from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "CMC ePerformances"
    app_version: str = "0.1.0"
    debug: bool = False

    # Database — Railway provides postgresql://, SQLAlchemy async needs postgresql+asyncpg://
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/cmc_eperformances"

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

    # CORS
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
