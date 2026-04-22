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


class MachineConnection:
    """Represents a single TCP connection to a CMC machine."""

    def __init__(self, machine_id: str, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.machine_id = machine_id
        self.reader = reader
        self.writer = writer
        self.connected_at = datetime.now(timezone.utc)
        self.last_heartbeat = datetime.now(timezone.utc)
        self.is_alive = True

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

    @property
    def connected_machines(self) -> list[str]:
        return [mid for mid, conn in self._connections.items() if conn.is_alive]

    @property
    def bound_port(self) -> int | None:
        """Port the TCP gateway actually bound to (may differ from config due to PORT conflicts)."""
        return self._bound_port

    def get_connection(self, machine_id: str) -> MachineConnection | None:
        conn = self._connections.get(machine_id)
        if conn and conn.is_alive:
            return conn
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

                    # Broadcast to all WebSocket clients
                    await ws_manager.broadcast({
                        "type": msg_type,
                        "severity": "info" if msg_type != "UNKNOWN" else "warning",
                        "message": _describe_event(msg_type, msg_data),
                        "machine_id": machine_id,
                        "data": msg_data,
                        "raw": event.get("raw", ""),
                    })

                    # Build and send response back to the machine
                    if msg_type != "UNKNOWN":
                        response = build_response(msg_type, msg_data)
                        msg_machine_id = msg_data.get("machine_id", "") if isinstance(msg_data, dict) else ""
                        response_bytes = serialize_response(msg_type, dict(response), msg_machine_id)
                        try:
                            await conn.send(response_bytes)

                            await ws_manager.broadcast({
                                "type": f"{msg_type}_RESPONSE",
                                "severity": "success",
                                "message": f"Sent {msg_type.lower()} response",
                                "machine_id": machine_id,
                                "data": response,
                            })
                        except Exception as e:
                            logger.error(f"Failed to send response: {e}")

                    # Persist the event to the DB so it shows up across
                    # dashboard/orders/audit/analytics. HBT has no order
                    # context, so we only log machine health indirectly.
                    if msg_type not in ("UNKNOWN", "HBT"):
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
