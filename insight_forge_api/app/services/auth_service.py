"""
Authentication service for JWT-based auth.
"""
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models.user import User
from app.schemas.auth import (
    AuthResponse,
    RegisterRequest,
    TokenResponse,
    UserResponse,
)

settings = get_settings()

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm
    )
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except JWTError:
        return None


def user_to_response(user: User) -> UserResponse:
    """Convert User model to UserResponse DTO."""
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        fullName=user.full_name,
        organization=user.organization,
        role=user.role,
        isActive=user.is_active,
        isVerified=user.is_verified,
        lastLogin=user.last_login.isoformat() if user.last_login else None,
        createdAt=user.created_at.isoformat() if user.created_at else None,
    )


class AuthService:
    """Service for authentication operations."""

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get a user by ID."""
        result = await self.session.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get a user by email."""
        result = await self.session.execute(
            select(User).where(User.email == email.lower())
        )
        return result.scalar_one_or_none()

    async def get_user_by_username(self, username: str) -> Optional[User]:
        """Get a user by username."""
        result = await self.session.execute(
            select(User).where(User.username == username)
        )
        return result.scalar_one_or_none()

    async def get_user_by_username_or_email(self, identifier: str) -> Optional[User]:
        """Get a user by username or email."""
        # Try as email first
        user = await self.get_user_by_email(identifier)
        if user:
            return user
        # Try as username
        return await self.get_user_by_username(identifier)

    async def authenticate_user(
        self, username: str, password: str
    ) -> Optional[User]:
        """Authenticate a user by username/email and password."""
        user = await self.get_user_by_username_or_email(username)
        if not user:
            return None
        if not verify_password(password, user.hashed_password):
            return None
        if not user.is_active:
            return None
        return user

    async def register_user(self, request: RegisterRequest) -> User:
        """Register a new user."""
        # Check if email already exists
        existing = await self.get_user_by_email(request.email)
        if existing:
            raise ValueError("Email already registered")

        # Check if username already exists
        existing = await self.get_user_by_username(request.username)
        if existing:
            raise ValueError("Username already taken")

        # Create user
        user = User(
            id=str(uuid.uuid4()),
            email=request.email.lower(),
            username=request.username,
            hashed_password=hash_password(request.password),
            full_name=request.fullName,
            organization=request.organization,
            role="user",
            is_active=True,
            is_verified=False,
        )

        self.session.add(user)
        await self.session.commit()

        # Re-query to get full object
        return await self.get_user_by_id(user.id)

    async def update_last_login(self, user: User) -> None:
        """Update the user's last login timestamp."""
        user.last_login = datetime.now(timezone.utc)
        await self.session.commit()

    async def change_password(
        self, user: User, current_password: str, new_password: str
    ) -> bool:
        """Change a user's password."""
        if not verify_password(current_password, user.hashed_password):
            return False
        user.hashed_password = hash_password(new_password)
        await self.session.commit()
        return True

    async def update_profile(
        self,
        user: User,
        full_name: Optional[str] = None,
        organization: Optional[str] = None,
        preferences: Optional[dict] = None,
    ) -> User:
        """Update user profile."""
        import json

        if full_name is not None:
            user.full_name = full_name
        if organization is not None:
            user.organization = organization
        if preferences is not None:
            user.preferences = json.dumps(preferences)

        await self.session.commit()
        return user

    def create_auth_response(self, user: User) -> AuthResponse:
        """Create an auth response with user and token."""
        access_token = create_access_token(
            data={"sub": user.id, "username": user.username}
        )
        token_response = TokenResponse(
            accessToken=access_token,
            tokenType="bearer",
            expiresIn=settings.jwt_expire_minutes * 60,  # Convert to seconds
        )
        return AuthResponse(user=user_to_response(user), token=token_response)
