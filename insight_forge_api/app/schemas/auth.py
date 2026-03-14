"""
Pydantic schemas for authentication.
"""
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ============================================================================
# Request DTOs
# ============================================================================


class RegisterRequest(BaseModel):
    """Request DTO for user registration."""

    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=8)
    fullName: Optional[str] = None
    organization: Optional[str] = None


class LoginRequest(BaseModel):
    """Request DTO for user login."""

    username: str  # Can be username or email
    password: str


class ChangePasswordRequest(BaseModel):
    """Request DTO for changing password."""

    currentPassword: str
    newPassword: str = Field(..., min_length=8)


class UpdateProfileRequest(BaseModel):
    """Request DTO for updating user profile."""

    fullName: Optional[str] = None
    organization: Optional[str] = None
    preferences: Optional[dict] = None


# ============================================================================
# Response DTOs
# ============================================================================


class TokenResponse(BaseModel):
    """Response DTO for authentication token."""

    accessToken: str
    tokenType: str = "bearer"
    expiresIn: int  # seconds


class UserResponse(BaseModel):
    """Response DTO for user information."""

    id: str
    email: str
    username: str
    fullName: Optional[str] = None
    organization: Optional[str] = None
    role: str
    isActive: bool
    isVerified: bool
    lastLogin: Optional[str] = None
    createdAt: Optional[str] = None


class AuthResponse(BaseModel):
    """Response DTO for login/register with user and token."""

    user: UserResponse
    token: TokenResponse
