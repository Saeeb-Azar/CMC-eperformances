from pydantic import BaseModel
from datetime import datetime


class TenantCreate(BaseModel):
    name: str
    slug: str
    plan: str = "starter"


class TenantRead(BaseModel):
    id: str
    name: str
    slug: str
    is_active: bool
    plan: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TenantUpdate(BaseModel):
    name: str | None = None
    is_active: bool | None = None
    plan: str | None = None
