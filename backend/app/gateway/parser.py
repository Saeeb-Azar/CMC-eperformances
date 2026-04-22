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


def build_response(msg_type: str, data: dict) -> dict:
    """Build a default CIS response for a CMC message type.

    Echoes back `event` and `reference_id` so the simulator recognises the
    correlation; without them it reports "reference is wrong".
    """
    ref = data.get("reference_id", data.get("referenceId", ""))
    event = data.get("event", "")
    barcode = data.get("barcode", "")

    if msg_type == "ENQ" and not ref:
        # Derive a reference id matching the CW1000 simulator's own default
        # ("ref0001") — "ref" + zero-padded event counter. Keeps the string
        # short and uniform with what the operator types into subsequent
        # IND/ACK/LAB1/END fields.
        event_num = str(event or "").strip().lstrip("0")
        try:
            ref = f"ref{int(event_num):04d}" if event_num else "ref0001"
        except ValueError:
            ref = "ref0001"

    responses = {
        "ENQ": {
            "event": event,
            "reference_id": ref,
            "result": 1,
            "item_validated": True,
            "description": "",
            "label_match": barcode,
            "lab1_enabled": True,
            "lab2_enabled": False,
            "lab3_enabled": False,
            "inv_enabled": False,
            "sorter": 0,
        },
        "IND": {"event": event, "reference_id": ref, "result": 1},
        "ACK": {"event": event, "reference_id": ref, "result": 1, "item_validated": True, "flag": "PROCESSABLE"},
        "INV": {"event": event, "reference_id": ref, "result": 1, "match_barcode": barcode},
        "LAB1": {"event": event, "reference_id": ref, "result": 1, "match_barcode": barcode, "label_url": "", "status": ""},
        "LAB2": {"event": event, "reference_id": ref, "result": 1, "match_barcode": barcode, "label_url": "", "status": ""},
        "END": {"event": event, "reference_id": ref, "result": 1},
        "REM": {"event": event, "reference_id": ref, "result": 1},
        "HBT": {"result": 1},
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
            # Note: CW1000 CIS rel 4.0 expects `item_validated` in the result
            # slot here (it's the accept/reject flag for scanner). Including a
            # separate `result` field before it makes the simulator refuse the
            # frame (timeout). Layout mirrors the fields shown in the ENQ
            # response panel: Item Validated, Reference ID, Description,
            # Label Match, LAB1/LAB2/LAB3, INV, Sorter.
            "event", "reference_id", "item_validated", "description",
            "label_match", "lab1_enabled", "lab2_enabled", "lab3_enabled",
            "inv_enabled", "sorter",
        ],
        "ACK": ["event", "reference_id", "result", "item_validated", "flag"],
        "LAB1": ["event", "reference_id", "result", "match_barcode", "label_url", "status"],
        "LAB2": ["event", "reference_id", "result", "match_barcode", "label_url", "status"],
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
