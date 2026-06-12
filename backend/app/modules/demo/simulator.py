"""Loopback-Maschinensimulator für den Demo-Durchlauf.

Statt einen externen TCP-Simulator zu starten, verbindet sich der Server hier
mit seinem EIGENEN Gateway-Port (wie es eine echte Maschine täte) und spielt die
Frame-Sequenz ENQ→IND→ACK→LAB1→END ab. Dadurch läuft der GENAUE Produktiv-Pfad:
CW-Listen-Match → DHL-Label (im Test-Modus gerendert) → Persistenz → WebSocket-
Broadcast. So testet der Demo-Knopf wirklich die Pipeline, nicht eine Attrappe.

Frame-Format = CMC-CIS pipe-delimited: ``<STX>MACHINE|type|f1|f2|…<ETX>``
(siehe app/gateway/parser.py POSITIONAL_FIELDS).
"""

from __future__ import annotations

import asyncio

from app.core.logging import logger

STX = b"\x02"
ETX = b"\x03"


def _frame(machine_id: str, msg_type: str, *fields: object) -> bytes:
    parts = [machine_id, msg_type] + [("" if f is None else str(f)) for f in fields]
    return STX + "|".join(parts).encode("utf-8") + ETX


async def _read_frame(reader: asyncio.StreamReader, timeout: float = 6.0) -> str:
    """Liest einen vollständigen STX…ETX-Frame und gibt den Inhalt (ohne
    Delimiter) als String zurück. Leerstring bei Timeout/Verbindungsende."""
    buf = b""
    try:
        while ETX not in buf:
            chunk = await asyncio.wait_for(reader.read(4096), timeout=timeout)
            if not chunk:
                break
            buf += chunk
    except asyncio.TimeoutError:
        return ""
    return (
        buf.replace(STX, b"").split(ETX)[0]
        .decode("utf-8", "replace").strip()
    )


class DemoRunResult:
    def __init__(self) -> None:
        self.reference_id: str = ""
        self.accepted: bool = False
        self.steps: list[dict] = []
        self.error: str = ""


async def run_demo_flow(
    *,
    host: str,
    port: int,
    machine_id: str,
    barcode: str,
    source: str = "Scanner",
    length_mm: int = 200,
    width_mm: int = 150,
    height_mm: int = 80,
    weight_g: int = 500,
    event: int | None = None,
    settle_s: float = 0.35,
) -> DemoRunResult:
    """Spielt einen kompletten Durchlauf gegen den lokalen Gateway-Port."""
    res = DemoRunResult()
    ev = int(event if event is not None else 1)

    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(host, port), timeout=5.0
        )
    except Exception as e:
        res.error = f"Kann Gateway nicht erreichen ({host}:{port}): {e}"
        logger.warning(f"Demo-Flow: {res.error}")
        return res

    async def _send(msg_type: str, *fields: object) -> str:
        writer.write(_frame(machine_id, msg_type, *fields))
        await writer.drain()
        reply = await _read_frame(reader)
        res.steps.append({"sent": msg_type, "reply": reply})
        logger.info(f"Demo-Flow {machine_id} {msg_type} → {reply!r}")
        return reply

    try:
        # 1) ENQ — Barcode „scannen". Antwort: MID|enq|event|reference_id|…
        enq_reply = await _send("ENQ", ev, barcode, source)
        parts = enq_reply.split("|")
        ref = parts[3] if len(parts) > 3 else ""
        res.reference_id = ref
        accepted = bool(ref) and ref.lower().startswith("ref")
        res.accepted = accepted
        if not accepted:
            res.error = f"ENQ abgelehnt (reference_id={ref or '—'})"
            return res

        await asyncio.sleep(settle_s)
        await _send("IND", ev, ref)              # Induktion
        await asyncio.sleep(settle_s)
        # ACK: event, ref, good, bad, height, length, width, area
        await _send("ACK", ev, ref, 1, 0, height_mm, length_mm, width_mm, 0)
        await asyncio.sleep(settle_s)
        # LAB1: event, ref, good, bad, weight_scale, weight_carton, weight_insert, feeders
        await _send("LAB1", ev, ref, 1, 0, weight_g, 0, 0, 0)
        await asyncio.sleep(settle_s)
        # END: event, ref, status, length, width, height, weight
        await _send("END", ev, ref, 1, length_mm, width_mm, height_mm, weight_g)
        return res
    except Exception as e:
        res.error = f"Fehler im Demo-Durchlauf: {e}"
        logger.warning(res.error)
        return res
    finally:
        try:
            writer.close()
            await asyncio.wait_for(writer.wait_closed(), timeout=2.0)
        except Exception:
            pass
