"""
Analytics service: aggregates data from orders, machines, and audit logs
to produce meaningful dashboard KPIs and charts.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case, extract

from app.modules.orders.models import OrderState
from app.modules.machines.models import Machine
from app.modules.analytics.schemas import (
    DashboardOverview,
    ThroughputData,
    DimensionStats,
    WeightStats,
    RejectAnalysis,
    StationTiming,
)


async def get_dashboard_overview(db: AsyncSession, tenant_id: str) -> DashboardOverview:
    """Main dashboard: today's KPIs across all machines."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    # Count orders by state today
    state_counts = await db.execute(
        select(
            OrderState.state,
            func.count(OrderState.id),
        )
        .where(OrderState.tenant_id == tenant_id, OrderState.created_at >= today_start)
        .group_by(OrderState.state)
    )
    counts = dict(state_counts.all())

    completed = counts.get("COMPLETED", 0)
    failed = counts.get("FAILED", 0)
    ejected = counts.get("EJECTED", 0)
    total = sum(counts.values())

    # Active orders on conveyors
    active_result = await db.execute(
        select(func.count(OrderState.id)).where(
            OrderState.tenant_id == tenant_id,
            OrderState.state.in_({"ASSIGNED", "INDUCTED", "SCANNED", "LABELED"}),
        )
    )
    active = active_result.scalar() or 0

    # Average processing time (ENQ → END) for completed orders today
    avg_time_result = await db.execute(
        select(
            func.avg(extract("epoch", OrderState.end_at - OrderState.enq_at))
        ).where(
            OrderState.tenant_id == tenant_id,
            OrderState.state == "COMPLETED",
            OrderState.enq_at.is_not(None),
            OrderState.end_at.is_not(None),
            OrderState.created_at >= today_start,
        )
    )
    avg_time = avg_time_result.scalar()

    # Machine health
    machines_result = await db.execute(
        select(
            func.count(Machine.id),
            func.sum(case((Machine.is_online == True, 1), else_=0)),
        ).where(Machine.tenant_id == tenant_id, Machine.is_active == True)
    )
    machines_row = machines_result.one()

    return DashboardOverview(
        total_orders_today=total,
        completed_today=completed,
        failed_today=failed,
        ejected_today=ejected,
        active_on_conveyor=active,
        success_rate_percent=round(completed / total * 100, 1) if total > 0 else 0.0,
        reject_rate_percent=round(ejected / total * 100, 1) if total > 0 else 0.0,
        avg_processing_time_seconds=round(avg_time, 1) if avg_time else None,
        machines_online=int(machines_row[1] or 0),
        machines_total=int(machines_row[0] or 0),
    )


async def get_throughput_hourly(
    db: AsyncSession, tenant_id: str, hours: int = 24
) -> list[ThroughputData]:
    """Hourly throughput for charting."""
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    result = await db.execute(
        select(
            func.date_trunc("hour", OrderState.created_at).label("hour"),
            func.count(OrderState.id).label("total"),
            func.sum(case((OrderState.state == "COMPLETED", 1), else_=0)).label("completed"),
            func.sum(case((OrderState.state == "FAILED", 1), else_=0)).label("failed"),
            func.sum(case((OrderState.state == "EJECTED", 1), else_=0)).label("ejected"),
        )
        .where(OrderState.tenant_id == tenant_id, OrderState.created_at >= since)
        .group_by("hour")
        .order_by("hour")
    )

    return [
        ThroughputData(
            timestamp=row.hour,
            total=row.total,
            completed=row.completed,
            failed=row.failed,
            ejected=row.ejected,
        )
        for row in result.all()
    ]


async def get_dimension_stats(
    db: AsyncSession, tenant_id: str, machine_id: str | None = None, days: int = 7
) -> DimensionStats:
    """3D sensor dimension analysis."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = select(
        func.avg(OrderState.dimension_height_mm),
        func.avg(OrderState.dimension_length_mm),
        func.avg(OrderState.dimension_width_mm),
        func.min(OrderState.dimension_height_mm),
        func.max(OrderState.dimension_height_mm),
        func.min(OrderState.dimension_length_mm),
        func.max(OrderState.dimension_length_mm),
        func.min(OrderState.dimension_width_mm),
        func.max(OrderState.dimension_width_mm),
        func.count(OrderState.id),
    ).where(
        OrderState.tenant_id == tenant_id,
        OrderState.dimension_height_mm.is_not(None),
        OrderState.created_at >= since,
    )

    if machine_id:
        query = query.where(OrderState.machine_db_id == machine_id)

    row = (await db.execute(query)).one()

    return DimensionStats(
        avg_height_mm=round(row[0], 1) if row[0] else None,
        avg_length_mm=round(row[1], 1) if row[1] else None,
        avg_width_mm=round(row[2], 1) if row[2] else None,
        min_height_mm=row[3],
        max_height_mm=row[4],
        min_length_mm=row[5],
        max_length_mm=row[6],
        min_width_mm=row[7],
        max_width_mm=row[8],
        total_measured=row[9],
    )


async def get_weight_stats(
    db: AsyncSession, tenant_id: str, machine_id: str | None = None, days: int = 7
) -> WeightStats:
    """Weight analysis from labeler station."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    query = select(
        func.avg(OrderState.lab1_weight_scale),
        func.avg(OrderState.lab1_weight_carton),
        func.avg(OrderState.lab1_weight_content),
        func.min(OrderState.lab1_weight_scale),
        func.max(OrderState.lab1_weight_scale),
        func.count(OrderState.id),
    ).where(
        OrderState.tenant_id == tenant_id,
        OrderState.lab1_weight_scale.is_not(None),
        OrderState.created_at >= since,
    )

    if machine_id:
        query = query.where(OrderState.machine_db_id == machine_id)

    row = (await db.execute(query)).one()

    return WeightStats(
        avg_weight_scale_g=round(row[0], 1) if row[0] else None,
        avg_weight_carton_g=round(row[1], 1) if row[1] else None,
        avg_weight_content_g=round(row[2], 1) if row[2] else None,
        min_weight_g=row[3],
        max_weight_g=row[4],
        total_weighed=row[5],
    )


async def get_reject_analysis(
    db: AsyncSession, tenant_id: str, days: int = 7
) -> list[RejectAnalysis]:
    """Breakdown of rejections by reason."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            OrderState.ejection_reason,
            func.count(OrderState.id),
        )
        .where(
            OrderState.tenant_id == tenant_id,
            OrderState.state == "EJECTED",
            OrderState.ejection_reason.is_not(None),
            OrderState.created_at >= since,
        )
        .group_by(OrderState.ejection_reason)
        .order_by(func.count(OrderState.id).desc())
    )

    rows = result.all()
    total = sum(r[1] for r in rows) if rows else 0

    return [
        RejectAnalysis(
            reason=row[0],
            count=row[1],
            percentage=round(row[1] / total * 100, 1) if total > 0 else 0.0,
        )
        for row in rows
    ]


async def get_station_timings(
    db: AsyncSession, tenant_id: str, machine_id: str | None = None, days: int = 7
) -> list[StationTiming]:
    """Average time between each station pair (bottleneck detection)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)

    station_pairs = [
        ("ENQ", "IND", OrderState.enq_at, OrderState.ind_at),
        ("IND", "ACK", OrderState.ind_at, OrderState.ack_at),
        ("ACK", "LAB1", OrderState.ack_at, OrderState.lab1_at),
        ("LAB1", "END", OrderState.lab1_at, OrderState.end_at),
        ("ENQ", "END", OrderState.enq_at, OrderState.end_at),
    ]

    timings = []
    for name_from, name_to, col_from, col_to in station_pairs:
        query = select(
            func.avg(extract("epoch", col_to - col_from)),
            func.min(extract("epoch", col_to - col_from)),
            func.max(extract("epoch", col_to - col_from)),
            func.count(OrderState.id),
        ).where(
            OrderState.tenant_id == tenant_id,
            col_from.is_not(None),
            col_to.is_not(None),
            OrderState.created_at >= since,
        )

        if machine_id:
            query = query.where(OrderState.machine_db_id == machine_id)

        row = (await db.execute(query)).one()
        if row[3] > 0:
            timings.append(StationTiming(
                station_from=name_from,
                station_to=name_to,
                avg_seconds=round(row[0], 2),
                min_seconds=round(row[1], 2),
                max_seconds=round(row[2], 2),
                sample_count=row[3],
            ))

    return timings
