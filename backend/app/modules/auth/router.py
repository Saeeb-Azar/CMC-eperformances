from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user, require_role, Role
from app.modules.auth import service
from app.modules.auth.schemas import UserRegister, UserLogin, UserRead, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead)
async def register(
    data: UserRegister,
    db: AsyncSession = Depends(get_db),
    _user: dict = Depends(require_role(Role.TENANT_ADMIN)),
):
    try:
        return await service.register_user(db, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    try:
        return await service.authenticate_user(db, data)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.get("/me", response_model=UserRead)
async def get_me(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    db_user = await service.get_user_by_id(db, user["sub"])
    if not db_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return db_user


@router.get("/users", response_model=list[UserRead])
async def list_users(
    db: AsyncSession = Depends(get_db),
    user: dict = Depends(require_role(Role.TENANT_ADMIN)),
):
    return await service.list_users_by_tenant(db, user["tenant_id"])
