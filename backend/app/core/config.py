from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "CMC ePerformances"
    app_version: str = "0.1.0"
    debug: bool = False

    # Database — defaults to a local SQLite file so the backend starts without
    # any external DB install. Override with DATABASE_URL for Supabase/Postgres:
    #   postgresql://...  (auto-rewritten to postgresql+asyncpg://...)
    database_url: str = "sqlite+aiosqlite:///./local.db"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_db_url(cls, v: str) -> str:
        """Convert plain postgresql:// to postgresql+asyncpg:// for async SQLAlchemy."""
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # Auth
    secret_key: str = "CHANGE-ME-IN-PRODUCTION"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # CMC Gateway
    cmc_tcp_host: str = "0.0.0.0"
    cmc_tcp_port: int = 15001
    cmc_tcp_role: str = "server"  # "server" or "client"

    # Event persistence: when False, incoming machine events are only kept in
    # the in-memory ring buffer for the live dashboard. order_states and
    # audit_logs receive no writes. Flip to True once long-term storage is
    # actually wanted.
    events_persist_enabled: bool = True
    # Aufbewahrungsdauer persistierter Aufträge/Logs in Tagen. Danach werden sie
    # vom Retention-Task automatisch gelöscht (Glocke warnt vorher).
    retention_days: int = 30

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    # ── Pulpo WMS integration ─────────────────────────────────────────
    # Aktiv sobald base_url + username + password gesetzt sind. Pulpo nutzt
    # OAuth2 Password-Flow: der Client holt sich per POST /api/v1/auth ein
    # Bearer-Token (siehe modules/pulpo/client.py) und cached es bis zum
    # Ablauf. Endpoints sind in client.py gegen die WMS-OpenAPI gemappt.
    pulpo_base_url: str = "https://eu.pulpo.co"
    pulpo_username: str = ""
    pulpo_password: str = ""
    # OAuth2-Scope laut WMS-Spec ("general" = Standard-User-Scope).
    pulpo_scope: str = "general"
    # Legacy/optional: statischer API-Key. Wird nicht mehr genutzt, seit der
    # Client auf OAuth2 umgestellt ist — bleibt nur für Abwärtskompatibilität.
    pulpo_api_key: str = ""
    # HMAC-Secret zur Webhook-Verifikation. Leerlassen für lokale Tests
    # (akzeptiert dann alles, loggt eine Warnung). Produktiv setzen.
    pulpo_webhook_secret: str = ""
    # Pick-Location-Code der unserer CMC1000-Maschine entspricht. Wird
    # bei jedem ENQ-Lookup zur Filterung der Pulpo-Queue gebraucht
    # (origin_location_code in GET /packing/orders).
    pulpo_pick_location: str = ""
    # Intervall (Sekunden) des Hintergrund-Tasks, der die CW-Listen aus der
    # Pulpo-Queue neu aufbaut (Self-Heal für verpasste Webhooks).
    cw_sync_interval_s: int = 8

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
