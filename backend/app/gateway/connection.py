"""
TCP connection manager for CMC CartonWrap machines.

Handles both server mode (CIS listens, machines connect)
and client mode (CIS connects to machine).
Port 15001 as per CMC CIS protocol.
"""

import asyncio
from datetime import datetime, timezone

from app.core.logging import logger
from app.gateway.protocol import MessageType


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
        self.writer.close()
        await self.writer.wait_closed()


class ConnectionManager:
    """Manages TCP connections to multiple CMC machines."""

    def __init__(self):
        self._connections: dict[str, MachineConnection] = {}
        self._server: asyncio.Server | None = None
        self._event_handler = None

    def set_event_handler(self, handler):
        """Set the callback that processes incoming CMC messages."""
        self._event_handler = handler

    @property
    def connected_machines(self) -> list[str]:
        return [mid for mid, conn in self._connections.items() if conn.is_alive]

    def get_connection(self, machine_id: str) -> MachineConnection | None:
        conn = self._connections.get(machine_id)
        if conn and conn.is_alive:
            return conn
        return None

    async def start_server(self, host: str, port: int) -> None:
        self._server = await asyncio.start_server(
            self._handle_client, host, port
        )
        logger.info(f"CMC Gateway listening on {host}:{port}")

    async def _handle_client(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        addr = writer.get_extra_info("peername")
        logger.info(f"New machine connection from {addr}")

        # Machine ID is determined from the first message or config
        machine_id = f"machine_{addr[0]}_{addr[1]}"
        conn = MachineConnection(machine_id, reader, writer)
        self._connections[machine_id] = conn

        try:
            while conn.is_alive:
                data = await reader.read(4096)
                if not data:
                    break
                await self._process_raw_message(machine_id, data)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Connection error for {machine_id}: {e}")
        finally:
            conn.is_alive = False
            logger.info(f"Machine {machine_id} disconnected")

    async def _process_raw_message(self, machine_id: str, data: bytes) -> None:
        """Parse raw TCP data and dispatch to the event handler."""
        if self._event_handler:
            await self._event_handler(machine_id, data)

    async def connect_to_machine(self, host: str, port: int, machine_id: str) -> None:
        """Client mode: connect to a CMC machine."""
        reader, writer = await asyncio.open_connection(host, port)
        conn = MachineConnection(machine_id, reader, writer)
        self._connections[machine_id] = conn
        logger.info(f"Connected to machine {machine_id} at {host}:{port}")
        asyncio.create_task(self._listen(machine_id, conn))

    async def _listen(self, machine_id: str, conn: MachineConnection) -> None:
        try:
            while conn.is_alive:
                data = await conn.reader.read(4096)
                if not data:
                    break
                await self._process_raw_message(machine_id, data)
        except Exception as e:
            logger.error(f"Listen error for {machine_id}: {e}")
        finally:
            conn.is_alive = False

    async def shutdown(self) -> None:
        for conn in self._connections.values():
            await conn.close()
        if self._server:
            self._server.close()
            await self._server.wait_closed()
        logger.info("CMC Gateway shut down")


# Singleton
connection_manager = ConnectionManager()
