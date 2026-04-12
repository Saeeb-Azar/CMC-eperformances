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
    text = raw.decode("utf-8", errors="replace").strip()
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

    # Try pipe-delimited (TYPE|field1|field2|...)
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


def _parse_pipe(text: str) -> list[dict]:
    """Parse pipe-delimited messages: TYPE|field1=value1|field2=value2"""
    events = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split("|")
        if parts and parts[0].upper() in KNOWN_TYPES:
            msg_type = parts[0].upper()
            data = {}
            for part in parts[1:]:
                if "=" in part:
                    k, v = part.split("=", 1)
                    data[k.strip()] = v.strip()
                else:
                    data[f"field_{len(data)}"] = part.strip()
            events.append({"type": msg_type, "data": data, "raw": line})
    return events


def build_response(msg_type: str, data: dict) -> dict:
    """Build a default CIS response for a CMC message type."""
    ref = data.get("reference_id", data.get("referenceId", ""))

    responses = {
        "ENQ": {
            "reference_id": ref or f"ref-{datetime.now(timezone.utc).strftime('%H%M%S')}",
            "result": 1,
            "item_validated": True,
            "description": "",
            "lab1_enabled": True,
            "lab2_enabled": False,
            "inv_enabled": False,
        },
        "IND": {"reference_id": ref, "result": 1},
        "ACK": {"reference_id": ref, "result": 1, "item_validated": True, "flag": "PROCESSABLE"},
        "INV": {"reference_id": ref, "result": 1},
        "LAB1": {"reference_id": ref, "result": 1, "match_barcode": "", "label_url": ""},
        "LAB2": {"reference_id": ref, "result": 1, "match_barcode": ""},
        "END": {"reference_id": ref, "result": 1},
        "REM": {"reference_id": ref, "result": 1},
        "HBT": {"result": 1},
    }

    return responses.get(msg_type, {"result": 1})


def serialize_response(msg_type: str, response: dict) -> bytes:
    """Serialize a response dict back to bytes for TCP transmission."""
    # Default: send as JSON (can be changed to XML when we know the exact format)
    payload = {"type": msg_type.lower(), **response}
    return (json.dumps(payload) + "\n").encode("utf-8")
