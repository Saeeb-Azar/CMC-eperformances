from pydantic import BaseModel
from datetime import datetime


class DashboardOverview(BaseModel):
    """Main dashboard KPIs."""
    # Throughput
    total_orders_today: int = 0
    completed_today: int = 0
    failed_today: int = 0
    ejected_today: int = 0
    active_on_conveyor: int = 0

    # Rates
    success_rate_percent: float = 0.0
    reject_rate_percent: float = 0.0

    # Performance
    avg_processing_time_seconds: float | None = None  # ENQ → END average
    avg_label_generation_ms: float | None = None

    # Machine health
    machines_online: int = 0
    machines_total: int = 0


class ThroughputData(BaseModel):
    """Throughput over time (for charts)."""
    timestamp: datetime
    completed: int = 0
    failed: int = 0
    ejected: int = 0
    total: int = 0


class DimensionStats(BaseModel):
    """3D sensor dimension analysis."""
    avg_height_mm: float | None = None
    avg_length_mm: float | None = None
    avg_width_mm: float | None = None
    min_height_mm: int | None = None
    max_height_mm: int | None = None
    min_length_mm: int | None = None
    max_length_mm: int | None = None
    min_width_mm: int | None = None
    max_width_mm: int | None = None
    total_measured: int = 0


class WeightStats(BaseModel):
    """Weight analysis from LAB1/LAB2 station."""
    avg_weight_scale_g: float | None = None
    avg_weight_carton_g: float | None = None
    avg_weight_content_g: float | None = None
    min_weight_g: int | None = None
    max_weight_g: int | None = None
    total_weighed: int = 0


class RejectAnalysis(BaseModel):
    """Reject breakdown by reason and station."""
    reason: str
    count: int
    percentage: float


class StationTiming(BaseModel):
    """Average time between stations (bottleneck detection)."""
    station_from: str
    station_to: str
    avg_seconds: float
    min_seconds: float
    max_seconds: float
    sample_count: int


class CarrierPerformance(BaseModel):
    """Carrier label generation performance."""
    carrier: str
    total_labels: int
    avg_generation_ms: float | None
    error_count: int
    error_rate_percent: float
