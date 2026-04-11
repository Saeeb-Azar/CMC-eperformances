from pydantic import BaseModel
from datetime import datetime


class MachineCreate(BaseModel):
    machine_id: str
    name: str
    model: str = "CW1000"
    tcp_role: str = "server"
    tcp_host: str = "127.0.0.1"
    tcp_port: int = 15001
    lab1_enabled: bool = True
    lab2_enabled: bool = False
    inv_enabled: bool = False
    pre_create_labels: bool = True
    max_length_mm: int = 6000
    max_width_mm: int = 4000
    max_height_mm: int = 3000


class MachineRead(BaseModel):
    id: str
    tenant_id: str
    machine_id: str
    name: str
    model: str
    tcp_role: str
    tcp_host: str
    tcp_port: int
    lab1_enabled: bool
    lab2_enabled: bool
    inv_enabled: bool
    pre_create_labels: bool
    max_length_mm: int
    max_width_mm: int
    max_height_mm: int
    status: str
    is_online: bool
    is_active: bool
    enq_sequence: int
    last_heartbeat_at: datetime | None
    last_event_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class MachineUpdate(BaseModel):
    name: str | None = None
    tcp_role: str | None = None
    tcp_host: str | None = None
    tcp_port: int | None = None
    lab1_enabled: bool | None = None
    lab2_enabled: bool | None = None
    inv_enabled: bool | None = None
    pre_create_labels: bool | None = None
    max_length_mm: int | None = None
    max_width_mm: int | None = None
    max_height_mm: int | None = None
    is_active: bool | None = None


class MachineStatusRead(BaseModel):
    machine_id: str
    status: str
    is_online: bool
    last_heartbeat_at: datetime | None
    uptime_percent_24h: float | None = None
    total_heartbeats_24h: int = 0

    model_config = {"from_attributes": True}


class HeartbeatLogRead(BaseModel):
    id: str
    status: str
    is_online: bool
    response_time_ms: int | None
    timestamp: datetime

    model_config = {"from_attributes": True}
