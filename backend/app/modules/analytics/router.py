from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user
from app.modules.analytics import service
from app.modules.analytics.schemas import (
    DashboardOverview,
    ThroughputData,
    DimensionStats,
    WeightStats,
    RejectAnalysis,
    StationTiming,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardOverview)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Main dashboard overview with today's KPIs."""
    return await service.get_dashboard_overview(db, user["tenant_id"])


@router.get("/throughput", response_model=list[ThroughputData])
async def get_throughput(
    hours: int = Query(24, le=168),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Hourly throughput data for charts."""
    return await service.get_throughput_hourly(db, user["tenant_id"], hours)


@router.get("/dimensions", response_model=DimensionStats)
async def get_dimensions(
    machine_id: str | None = None,
    days: int = Query(7, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """3D sensor dimension analysis."""
    return await service.get_dimension_stats(db, user["tenant_id"], machine_id, days)


@router.get("/weights", response_model=WeightStats)
async def get_weights(
    machine_id: str | None = None,
    days: int = Query(7, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Weight analysis from labeler station."""
    return await service.get_weight_stats(db, user["tenant_id"], machine_id, days)


@router.get("/rejects", response_model=list[RejectAnalysis])
async def get_rejects(
    days: int = Query(7, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Reject breakdown by reason."""
    return await service.get_reject_analysis(db, user["tenant_id"], days)


@router.get("/timings", response_model=list[StationTiming])
async def get_timings(
    machine_id: str | None = None,
    days: int = Query(7, le=90),
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    """Station-to-station timing (bottleneck detection)."""
    return await service.get_station_timings(db, user["tenant_id"], machine_id, days)
