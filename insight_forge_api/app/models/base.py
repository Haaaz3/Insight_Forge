"""
Base model classes with audit fields and common utilities.
"""
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class AuditMixin:
    """
    Mixin that adds audit tracking fields to models.
    Provides created_at, created_by, updated_at, updated_by columns.
    """

    created_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        default=func.now(),
        nullable=True,
    )

    created_by: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime,
        default=func.now(),
        onupdate=func.now(),
        nullable=True,
    )

    updated_by: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )


class AuditableEntity(Base, AuditMixin):
    """
    Abstract base class for entities that require audit tracking.
    Combines SQLAlchemy Base with AuditMixin.
    """

    __abstract__ = True

    def to_dict(self) -> Dict[str, Any]:
        """Convert model to dictionary."""
        return {
            column.name: getattr(self, column.name)
            for column in self.__table__.columns
        }
