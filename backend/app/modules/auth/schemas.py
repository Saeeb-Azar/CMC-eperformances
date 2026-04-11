from pydantic import BaseModel, EmailStr
from datetime import datetime


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: str = "viewer"
    tenant_id: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    id: str
    email: str
    full_name: str
    role: str
    is_active: bool
    tenant_id: str
    last_login: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead


class TokenRefresh(BaseModel):
    refresh_token: str
