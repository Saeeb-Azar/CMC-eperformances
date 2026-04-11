from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import require_role, Role
from app.modules.tenants import service
from app.modules.tenants.schemas import TenantCreate, TenantRead, TenantUpdate

router = APIRouter(prefix="/tenants", tags=["tenants"])


@router.post("", response_model=TenantRead)
async def create_tenant(
    data: TenantCreate,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_role(Role.SUPER_ADMIN)),
):
    return await service.create_tenant(db, data)


@router.get("", response_model=list[TenantRead])
async def list_tenants(
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_role(Role.SUPER_ADMIN)),
):
    return await service.list_tenants(db)


@router.get("/{tenant_id}", response_model=TenantRead)
async def get_tenant(
    tenant_id: str,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_role(Role.TENANT_ADMIN)),
):
    return await service.get_tenant(db, tenant_id)


@router.patch("/{tenant_id}", response_model=TenantRead)
async def update_tenant(
    tenant_id: str,
    data: TenantUpdate,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_role(Role.SUPER_ADMIN)),
):
    return await service.update_tenant(db, tenant_id, data)
