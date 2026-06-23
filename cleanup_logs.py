#!/usr/bin/env python3
"""
Sofort-Cleanup: Löscht alte Logs aus der DB.
- INFO: älter als 24h → weg
- ERROR/PROBLEM: älter als 15 Tagen → weg

Nutzer: cd backend && python ../cleanup_logs.py
"""
import asyncio
import sys
from datetime import datetime, timedelta, timezone
from sqlalchemy import delete

# Import from Backend
sys.path.insert(0, "/home/user/CMC-eperformances/backend")
from app.core.database import async_session
from app.modules.audit.models import AuditLog


async def cleanup():
    """Löscht alte Logs nach Retention-Regeln."""
    try:
        now = datetime.now(timezone.utc)

        async with async_session() as db:
            # ─ INFO-Logs: älter als 24h raus
            cutoff_info = now - timedelta(hours=24)
            r_info = await db.execute(
                delete(AuditLog).where(
                    (AuditLog.event_type == "INFO") &
                    (AuditLog.timestamp < cutoff_info)
                )
            )
            await db.commit()
            info_deleted = r_info.rowcount or 0

            # ─ ERROR/PROBLEM: älter als 15 Tagen raus
            cutoff_error = now - timedelta(days=15)
            r_error = await db.execute(
                delete(AuditLog).where(
                    (AuditLog.event_type.in_(["ERROR", "PROBLEM"])) &
                    (AuditLog.timestamp < cutoff_error)
                )
            )
            await db.commit()
            error_deleted = r_error.rowcount or 0

            total = info_deleted + error_deleted
            print(f"✓ Gelöscht: {info_deleted} INFO-Logs (>24h), {error_deleted} ERROR/PROBLEM (>15d)")
            print(f"✓ Total: {total} Zeilen entfernt")
            return total

    except Exception as e:
        print(f"✗ Fehler: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return -1


if __name__ == "__main__":
    result = asyncio.run(cleanup())
    sys.exit(0 if result >= 0 else 1)
