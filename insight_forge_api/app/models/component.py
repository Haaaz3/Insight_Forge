"""
Library component models.
Contains LibraryComponent base class and AtomicComponent/CompositeComponent subclasses.
Uses single-table inheritance with discriminator column.
"""
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, Enum, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import AuditableEntity
from app.models.enums import (
    ApprovalStatus,
    ComplexityLevel,
    ComponentCategory,
    Gender,
    LogicalOperator,
    TimingOperator,
)

if TYPE_CHECKING:
    from app.models.measure import DataElement


class LibraryComponent(AuditableEntity):
    """
    Abstract base class for library components.
    Uses single-table inheritance with discriminator column.
    """

    __tablename__ = "library_component"
    __table_args__ = (
        Index("idx_component_category", "category"),
        Index("idx_component_status", "version_status"),
        Index("idx_component_type", "component_type"),
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    component_type: Mapped[str] = mapped_column(String(31), nullable=False)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Complexity (embedded)
    complexity_level: Mapped[Optional[ComplexityLevel]] = mapped_column(
        Enum(ComplexityLevel), nullable=True
    )
    complexity_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    complexity_factors: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON

    # Version info (embedded)
    version_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    version_status: Mapped[Optional[ApprovalStatus]] = mapped_column(
        Enum(ApprovalStatus), nullable=True
    )
    version_history: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON
    approved_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Usage tracking (embedded)
    measure_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array
    usage_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    parent_composite_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON

    # Metadata (embedded)
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    category_auto_assigned: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array
    source_origin: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    source_reference: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    original_measure_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Catalogue tags (JSON array)
    catalogs: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Catalogue-specific defaults (JSON object)
    catalogue_defaults: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ---- Atomic component fields ----
    # Value set (embedded)
    value_set_oid: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    value_set_name: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    value_set_version: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    value_set_codes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON

    # Additional value sets (JSON array)
    additional_value_sets: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Timing expression (embedded)
    timing_operator: Mapped[Optional[TimingOperator]] = mapped_column(
        Enum(TimingOperator), nullable=True
    )
    timing_quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    timing_unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    timing_position: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    timing_reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    timing_display: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    negation: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    resource_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    gender_value: Mapped[Optional[Gender]] = mapped_column(Enum(Gender), nullable=True)

    # ---- Composite component fields ----
    logical_operator: Mapped[Optional[LogicalOperator]] = mapped_column(
        Enum(LogicalOperator), nullable=True
    )
    children: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array

    # Relationships
    data_elements: Mapped[List["DataElement"]] = relationship(
        "DataElement", back_populates="library_component"
    )

    __mapper_args__ = {
        "polymorphic_on": "component_type",
        "polymorphic_identity": "base",
    }

    @property
    def is_atomic(self) -> bool:
        """Check if this is an atomic component."""
        return self.component_type == "atomic"

    @property
    def is_composite(self) -> bool:
        """Check if this is a composite component."""
        return self.component_type == "composite"


class AtomicComponent(LibraryComponent):
    """
    Atomic component representing a single clinical concept.
    Contains a value set, timing expression, and optional negation.
    """

    __mapper_args__ = {
        "polymorphic_identity": "atomic",
    }


class CompositeComponent(LibraryComponent):
    """
    Composite component combining multiple atomic components.
    Uses a logical operator to combine children.
    """

    __mapper_args__ = {
        "polymorphic_identity": "composite",
    }
