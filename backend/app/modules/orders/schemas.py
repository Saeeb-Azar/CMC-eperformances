from pydantic import BaseModel
from datetime import datetime


class OrderStateRead(BaseModel):
    id: str
    tenant_id: str
    machine_db_id: str
    reference_id: str
    barcode: str
    barcode_type: str
    barcode_source: str
    state: str
    enq_sequence: int

    # 3D sensor data
    dimension_height_mm: int | None
    dimension_length_mm: int | None
    dimension_width_mm: int | None

    # Weight data
    lab1_weight_scale: int | None
    lab1_weight_carton: int | None
    lab1_weight_content: int | None

    # Final box data
    final_length_mm: int | None
    final_width_mm: int | None
    final_height_mm: int | None
    final_weight_g: int | None

    # Label & tracking
    tracking_number: str | None
    carrier: str | None
    label_type: str | None
    label_pre_created: bool

    # Station flags
    lab1_enabled: bool
    lab2_enabled: bool
    inv_enabled: bool
    inv_printed: bool

    # Resolution
    resolved_by: str | None
    resolved_at: datetime | None
    resolution_reason: str | None
    ejection_reason: str | None

    # Timing
    enq_at: datetime | None
    ind_at: datetime | None
    ack_at: datetime | None
    inv_at: datetime | None
    lab1_at: datetime | None
    lab2_at: datetime | None
    end_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderStateListItem(BaseModel):
    """Lighter version for list views."""
    id: str
    reference_id: str
    barcode: str
    state: str
    enq_sequence: int
    tracking_number: str | None
    carrier: str | None
    final_weight_g: int | None
    ejection_reason: str | None
    enq_at: datetime | None
    completed_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class OrderResolveRequest(BaseModel):
    resolution_reason: str
    tracking_number: str | None = None
    tracking_url: str | None = None
    force: bool = False


class OrderDeleteRequest(BaseModel):
    reason: str


class OrderFilterParams(BaseModel):
    state: str | None = None
    machine_id: str | None = None
    barcode: str | None = None
    reference_id: str | None = None
    carrier: str | None = None
    date_from: datetime | None = None
    date_to: datetime | None = None
    limit: int = 50
    offset: int = 0
