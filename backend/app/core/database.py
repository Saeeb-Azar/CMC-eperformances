from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

# Pooler-Härtung: Supabase/PgBouncer schließt idle Connections, und eine aus
# dem Pool geholte „tote" Verbindung wirft sonst 500er (genau die sporadischen
# _create_connection-Fehler). pool_pre_ping prüft die Verbindung VOR Gebrauch und
# baut sie transparent neu auf; pool_recycle wirft alte vorsorglich weg.
# statement_cache_size=0 ist Pflicht für PgBouncer Transaction-Pooling + asyncpg
# (sonst „prepared statement does not exist"-Fehler).
_engine_kwargs: dict = {"echo": settings.debug, "pool_pre_ping": True}
if settings.database_url.startswith("postgresql"):
    _engine_kwargs["pool_recycle"] = 300
    _engine_kwargs["connect_args"] = {"statement_cache_size": 0}
    # F4: expliziter Pool + KURZER Timeout. Ohne pool_timeout wartet eine
    # Anfrage bei erschöpftem Pool bis zu 30 s auf eine Connection → riss das
    # 2-s-ENQ-Budget. Jetzt: schnell scheitern statt den Read-Loop zu blockieren.
    _engine_kwargs["pool_size"] = settings.db_pool_size
    _engine_kwargs["max_overflow"] = settings.db_max_overflow
    _engine_kwargs["pool_timeout"] = settings.db_pool_timeout_s

engine = create_async_engine(settings.database_url, **_engine_kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
