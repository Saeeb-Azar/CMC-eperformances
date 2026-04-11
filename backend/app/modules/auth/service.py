from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import hash_password, verify_password, create_access_token, create_refresh_token
from app.modules.auth.models import User
from app.modules.auth.schemas import UserRegister, UserLogin, TokenResponse, UserRead


async def register_user(db: AsyncSession, data: UserRegister) -> User:
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise ValueError("Email already registered")

    user = User(
        email=data.email,
        hashed_password=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
        tenant_id=data.tenant_id,
    )
    db.add(user)
    await db.flush()
    return user


async def authenticate_user(db: AsyncSession, data: UserLogin) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.hashed_password):
        raise ValueError("Invalid email or password")

    if not user.is_active:
        raise ValueError("Account is deactivated")

    user.last_login = datetime.now(timezone.utc)
    await db.flush()

    token_data = {
        "sub": user.id,
        "email": user.email,
        "role": user.role,
        "tenant_id": user.tenant_id,
    }

    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
        user=UserRead.model_validate(user),
    )


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    return await db.get(User, user_id)


async def list_users_by_tenant(db: AsyncSession, tenant_id: str) -> list[User]:
    result = await db.execute(
        select(User).where(User.tenant_id == tenant_id).order_by(User.created_at.desc())
    )
    return list(result.scalars().all())
