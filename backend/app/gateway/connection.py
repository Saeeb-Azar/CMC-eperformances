"""
TCP connection manager for CMC CartonWrap machines.

Handles both server mode (CIS listens, machines connect)
and client mode (CIS connects to machine).
Port 15001 as per CMC CIS protocol.
"""

import asyncio
from datetime import datetime, timezone

from app.core.logging import logger
from app.gateway.parser import parse_message, build_response, serialize_response
from app.gateway.persistence import persist_event
from app.gateway.websocket import ws_manager


# Active states per cmc-process-doc Section 4 / Section 7 "Order Reservation
# at ENQ". A barcode whose package is in any of these is considered already
# being processed and must not be re-accepted at the scanner.
ACTIVE_STATES = frozenset({"ASSIGNED", "INDUCTED", "SCANNED", "LABELED"})


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
        # jede mit eigenem Aktiv-Flag und einer Barcode-Menge. Aus Pulpo
        # gefütterte „Wellen". Eine Bestellung wird angenommen, sobald ihr
        # Barcode in mindestens einer AKTIVEN Liste auftaucht. Die erste
        # matchende Liste wird der Bestellung als Herkunft zugeordnet und
        # an die Broadcasts gehängt, damit die UI sie spaltenweise filtern
        # und anzeigen kann. Wenn KEINE Liste aktiv ist → kein Filter
        # (jeder Scan kommt durch, abgesehen von NOREAD/Dup/Multi-Only).
        self._cw_lists: dict[str, dict[str, dict]] = {}
        # Mid-flight Ejections: pro Maschine eine Menge von reference_ids,
        # die beim nächsten ACK/INV/LAB1/LAB2/END mit Reject beantwortet
        # werden sollen. Die Maschine wirft das Paket dann am nächsten
        # möglichen Gate aus; das Band läuft normal weiter, andere
        # Bestellungen sind nicht betroffen. In-Memory; entweder durch
        # Operator (manuelle Eject-Button) oder später durch automatische
        # Soll-/Ist-Checks befüllt.
        self._pending_ejections: dict[str, set[str]] = {}

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

    def get_active_cw_lists(self, protocol_id: str) -> list[tuple[str, set[str]]]:
        """Returns aktive Listen als [(name, {barcodes...}), ...] in
        insertion order. Erste Liste in der Reihenfolge gewinnt bei
        Mehrfach-Matches.
        """
        out: list[tuple[str, set[str]]] = []
        for name, lst in self._cw_lists.get(protocol_id, {}).items():
            if lst.get("active"):
                out.append((name, lst.get("barcodes", set())))
        return out

    def get_all_cw_lists(self, protocol_id: str) -> list[tuple[str, bool, set[str]]]:
        """Alle Listen mit Aktiv-Flag — für Filter UND Tagging. Insertion-
        Order. Aktive Listen tauchen zuerst auf, damit beim Tagging ein
        aktiver Treffer einem inaktiven vorgezogen wird.
        """
        items = list(self._cw_lists.get(protocol_id, {}).items())
        items.sort(key=lambda kv: not kv[1].get("active"))
        return [
            (name, bool(lst.get("active")), lst.get("barcodes", set()))
            for name, lst in items
        ]

    def find_cw_list_for_barcode(self, protocol_id: str, barcode: str) -> str | None:
        """Welche aktive Liste enthält diesen Barcode? Erste Match gewinnt.
        Returns None wenn keine Liste matched oder keine aktiv ist.
        """
        if not barcode:
            return None
        for name, barcodes in self.get_active_cw_lists(protocol_id):
            if barcode in barcodes:
                return name
        return None

    def upsert_cw_list(
        self, protocol_id: str, name: str,
        *, barcodes: list[str] | None = None, active: bool | None = None,
    ) -> dict:
        per_machine = self._cw_lists.setdefault(protocol_id, {})
        existing = per_machine.get(name) or {"active": False, "barcodes": set()}
        if barcodes is not None:
            existing["barcodes"] = {b.strip() for b in barcodes if b and b.strip()}
        if active is not None:
            existing["active"] = bool(active)
        per_machine[name] = existing
        return self._serialize_cw_list(name, existing)

    def delete_cw_list(self, protocol_id: str, name: str) -> bool:
        per_machine = self._cw_lists.get(protocol_id, {})
        return per_machine.pop(name, None) is not None

    @staticmethod
    def _serialize_cw_list(name: str, lst: dict) -> dict:
        return {
            "name": name,
            "active": bool(lst.get("active")),
            "barcodes": sorted(lst.get("barcodes", set())),
            "count": len(lst.get("barcodes", set())),
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
        else:
            s = self._pending_ejections.pop(protocol_id, None)
            if s:
                cleared_ejections = len(s)
        return {"packages": cleared_packages, "ejections": cleared_ejections}

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
            if not conn.is_alive or not conn.protocol_id:
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
            if c.is_alive and not c.protocol_id
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
        if conn and conn.is_alive:
            return conn
        for c in self._connections.values():
            if c.is_alive and c.protocol_id == machine_id:
                return c
        return None

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

                # Parse raw TCP data
                events = parse_message(data)

                for event in events:
                    msg_type = event["type"]
                    msg_data = event["data"]

                    # Capture the protocol id ("0001") from the first frame
                    # that carries one, so the sidebar shows the CW#### label
                    # instead of the socket address.
                    if conn.protocol_id is None and isinstance(msg_data, dict):
                        declared = msg_data.get("machine_id")
                        if isinstance(declared, str) and declared.strip():
                            conn.protocol_id = declared.strip()

                    # STEP 1 (latency-critical): answer the machine as fast
                    # as possible. The CMC simulator times out after ~2s, so
                    # any slow WebSocket client or DB write must not delay
                    # the TCP reply. We build and send the response first,
                    # then fan out to browsers and persistence after.
                    response: dict | None = None
                    if msg_type != "UNKNOWN":
                        # Order-Reservation guard (process doc Section 7
                        # "Order Reservation at ENQ"): if the barcode is
                        # already on the belt, reject the scan up front so
                        # we never create a duplicate state.
                        is_duplicate = False
                        if msg_type == "ENQ":
                            barcode = str(msg_data.get("barcode", "") or "").strip()
                            if barcode:
                                is_duplicate = self._tracker.is_active_barcode(machine_id, barcode)

                        try:
                            multi_only = (
                                conn.protocol_id is not None
                                and self._machine_modes.get(conn.protocol_id) == "multi_only"
                            )
                            all_lists = (
                                self.get_all_cw_lists(conn.protocol_id)
                                if conn.protocol_id else []
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
                                multi_only=multi_only,
                                cw_lists=all_lists,
                                pending_eject=eject_now,
                            )
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
                            # Welche CW-Liste hat den Scan „gefangen"? Wird
                            # an die Bestellung gehängt, damit die Tabelle
                            # die Spalte rendern und filtern kann.
                            matched_list = response.get("cw_list")
                            if matched_list:
                                msg_data["cw_list"] = matched_list

                        # Keep the in-memory tracker in sync with the latest
                        # event so future ENQ duplicate-checks see the truth.
                        if response and isinstance(msg_data, dict):
                            self._tracker.apply(
                                machine_id, msg_type, msg_data,
                                response.get("reference_id", ""),
                            )

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
