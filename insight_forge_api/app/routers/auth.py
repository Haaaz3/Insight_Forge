"""
Authentication routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.auth import (
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    UpdateProfileRequest,
    UserResponse,
)
from app.services.auth_service import (
    AuthService,
    decode_token,
    user_to_response,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db),
):
    """Dependency to get the current authenticated user."""
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


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: AsyncSession = Depends(get_db),
):
    """Dependency to optionally get the current user (for routes that work with or without auth)."""
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


@router.post("/register", response_model=AuthResponse)
async def register(
    request: RegisterRequest,
    session: AsyncSession = Depends(get_db),
):
    """Register a new user."""
    auth_service = AuthService(session)

    try:
        user = await auth_service.register_user(request)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return auth_service.create_auth_response(user)


@router.post("/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    session: AsyncSession = Depends(get_db),
):
    """Authenticate user and return token."""
    auth_service = AuthService(session)

    user = await auth_service.authenticate_user(request.username, request.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    await auth_service.update_last_login(user)
    return auth_service.create_auth_response(user)


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user=Depends(get_current_user),
):
    """Get current user's profile."""
    return user_to_response(current_user)


@router.put("/me", response_model=UserResponse)
async def update_profile(
    request: UpdateProfileRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """Update current user's profile."""
    auth_service = AuthService(session)

    updated_user = await auth_service.update_profile(
        current_user,
        full_name=request.fullName,
        organization=request.organization,
        preferences=request.preferences,
    )

    return user_to_response(updated_user)


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """Change current user's password."""
    auth_service = AuthService(session)

    success = await auth_service.change_password(
        current_user,
        request.currentPassword,
        request.newPassword,
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    return {"message": "Password changed successfully"}


@router.post("/refresh", response_model=AuthResponse)
async def refresh_token(
    current_user=Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
):
    """Refresh the access token."""
    auth_service = AuthService(session)
    return auth_service.create_auth_response(current_user)
