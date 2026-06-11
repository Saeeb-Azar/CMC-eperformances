"""
CMC TCP Message Parser.

Parses raw TCP bytes from the CMC CartonWrap simulator into structured events.
The CIS protocol uses XML messages. We also support JSON as fallback.
"""

import json
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from app.core.logging import logger
from app.gateway.protocol import MessageType


# Known CMC message types (uppercase = from machine)
KNOWN_TYPES = {t.value for t in MessageType}


def parse_message(raw: bytes) -> list[dict]:
    """
    Parse raw TCP data into a list of event dicts.
    Returns: [{"type": "ENQ", "data": {...}, "raw": "..."}]
    """
    text = raw.decode("utf-8", errors="replace")
    # Strip CMC CIS framing: STX (0x02) and ETX (0x03) — both binary and literal text forms
    text = (
        text.replace("\x02", "")
            .replace("\x03", "")
            .replace("<stx>", "")
            .replace("<etx>", "")
            .replace("<STX>", "")
            .replace("<ETX>", "")
            .strip()
    )
    if not text:
        return []

    events = []

    # Try XML first (most CIS protocols use XML)
    try:
        events = _parse_xml(text)
        if events:
            return events
    except Exception:
        pass

    # Try JSON
    try:
        events = _parse_json(text)
        if events:
            return events
    except Exception:
        pass

    # Try pipe-delimited (CMC CIS format: MACHINE_ID|TYPE|field1|...)
    try:
        events = _parse_pipe(text)
        if events:
            return events
    except Exception:
        pass

    # Fallback: return raw as unknown
    return [{
        "type": "UNKNOWN",
        "data": {"raw_text": text},
        "raw": text,
    }]


def _parse_xml(text: str) -> list[dict]:
    """Parse XML messages. Handles both single and multi-message payloads."""
    events = []

    # Wrap in root if multiple top-level elements
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        try:
            root = ET.fromstring(f"<root>{text}</root>")
        except ET.ParseError:
            return []

    # The root tag might be the message type itself
    tag = root.tag.upper()
    if tag in KNOWN_TYPES:
        data = _xml_element_to_dict(root)
        events.append({"type": tag, "data": data, "raw": text})
    else:
        # Check children
        for child in root:
            child_tag = child.tag.upper()
            if child_tag in KNOWN_TYPES:
                data = _xml_element_to_dict(child)
                events.append({"type": child_tag, "data": data, "raw": ET.tostring(child, encoding="unicode")})

    return events


def _xml_element_to_dict(elem: ET.Element) -> dict:
    """Convert XML element to dict (attributes + child text)."""
    data = dict(elem.attrib)
    for child in elem:
        data[child.tag] = child.text or ""
    return data


def _parse_json(text: str) -> list[dict]:
    """Parse JSON messages."""
    obj = json.loads(text)

    if isinstance(obj, list):
        events = []
        for item in obj:
            msg_type = (item.get("type") or item.get("message_type") or "UNKNOWN").upper()
            events.append({"type": msg_type, "data": item, "raw": json.dumps(item)})
        return events

    if isinstance(obj, dict):
        msg_type = (obj.get("type") or obj.get("message_type") or "UNKNOWN").upper()
        return [{"type": msg_type, "data": obj, "raw": text}]

    return []


# Positional field names for CMC CIS messages (sender → CIS).
# Each CW1000 frame starts with <STX>MACHINE_ID|TYPE|EVENT|... and so the
# second token after TYPE is the per-machine event counter, not a payload
# field. reference_id follows the event on every message that carries one.
POSITIONAL_FIELDS: dict[str, list[str]] = {
    "ENQ": ["event", "barcode", "source"],
    "IND": ["event", "reference_id"],
    "ACK": ["event", "reference_id", "good", "bad", "height_mm", "length_mm", "width_mm", "area_carton"],
    "INV": ["event", "reference_id", "num_pages"],
    "LAB1": ["event", "reference_id", "good", "bad", "weight_scale", "weight_carton", "weight_insert", "feeders"],
    "LAB2": ["event", "reference_id", "good", "bad", "weight_scale", "weight_carton", "weight_insert", "feeders"],
    "END": ["event", "reference_id", "status", "sizes_length", "sizes_width", "sizes_height", "weight"],
    "REM": ["event", "reference_id"],
    "HBT": [],
    "STS": ["status"],
}


def _parse_pipe(text: str) -> list[dict]:
    """Parse pipe-delimited CMC CIS messages.

    Supported layouts:
      TYPE|field1|field2|...
      MACHINE_ID|TYPE|field1|field2|...   (CMC CW1000 default)

    Field values may be positional (mapped to POSITIONAL_FIELDS) or key=value.
    Anything past the known positional slots is stored as field_N.
    """
    events = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split("|")]
        if not parts:
            continue

        # Locate the message-type token (check first two positions)
        type_idx = None
        for i in range(min(2, len(parts))):
            if parts[i].upper() in KNOWN_TYPES:
                type_idx = i
                break
        if type_idx is None:
            continue

        msg_type = parts[type_idx].upper()
        data: dict = {}
        if type_idx == 1:
            data["machine_id"] = parts[0]

        field_names = POSITIONAL_FIELDS.get(msg_type, [])
        tail = parts[type_idx + 1:]
        extra_idx = 0
        for i, part in enumerate(tail):
            if "=" in part:
                k, v = part.split("=", 1)
                data[k.strip()] = v.strip()
            elif i < len(field_names):
                data[field_names[i]] = part
            else:
                data[f"field_{extra_idx}"] = part
                extra_idx += 1

        events.append({"type": msg_type, "data": data, "raw": line})
    return events


def build_response(
    msg_type: str,
    data: dict,
    *,
    is_duplicate: bool = False,
    is_unknown_barcode: bool = False,
    matched_cw_list: str | None = None,
    multi_only: bool = False,
    pending_eject: bool = False,
    station_flags: dict[str, bool] | None = None,
) -> dict:
    """Build a default CIS response for a CMC message type.

    Echoes back `event` and `reference_id` so the simulator recognises the
    correlation; without them it reports "reference is wrong".

    ENQ-specific handling:
      - empty / "NOREAD" barcode                    → ref `NOREAD-<event>`,        result=0
      - is_duplicate flag set                       → ref `DUPLICATE-<event>`,     result=0
      - aktive CW-Listen gepflegt, kein Match darin → ref `UNKNOWN-<event>`,       result=0
      - multi_only mode + pure-numeric              → ref `SINGLE-REJECT-<event>`, result=0
      Wenn der Scan akzeptiert wird und durch eine aktive CW-Liste
      „gefangen" wurde, wird ihr Name als `cw_list` im Response-Dict
      mitgegeben — der Read-Loop hängt das ans Broadcast-Payload und die
      UI rendert/filtert danach.

      `active_cw_lists` ist eine Liste von (name, barcodes)-Tupeln in
      Wirkungs-Reihenfolge. Wenn die Liste leer / None ist, wird kein
      Listen-Filter angewandt — Scans gehen durch wie ohne Listen.
    """
    ref = data.get("reference_id", data.get("referenceId", ""))
    event = data.get("event", "")
    barcode = data.get("barcode", "")

    # ENQ classification. Filter-Entscheidung (CW-Listen-Mengen + Glitch-
    # Fenster) wird vom Caller in connection.py vorberechnet — der Parser
    # bekommt nur fertige Flags. Das hält Side-Effects (consumed-Hochzähler,
    # Glitch-Memo) aus der Serialize-Schicht raus.
    rejection_reason: str | None = None
    is_noread = False
    is_unknown = False
    is_single_reject = False
    if msg_type == "ENQ":
        barcode_str = str(barcode or "").strip()
        if not barcode_str or barcode_str.upper() == "NOREAD":
            is_noread = True
            rejection_reason = "no_read"
        elif is_duplicate:
            rejection_reason = "already_active"
        elif is_unknown_barcode:
            is_unknown = True
            rejection_reason = "unknown_barcode"
        elif multi_only and barcode_str.isdigit():
            is_single_reject = True
            rejection_reason = "multi_only_mode"

    if msg_type == "ENQ" and not ref:
        event_num = str(event or "").strip().lstrip("0")
        try:
            event_digits = f"{int(event_num):04d}" if event_num else "0001"
        except ValueError:
            event_digits = "0001"
        if is_noread:
            ref = f"NOREAD-{event_digits}"
        elif is_duplicate:
            ref = f"DUPLICATE-{event_digits}"
        elif is_unknown:
            ref = f"UNKNOWN-{event_digits}"
        elif is_single_reject:
            ref = f"SINGLE-REJECT-{event_digits}"
        else:
            ref = f"ref{event_digits}"

    accept_enq = msg_type != "ENQ" or (
        not is_noread and not is_duplicate and not is_unknown and not is_single_reject
    )

    # Mid-flight Eject — Operator hat das Paket nachträglich verworfen
    # (oder ein automatisches Soll-/Ist-Check wird später hier ankoppeln).
    # Die Maschine kann den Reject nur an bestimmten Gates ausführen:
    #   - ACK    → Gate hinter dem 3D-Sensor (frühest möglich, kein Karton/Label
    #              verschwendet, Band läuft weiter)
    #   - LAB1/2 → kein Label drucken, Maschine wirft am Ausgang aus
    #   - INV    → keine Etiketten-Daten, gleiches Verhalten wie LAB
    #   - END    → letzte Reject-Stelle bei Ausgangsverifikation
    # An welcher Stelle es schlägt hängt davon ab, wann der Operator klickt;
    # wir reagieren beim ersten betroffenen Event. Andere Pakete sind nicht
    # betroffen — die Maschine läuft normal weiter.
    eject_now = pending_eject and msg_type in ("ACK", "INV", "LAB1", "LAB2", "END")
    if eject_now and rejection_reason is None:
        rejection_reason = "manual_eject"

    responses = {
        "ENQ": {
            "event": event,
            "reference_id": ref,
            "result": 1 if accept_enq else 0,
            "item_validated": accept_enq,
            # description war hier — entfernt: die echte CW1000 (und die
            # Soll-Antwort des CMC-CIS-Simulators) hat KEIN description-Feld
            # zwischen item_validated und label_match. Mit dem Extra-Feld
            # rutscht alles danach um einen Slot, feeders landet wo sorter
            # erwartet wird → "Wrong enq" + Out-of-Format-Auswurf.
            # Den Ablehnungsgrund halten wir intern in rejection_reason fest.
            "label_match": barcode,
            # Stationsflags MÜSSEN zur tatsächlich installierten Hardware
            # passen — sonst antwortet die echte CW1000 mit "no LAB1 Reader
            # selected → INVALID" und wirft das Item aus. Werte kommen aus
            # der DB (modules.machines.models.Machine.lab1/lab2/inv_enabled).
            # Default ohne bekannte Maschine: konservativ alles AUS, dann
            # läuft die Mechanik durch, ohne nicht-existierende Stationen
            # anzufordern. lab3 ist noch nicht im Datenmodell — bleibt False.
            "lab1_enabled": bool((station_flags or {}).get("lab1", False)),
            "lab2_enabled": bool((station_flags or {}).get("lab2", False)),
            "lab3_enabled": False,
            "inv_enabled":  bool((station_flags or {}).get("inv",  False)),
            "sorter": 0,
            # Feeders-Bitmask (8 chars, je Bit = ein Karton-Formings-Feeder /
            # eine Pappe-Rolle). Die ECHTE CW1000 wirft den Auftrag als
            # "Out of Format (W2/W1)" aus, wenn der einzige erlaubte Feeder
            # eine andere Pappenbreite hat als zum gemessenen 3D-Item passt.
            # Wir lassen deshalb ALLE Feeder zu ("11111111") — die Maschine
            # wählt anhand der 3D-Messung selbst die richtige Karton-Größe.
            # (Default "01000000" hatte den CIS-Simulator zudem "incorrect
            # feeders value!" werfen lassen.)
            "feeders": "11111111",
            # Internal hints — stripped before wire serialisation, used by
            # connection.py to annotate the broadcast event for the dashboard.
            "rejection_reason": rejection_reason,
            "cw_list": matched_cw_list,
        },
        "IND": {"event": event, "reference_id": ref, "result": 1},
        "ACK": {
            "event": event, "reference_id": ref,
            "result": 0 if eject_now else 1,
            "item_validated": not eject_now,
            "flag": "EJECTED" if eject_now else "PROCESSABLE",
            "rejection_reason": rejection_reason if eject_now else None,
        },
        "INV": {
            "event": event, "reference_id": ref,
            "result": 0 if eject_now else 1,
            "match_barcode": barcode,
            "rejection_reason": rejection_reason if eject_now else None,
        },
        "LAB1": {
            "event": event, "reference_id": ref,
            "result": 0 if eject_now else 1,
            "match_barcode": barcode,
            "label_url": "",
            "status": "REJECTED" if eject_now else "",
            "rejection_reason": rejection_reason if eject_now else None,
        },
        "LAB2": {
            "event": event, "reference_id": ref,
            "result": 0 if eject_now else 1,
            "match_barcode": barcode,
            "label_url": "",
            "status": "REJECTED" if eject_now else "",
            "rejection_reason": rejection_reason if eject_now else None,
        },
        "END": {
            "event": event, "reference_id": ref,
            "result": 0 if eject_now else 1,
            "rejection_reason": rejection_reason if eject_now else None,
        },
        "REM": {"event": event, "reference_id": ref, "result": 1},
        "HBT": {"result": 1},
        # STS: machine reports its operational state ("RUNNING" / "PAUSE" /
        # "STOP" / "ERROR"). We just acknowledge — the simulator only needs
        # a positively-framed reply with `result=1`. Echoing the status back
        # is harmless and helps debugging.
        "STS": {
            "result": 1,
            "status": str(data.get("status", "RUNNING") or "RUNNING"),
        },
    }

    return responses.get(msg_type, {"result": 1})


def serialize_response(msg_type: str, response: dict, machine_id: str = "") -> bytes:
    """Serialize a response dict in CMC CIS pipe-delimited format.

    Output: <STX>MACHINE_ID|type|v1|v2|...<ETX>

    STX (0x02) / ETX (0x03) are the CIS frame delimiters. Values are emitted
    positionally in the order defined below per message type.
    """
    mid = str(response.pop("machine_id", "") or machine_id)

    # Positional ordering per message type (matches CMC CW1000 CIS simulator).
    # Every response echoes the original `event` counter and reference_id so
    # the simulator can correlate request/response pairs.
    order: dict[str, list[str]] = {
        "HBT": ["result"],
        "IND": ["event", "reference_id", "result"],
        "REM": ["event", "reference_id", "result"],
        "END": ["event", "reference_id", "result"],
        "INV": ["event", "reference_id", "result", "match_barcode"],
        "ENQ": [
            # CW1000 CIS rel 4.0: Reihenfolge nach Soll-Antwort des CMC-CIS-
            # Simulators ("|enq|event|ref|item_validated|label_match|lab1|
            # lab2|lab3|inv|sorter|feeders"). KEIN description-Feld in der
            # Wire-Antwort — sonst rutschen alle Werte um einen Slot, die
            # echte Maschine wirft das Item als "Wrong enq / Out of Format"
            # aus (siehe Maschinen-HMI-Logs 11.06.).
            "event", "reference_id", "item_validated",
            "label_match", "lab1_enabled", "lab2_enabled", "lab3_enabled",
            "inv_enabled", "sorter", "feeders",
        ],
        "ACK": ["event", "reference_id", "result", "item_validated", "flag"],
        "LAB1": ["event", "reference_id", "result", "match_barcode", "label_url", "status"],
        "LAB2": ["event", "reference_id", "result", "match_barcode", "label_url", "status"],
        # STS reply: CIS acknowledges a machine-status broadcast.
        "STS": ["result", "status"],
    }

    def _fmt(v):
        if isinstance(v, bool):
            return "1" if v else "0"
        return "" if v is None else str(v)

    mtype = msg_type.upper()
    if mtype in order:
        parts = [mid, msg_type.lower()]
        for key in order[mtype]:
            parts.append(_fmt(response.get(key, "")))
    else:
        # Unknown type: fall back to key=value so we don't lose info
        parts = [mid, msg_type.lower()]
        for k, v in response.items():
            parts.append(f"{k}={_fmt(v)}")

    payload = "|".join(parts)
    return b"\x02" + payload.encode("utf-8") + b"\x03"
