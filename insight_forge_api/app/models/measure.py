"""
Measure domain models.
Contains Measure, Population, LogicalClause, DataElement, and related entities.
"""
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Table,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import AuditableEntity
from app.models.enums import (
    CodeSystem,
    ConfidenceLevel,
    CorrectionType,
    DataElementType,
    Gender,
    LogicalOperator,
    MeasureProgram,
    MeasureStatus,
    PopulationType,
    ReviewStatus,
)

if TYPE_CHECKING:
    from app.models.component import LibraryComponent


# Association table for DataElement <-> MeasureValueSet many-to-many
data_element_value_set = Table(
    "data_element_value_set",
    AuditableEntity.metadata,
    Column("data_element_id", String(255), ForeignKey("data_element.id"), primary_key=True),
    Column("value_set_id", String(255), ForeignKey("measure_value_set.id"), primary_key=True),
)


class Measure(AuditableEntity):
    """
    Universal Measure Specification entity.
    Represents a clinical quality measure with populations, value sets, and generated code.
    """

    __tablename__ = "measure"
    __table_args__ = (
        Index("idx_measure_status", "status"),
        Index("idx_measure_program", "program"),
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    measure_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    version: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    steward: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    program: Mapped[Optional[MeasureProgram]] = mapped_column(
        Enum(MeasureProgram), nullable=True
    )
    measure_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rationale: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    clinical_recommendation: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Measurement Period
    period_start: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    period_end: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Global Constraints (embedded as columns)
    age_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    age_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    gender: Mapped[Optional[Gender]] = mapped_column(Enum(Gender), nullable=True)
    age_calculation: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    product_line: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON array
    continuous_enrollment_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    allowed_gap_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Status
    status: Mapped[Optional[MeasureStatus]] = mapped_column(
        Enum(MeasureStatus), nullable=True
    )
    overall_confidence: Mapped[Optional[ConfidenceLevel]] = mapped_column(
        Enum(ConfidenceLevel), nullable=True
    )
    locked_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    locked_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Generated Code
    generated_cql: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    generated_sql: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    populations: Mapped[List["Population"]] = relationship(
        "Population",
        back_populates="measure",
        cascade="all, delete-orphan",
        order_by="Population.display_order",
    )
    value_sets: Mapped[List["MeasureValueSet"]] = relationship(
        "MeasureValueSet",
        back_populates="measure",
        cascade="all, delete-orphan",
    )
    corrections: Mapped[List["MeasureCorrection"]] = relationship(
        "MeasureCorrection",
        back_populates="measure",
        cascade="all, delete-orphan",
        order_by="MeasureCorrection.timestamp.desc()",
    )


class Population(AuditableEntity):
    """
    Population definition for a measure.
    Contains a root LogicalClause that holds the criteria tree.
    """

    __tablename__ = "population"
    __table_args__ = (
        Index("idx_population_measure", "measure_id"),
        Index("idx_population_type", "population_type"),
        Index("idx_population_display_order", "measure_id", "display_order"),
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    measure_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("measure.id"), nullable=False
    )
    population_type: Mapped[PopulationType] = mapped_column(
        Enum(PopulationType), nullable=False
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    narrative: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    confidence: Mapped[Optional[ConfidenceLevel]] = mapped_column(
        Enum(ConfidenceLevel), nullable=True
    )
    review_status: Mapped[Optional[ReviewStatus]] = mapped_column(
        Enum(ReviewStatus), nullable=True
    )
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # CQL generation cache
    cql_definition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cql_definition_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Root clause reference
    root_clause_id: Mapped[Optional[str]] = mapped_column(
        String(255), ForeignKey("logical_clause.id"), nullable=True
    )

    # Relationships
    measure: Mapped["Measure"] = relationship("Measure", back_populates="populations")
    root_clause: Mapped[Optional["LogicalClause"]] = relationship(
        "LogicalClause",
        foreign_keys=[root_clause_id],
        cascade="all, delete-orphan",
        single_parent=True,
    )


class LogicalClause(AuditableEntity):
    """
    Logical clause in a population criteria tree.
    Self-referencing for nested AND/OR/NOT operations.
    """

    __tablename__ = "logical_clause"
    __table_args__ = (
        Index("idx_clause_parent", "parent_clause_id"),
        Index("idx_clause_display_order", "parent_clause_id", "display_order"),
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    parent_clause_id: Mapped[Optional[str]] = mapped_column(
        String(255), ForeignKey("logical_clause.id"), nullable=True
    )
    operator: Mapped[LogicalOperator] = mapped_column(
        Enum(LogicalOperator), nullable=False
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    confidence: Mapped[Optional[ConfidenceLevel]] = mapped_column(
        Enum(ConfidenceLevel), nullable=True
    )
    review_status: Mapped[Optional[ReviewStatus]] = mapped_column(
        Enum(ReviewStatus), nullable=True
    )

    # CQL snippet cache
    cql_snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cql_definition_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Sibling connections (JSON)
    sibling_connections: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    parent_clause: Mapped[Optional["LogicalClause"]] = relationship(
        "LogicalClause",
        remote_side=[id],
        back_populates="child_clauses",
    )
    child_clauses: Mapped[List["LogicalClause"]] = relationship(
        "LogicalClause",
        back_populates="parent_clause",
        cascade="all, delete-orphan",
        order_by="LogicalClause.display_order",
    )
    data_elements: Mapped[List["DataElement"]] = relationship(
        "DataElement",
        back_populates="clause",
        cascade="all, delete-orphan",
        order_by="DataElement.display_order",
    )


class DataElement(AuditableEntity):
    """
    Data element (leaf node) in a population criteria tree.
    Represents a single clinical criterion.
    """

    __tablename__ = "data_element"
    __table_args__ = (
        Index("idx_element_clause", "clause_id"),
        Index("idx_element_type", "element_type"),
        Index("idx_element_library_component", "library_component_id"),
        Index("idx_element_display_order", "clause_id", "display_order"),
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    clause_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("logical_clause.id"), nullable=False
    )
    element_type: Mapped[DataElementType] = mapped_column(
        Enum(DataElementType), nullable=False
    )
    resource_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Thresholds (embedded)
    threshold_age_min: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    threshold_age_max: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    value_min: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    value_max: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 2), nullable=True)
    value_unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    value_comparator: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # Gender for demographic checks
    gender_value: Mapped[Optional[Gender]] = mapped_column(Enum(Gender), nullable=True)

    negation: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    negation_rationale: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Timing (JSON)
    timing_override: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timing_window: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Additional requirements (JSON array)
    additional_requirements: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    confidence: Mapped[Optional[ConfidenceLevel]] = mapped_column(
        Enum(ConfidenceLevel), nullable=True
    )
    review_status: Mapped[Optional[ReviewStatus]] = mapped_column(
        Enum(ReviewStatus), nullable=True
    )

    # CQL cache
    cql_definition_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    cql_expression: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Library component link
    library_component_id: Mapped[Optional[str]] = mapped_column(
        String(255), ForeignKey("library_component.id"), nullable=True
    )

    # Relationships
    clause: Mapped["LogicalClause"] = relationship(
        "LogicalClause", back_populates="data_elements"
    )
    value_sets: Mapped[List["MeasureValueSet"]] = relationship(
        "MeasureValueSet",
        secondary=data_element_value_set,
        back_populates="data_elements",
    )
    library_component: Mapped[Optional["LibraryComponent"]] = relationship(
        "LibraryComponent", back_populates="data_elements"
    )


class MeasureValueSet(AuditableEntity):
    """
    Value set owned by a measure.
    Contains codes that define clinical concepts.
    """

    __tablename__ = "measure_value_set"
    __table_args__ = (
        Index("idx_value_set_measure", "measure_id"),
        Index("idx_value_set_oid", "oid"),
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    measure_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("measure.id"), nullable=False
    )
    oid: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    version: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    publisher: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    purpose: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    confidence: Mapped[Optional[ConfidenceLevel]] = mapped_column(
        Enum(ConfidenceLevel), nullable=True
    )
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Relationships
    measure: Mapped["Measure"] = relationship("Measure", back_populates="value_sets")
    codes: Mapped[List["ValueSetCode"]] = relationship(
        "ValueSetCode",
        back_populates="value_set",
        cascade="all, delete-orphan",
    )
    data_elements: Mapped[List["DataElement"]] = relationship(
        "DataElement",
        secondary=data_element_value_set,
        back_populates="value_sets",
    )


class ValueSetCode(AuditableEntity):
    """
    Individual code within a value set.
    """

    __tablename__ = "value_set_code"
    __table_args__ = (
        Index("idx_code_value_set", "value_set_id"),
        Index("idx_code_system", "code_system"),
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    value_set_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("measure_value_set.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(100), nullable=False)
    code_system: Mapped[CodeSystem] = mapped_column(Enum(CodeSystem), nullable=False)
    system_uri: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    display: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    version: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Relationships
    value_set: Mapped["MeasureValueSet"] = relationship(
        "MeasureValueSet", back_populates="codes"
    )


class MeasureCorrection(AuditableEntity):
    """
    Extraction correction record for a measure.
    Tracks user corrections to AI-extracted content.
    """

    __tablename__ = "measure_correction"
    __table_args__ = (
        Index("idx_correction_measure", "measure_id"),
        Index("idx_correction_type", "correction_type"),
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    measure_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("measure.id"), nullable=False
    )
    element_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    correction_type: Mapped[CorrectionType] = mapped_column(
        Enum(CorrectionType), nullable=False
    )
    original_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    corrected_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    context: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

    # Relationships
    measure: Mapped["Measure"] = relationship("Measure", back_populates="corrections")
