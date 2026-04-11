from enum import Enum
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.core.security import decode_token

security_scheme = HTTPBearer()


class Role(str, Enum):
    SUPER_ADMIN = "super_admin"  # Platform-level admin (SaaS owner)
    TENANT_ADMIN = "tenant_admin"  # Tenant-level admin
    OPERATOR = "operator"  # Machine operator
    VIEWER = "viewer"  # Read-only access


# Role hierarchy: higher roles include all permissions of lower roles
ROLE_HIERARCHY = {
    Role.SUPER_ADMIN: 4,
    Role.TENANT_ADMIN: 3,
    Role.OPERATOR: 2,
    Role.VIEWER: 1,
}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_scheme),
) -> dict:
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        return payload
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


def require_role(minimum_role: Role):
    """Dependency that checks if the user has at least the minimum role."""

    async def role_checker(user: dict = Depends(get_current_user)) -> dict:
        user_role = Role(user.get("role", "viewer"))
        if ROLE_HIERARCHY[user_role] < ROLE_HIERARCHY[minimum_role]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{minimum_role.value}' or higher required",
            )
        return user

    return role_checker
