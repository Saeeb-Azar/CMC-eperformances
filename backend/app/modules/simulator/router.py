"""
Simulator API: connect/disconnect to CMC CartonWrap simulator for testing.
"""

import asyncio
import socket

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.gateway.connection import connection_manager
from app.gateway.websocket import ws_manager
from app.core.logging import logger

router = APIRouter(prefix="/simulator", tags=["simulator"])


class ConnectRequest(BaseModel):
    host: str = "127.0.0.1"
    port: int = 15001
    machine_id: str = "SIM-001"


class SimulatorStatus(BaseModel):
    connected: bool
    machine_id: str | None = None
    host: str | None = None
    port: int | None = None
    websocket_clients: int = 0
    connected_machines: list[str] = []


# Track active simulator connection
_active_sim: dict | None = None


@router.post("/connect")
async def connect_to_simulator(req: ConnectRequest):
    """Connect to a CMC simulator via TCP."""
    global _active_sim

    # Check if already connected
    existing = connection_manager.get_connection(req.machine_id)
    if existing and existing.is_alive:
        raise HTTPException(400, f"Already connected to {req.machine_id}")

    try:
        await connection_manager.connect_to_machine(req.host, req.port, req.machine_id)
        _active_sim = {"machine_id": req.machine_id, "host": req.host, "port": req.port}

        await ws_manager.broadcast({
            "type": "SYSTEM",
            "severity": "success",
            "message": f"Connected to simulator at {req.host}:{req.port}",
            "machine_id": req.machine_id,
        })

        logger.info(f"Simulator connected: {req.machine_id} @ {req.host}:{req.port}")
        return {"status": "connected", "machine_id": req.machine_id}

    except Exception as e:
        logger.error(f"Failed to connect to simulator: {e}")
        raise HTTPException(502, f"Connection failed: {e}")


@router.post("/disconnect")
async def disconnect_simulator():
    """Disconnect from the simulator."""
    global _active_sim

    if not _active_sim:
        raise HTTPException(400, "No active simulator connection")

    machine_id = _active_sim["machine_id"]
    conn = connection_manager.get_connection(machine_id)
    if conn:
        await conn.close()

    await ws_manager.broadcast({
        "type": "SYSTEM",
        "severity": "info",
        "message": f"Disconnected from simulator {machine_id}",
        "machine_id": machine_id,
    })

    _active_sim = None
    return {"status": "disconnected"}


@router.get("/status", response_model=SimulatorStatus)
async def get_simulator_status():
    """Get current simulator connection status."""
    connected = False
    machine_id = None

    if _active_sim:
        machine_id = _active_sim["machine_id"]
        conn = connection_manager.get_connection(machine_id)
        connected = conn is not None and conn.is_alive

    return SimulatorStatus(
        connected=connected,
        machine_id=_active_sim.get("machine_id") if _active_sim else None,
        host=_active_sim.get("host") if _active_sim else None,
        port=_active_sim.get("port") if _active_sim else None,
        websocket_clients=ws_manager.client_count,
        connected_machines=connection_manager.connected_machines,
    )


class ResolveResult(BaseModel):
    host: str
    ip: str
    port: int | None = None


@router.get("/resolve", response_model=ResolveResult)
async def resolve_host(host: str):
    """Resolve a Railway TCP-proxy address to a numeric IP.

    The CW1000 CIS simulator only accepts a numeric IP, but Railway hands out
    a hostname like ``roundhouse.proxy.rlwy.net:56127``. This does the DNS
    lookup server-side (a browser can't) so the UI can show ``IP:port`` ready
    to paste. Accepts a bare hostname, ``host:port``, or a full URL; any
    trailing ``:port`` is parsed out and echoed back unchanged.
    """
    raw = (host or "").strip()
    if "://" in raw:  # tolerate a pasted scheme like tcp:// or https://
        raw = raw.split("://", 1)[1]
    raw = raw.strip("/")

    port: int | None = None
    hostname = raw
    if ":" in raw:
        maybe_host, _, port_str = raw.rpartition(":")
        if port_str.strip().isdigit():
            hostname = maybe_host
            port = int(port_str.strip())
    hostname = hostname.strip()

    if not hostname:
        raise HTTPException(400, "No hostname provided")

    loop = asyncio.get_running_loop()
    try:
        # Prefer IPv4 (what the simulator expects); fall back to any family.
        try:
            infos = await loop.getaddrinfo(
                hostname, port, family=socket.AF_INET, type=socket.SOCK_STREAM
            )
        except socket.gaierror:
            infos = await loop.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
    except Exception as e:
        raise HTTPException(502, f"DNS lookup failed for '{hostname}': {e}")

    if not infos:
        raise HTTPException(502, f"No address found for '{hostname}'")

    ip = infos[0][4][0]
    return ResolveResult(host=hostname, ip=ip, port=port)
