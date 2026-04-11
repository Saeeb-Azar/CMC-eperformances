from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.modules.tenants.models import Tenant
from app.modules.tenants.schemas import TenantCreate, TenantUpdate


async def create_tenant(db: AsyncSession, data: TenantCreate) -> Tenant:
    tenant = Tenant(**data.model_dump())
    db.add(tenant)
    await db.flush()
    return tenant


async def get_tenant(db: AsyncSession, tenant_id: str) -> Tenant | None:
    return await db.get(Tenant, tenant_id)


async def get_tenant_by_slug(db: AsyncSession, slug: str) -> Tenant | None:
    result = await db.execute(select(Tenant).where(Tenant.slug == slug))
    return result.scalar_one_or_none()


async def list_tenants(db: AsyncSession) -> list[Tenant]:
    result = await db.execute(select(Tenant).order_by(Tenant.created_at.desc()))
    return list(result.scalars().all())


async def update_tenant(db: AsyncSession, tenant_id: str, data: TenantUpdate) -> Tenant | None:
    tenant = await get_tenant(db, tenant_id)
    if not tenant:
        return None
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(tenant, key, value)
    await db.flush()
    return tenant
