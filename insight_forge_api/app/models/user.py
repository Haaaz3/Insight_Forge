"""
User model for authentication.
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import AuditableEntity


class User(AuditableEntity):
    """
    User entity for authentication and authorization.
    """

    __tablename__ = "user"
    __table_args__ = (
        Index("idx_user_email", "email", unique=True),
        Index("idx_user_username", "username", unique=True),
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    # Profile
    full_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    organization: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(50), default="user", nullable=False)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Timestamps
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Preferences (JSON)
    preferences: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
