"""Online-Status-Wahrheit: eine Maschine ohne frischen Heartbeat darf
nirgends als verbunden/online erscheinen — weder im Gateway
(connected_machines via is_live) noch in der Maschinen-API
(effective_online)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.gateway.connection import ConnectionManager, MachineConnection
from app.modules.machines.models import Machine
from app.modules.machines.service import effective_online


@pytest.fixture(autouse=True)
def _ensure_event_loop():
    """Die sync-Tests hier bauen asyncio.StreamReader() (braucht einen aktuellen
    Loop). Lief vorher ein asyncio.run()/async-Test, ist der Loop geschlossen
    und nicht gesetzt → 'no current event loop'. Hier robust einen bereitstellen,
    unabhängig von der Test-Reihenfolge."""
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        asyncio.set_event_loop(asyncio.new_event_loop())


class _FakeWriter:
    def __init__(self):
        self.closed = False

    def write(self, data):  # pragma: no cover
        pass

    async def drain(self):  # pragma: no cover
        pass

    def close(self):
        self.closed = True

    async def wait_closed(self):
        pass

    def get_extra_info(self, *_):  # pragma: no cover
        return ("127.0.0.1", 12345)


def _conn(protocol_id: str, idle_s: float) -> MachineConnection:
    c = MachineConnection("machine_x", asyncio.StreamReader(), _FakeWriter())
    c.protocol_id = protocol_id
    c.last_heartbeat = datetime.now(timezone.utc) - timedelta(seconds=idle_s)
    return c


def test_fresh_connection_is_live_and_listed():
    mgr = ConnectionManager()
    mgr._connections["a"] = _conn("0001", idle_s=2)
    assert mgr.connected_machines == ["0001"]


def test_silent_connection_disappears_from_connected_machines():
    """>30s Funkstille → nicht mehr 'verbunden', auch wenn der Socket nie
    sauber geschlossen wurde (halboffen hinter dem TCP-Proxy)."""
    mgr = ConnectionManager()
    stale = _conn("0001", idle_s=MachineConnection.STALE_AFTER_S + 5)
    mgr._connections["a"] = stale
    assert stale.is_alive  # Socket meint noch zu leben …
    assert not stale.is_live  # … aber die Wahrheit ist: tot
    assert mgr.connected_machines == []
    assert mgr.get_connection("0001") is None


@pytest.mark.asyncio
async def test_reaper_closes_and_removes_long_idle_sockets():
    mgr = ConnectionManager()
    fresh = _conn("0001", idle_s=2)
    dead = _conn("0002", idle_s=600)
    mgr._connections["fresh"] = fresh
    mgr._connections["dead"] = dead
    reaped = await mgr.reap_stale_connections(max_idle_s=300)
    assert reaped == 1
    assert "dead" not in mgr._connections
    assert "fresh" in mgr._connections
    assert dead.writer.closed


def _machine(is_online: bool, hb_age_s: float | None) -> Machine:
    m = Machine(tenant_id="t", machine_id="0001", name="CW-001")
    m.is_online = is_online
    m.last_heartbeat_at = (
        None if hb_age_s is None
        else datetime.now(timezone.utc) - timedelta(seconds=hb_age_s)
    )
    return m


def test_effective_online_truth_table():
    assert effective_online(_machine(True, 3)) is True
    # is_online=True in der DB, aber Heartbeat alt → offline (der Kernbug:
    # nichts hatte das Flag je zurückgesetzt).
    assert effective_online(_machine(True, 90)) is False
    assert effective_online(_machine(True, None)) is False
    assert effective_online(_machine(False, 3)) is False


def test_effective_online_handles_naive_datetime():
    m = _machine(True, 3)
    m.last_heartbeat_at = m.last_heartbeat_at.replace(tzinfo=None)
    assert effective_online(m) is True
