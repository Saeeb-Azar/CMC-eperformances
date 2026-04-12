"""
Alembic async environment for CMC ePerformances.
Uses asyncpg driver — compatible with Railway's DATABASE_URL.
"""

import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import all models so Alembic can detect them for autogenerate
from app.core.database import Base  # noqa: F401
from app.modules.tenants.models import Tenant  # noqa: F401
from app.modules.auth.models import User  # noqa: F401
from app.modules.machines.models import Machine, HeartbeatLog  # noqa: F401
from app.modules.orders.models import OrderState  # noqa: F401
from app.modules.audit.models import AuditLog  # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
    """
    Read DATABASE_URL from environment (Railway injects this automatically).
    Converts plain postgresql:// → postgresql+asyncpg:// for async SQLAlchemy.
    Falls back to alembic.ini value.
    """
    url = os.getenv("DATABASE_URL") or config.get_main_option("sqlalchemy.url", "")
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


# ── Offline mode (generates SQL without connecting) ──────────────────────────

def run_migrations_offline() -> None:
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


# ── Online mode (connects and runs migrations) ────────────────────────────────

def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = get_url()

    connectable = async_engine_from_config(
        cfg,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
