"""Delete all rows from order_states and audit_logs.

Run via Railway shell:
    python -m scripts.reset_events

Tenants, users, and machines are kept — only the event/order history is purged.
"""

from __future__ import annotations

import asyncio
import sys

from sqlalchemy import delete

from app.core.database import async_session
from app.modules.audit.models import AuditLog
from app.modules.orders.models import OrderState


async def _run() -> tuple[int, int]:
    async with async_session() as db:
        audit = await db.execute(delete(AuditLog))
        orders = await db.execute(delete(OrderState))
        await db.commit()
        return orders.rowcount or 0, audit.rowcount or 0


def main() -> None:
    orders, audit = asyncio.run(_run())
    print(f"deleted: order_states={orders}  audit_logs={audit}")


if __name__ == "__main__":
    sys.exit(main())
