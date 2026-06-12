"""
TCP connection manager for CMC CartonWrap machines.

Handles both server mode (CIS listens, machines connect)
and client mode (CIS connects to machine).
Port 15001 as per CMC CIS protocol.
"""

import asyncio
import re
import time
from collections import Counter
from datetime import datetime, timezone

from app.core.logging import logger
from app.gateway.parser import parse_message, build_response, serialize_response
from app.gateway.persistence import persist_event
from app.gateway.websocket import ws_manager
from app.modules.pulpo.runtime import pulpo_runtime


def sanitize_barcode(raw: str) -> str:
    """Resolve a (possibly multi-)barcode read into the ONE code we route on.

    The scanner can deliver several codes in a single read (semicolon- or
    whitespace-separated). A multi-order parcel carries an alphanumeric
    cart-box label (e.g. ``M319991``) AND the plain EANs of the articles
    inside it. **As soon as an M-/letter code is present it ALWAYS wins and
    the numeric EANs are ignored** — the parcel must be processed as the
    multi-order cart box, not as one of its contained single articles.

    Empty input and a ``NOREAD`` token are passed through (NOREAD keeps its
    letters → handled as no-read downstream)."""
    if not raw:
        return ""
    tokens = [t.strip() for t in re.split(r"[;\s]+", raw) if t.strip()]
    if not tokens:
        return ""
    # Alphanumeric (cart-box / multi-order) codes take priority over EANs.
    alnum = [t for t in tokens if any(c.isalpha() for c in t)]
    if alnum:
        m_codes = [t for t in alnum if t.upper().startswith("M")]
        return (m_codes or alnum)[0]
    return tokens[0]


# Active states per cmc-process-doc Section 4 / Section 7 "Order Reservation
# at ENQ". A barcode whose package is in any of these is considered already
# being processed and must not be re-accepted at the scanner.
ACTIVE_STATES = frozenset({"ASSIGNED", "INDUCTED", "SCANNED", "LABELED"})

# Scanner-Glitch-Fenster: wenn derselbe Barcode innerhalb dieses
# Intervalls erneut am Scanner ankommt, ist's mit hoher Wahrscheinlichkeit
# eine Doppelablesung desselben physischen Pakets. 0.5s ist großzügig
# genug für reale Scanner-Stotterer und schmal genug dass zwei echte
# Single-Order-Bestellungen vom selben Artikel ungehindert durchkommen.
SCAN_GLITCH_WINDOW_S = 0.5

# Name of the auto-managed CW-Liste that mirrors the Pulpo packing queue.
# Lists with source="pulpo" are read-only in the UI and rebuilt by the
# Pulpo sync — they are never edited by hand.
PULPO_LIST_NAME = "Pulpo-Queue"


class ActivePackageTracker:
    """In-memory mirror of active packages per machine.

    Lives alongside the DB persistence layer so the latency-critical ENQ
    response path can synchronously decide "is this barcode already on the
    belt?" without awaiting a DB query (the simulator times out after ~2s).

    Also implements the sequence-based ejection from cmc-process-doc § 7,
    Recovery Mechanism #1: every ENQ carries a monotonic event counter from
    the machine, and when a later END arrives we eject any still-active
    predecessor — that's the lost-on-belt cleanup the doc describes.
    """

    def __init__(self) -> None:
        # machine_id -> ref -> {"barcode": str, "state": str, "seq": int}
        self._packages: dict[str, dict[str, dict[str, object]]] = {}

    def is_active_barcode(self, machine_id: str, barcode: str) -> bool:
        if not barcode:
            return False
        for pkg in self._packages.get(machine_id, {}).values():
            if pkg["barcode"] == barcode and pkg["state"] in ACTIVE_STATES:
                return True
        return False

    def get_package(self, machine_id: str, ref: str) -> dict[str, object] | None:
        """Aktiven Paket-Datensatz (barcode, state, seq, dims) abrufen oder
        ``None``, wenn die Ref bereits terminal/unbekannt ist."""
        return self._packages.get(machine_id, {}).get(ref)

    def clear(self, machine_id: str | None = None) -> int:
        """Tracker leeren — entweder pro Maschine oder global. Operator-
        Action wenn das Dashboard „Leeren" geklickt wird; ohne diesen
        Schritt würde der Tracker einen Barcode weiter als aktiv halten
        und neue Scans als Doppel-Scan abweisen, obwohl die Tabelle
        längst leer ist.
        """
        if machine_id is None:
            count = sum(len(m) for m in self._packages.values())
            self._packages.clear()
            return count
        m = self._packages.pop(machine_id, {})
        return len(m)

    def apply(self, machine_id: str, msg_type: str, data: dict, response_ref: str) -> None:
        ref = response_ref or data.get("reference_id", "") or ""
        if not ref:
            return
        per_machine = self._packages.setdefault(machine_id, {})

        if msg_type == "ENQ":
            barcode = str(data.get("barcode", "")).strip()
            try:
                seq = int(str(data.get("event", "")).strip() or "0")
            except ValueError:
                seq = 0
            per_machine[ref] = {"barcode": barcode, "state": "ASSIGNED", "seq": seq}
            return

        pkg = per_machine.get(ref)
        if pkg is None:
            return

        if msg_type == "IND":
            pkg["state"] = "INDUCTED"
        elif msg_type == "ACK":
            good = data.get("good") in (1, "1", True, "true")
            pkg["state"] = "SCANNED" if good else "DELETED"
            # 3D-Maße der Maschine merken — werden bei LAB1 für den
            # DHL-Label-Call gebraucht.
            for k_src, k_dst in (("length_mm", "length_mm"),
                                 ("width_mm",  "width_mm"),
                                 ("height_mm", "height_mm")):
                v = data.get(k_src)
                if v not in (None, ""):
                    try: pkg[k_dst] = int(str(v).strip())
                    except (TypeError, ValueError): pass
        elif msg_type in ("LAB1", "LAB2"):
            good = data.get("good") in (1, "1", True, "true")
            if good:
                pkg["state"] = "LABELED"
        elif msg_type == "END":
            status = data.get("status")
            ok = status in (1, "1")
            pkg["state"] = "COMPLETED" if ok else "EJECTED"
        elif msg_type == "REM":
            pkg["state"] = "DELETED"

        # Drop terminal entries so the dict doesn't grow unboundedly.
        if pkg["state"] not in ACTIVE_STATES:
            per_machine.pop(ref, None)

    def eject_stale_predecessors(self, machine_id: str, current_seq: int) -> list[dict[str, object]]:
        """Räume Pakete weg, die am Scanner hängen geblieben sind.

        Nur Pakete im Status ASSIGNED (ENQ akzeptiert, aber kein IND/ACK/
        LAB gefolgt) zählen als „verloren". Sobald die Maschine ein IND
        oder später geschickt hat, hat sie das Paket physisch übernommen
        und wird ein eigenes END liefern — wir greifen dann nicht ein.

        Der Event-Counter ist ein globaler Zähler über alle Nachrichten
        (HBT, ACK, IND…), nicht pro Paket. Ein END mit hohem Counter
        heißt nur „21. Nachricht insgesamt", nicht „Paket #21 fertig" —
        Pakete laufen verschachtelt durch die Stationen, ihr ENQ-Counter
        ist nahezu immer kleiner als der END-Counter eines beliebigen
        anderen Pakets. Deshalb darf der Seq-Vergleich allein noch nichts
        als verloren markieren.
        """
        per_machine = self._packages.get(machine_id, {})
        ejected: list[dict[str, object]] = []
        stale_refs = [
            ref for ref, pkg in per_machine.items()
            if pkg["state"] == "ASSIGNED" and int(pkg.get("seq") or 0) < current_seq
        ]
        for ref in stale_refs:
            pkg = per_machine.pop(ref)
            ejected.append({
                "reference_id": ref,
                "barcode": pkg.get("barcode", ""),
                "previous_state": pkg["state"],
                "ejection_reason": "skipped_by_subsequent_end",
            })
        return ejected


class MachineConnection:
    """Represents a single TCP connection to a CMC machine."""

    # Maschine sendet HBT alle ~5s. Kommt 30s lang NICHTS mehr rein, gilt die
    # Verbindung als tot — auch wenn der Socket (z.B. hinter dem Railway-TCP-
    # Proxy oder nach Stromausfall der Maschine) nie sauber geschlossen wurde.
    # Sonst zeigt das Dashboard "Verbunden", obwohl längst nichts mehr lebt.
    STALE_AFTER_S = 30

    def __init__(self, machine_id: str, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.machine_id = machine_id
        self.reader = reader
        self.writer = writer
        self.connected_at = datetime.now(timezone.utc)
        self.last_heartbeat = datetime.now(timezone.utc)
        self.is_alive = True
        # Protocol id the machine declares about itself ("0001"). Stays None
        # until the first frame is parsed — until then the connection is not
        # surfaced to the dashboard, so the sidebar never shows a transient
        # `<ip>:<port>` entry.
        self.protocol_id: str | None = None
        # Stationsflags aus der DB-Konfiguration der Maschine (lab1/lab2/inv).
        # Wird einmalig nach dem ersten Frame mit machine_id geladen und in der
        # ENQ-Antwort verwendet — die ECHTE CW1000 wirft Items aus mit
        # "no LAB1 Reader selected" wenn wir lab1=1 anfordern, die Hardware
        # aber keinen Labeler installiert hat.
        self.station_flags: dict[str, bool] | None = None

    @property
    def idle_seconds(self) -> float:
        return (datetime.now(timezone.utc) - self.last_heartbeat).total_seconds()

    @property
    def is_live(self) -> bool:
        """Alive AND recently heard from — the truth the dashboard shows."""
        return self.is_alive and self.idle_seconds < self.STALE_AFTER_S

    async def send(self, data: bytes) -> None:
        self.writer.write(data)
        await self.writer.drain()

    async def close(self) -> None:
        self.is_alive = False
        try:
            self.writer.close()
            await self.writer.wait_closed()
        except Exception:
            pass


class ConnectionManager:
    """Manages TCP connections to multiple CMC machines."""

    def __init__(self):
        self._connections: dict[str, MachineConnection] = {}
        self._server: asyncio.Server | None = None
        self._bound_port: int | None = None
        self._tracker = ActivePackageTracker()
        # Per-machine runtime modes keyed by protocol id ("0001" → "multi_only").
        # In-memory only — persistence is intentionally off (see config). When
        # a machine is in multi_only mode, ENQ rejects pure-numeric (single-
        # order) barcodes at the scanner. See cmc-process-doc § 3.
        self._machine_modes: dict[str, str] = {}
        # CW-Listen: pro Maschine mehrere benannte Listen (z.B. CW1..CW14),
        # jede mit Aktiv-Flag und einer Mengen-Tabelle pro Barcode. Ein
        # Eintrag sieht so aus: items[barcode] = {expected: N, consumed: K}.
        # Damit decken wir Single-Order-Fälle ab, in denen mehrere Kunden
        # denselben Artikel bestellt haben (z.B. BC0001 × 2). Ein ENQ
        # wird akzeptiert, sobald es in mindestens einer aktiven Liste
        # einen Eintrag mit `consumed < expected` gibt; auf der ersten
        # passenden aktiven Liste wird `consumed` hochgezählt.
        # `cw_list` (Anzeige-Tag) zeigt die zugeordnete Liste in der UI —
        # bei Mehrfach-Match gewinnt die erste aktive, mit Rest kapazität.
        self._cw_lists: dict[str, dict[str, dict]] = {}
        # Scanner-Glitch-Schutz: pro Maschine merken wir uns den letzten
        # akzeptierten Barcode samt Zeitstempel. Wenn derselbe Code
        # innerhalb von 500ms erneut reinkommt, ist das physikalisch fast
        # immer ein Scanner-Wackler (gleiches Paket nochmal gelesen) und
        # wird als DUPLICATE abgewiesen, ohne `consumed` zu erhöhen.
        self._last_scan: dict[str, tuple[str, float]] = {}
        # Mid-flight Ejections: pro Maschine eine Menge von reference_ids,
        # die beim nächsten ACK/INV/LAB1/LAB2/END mit Reject beantwortet
        # werden sollen. Die Maschine wirft das Paket dann am nächsten
        # möglichen Gate aus; das Band läuft normal weiter, andere
        # Bestellungen sind nicht betroffen. In-Memory; entweder durch
        # Operator (manuelle Eject-Button) oder später durch automatische
        # Soll-/Ist-Checks befüllt.
        self._pending_ejections: dict[str, set[str]] = {}
        # Welche CW-Liste hat ein ENQ-Ref einen Slot abgebucht? protocol_id →
        # ref → (list_name, barcode). Damit können wir den Slot **zurückgeben**,
        # wenn der Auftrag ejected/abgelehnt wird (EJECTED/DELETED/REM), und ihn
        # **behalten**, wenn er sauber durchläuft (COMPLETED). So verzählt sich
        # die Liste nicht, wenn ein Paket ausgeworfen und neu aufgelegt wird.
        self._cw_consumption: dict[str, dict[str, tuple[str, str]]] = {}

    def get_mode(self, protocol_id: str) -> str | None:
        return self._machine_modes.get(protocol_id)

    def set_mode(self, protocol_id: str, mode: str | None) -> None:
        if mode:
            self._machine_modes[protocol_id] = mode
        else:
            self._machine_modes.pop(protocol_id, None)

    @property
    def machine_modes(self) -> dict[str, str]:
        return dict(self._machine_modes)

    # ── CW-Listen ─────────────────────────────────────────────────────────

    def get_cw_lists(self, protocol_id: str) -> dict[str, dict]:
        return self._cw_lists.get(protocol_id, {})

    def evaluate_cw_for_enq(
        self, protocol_id: str, barcode: str,
    ) -> tuple[str | None, bool, bool]:
        """Bewertet einen ENQ-Barcode gegen die CW-Listen der Maschine.

        Rückgabe: (matched_list, filter_passed, has_active_lists)
          - matched_list: Liste, in der der Barcode aufschlägt (Tag für UI).
            Aktive Treffer mit Restmenge gewinnen, dann aktive ohne, dann
            inaktive mit, dann inaktive ohne. None wenn der Barcode in
            keiner Liste auftaucht.
          - filter_passed: True wenn der Scan akzeptiert werden darf —
            entweder weil keine aktive Liste existiert (kein Filter) oder
            weil mindestens eine aktive Liste den Barcode mit
            consumed < expected enthält.
          - has_active_lists: ob überhaupt eine aktive Liste existiert.
        """
        lists = self._cw_lists.get(protocol_id, {})
        if not barcode or not lists:
            return (None, True, any(l.get("active") for l in lists.values()))

        has_active = any(l.get("active") for l in lists.values())

        active_with_remaining: str | None = None
        active_consumed: str | None = None
        inactive_with_remaining: str | None = None
        inactive_consumed: str | None = None
        for name, lst in lists.items():
            entry = lst.get("items", {}).get(barcode)
            if entry is None:
                continue
            has_rem = entry["consumed"] < entry["expected"]
            if lst.get("active"):
                if has_rem and active_with_remaining is None:
                    active_with_remaining = name
                elif not has_rem and active_consumed is None:
                    active_consumed = name
            else:
                if has_rem and inactive_with_remaining is None:
                    inactive_with_remaining = name
                elif not has_rem and inactive_consumed is None:
                    inactive_consumed = name

        matched = (
            active_with_remaining or active_consumed
            or inactive_with_remaining or inactive_consumed
        )
        filter_passed = not has_active or active_with_remaining is not None
        return matched, filter_passed, has_active

    def consume_cw_entry(self, protocol_id: str, list_name: str, barcode: str) -> bool:
        """Erhöht consumed um 1 auf der angegebenen Liste. True wenn
        wirklich verbraucht wurde, False sonst (z.B. weil bereits voll).
        """
        lst = self._cw_lists.get(protocol_id, {}).get(list_name)
        if not lst:
            return False
        entry = lst.get("items", {}).get(barcode)
        if not entry or entry["consumed"] >= entry["expected"]:
            return False
        entry["consumed"] += 1
        return True

    def record_cw_consumption(self, protocol_id: str, ref: str, list_name: str, barcode: str) -> None:
        """Merkt sich, dass ``ref`` einen Slot von ``list_name`` abgebucht hat —
        Grundlage für eine spätere Rückgabe bei Eject."""
        if not (protocol_id and ref and list_name and barcode):
            return
        self._cw_consumption.setdefault(protocol_id, {})[ref] = (list_name, barcode)

    def release_cw_for_ref(self, protocol_id: str, ref: str) -> bool:
        """Gibt den von ``ref`` belegten CW-Slot zurück (consumed −1). Wird bei
        EJECTED/DELETED/REM aufgerufen, damit ein erneut aufgelegtes Paket den
        Slot sauber neu verbrauchen kann. True, wenn wirklich zurückgegeben."""
        per_machine = self._cw_consumption.get(protocol_id)
        if not per_machine:
            return False
        entry = per_machine.pop(ref, None)
        if not entry:
            return False
        list_name, barcode = entry
        lst = self._cw_lists.get(protocol_id, {}).get(list_name)
        item = (lst or {}).get("items", {}).get(barcode) if lst else None
        if item and item["consumed"] > 0:
            item["consumed"] -= 1
            return True
        return False

    def finalize_cw_for_ref(self, protocol_id: str, ref: str) -> None:
        """Auftrag sauber abgeschlossen (COMPLETED): Slot bleibt verbraucht,
        nur die Buchführung wird aufgeräumt."""
        per_machine = self._cw_consumption.get(protocol_id)
        if per_machine:
            per_machine.pop(ref, None)

    def is_scan_glitch(self, protocol_id: str, barcode: str, *, now: float) -> bool:
        """True wenn derselbe Barcode innerhalb des Glitch-Fensters
        bereits gesehen wurde. Aktualisiert das Last-Scan-Memo nicht —
        Aufrufer entscheidet wann das passieren soll.
        """
        last = self._last_scan.get(protocol_id)
        if not last or not barcode:
            return False
        last_barcode, last_ts = last
        return last_barcode == barcode and (now - last_ts) < SCAN_GLITCH_WINDOW_S

    def record_scan(self, protocol_id: str, barcode: str, *, now: float) -> None:
        if barcode:
            self._last_scan[protocol_id] = (barcode, now)

    def upsert_cw_list(
        self, protocol_id: str, name: str,
        *, barcodes: list[str] | None = None, active: bool | None = None,
    ) -> dict:
        """Anlegen oder Updaten einer CW-Liste.

        `barcodes` ist eine Liste von Roh-Barcodes (Duplikate erlaubt!).
        Duplikate werden zu Mengenangaben aggregiert: ["BC0001","BC0001"]
        → items["BC0001"].expected = 2. Bestehender `consumed`-Stand für
        Barcodes, die in beiden Listen vorkommen, bleibt erhalten (auf
        die neue expected gekappt), damit ein Mid-Shift-Edit nicht den
        Verbrauchsstand vergisst.
        """
        per_machine = self._cw_lists.setdefault(protocol_id, {})
        existing = per_machine.get(name) or {"active": False, "items": {}}
        if barcodes is not None:
            counter = Counter(b.strip() for b in barcodes if b and b.strip())
            old_items = existing.get("items", {})
            new_items: dict[str, dict[str, int]] = {}
            for barcode, expected in counter.items():
                old_consumed = old_items.get(barcode, {}).get("consumed", 0)
                new_items[barcode] = {
                    "expected": expected,
                    "consumed": min(old_consumed, expected),
                }
            existing["items"] = new_items
        if active is not None:
            existing["active"] = bool(active)
        per_machine[name] = existing
        return self._serialize_cw_list(name, existing)

    def is_pulpo_list(self, protocol_id: str, name: str) -> bool:
        lst = self._cw_lists.get(protocol_id, {}).get(name)
        return bool(lst and lst.get("source") == "pulpo")

    def set_pulpo_cw_list(
        self, protocol_id: str, barcode_quantities: dict[str, int], *, active: bool = True,
    ) -> dict:
        """Replace the auto-managed Pulpo CW-Liste for a machine with the
        given barcode→expected-quantity map (derived from the Pulpo packing
        queue). Marked source="pulpo" so it is read-only in the UI.

        Existing `consumed` counts are preserved per barcode (capped to the
        new expected) so an in-flight scan count survives a queue refresh.
        """
        per_machine = self._cw_lists.setdefault(protocol_id, {})
        existing = per_machine.get(PULPO_LIST_NAME) or {}
        old_items = existing.get("items", {})
        new_items: dict[str, dict[str, int]] = {}
        for barcode, expected in barcode_quantities.items():
            bc = (barcode or "").strip()
            if not bc or expected <= 0:
                continue
            old_consumed = old_items.get(bc, {}).get("consumed", 0)
            new_items[bc] = {"expected": int(expected), "consumed": min(old_consumed, int(expected))}
        per_machine[PULPO_LIST_NAME] = {
            "active": active if not existing else bool(existing.get("active", active)),
            "items": new_items,
            "source": "pulpo",
        }
        return self._serialize_cw_list(PULPO_LIST_NAME, per_machine[PULPO_LIST_NAME])

    def set_pulpo_cw_lists(
        self, protocol_id: str, lists: dict[str, dict[str, int]], *, active: bool = False,
    ) -> None:
        """Replace ALL Pulpo-sourced CW-Listen of a machine with one named list
        per Lagerplatz (e.g. "CW1", "CW6", "CW10"). Each maps barcode→expected.
        Existing `consumed` is preserved per barcode; Pulpo lists no longer
        present are removed (manual lists are untouched).

        New lists arrive **inactive** (active=False) so the operator opts in by
        ticking the box — we never auto-select a freshly synced Lagerplatz."""
        per_machine = self._cw_lists.setdefault(protocol_id, {})
        # Drop Pulpo lists that are no longer in the queue.
        for name in [n for n, l in list(per_machine.items())
                     if l.get("source") == "pulpo" and n not in lists]:
            per_machine.pop(name, None)
        for name, barcode_quantities in lists.items():
            existing = per_machine.get(name) or {}
            old_items = existing.get("items", {})
            new_items: dict[str, dict[str, int]] = {}
            for barcode, expected in barcode_quantities.items():
                bc = (barcode or "").strip()
                if not bc or expected <= 0:
                    continue
                old_consumed = old_items.get(bc, {}).get("consumed", 0)
                new_items[bc] = {"expected": int(expected), "consumed": min(old_consumed, int(expected))}
            per_machine[name] = {
                "active": active if not existing else bool(existing.get("active", active)),
                "items": new_items,
                "source": "pulpo",
            }

    def reset_cw_consumed(self, protocol_id: str | None = None) -> int:
        """Setzt `consumed` aller Listen-Einträge zurück. Wird vom
        Dashboard-Leeren-Button mit aufgerufen, damit der nächste Scan
        wieder voll zählt.
        """
        cleared = 0
        machines = (
            [protocol_id] if protocol_id is not None
            else list(self._cw_lists.keys())
        )
        for mid in machines:
            for lst in self._cw_lists.get(mid, {}).values():
                for entry in lst.get("items", {}).values():
                    if entry.get("consumed"):
                        cleared += 1
                        entry["consumed"] = 0
        return cleared

    def delete_cw_list(self, protocol_id: str, name: str) -> bool:
        per_machine = self._cw_lists.get(protocol_id, {})
        return per_machine.pop(name, None) is not None

    @staticmethod
    def _serialize_cw_list(name: str, lst: dict) -> dict:
        items = lst.get("items", {})
        rows = [
            {
                "barcode": barcode,
                "expected": entry["expected"],
                "consumed": entry["consumed"],
            }
            for barcode, entry in sorted(items.items())
        ]
        total_expected = sum(e["expected"] for e in rows)
        total_consumed = sum(e["consumed"] for e in rows)
        return {
            "name": name,
            "active": bool(lst.get("active")),
            "source": lst.get("source", "manual"),
            "items": rows,
            "total_expected": total_expected,
            "total_consumed": total_consumed,
            "remaining": total_expected - total_consumed,
        }

    # ── Pending Ejections ─────────────────────────────────────────────────

    def reset_runtime(self, protocol_id: str | None = None) -> dict:
        """Maschinen-Laufzeitstatus leeren: aktiver Paket-Tracker und
        Pending-Ejections. Aufgerufen vom Dashboard-Leeren-Button —
        damit neue Scans nicht fälschlich als Doppel-Scan abgewiesen
        werden, weil der Tracker noch Bestellungen aus der gerade
        gelöschten Tabelle hält. CW-Listen und Maschinen-Modi bleiben
        unangetastet (das ist Konfiguration, kein Laufzeitstatus).
        """
        cleared_packages = self._tracker.clear(protocol_id)
        cleared_ejections = 0
        if protocol_id is None:
            cleared_ejections = sum(len(s) for s in self._pending_ejections.values())
            self._pending_ejections.clear()
            self._last_scan.clear()
            self._cw_consumption.clear()
        else:
            s = self._pending_ejections.pop(protocol_id, None)
            if s:
                cleared_ejections = len(s)
            self._last_scan.pop(protocol_id, None)
            self._cw_consumption.pop(protocol_id, None)
        cleared_consumed = self.reset_cw_consumed(protocol_id)
        return {
            "packages": cleared_packages,
            "ejections": cleared_ejections,
            "consumed_reset": cleared_consumed,
        }

    def mark_for_ejection(self, protocol_id: str, ref_id: str) -> None:
        """Vormerken: das Paket mit dieser reference_id wird beim nächsten
        Pipeline-Event (ACK / INV / LAB1 / LAB2 / END) per Reject-Response
        beantwortet. Die Maschine wirft es am nächsten möglichen Gate aus.
        """
        if not ref_id:
            return
        self._pending_ejections.setdefault(protocol_id, set()).add(ref_id)

    def unmark_ejection(self, protocol_id: str, ref_id: str) -> bool:
        s = self._pending_ejections.get(protocol_id)
        if not s:
            return False
        removed = ref_id in s
        s.discard(ref_id)
        return removed

    def is_ejection_pending(self, protocol_id: str, ref_id: str) -> bool:
        return ref_id in self._pending_ejections.get(protocol_id, set())

    def consume_ejection(self, protocol_id: str, ref_id: str) -> bool:
        """Atomisch: true zurückgeben wenn das Paket markiert war, und im
        gleichen Zug aus der Menge entfernen. Beim nächsten Event ist es
        damit nicht mehr aktiv — wir wollen nicht zweimal rejecten.
        """
        s = self._pending_ejections.get(protocol_id)
        if not s or ref_id not in s:
            return False
        s.discard(ref_id)
        return True

    @property
    def pending_ejections(self) -> dict[str, list[str]]:
        return {mid: sorted(s) for mid, s in self._pending_ejections.items() if s}

    @property
    def cw_lists(self) -> dict[str, list[dict]]:
        """For broadcast in /events/recent — pro Maschine eine Liste von
        Listen-Objekten in Insertion-Order (Reihenfolge der Erst-Anlage).
        """
        return {
            mid: [self._serialize_cw_list(n, l) for n, l in lists.items()]
            for mid, lists in self._cw_lists.items()
        }

    @property
    def connected_machines(self) -> list[str]:
        """Protocol ids of currently-connected machines.

        We deliberately do NOT expose the per-socket connection key
        (`machine_<ip>_<port>`) — that's an internal handle. Until a machine
        declares its protocol id in its first frame, it is not listed.
        """
        seen: set[str] = set()
        out: list[str] = []
        for conn in self._connections.values():
            # is_live statt is_alive: ein halboffener Socket ohne Traffic
            # (>30s kein HBT) zählt NICHT mehr als verbunden.
            if not conn.is_live or not conn.protocol_id:
                continue
            if conn.protocol_id in seen:
                continue
            seen.add(conn.protocol_id)
            out.append(conn.protocol_id)
        return out

    @property
    def pending_connections(self) -> int:
        """Number of TCP sockets currently open but not yet identified
        (no protocol id seen yet). Used to distinguish "no simulator" from
        "simulator connected, waiting for first frame".
        """
        return sum(
            1 for c in self._connections.values()
            if c.is_live and not c.protocol_id
        )

    @property
    def bound_port(self) -> int | None:
        """Port the TCP gateway actually bound to (may differ from config due to PORT conflicts)."""
        return self._bound_port

    def get_connection(self, machine_id: str) -> MachineConnection | None:
        """Look up a live connection by either its socket key or its
        protocol id (CIS id like "0001"). Callers from the HTTP layer pass
        the protocol id; internal callers use the socket key.
        """
        conn = self._connections.get(machine_id)
        if conn and conn.is_live:
            return conn
        for c in self._connections.values():
            if c.is_live and c.protocol_id == machine_id:
                return c
        return None

    def invalidate_station_flags(self, protocol_id: str) -> None:
        """Cache der Stationsflags für die angegebene Maschine löschen, damit
        beim nächsten Frame frisch aus der DB gelesen wird. Wird vom Maschinen-
        Edit-Endpunkt aufgerufen, wenn lab1/lab2/inv geändert wurden — sonst
        würde eine bestehende Verbindung noch ewig die alten Flags senden."""
        for conn in self._connections.values():
            if conn.protocol_id == protocol_id:
                conn.station_flags = None
                # Sofort neu laden, damit der nächste Hot-Path-Frame schon den
                # neuen Wert hat.
                asyncio.create_task(self._load_station_flags(conn))

    async def _load_station_flags(self, conn: "MachineConnection") -> None:
        """Lab1/Lab2/Inv-Flags der Maschine aus der DB nachladen.

        Wird einmalig getriggert, sobald die Maschine ihre protocol_id ("0001")
        im ersten Frame deklariert. Bis die DB geantwortet hat, fällt die ENQ-
        Antwort auf konservative Defaults zurück (lab1=False, lab2=False,
        inv=False) — damit eine echte CW1000 OHNE Labeler kein Item mehr als
        "no LAB1 Reader selected → INVALID" auswirft."""
        from sqlalchemy import select
        from app.core.database import async_session
        from app.modules.machines.models import Machine

        protocol_id = conn.protocol_id
        if not protocol_id:
            return
        try:
            async with async_session() as db:
                m = (await db.execute(
                    select(Machine).where(Machine.machine_id == protocol_id).limit(1)
                )).scalar_one_or_none()
            if m is None:
                conn.station_flags = {"lab1": False, "lab2": False, "inv": False}
                logger.info(
                    f"Machine {protocol_id} not in registry — defaulting station "
                    f"flags to all-off (item would be ejected otherwise)"
                )
                return
            conn.station_flags = {
                "lab1": bool(m.lab1_enabled),
                "lab2": bool(m.lab2_enabled),
                "inv": bool(m.inv_enabled),
            }
            logger.info(
                f"Station flags for {protocol_id} loaded: {conn.station_flags}"
            )
        except Exception as e:
            logger.warning(f"Could not load station flags for {protocol_id}: {e}")
            conn.station_flags = {"lab1": False, "lab2": False, "inv": False}

    async def _enrich_lab1_with_dhl(
        self, response: dict, protocol_id: str, ref: str, msg_data: dict,
    ) -> None:
        """LAB1-Antwort um Tracking-Nummer + Label-Daten erweitern.

        Erzeugt ein DHL-Sendungslabel über den modules.dhl.service. Im
        Test-Modus → Mock-Tracking, kein API-Call. Empfänger kommt — falls
        verfügbar — aus dem letzten Pulpo-Sales-Order; sonst Default-Adresse
        aus den Settings (für die ersten Maschinen-Smokes auf der echten
        CW1000 ohne realen Versand). Im Erfolgsfall wird:
          - `match_barcode` auf die Tracking-Nummer gesetzt (Maschine prüft
            damit das gedruckte Label am Exit-Reader)
          - `label_url` mit dem Base64-Label gefüllt (ZPL2 für direkten
            Druck am thermischen Labeler)
        """
        from app.core.config import get_settings
        from app.core.database import async_session
        from app.modules.dhl.client import Address
        from app.modules.dhl.service import create_label_for_order
        from app.modules.machines.models import Machine
        from sqlalchemy import select

        # Maße aus dem ACK übernehmen (Tracker speichert sie seit dem ACK-
        # Handler). Gewicht trägt die Maschine erst im LAB1-Request bei.
        pkg = self._tracker.get_package(protocol_id, ref) or {}
        length_mm = int(pkg.get("length_mm") or msg_data.get("length_mm") or 200)
        width_mm  = int(pkg.get("width_mm")  or msg_data.get("width_mm")  or 150)
        height_mm = int(pkg.get("height_mm") or msg_data.get("height_mm") or 80)
        # weight_scale ist im LAB1-Request enthalten; Fallback 500g.
        weight_g = 500
        for k in ("weight_scale", "weightScale", "weight"):
            v = msg_data.get(k)
            if v not in (None, ""):
                try: weight_g = max(1, int(str(v).strip())); break
                except (TypeError, ValueError): pass

        s = get_settings()
        recipient = Address(
            name=s.dhl_default_recipient_name, street=s.dhl_default_recipient_street,
            street_no=s.dhl_default_recipient_street_no, zip_code=s.dhl_default_recipient_zip,
            city=s.dhl_default_recipient_city, country=s.dhl_default_recipient_country,
        )

        # tenant_id der Maschine ermitteln, damit die Sendung dem richtigen
        # Mandanten gehört. Die TCP-Verbindung kennt den Tenant nicht direkt
        # → über die Protocol-ID (= Machine.machine_id) auflösen, Fallback
        # auf den ersten Tenant.
        async with async_session() as db:
            machine = (await db.execute(
                select(Machine).where(Machine.machine_id == protocol_id).limit(1)
            )).scalar_one_or_none()
            tenant_id = machine.tenant_id if machine else None
            if not tenant_id:
                from app.modules.tenants.models import Tenant
                t = (await db.execute(select(Tenant).limit(1))).scalar_one_or_none()
                tenant_id = t.id if t else ""

            # ── Pre-Created Label aus DB lesen (Hot-Path #1) ───────────────
            # Wenn IND das Label schon erzeugt hat (Doku §6 Pre-Creation),
            # liegt es in der shipments-Tabelle bereit → kein API-Call.
            from app.modules.dhl.models import Shipment
            cached = (await db.execute(
                select(Shipment).where(
                    Shipment.tenant_id == tenant_id,
                    Shipment.reference_id == ref,
                ).order_by(Shipment.created_at.desc()).limit(1)
            )).scalar_one_or_none()
            if cached and cached.tracking_number:
                response["match_barcode"] = cached.tracking_number
                response["label_url"] = cached.label_b64 if get_settings().cmc_lab_label_mode == "base64" else ""
                response["status"] = ""
                response["rejection_reason"] = None
                logger.info(
                    f"LAB1 cache hit: ref={ref} tracking={cached.tracking_number} "
                    f"label_mode={get_settings().cmc_lab_label_mode} "
                    f"(machine reads only match_barcode; print runs via daemon)"
                )
                return

            # ── Pulpo-Label-First ──────────────────────────────────────────
            # Hat Pulpo zum gescannten Barcode bereits ein Label generiert?
            # (Pre-Label-Workflow: Pulpo erstellt das DHL-Label, sobald die
            #  Sales-Order in die Pack-Queue wandert. Dann müssen wir nicht
            #  selbst DHL anrufen — risikoärmer, idempotent, kostenfrei.)
            scanned_barcode = str(msg_data.get("barcode", "") or "").strip()
            pulpo_hit = await self._try_pulpo_label(db, tenant_id, scanned_barcode)
            if pulpo_hit is not None:
                tracking, label_b64 = pulpo_hit
                response["match_barcode"] = tracking
                response["label_url"] = label_b64
                response["status"] = ""
                response["rejection_reason"] = None
                logger.info(
                    f"LAB1 enriched from Pulpo label: ref={ref} tracking={tracking}"
                )
                return

            # ── Fallback: DHL direkt erzeugen ──────────────────────────────
            # ECHTE Empfängeradresse aus Pulpo holen (ship_to der Sales-
            # Order). Die hardcodierte Test-Adresse oben würde DHL beim
            # echten Tenant mit HTTP 400 ablehnen.
            pulpo_recipient = await self._resolve_pulpo_recipient(
                db, tenant_id, scanned_barcode,
            )
            if pulpo_recipient is not None:
                recipient = pulpo_recipient
                logger.info(
                    f"DHL fallback: using Pulpo ship_to for ref={ref} "
                    f"({recipient.zip_code} {recipient.city}, {recipient.country})"
                )
            else:
                logger.warning(
                    f"DHL fallback: no Pulpo ship_to for ref={ref} barcode={scanned_barcode} "
                    f"— using default test recipient (DHL may reject)"
                )

            shipment = await create_label_for_order(
                db, tenant_id=tenant_id, order_ref=ref,
                order_state_id=None,
                recipient=recipient,
                weight_g=weight_g, length_mm=length_mm,
                width_mm=width_mm, height_mm=height_mm,
            )
            await db.commit()

        response["match_barcode"] = shipment.tracking_number
        # label_url = Label-Daten (Base64 ZPL2). Bei zu großem Frame ggf.
        # später auf eine HTTP-URL umstellen; aktuell senden wir den ZPL
        # direkt im Feld, weil der CW1000-Labeler das so erwartet.
        response["label_url"] = shipment.label_b64
        response["status"] = ""
        response["rejection_reason"] = None
        logger.info(
            f"LAB1 enriched with DHL: ref={ref} tracking={shipment.tracking_number} "
            f"test={shipment.is_test}"
        )

    async def _resolve_pulpo_recipient(
        self, db, tenant_id: str, barcode: str,
    ):
        """Empfängeradresse aus Pulpos Sales-Order holen (ship_to-Feld).
        Genutzt vom DHL-Fallback, damit DHL die ECHTE Lieferadresse sieht
        statt der Standard-Testadresse — sonst HTTP 400 vom DHL-API.

        Endpoint-Kette:
          1. PulpoPackingOrder (lokal) zum gescannten Barcode finden
          2. ``raw_payload.sales_order_id`` → ``GET /sales/orders/{id}``
          3. ``ship_to.name`` + ``ship_to.address.{street,house_nr,zip,city,
             country/country_alpha2,email}`` → ``Address``-Objekt
        Liefert ``None``, wenn irgendwo etwas fehlt (dann fällt der Caller
        auf die Default-Adresse zurück).
        """
        try:
            from sqlalchemy import select
            from app.modules.pulpo.client import pulpo as pulpo_client
            from app.modules.pulpo.models import PulpoPackingOrder, PulpoOrderItem
            from app.modules.dhl.client import Address

            # 1) Pulpo-Order finden (analog _try_pulpo_label)
            order = (await db.execute(
                select(PulpoPackingOrder).where(
                    PulpoPackingOrder.tenant_id == tenant_id,
                    PulpoPackingOrder.cart_box_barcode == barcode,
                ).limit(1)
            )).scalar_one_or_none()
            if order is None and barcode:
                order = (await db.execute(
                    select(PulpoPackingOrder).join(
                        PulpoOrderItem, PulpoOrderItem.order_db_id == PulpoPackingOrder.id,
                    ).where(
                        PulpoPackingOrder.tenant_id == tenant_id,
                        PulpoOrderItem.ean == barcode,
                    ).limit(1)
                )).scalar_one_or_none()
            if order is None:
                return None

            raw = order.raw_payload if isinstance(order.raw_payload, dict) else {}
            sales_order_id = raw.get("sales_order_id")
            if not sales_order_id:
                return None

            # 2) Sales-Order von Pulpo holen
            so = await pulpo_client.get_sales_order(sales_order_id)
            if not so:
                return None
            ship_to = (so.get("ship_to") or {}) if isinstance(so, dict) else {}
            addr = (ship_to.get("address") or {}) if isinstance(ship_to, dict) else {}
            if not isinstance(addr, dict):
                return None

            # 3) Pflichtfelder prüfen
            street = str(addr.get("street") or "").strip()
            zip_   = str(addr.get("zip") or "").strip()
            city   = str(addr.get("city") or "").strip()
            if not (street and zip_ and city):
                return None

            # ISO-Land normalisieren — DHL erwartet Alpha-3 (DEU/AUT/CHE…).
            _iso3 = {
                "DE": "DEU", "AT": "AUT", "CH": "CHE", "FR": "FRA", "NL": "NLD",
                "BE": "BEL", "IT": "ITA", "PL": "POL", "GB": "GBR", "DK": "DNK",
                "ES": "ESP", "CZ": "CZE", "LU": "LUX", "SE": "SWE", "FI": "FIN",
            }
            country_in = str(
                addr.get("country_alpha2") or addr.get("country_code")
                or addr.get("country") or "DE"
            ).strip().upper()
            if len(country_in) == 2:
                country = _iso3.get(country_in, "DEU")
            elif country_in in ("GERMANY", "DEUTSCHLAND"):
                country = "DEU"
            elif len(country_in) == 3:
                country = country_in
            else:
                country = "DEU"

            return Address(
                # name1 = Empfängername; DHL begrenzt das Feld, sicherheitshalber kürzen.
                name=(str(ship_to.get("name") or "")[:50]).strip() or "Empfaenger",
                street=street[:50],
                # DHL braucht ein Hausnummern-Feld; falls Pulpo es nicht
                # separat führt, fällt eine 1 als Platzhalter ein.
                street_no=str(addr.get("house_nr") or "1").strip()[:10],
                zip_code=zip_,
                city=city[:50],
                country=country,
                email=str(addr.get("email") or "")[:80],
                phone=str(ship_to.get("phone_number") or "")[:20],
            )
        except Exception as e:
            logger.warning(f"Pulpo recipient lookup failed: {e!r} — using default")
            return None

    async def _precreate_label(
        self, protocol_id: str, ref: str, msg_data: dict,
    ) -> None:
        """Hintergrund-Task: Label nach IND vorab generieren und in der
        ``shipments``-Tabelle ablegen. So braucht LAB1 nur noch ein
        SELECT auf reference_id — keine externen API-Calls mehr im 2-s-
        Antwortbudget.

        Jeder Pfad wird klar geloggt (PRECREATE-Präfix) UND in
        dhl_runtime.precreate_* gespiegelt, damit der Operator den letzten
        Status in der DHL-Statuskarte sehen kann (kein Logwühlen).
        """
        from app.core.database import async_session
        from app.modules.dhl.models import Shipment
        from app.modules.dhl.runtime import dhl_runtime
        from app.modules.machines.models import Machine
        from app.modules.tenants.models import Tenant
        from sqlalchemy import select
        from datetime import datetime as _dt

        def _note(ok: bool, msg: str) -> None:
            dhl_runtime.precreate_total += 1
            if ok: dhl_runtime.precreate_ok += 1
            dhl_runtime.precreate_last_msg = msg[:300]
            dhl_runtime.precreate_last_at = _dt.utcnow()

        barcode = str(msg_data.get("barcode", "") or "").strip()
        logger.info(f"PRECREATE start: ref={ref} barcode={barcode} machine={protocol_id}")
        try:
            async with async_session() as db:
                machine = (await db.execute(
                    select(Machine).where(Machine.machine_id == protocol_id).limit(1)
                )).scalar_one_or_none()
                tenant_id = machine.tenant_id if machine else None
                if not tenant_id:
                    t = (await db.execute(select(Tenant).limit(1))).scalar_one_or_none()
                    tenant_id = t.id if t else ""
                if not tenant_id:
                    logger.warning(f"PRECREATE no-tenant: ref={ref}")
                    _note(False, f"ref={ref}: kein Tenant auflösbar")
                    return

                existing = (await db.execute(
                    select(Shipment).where(
                        Shipment.tenant_id == tenant_id,
                        Shipment.reference_id == ref,
                    ).order_by(Shipment.created_at.desc()).limit(1)
                )).scalar_one_or_none()
                if existing and existing.tracking_number:
                    logger.info(
                        f"PRECREATE skip: ref={ref} already has tracking={existing.tracking_number}"
                    )
                    _note(True, f"ref={ref}: bereits vorhanden ({existing.tracking_number})")
                    return

                pulpo_hit = await self._try_pulpo_label(db, tenant_id, barcode)
                if pulpo_hit:
                    tracking, label_b64 = pulpo_hit
                    # Pulpo-IDs für die OrderState-Reconstruction speichern
                    # (siehe persistence.py: wenn ENQ verpasst wurde, baut
                    # ein späterer Event-Handler den OrderState aus diesen
                    # Feldern wieder zusammen — Barcode/PA/Verkaufsauftrag).
                    seq_num = ""; sales_num = ""
                    try:
                        from sqlalchemy import select as _sel
                        from app.modules.pulpo.models import PulpoPackingOrder as _PO, PulpoOrderItem as _PI
                        po = (await db.execute(
                            _sel(_PO).where(
                                _PO.tenant_id == tenant_id,
                                _PO.cart_box_barcode == barcode,
                            ).limit(1)
                        )).scalar_one_or_none()
                        if po is None and barcode:
                            po = (await db.execute(
                                _sel(_PO).join(_PI, _PI.order_db_id == _PO.id).where(
                                    _PO.tenant_id == tenant_id, _PI.ean == barcode,
                                ).limit(1)
                            )).scalar_one_or_none()
                        if po and isinstance(po.raw_payload, dict):
                            seq_num = str(po.raw_payload.get("sequence_number") or "")
                            sales_num = str((po.raw_payload.get("sales_order") or {}).get("order_num") or "")
                    except Exception: pass
                    sh = Shipment(
                        tenant_id=tenant_id, reference_id=ref,
                        barcode=barcode,
                        pulpo_sequence_number=seq_num,
                        pulpo_sales_order_num=sales_num,
                        tracking_number=tracking,
                        label_b64=label_b64, label_format="PDF",
                        carrier="DHL", product="V01PAK",
                        is_test=False,
                    )
                    db.add(sh)
                    await db.commit()
                    bytes_est = len(label_b64) * 3 // 4 if label_b64 else 0
                    logger.info(
                        f"PRECREATE OK (Pulpo): ref={ref} tracking={tracking} "
                        f"label_bytes~{bytes_est}"
                    )
                    _note(True, f"ref={ref}: Pulpo-Label {tracking}")
                    return

                logger.warning(
                    f"PRECREATE miss: ref={ref} barcode={barcode} — Pulpo hat noch "
                    f"kein Label, LAB1 wird DHL-Fallback versuchen"
                )
                _note(False, f"ref={ref}: kein Pulpo-Label, DHL-Fallback bei LAB1")
        except Exception as e:
            logger.exception(f"PRECREATE crash: ref={ref}: {e!r}")
            _note(False, f"ref={ref}: Ausnahme {e!r}"[:300])

    async def _try_pulpo_label(
        self, db, tenant_id: str, barcode: str,
    ) -> tuple[str, str] | None:
        """Pulpo-Label für den gescannten Barcode finden.

        Pulpo schreibt Tracking + Label-Attachment direkt in
        ``PulpoPackingOrder.raw_payload['packing_boxes'][n]`` — sobald die
        Order in Pulpo „packed" ist:
          - ``shipment_tracking.tracking_code`` → DHL-Sendungsnummer
          - ``attachments[].url``               → vorsignierte S3-URL (PDF)

        Wir lesen direkt aus dem Cache (kein zusätzlicher API-Call → bleibt
        im 2-s-LAB1-Budget), laden das PDF nur, wenn eine URL da ist.
        Liefert ``(tracking, label_b64)`` bei Treffer, sonst None → DHL
        wird als Fallback versucht.
        """
        try:
            from sqlalchemy import select
            from app.modules.pulpo.client import pulpo as pulpo_client
            from app.modules.pulpo.models import PulpoPackingOrder, PulpoOrderItem
            import base64

            # 1) Pulpo-PackingOrder zum Barcode finden (Multi-Box oder Single-EAN)
            order = (await db.execute(
                select(PulpoPackingOrder).where(
                    PulpoPackingOrder.tenant_id == tenant_id,
                    PulpoPackingOrder.cart_box_barcode == barcode,
                ).limit(1)
            )).scalar_one_or_none()
            if order is None and barcode:
                order = (await db.execute(
                    select(PulpoPackingOrder).join(
                        PulpoOrderItem, PulpoOrderItem.order_db_id == PulpoPackingOrder.id,
                    ).where(
                        PulpoPackingOrder.tenant_id == tenant_id,
                        PulpoOrderItem.ean == barcode,
                    ).limit(1)
                )).scalar_one_or_none()
            if order is None:
                return None

            # 2) Boxen + Tracking aus dem gecachten raw_payload extrahieren.
            # Falls der Cache nichts hat oder die Box noch ohne Tracking ist,
            # frisch nachfragen — der Sync läuft alle 8s, manchmal hat
            # Pulpo gerade in den letzten Sekunden noch ein Label erzeugt.
            raw = order.raw_payload if isinstance(order.raw_payload, dict) else {}
            def _has_tracking(rp: dict) -> bool:
                for b in rp.get("packing_boxes") or []:
                    if isinstance(b, dict):
                        st = b.get("shipment_tracking") or {}
                        if isinstance(st, dict) and st.get("tracking_code"):
                            return True
                return False
            if not _has_tracking(raw):
                try:
                    fresh = await pulpo_client.get_packing_order(order.pulpo_order_id)
                    if isinstance(fresh, dict) and _has_tracking(fresh):
                        raw = fresh
                        # Cache nachziehen (best-effort), damit der nächste Scan
                        # ohne Round-Trip auskommt.
                        try:
                            order.raw_payload = fresh
                            await db.flush()
                        except Exception: pass
                        logger.info(
                            f"Pulpo refresh hit: order_id={order.pulpo_order_id} "
                            f"now has shipment_tracking"
                        )
                except Exception as e:
                    logger.warning(
                        f"Pulpo refresh for label lookup failed: {e!r} (continuing with cache)"
                    )
            boxes = raw.get("packing_boxes") or []
            for box in boxes:
                if not isinstance(box, dict):
                    continue
                tracking_info = box.get("shipment_tracking") or {}
                if not isinstance(tracking_info, dict):
                    continue
                tracking = str(tracking_info.get("tracking_code") or "").strip()
                if not tracking:
                    continue

                # 3) Label aus den Attachments. Pulpo liefert eine vorsignierte
                #    S3-URL zur PDF. WAS wir der Maschine ins label_url-Feld
                #    geben, steuert CMC_LAB_LABEL_MODE:
                #      "url"    → die S3-URL direkt (Maschine lädt selbst; passt
                #                 zum Feldnamen, kleiner Frame) — DEFAULT
                #      "base64" → PDF heruntergeladen und base64-kodiert
                #      "none"   → leer (Maschine druckt über eigenen Spooler;
                #                 nur Tracking als match_barcode)
                from app.core.config import get_settings as _gs
                label_mode = (_gs().cmc_lab_label_mode or "url").lower()

                label_url = ""
                for att in box.get("attachments") or []:
                    if not isinstance(att, dict):
                        continue
                    is_label = str(att.get("type") or "").lower() == "label"
                    is_pdf   = str(att.get("name") or "").lower().endswith(".pdf")
                    if is_label or is_pdf:
                        label_url = str(att.get("url") or "")
                        if label_url:
                            break

                label_value = ""
                if label_mode == "url":
                    label_value = label_url
                elif label_mode == "base64" and label_url:
                    try:
                        dl = await pulpo_client.download_url(label_url)
                        if dl:
                            label_value = base64.b64encode(dl[0]).decode("ascii")
                    except Exception as e:
                        logger.warning(
                            f"Pulpo label PDF download failed for {tracking}: {e!r}"
                        )
                # "none" → label_value bleibt leer; Tracking reicht der Maschine
                # als match_barcode am Exit-Reader.

                logger.info(
                    f"Pulpo label hit: barcode={barcode} order_id={order.pulpo_order_id} "
                    f"tracking={tracking} mode={label_mode} "
                    f"label_len={len(label_value)} url={'yes' if label_url else 'no'}"
                )
                return tracking, label_value

            # Order gefunden, aber noch keine packing_box mit Tracking
            # (Pulpo hat das Label noch nicht erzeugt) → Fallback auf DHL.
            logger.info(
                f"Pulpo order found but no shipment_tracking yet "
                f"(order_id={order.pulpo_order_id}) — falling back to DHL"
            )
            return None
        except Exception as e:
            logger.warning(f"Pulpo label lookup failed: {e!r} — falling back to DHL")
            return None

    async def reap_stale_connections(self, max_idle_s: float = 300) -> int:
        """Close + drop sockets that have been silent for a long time.

        is_live blendet stumme Verbindungen sofort aus der Anzeige aus;
        hier räumen wir sie zusätzlich physisch weg (Socket schließen,
        Eintrag entfernen), damit sich über Tage nichts ansammelt. Kommt
        die Maschine zurück, baut sie ohnehin eine neue Verbindung auf."""
        reaped = 0
        for key in list(self._connections.keys()):
            conn = self._connections.get(key)
            if conn is None:
                continue
            if not conn.is_alive or conn.idle_seconds > max_idle_s:
                await conn.close()
                self._connections.pop(key, None)
                reaped += 1
                logger.info(
                    f"Reaped stale machine connection {key} "
                    f"(idle {conn.idle_seconds:.0f}s, protocol_id={conn.protocol_id})"
                )
        return reaped

    # ── Server mode: machines connect to us ───────────────────────────────

    async def start_server(self, host: str, port: int) -> None:
        self._server = await asyncio.start_server(self._handle_client, host, port)
        self._bound_port = port
        logger.info(f"CMC Gateway listening on {host}:{port}")

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        addr = writer.get_extra_info("peername")
        machine_id = f"machine_{addr[0]}_{addr[1]}"
        logger.info(f"New machine connection from {addr}")

        conn = MachineConnection(machine_id, reader, writer)
        self._connections[machine_id] = conn

        await ws_manager.broadcast({
            "type": "SYSTEM",
            "severity": "success",
            "message": f"Machine connected from {addr[0]}:{addr[1]}",
            "machine_id": machine_id,
        })

        try:
            await self._read_loop(machine_id, conn)
        finally:
            conn.is_alive = False
            await ws_manager.broadcast({
                "type": "SYSTEM",
                "severity": "warning",
                "message": f"Machine {machine_id} disconnected",
                "machine_id": machine_id,
            })

    # ── Client mode: we connect to a machine ──────────────────────────────

    async def connect_to_machine(self, host: str, port: int, machine_id: str) -> None:
        reader, writer = await asyncio.open_connection(host, port)
        conn = MachineConnection(machine_id, reader, writer)
        self._connections[machine_id] = conn
        logger.info(f"Connected to machine {machine_id} at {host}:{port}")
        asyncio.create_task(self._read_loop(machine_id, conn))

    # ── Shared read loop ──────────────────────────────────────────────────

    async def _read_loop(self, machine_id: str, conn: MachineConnection) -> None:
        """Read data from TCP, parse, respond, and broadcast to WebSocket."""
        try:
            while conn.is_alive:
                data = await conn.reader.read(4096)
                if not data:
                    break

                conn.last_heartbeat = datetime.now(timezone.utc)

                # Roh-Frame loggen (STX/ETX sichtbar gemacht) — unverzichtbar
                # für die Inbetriebnahme an der echten Maschine: so sehen wir
                # exakt, welche Felder die CMC im ENQ schickt und können die
                # Antwort 1:1 dagegen abgleichen ("Wrong Barcode"-Diagnose).
                logger.info(
                    "TCP recv ← %s",
                    data.replace(b"\x02", b"<STX>").replace(b"\x03", b"<ETX>")
                        .decode("utf-8", "replace").strip(),
                )

                # Parse raw TCP data
                events = parse_message(data)

                for event in events:
                    msg_type = event["type"]
                    msg_data = event["data"]

                    # Jedes Event trägt den Modus, in dem es entstand — das
                    # Frontend blendet damit Test-Aufträge im Produktiv-Modus
                    # aus (und umgekehrt), auch im Live-Stream/Ringbuffer.
                    if isinstance(msg_data, dict):
                        msg_data["is_test"] = pulpo_runtime.test_mode

                    # Capture the protocol id ("0001") from the first frame
                    # that carries one, so the sidebar shows the CW#### label
                    # instead of the socket address.
                    if conn.protocol_id is None and isinstance(msg_data, dict):
                        declared = msg_data.get("machine_id")
                        if isinstance(declared, str) and declared.strip():
                            conn.protocol_id = declared.strip()
                            # Stationsflags der Maschine aus der DB laden —
                            # damit die ENQ-Antwort genau die LAB/INV-Stationen
                            # ankündigt, die diese Hardware tatsächlich hat.
                            asyncio.create_task(self._load_station_flags(conn))

                    # STEP 1 (latency-critical): answer the machine as fast
                    # as possible. The CMC simulator times out after ~2s, so
                    # any slow WebSocket client or DB write must not delay
                    # the TCP reply. We build and send the response first,
                    # then fan out to browsers and persistence after.
                    response: dict | None = None
                    if msg_type != "UNKNOWN":
                        # ENQ-Vorberechnung: Glitch-Schutz + CW-Listen-
                        # Auswertung. Beides liefert dem Parser fertige
                        # Flags, side-effects (consumed-Hochzähler, Last-
                        # Scan-Memo) bleiben hier in der Connection-Schicht.
                        is_duplicate = False
                        is_unknown_barcode = False
                        is_resume = False
                        matched_cw_list: str | None = None
                        filter_passed = True
                        if msg_type == "ENQ" and conn.protocol_id:
                            # Stationsflags MÜSSEN vor dem ENQ-Reply geladen
                            # sein (Lab1Sel etc.). Der Hintergrund-Task kann
                            # noch laufen → hier zuverlässig nachladen, falls
                            # noch nicht gecacht. Einmaliger DB-Read, danach
                            # gecacht; im 2-s-Budget der Maschine unkritisch.
                            if conn.station_flags is None:
                                try:
                                    await asyncio.wait_for(
                                        self._load_station_flags(conn), timeout=1.0,
                                    )
                                except Exception as e:
                                    logger.warning(f"station flags load failed inline: {e}")
                            raw_bc = str(msg_data.get("barcode", "") or "")
                            barcode = sanitize_barcode(raw_bc)
                            # Resolved code flows through the whole pipeline
                            # (filter, multi_only reject, consume, persistence,
                            # UI). Keep the raw read for traceability if a
                            # multi-read was collapsed (e.g. "M319991;406…").
                            if isinstance(msg_data, dict):
                                if barcode != raw_bc.strip():
                                    msg_data["barcode_raw"] = raw_bc.strip()
                                msg_data["barcode"] = barcode
                            now_ts = time.monotonic()
                            if barcode and self.is_scan_glitch(
                                conn.protocol_id, barcode, now=now_ts,
                            ):
                                is_duplicate = True
                            elif barcode and self._tracker.is_active_barcode(machine_id, barcode):
                                # Wiederaufnahme: dasselbe Paket läuft erneut über
                                # den Scanner (z.B. ausgeworfen und neu aufgelegt,
                                # bevor der erste Durchlauf terminiert ist). Wir
                                # akzeptieren es, buchen aber KEINEN neuen Slot ab
                                # (der ist schon vom noch aktiven Auftrag belegt)
                                # und weisen es nicht als Doppel-Scan ab.
                                is_resume = True
                                matched_cw_list, _fp, _ha = (
                                    self.evaluate_cw_for_enq(conn.protocol_id, barcode)
                                )
                                filter_passed = True
                            else:
                                matched_cw_list, filter_passed, _has_active = (
                                    self.evaluate_cw_for_enq(conn.protocol_id, barcode)
                                )
                                if not filter_passed:
                                    is_unknown_barcode = True

                        try:
                            multi_only = (
                                conn.protocol_id is not None
                                and self._machine_modes.get(conn.protocol_id) == "multi_only"
                            )
                            # Wenn das Paket zum Eject vorgemerkt ist, ziehen
                            # wir die Markierung jetzt — beim NÄCHSTEN Event
                            # dieses Refs (z.B. LAB1 nach ACK) wäre sie
                            # ohnehin nicht mehr wirksam; und wir wollen
                            # nicht doppelt rejecten. So bekommt das erste
                            # relevante Gate den Reject und das war's.
                            msg_ref = (
                                msg_data.get("reference_id") or msg_data.get("referenceId") or ""
                                if isinstance(msg_data, dict) else ""
                            )
                            eject_now = bool(
                                conn.protocol_id and msg_ref
                                and msg_type in ("ACK", "INV", "LAB1", "LAB2", "END")
                                and self.consume_ejection(conn.protocol_id, str(msg_ref))
                            )
                            response = build_response(
                                msg_type, msg_data,
                                is_duplicate=is_duplicate,
                                is_unknown_barcode=is_unknown_barcode,
                                matched_cw_list=matched_cw_list,
                                multi_only=multi_only,
                                pending_eject=eject_now,
                                station_flags=conn.station_flags,
                            )
                            # ── DHL-Label bei LAB1 anfordern ───────────────
                            # Nur wenn die Antwort akzeptiert (result=1) und
                            # ein DHL-Konto konfiguriert ist; im Test-Modus
                            # liefert der Service eine Mock-Tracking-Nummer.
                            # Wir haben hier ein Hard-Timeout von 1.5 s, damit
                            # wir innerhalb des 2-s-Antwortbudgets der CW1000
                            # bleiben. Bei Timeout/Fehler wird das Item per
                            # result=0 abgelehnt — sauberer Reject statt
                            # blinder Annahme.
                            # ── Pre-Creation bei IND (Doku §6): sobald das
                            # Item eingeschleust ist, im Hintergrund das Label
                            # aus Pulpo/DHL holen und persistieren. Bei LAB1
                            # liegt es dann schon im Cache → kein Hot-Path-
                            # Call mehr, kein 2-s-Timeout-Risiko. Nicht
                            # awaiten — IND-Antwort darf nicht warten.
                            if (
                                msg_type == "IND" and conn.protocol_id
                                and isinstance(msg_data, dict)
                            ):
                                ref_ind = str(response.get("reference_id") or "")
                                if ref_ind:
                                    asyncio.create_task(
                                        self._precreate_label(conn.protocol_id, ref_ind, dict(msg_data))
                                    )

                            if msg_type == "LAB1" and response.get("result") == 1 and conn.protocol_id:
                                ref_for_label = str(response.get("reference_id") or "")
                                from app.core.config import get_settings as _gs
                                _dhl_timeout = _gs().dhl_lab1_timeout_s
                                try:
                                    await asyncio.wait_for(
                                        self._enrich_lab1_with_dhl(
                                            response, conn.protocol_id, ref_for_label, msg_data,
                                        ),
                                        timeout=_dhl_timeout,
                                    )
                                except asyncio.TimeoutError:
                                    logger.warning(
                                        f"DHL label timeout for {ref_for_label} — rejecting LAB1"
                                    )
                                    response["result"] = 0
                                    response["status"] = "REJECTED"
                                    response["rejection_reason"] = "dhl_timeout"
                                    try:
                                        from app.modules.dhl.runtime import dhl_runtime
                                        from datetime import datetime as _dt
                                        dhl_runtime.last_error = f"LAB1 {ref_for_label}: timeout after 1.5s"
                                        dhl_runtime.last_error_at = _dt.utcnow()
                                    except Exception: pass
                                except Exception as e:
                                    # DHL liefert den Validation-Body als
                                    # .payload mit — der zeigt EXAKT, welches
                                    # Feld DHL beanstandet. Ohne den Body ist
                                    # ein 400 nicht diagnostizierbar.
                                    payload = getattr(e, "payload", None)
                                    logger.warning(
                                        f"DHL label error for {ref_for_label}: {e!r} "
                                        f"body={payload!r} — rejecting LAB1",
                                        exc_info=True,
                                    )
                                    response["result"] = 0
                                    response["status"] = "REJECTED"
                                    response["rejection_reason"] = "dhl_error"
                                    # Fehlertext ins Runtime spiegeln, damit er
                                    # in der DHL-Statuskarte sichtbar ist.
                                    try:
                                        from app.modules.dhl.runtime import dhl_runtime
                                        from datetime import datetime as _dt
                                        dhl_runtime.last_error = f"LAB1 {ref_for_label}: {e!r}"
                                        dhl_runtime.last_error_at = _dt.utcnow()
                                    except Exception: pass
                            # Nach erfolgreicher ENQ-Annahme: verbrauchten
                            # CW-Slot abbuchen und Glitch-Memo setzen.
                            if (
                                msg_type == "ENQ" and conn.protocol_id
                                and response.get("result") == 1
                            ):
                                bc = str(msg_data.get("barcode", "") or "").strip()
                                # Wiederaufnahme verbraucht keinen neuen Slot.
                                if matched_cw_list and filter_passed and not is_resume:
                                    if self.consume_cw_entry(conn.protocol_id, matched_cw_list, bc):
                                        self.record_cw_consumption(
                                            conn.protocol_id,
                                            str(response.get("reference_id", "") or ""),
                                            matched_cw_list, bc,
                                        )
                                self.record_scan(conn.protocol_id, bc, now=time.monotonic())
                            msg_machine_id = msg_data.get("machine_id", "") if isinstance(msg_data, dict) else ""
                            response_bytes = serialize_response(msg_type, dict(response), msg_machine_id)
                        except Exception as e:
                            # Never let a serialisation bug take down the
                            # read loop — log and keep processing.
                            logger.exception(f"Failed to build {msg_type} response: {e}")
                            response = None
                            response_bytes = None

                        if response_bytes is not None:
                            try:
                                await conn.send(response_bytes)
                                logger.info(
                                    "TCP reply %s → %s (%d bytes)",
                                    msg_type,
                                    response_bytes.replace(b"\x02", b"").replace(b"\x03", b"").decode("utf-8", "replace"),
                                    len(response_bytes),
                                )
                            except Exception as e:
                                logger.error(f"Failed to send response: {e}")

                        # ENQ frames don't carry a reference_id on the wire
                        # (the CIS assigns one in the reply). Inject the
                        # reference we just chose back into the parsed data
                        # so the dashboard can group the scan with the
                        # subsequent IND/ACK/LAB1/END events for the same
                        # package — otherwise the Paket-Verlauf tracker
                        # never lights up "Gescannt".
                        if response and isinstance(msg_data, dict) and not msg_data.get("reference_id"):
                            assigned_ref = response.get("reference_id")
                            if assigned_ref:
                                msg_data["reference_id"] = assigned_ref

                        # Annotate the broadcast payload with the rejection
                        # cause (NOREAD / duplicate scan) so the dashboard
                        # banner can render a human reason without having to
                        # re-derive the rule.
                        if response and isinstance(msg_data, dict):
                            rejection = response.get("rejection_reason")
                            if rejection:
                                msg_data["rejection_reason"] = rejection
                            if is_resume:
                                msg_data["resumed"] = True
                            # Welche CW-Liste hat den Scan „gefangen"? Wird
                            # an die Bestellung gehängt, damit die Tabelle
                            # die Spalte rendern und filtern kann.
                            matched_list = response.get("cw_list")
                            if matched_list:
                                msg_data["cw_list"] = matched_list

                        # Keep the in-memory tracker in sync with the latest
                        # event so future ENQ duplicate-checks see the truth.
                        if response and isinstance(msg_data, dict):
                            term_ref = str(response.get("reference_id", "") or "")
                            self._tracker.apply(machine_id, msg_type, msg_data, term_ref)
                            # CW-Slot-Buchführung: bei sauberem Abschluss behalten,
                            # bei Auswurf/Ablehnung zurückgeben — damit ein neu
                            # aufgelegtes Paket den Slot korrekt neu verbraucht.
                            if conn.protocol_id and term_ref:
                                pid = conn.protocol_id
                                if msg_type == "END":
                                    if str(msg_data.get("status")) in ("1",):
                                        self.finalize_cw_for_ref(pid, term_ref)
                                    else:
                                        self.release_cw_for_ref(pid, term_ref)
                                elif msg_type == "REM":
                                    self.release_cw_for_ref(pid, term_ref)
                                elif msg_type == "ACK" and msg_data.get("good") not in (1, "1", True, "true"):
                                    self.release_cw_for_ref(pid, term_ref)
                                elif eject_now:
                                    self.release_cw_for_ref(pid, term_ref)

                        # Sequence-based ejection (cmc-process-doc § 7 #1):
                        # when END fires, any older active state on the same
                        # machine that never reached END was silently lost —
                        # transition them to EJECTED and broadcast synthetic
                        # events so the dashboard updates.
                        if msg_type == "END" and isinstance(msg_data, dict):
                            try:
                                current_seq = int(str(msg_data.get("event", "")).strip() or "0")
                            except ValueError:
                                current_seq = 0
                            if current_seq > 0:
                                ejected = self._tracker.eject_stale_predecessors(machine_id, current_seq)
                                for stale in ejected:
                                    # Verloren am Band → Slot zurückgeben.
                                    if conn.protocol_id:
                                        self.release_cw_for_ref(
                                            conn.protocol_id, str(stale.get("reference_id", "") or ""),
                                        )
                                    asyncio.create_task(ws_manager.broadcast({
                                        "type": "EJECT",
                                        "severity": "warning",
                                        "message": f"Älterer Auftrag {stale['reference_id']} automatisch ausgeworfen (übersprungen durch END {current_seq})",
                                        "machine_id": machine_id,
                                        "data": {
                                            **stale,
                                            "machine_id": conn.protocol_id or machine_id,
                                            "new_state": "EJECTED",
                                            "trigger_sequence": current_seq,
                                        },
                                    }))

                    # STEP 2: fan out to dashboard clients and persistence.
                    # Both are fire-and-forget so a slow browser cannot back
                    # up the TCP reply loop for the next message.
                    asyncio.create_task(ws_manager.broadcast({
                        "type": msg_type,
                        "severity": "info" if msg_type != "UNKNOWN" else "warning",
                        "message": _describe_event(msg_type, msg_data),
                        "machine_id": machine_id,
                        "data": msg_data,
                        "raw": event.get("raw", ""),
                    }))

                    if response is not None:
                        asyncio.create_task(ws_manager.broadcast({
                            "type": f"{msg_type}_RESPONSE",
                            "severity": "success",
                            "message": f"Sent {msg_type.lower()} response",
                            "machine_id": machine_id,
                            "data": response,
                        }))

                    if msg_type != "UNKNOWN":
                        asyncio.create_task(persist_event(msg_type, dict(msg_data)))

        except asyncio.CancelledError:
            pass
        except ConnectionResetError:
            logger.info(f"Connection reset by {machine_id}")
        except Exception as e:
            logger.error(f"Read error for {machine_id}: {e}")
        finally:
            conn.is_alive = False
            logger.info(f"Machine {machine_id} disconnected")

    # ── Shutdown ──────────────────────────────────────────────────────────

    async def shutdown(self) -> None:
        for conn in self._connections.values():
            await conn.close()
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        logger.info("CMC Gateway shut down")


def _describe_event(msg_type: str, data: dict) -> str:
    """Human-readable description of a CMC event."""
    ref = data.get("reference_id", data.get("referenceId", ""))
    barcode = data.get("barcode", "")

    descriptions = {
        "ENQ": f"Barcode scanned: {barcode}" if barcode else "Barcode scanned",
        "IND": f"Package {ref} entered conveyor",
        "ACK": f"Package {ref} measured — {data.get('height_mm', '?')}×{data.get('length_mm', '?')}×{data.get('width_mm', '?')} mm",
        "INV": f"Invoice requested for {ref}",
        "LAB1": f"Label 1 requested for {ref} — weight: {data.get('weight_scale', '?')}g",
        "LAB2": f"Label 2 requested for {ref}",
        "END": f"Package {ref} exited — status: {'OK' if data.get('status') == '1' or data.get('good') else 'REJECTED'}",
        "REM": f"Package {ref} removed from conveyor",
        "HBT": "Heartbeat",
        "STS": f"Status: {data.get('status', 'unknown')}",
    }
    return descriptions.get(msg_type, f"Unknown message: {msg_type}")


# Singleton
connection_manager = ConnectionManager()
