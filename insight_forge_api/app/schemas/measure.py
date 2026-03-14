"""
Pydantic schemas for Measure-related DTOs.
Field names match the Java DTOs exactly for API compatibility.
"""
from datetime import datetime
from decimal import Decimal
from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ============================================================================
# Response DTOs
# ============================================================================

class ValueSetCodeDto(BaseModel):
    """Individual code in a value set."""
    model_config = ConfigDict(from_attributes=True)

    id: Optional[str] = None
    code: str
    system: Optional[str] = None  # Maps to codeSystem in DB
    display: Optional[str] = None
    version: Optional[str] = None


class ThresholdDto(BaseModel):
    """Threshold range for data elements."""
    model_config = ConfigDict(from_attributes=True)

    ageMin: Optional[int] = Field(None, alias="age_min")
    ageMax: Optional[int] = Field(None, alias="age_max")
    valueMin: Optional[Decimal] = Field(None, alias="value_min")
    valueMax: Optional[Decimal] = Field(None, alias="value_max")
    comparator: Optional[str] = Field(None, alias="value_comparator")
    unit: Optional[str] = Field(None, alias="value_unit")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ValueSetRefDto(BaseModel):
    """Lightweight value set reference attached to a data element."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    oid: Optional[str] = None
    name: str
    version: Optional[str] = None
    source: Optional[str] = None
    verified: bool = False
    codes: List[ValueSetCodeDto] = []


class DataElementDto(BaseModel):
    """Data element (leaf node) DTO."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    elementType: str
    resourceType: Optional[str] = None
    description: Optional[str] = None
    libraryComponentId: Optional[str] = None
    negation: bool = False
    negationRationale: Optional[str] = None
    genderValue: Optional[str] = None
    thresholds: Optional[ThresholdDto] = None
    timingOverride: Optional[str] = None  # JSON string
    timingWindow: Optional[str] = None  # JSON string
    additionalRequirements: Optional[str] = None  # JSON string
    confidence: Optional[str] = None
    reviewStatus: Optional[str] = None
    displayOrder: int = 0
    valueSets: List[ValueSetRefDto] = []


class LogicalClauseDto(BaseModel):
    """Recursive logical clause DTO."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    operator: str
    description: Optional[str] = None
    displayOrder: int = 0
    children: List["LogicalClauseDto"] = []
    dataElements: List[DataElementDto] = []


# Forward reference resolution for recursive model
LogicalClauseDto.model_rebuild()


class PopulationDto(BaseModel):
    """Population DTO with root clause."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    populationType: str
    description: Optional[str] = None
    narrative: Optional[str] = None
    rootClause: Optional[LogicalClauseDto] = None
    displayOrder: int = 0
    confidence: Optional[str] = None
    reviewStatus: Optional[str] = None
    reviewNotes: Optional[str] = None
    cqlDefinition: Optional[str] = None
    cqlDefinitionName: Optional[str] = None


class MeasureValueSetDto(BaseModel):
    """Measure value set DTO with codes."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    oid: Optional[str] = None
    url: Optional[str] = None
    name: str
    version: Optional[str] = None
    publisher: Optional[str] = None
    purpose: Optional[str] = None
    confidence: Optional[str] = None
    verified: bool = False
    source: Optional[str] = None
    codes: List[ValueSetCodeDto] = []


class CorrectionDto(BaseModel):
    """Correction entry DTO."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    correctionType: str
    description: Optional[str] = None
    author: Optional[str] = None
    timestamp: Optional[datetime] = None
    field: Optional[str] = None
    oldValue: Optional[str] = None
    newValue: Optional[str] = None


class GlobalConstraintsDto(BaseModel):
    """Global constraints for a measure."""
    model_config = ConfigDict(from_attributes=True)

    ageMin: Optional[int] = None
    ageMax: Optional[int] = None
    ageCalculation: Optional[str] = None
    gender: Optional[str] = None
    measurementPeriodType: Optional[str] = None
    measurementPeriodAnchor: Optional[str] = None


class MeasureDto(BaseModel):
    """Full measure DTO with all fields and eagerly resolved relationships."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    measureId: Optional[str] = None
    title: Optional[str] = None
    version: Optional[str] = None
    steward: Optional[str] = None
    program: Optional[str] = None
    measureType: Optional[str] = None
    description: Optional[str] = None
    rationale: Optional[str] = None
    clinicalRecommendation: Optional[str] = None
    periodStart: Optional[str] = None
    periodEnd: Optional[str] = None
    globalConstraints: Optional[GlobalConstraintsDto] = None
    status: Optional[str] = None
    overallConfidence: Optional[str] = None
    lockedAt: Optional[datetime] = None
    lockedBy: Optional[str] = None
    populations: List[PopulationDto] = []
    valueSets: List[MeasureValueSetDto] = []
    corrections: List[CorrectionDto] = []
    generatedCql: Optional[str] = None
    generatedSql: Optional[str] = None
    createdAt: Optional[datetime] = None
    createdBy: Optional[str] = None
    updatedAt: Optional[datetime] = None
    updatedBy: Optional[str] = None


class MeasureSummaryDto(BaseModel):
    """Lightweight measure summary for list views."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    measureId: Optional[str] = None
    title: Optional[str] = None
    program: Optional[str] = None
    status: Optional[str] = None
    populationCount: int = 0
    updatedAt: Optional[datetime] = None


# ============================================================================
# Request DTOs
# ============================================================================

class GlobalConstraintsRequest(BaseModel):
    """Global constraints for creating/updating a measure."""

    ageMin: Optional[int] = None
    ageMax: Optional[int] = None
    ageCalculation: Optional[str] = None
    gender: Optional[str] = None
    measurementPeriodType: Optional[str] = None
    measurementPeriodAnchor: Optional[str] = None


class CreateMeasureRequest(BaseModel):
    """Request DTO for creating a new measure."""

    measureId: str = Field(..., min_length=1, max_length=100)
    title: str = Field(..., min_length=1, max_length=500)
    version: Optional[str] = Field(None, max_length=50)
    steward: Optional[str] = Field(None, max_length=255)
    program: Optional[str] = None
    measureType: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    rationale: Optional[str] = None
    clinicalRecommendation: Optional[str] = None
    periodStart: Optional[str] = None
    periodEnd: Optional[str] = None
    globalConstraints: Optional[GlobalConstraintsRequest] = None
    status: Optional[str] = None


class UpdateMeasureRequest(BaseModel):
    """Request DTO for updating a measure. All fields are optional."""

    measureId: Optional[str] = Field(None, max_length=100)
    title: Optional[str] = Field(None, max_length=500)
    version: Optional[str] = Field(None, max_length=50)
    steward: Optional[str] = Field(None, max_length=255)
    program: Optional[str] = None
    measureType: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    rationale: Optional[str] = None
    clinicalRecommendation: Optional[str] = None
    periodStart: Optional[str] = None
    periodEnd: Optional[str] = None
    globalConstraints: Optional[GlobalConstraintsRequest] = None
    status: Optional[str] = None
    populations: Optional[List[Any]] = None  # Full population trees
    valueSets: Optional[List[Any]] = None
