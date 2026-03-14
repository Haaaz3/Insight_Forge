"""
Application dependencies for dependency injection.
"""
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.services.auth_service import AuthService, decode_token

settings = get_settings()
security = HTTPBearer(auto_error=False)


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """
    Dependency to optionally get the current user.
    Returns None if no valid token is provided.
    """
    if not credentials:
        return None

    payload = decode_token(credentials.credentials)
    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    auth_service = AuthService(session)
    user = await auth_service.get_user_by_id(user_id)
    if not user or not user.is_active:
        return None

    return user


async def require_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db),
) -> User:
    """
    Dependency to require authentication.
    Raises 401 if not authenticated.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )

    auth_service = AuthService(session)
    user = await auth_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    return user


async def require_auth_if_enabled(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """
    Dependency that requires authentication only when auth_enabled is True.
    When auth_enabled is False, returns None (allowing unauthenticated access).
    """
    if not settings.auth_enabled:
        # Auth disabled - allow access without authentication
        return None

    # Auth enabled - require authentication
    return await require_auth(credentials, session)


async def require_admin(
    user: User = Depends(require_auth),
) -> User:
    """
    Dependency to require admin role.
    """
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


async def require_admin_if_enabled(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """
    Dependency that requires admin only when auth_enabled is True.
    """
    if not settings.auth_enabled:
        return None

    user = await require_auth(credentials, session)
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
