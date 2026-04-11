from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.logging import logger

# Import routers from all modules
from app.modules.auth.router import router as auth_router
from app.modules.tenants.router import router as tenants_router
from app.modules.machines.router import router as machines_router
from app.modules.orders.router import router as orders_router
from app.modules.audit.router import router as audit_router
from app.modules.analytics.router import router as analytics_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    # TODO: Start CMC Gateway TCP server here when ready
    # from app.gateway.connection import connection_manager
    # await connection_manager.start_server(settings.cmc_tcp_host, settings.cmc_tcp_port)
    yield
    logger.info("Shutting down")
    # await connection_manager.shutdown()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all module routers under /api/v1
API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(tenants_router, prefix=API_PREFIX)
app.include_router(machines_router, prefix=API_PREFIX)
app.include_router(orders_router, prefix=API_PREFIX)
app.include_router(audit_router, prefix=API_PREFIX)
app.include_router(analytics_router, prefix=API_PREFIX)


@app.get("/")
def root():
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
    }


@app.get("/health")
def health():
    return {"status": "ok"}
