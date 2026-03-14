"""
Pydantic schemas for Component-related DTOs.
Field names match the Java DTOs exactly for API compatibility.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ============================================================================
# Nested DTOs for ComponentDto
# ============================================================================

class CodeDto(BaseModel):
    """Code within a value set."""
    model_config = ConfigDict(from_attributes=True)

    code: str
    system: Optional[str] = None
    display: Optional[str] = None
    version: Optional[str] = None


class ValueSetDto(BaseModel):
    """Value set reference for components."""
    model_config = ConfigDict(from_attributes=True)

    oid: Optional[str] = None
    name: Optional[str] = None
    version: Optional[str] = None
    codes: List[CodeDto] = []


class TimingDto(BaseModel):
    """Timing expression for components."""
    model_config = ConfigDict(from_attributes=True)

    operator: Optional[str] = None
    quantity: Optional[int] = None
    unit: Optional[str] = None
    position: Optional[str] = None
    reference: Optional[str] = None
    displayExpression: Optional[str] = None


class ComponentReferenceDto(BaseModel):
    """Reference to a child component in a composite."""
    model_config = ConfigDict(from_attributes=True)

    componentId: str
    versionId: Optional[str] = None
    displayName: Optional[str] = None


class ComplexityDto(BaseModel):
    """Complexity metrics for a component."""
    model_config = ConfigDict(from_attributes=True)

    level: Optional[str] = None
    score: int = 0
    valueSetCount: int = 0
    timingCount: int = 0
    nestedDepth: int = 0
    explanation: Optional[str] = None


class VersionHistoryEntryDto(BaseModel):
    """Entry in version history."""
    model_config = ConfigDict(from_attributes=True)

    versionId: Optional[str] = None
    status: Optional[str] = None
    createdAt: Optional[str] = None
    createdBy: Optional[str] = None
    changeDescription: Optional[str] = None


class VersionInfoDto(BaseModel):
    """Version information for a component."""
    model_config = ConfigDict(from_attributes=True)

    versionId: Optional[str] = None
    status: Optional[str] = None
    versionHistory: List[VersionHistoryEntryDto] = []
    approvedBy: Optional[str] = None
    approvedAt: Optional[datetime] = None
    reviewNotes: Optional[str] = None


class UsageDto(BaseModel):
    """Usage tracking for a component."""
    model_config = ConfigDict(from_attributes=True)

    usageCount: int = 0
    measureIds: List[str] = []
    lastUsedAt: Optional[datetime] = None


class MetadataDto(BaseModel):
    """Metadata for a component."""
    model_config = ConfigDict(from_attributes=True)

    category: Optional[str] = None
    categoryAutoAssigned: bool = False
    tags: List[str] = []


# ============================================================================
# Response DTOs
# ============================================================================

class ComponentDto(BaseModel):
    """Full component DTO with all fields."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str  # "atomic" or "composite"
    name: str
    description: Optional[str] = None

    # Atomic-specific fields
    valueSet: Optional[ValueSetDto] = None
    additionalValueSets: List[ValueSetDto] = []
    timing: Optional[TimingDto] = None
    negation: bool = False
    resourceType: Optional[str] = None
    genderValue: Optional[str] = None

    # Composite-specific fields
    operator: Optional[str] = None
    children: List[ComponentReferenceDto] = []

    # Complexity
    complexity: Optional[ComplexityDto] = None

    # Version info
    versionInfo: Optional[VersionInfoDto] = None

    # Usage
    usage: Optional[UsageDto] = None

    # Metadata
    metadata: Optional[MetadataDto] = None

    # Catalogue tags
    catalogs: List[str] = []

    # Catalogue defaults (e.g., HEDIS collection type defaults)
    catalogueDefaults: Optional[Dict[str, Any]] = None

    # Audit
    createdAt: Optional[datetime] = None
    createdBy: Optional[str] = None
    updatedAt: Optional[datetime] = None
    updatedBy: Optional[str] = None


class ComponentSummaryDto(BaseModel):
    """Lightweight summary DTO for component list views."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    status: Optional[str] = None
    complexityLevel: Optional[str] = None
    usageCount: int = 0
    updatedAt: Optional[datetime] = None


class ComponentStatsDto(BaseModel):
    """Response DTO for component library statistics."""
    model_config = ConfigDict(from_attributes=True)

    totalComponents: int = 0
    byCategory: Dict[str, int] = {}
    byStatus: Dict[str, int] = {}


# ============================================================================
# Request DTOs
# ============================================================================

class CodeRequest(BaseModel):
    """Code request for creating/updating components."""

    code: str
    system: Optional[str] = None
    display: Optional[str] = None
    version: Optional[str] = None


class ValueSetRequest(BaseModel):
    """Value set request for creating/updating components."""

    oid: Optional[str] = None
    name: Optional[str] = None
    version: Optional[str] = None
    codes: List[CodeRequest] = []


class TimingRequest(BaseModel):
    """Timing request for creating/updating components."""

    operator: Optional[str] = None
    quantity: Optional[int] = None
    unit: Optional[str] = None
    position: Optional[str] = None
    reference: Optional[str] = None
    displayExpression: Optional[str] = None


class ComponentReferenceRequest(BaseModel):
    """Reference to a child component for composite creation."""

    componentId: str = Field(..., min_length=1)
    versionId: Optional[str] = None
    displayName: Optional[str] = None


class CreateAtomicComponentRequest(BaseModel):
    """Request DTO for creating an atomic component."""

    id: Optional[str] = None  # Optional client-provided ID
    name: str = Field(..., min_length=1)
    description: Optional[str] = None

    # Value set info (required for atomic)
    valueSetOid: str = Field(..., min_length=1)
    valueSetName: str = Field(..., min_length=1)
    valueSetVersion: Optional[str] = None
    codes: List[CodeRequest] = []
    additionalValueSets: List[ValueSetRequest] = []

    # Timing
    timing: Optional[TimingRequest] = None

    # Negation
    negation: bool = False

    # Resource type
    resourceType: Optional[str] = None

    # Gender (for Patient sex components)
    genderValue: Optional[str] = None

    # Metadata
    category: Optional[str] = None
    tags: List[str] = []

    # Catalogue tags
    catalogs: List[str] = []

    # Catalogue defaults
    catalogueDefaults: Optional[Dict[str, Any]] = None


class CreateCompositeComponentRequest(BaseModel):
    """Request DTO for creating a composite component."""

    name: str = Field(..., min_length=1)
    description: Optional[str] = None

    # Logical operator (AND, OR)
    operator: str = Field(..., min_length=1)

    # Child component references
    children: List[ComponentReferenceRequest] = Field(..., min_length=1)

    # Metadata
    category: Optional[str] = None
    tags: List[str] = []

    # Catalogue tags
    catalogs: List[str] = []

    # Catalogue defaults
    catalogueDefaults: Optional[Dict[str, Any]] = None


class UpdateComponentRequest(BaseModel):
    """Request DTO for updating a component. All fields are optional."""

    name: Optional[str] = None
    description: Optional[str] = None

    # Atomic-specific fields
    valueSetOid: Optional[str] = None
    valueSetName: Optional[str] = None
    valueSetVersion: Optional[str] = None
    codes: Optional[List[CodeRequest]] = None
    additionalValueSets: Optional[List[ValueSetRequest]] = None
    timing: Optional[TimingRequest] = None
    negation: Optional[bool] = None
    resourceType: Optional[str] = None
    genderValue: Optional[str] = None

    # Composite-specific fields
    operator: Optional[str] = None
    children: Optional[List[ComponentReferenceRequest]] = None

    # Metadata
    category: Optional[str] = None
    tags: Optional[List[str]] = None

    # Catalogue tags
    catalogs: Optional[List[str]] = None

    # Catalogue defaults
    catalogueDefaults: Optional[Dict[str, Any]] = None


class ApproveComponentRequest(BaseModel):
    """Request DTO for approving a component."""

    approvedBy: str = Field(..., min_length=1)
    reviewNotes: Optional[str] = None


class SetCategoryRequest(BaseModel):
    """Request DTO for setting component category."""

    category: str = Field(..., min_length=1)


class CreateVersionRequest(BaseModel):
    """Request DTO for creating a new component version."""

    changeDescription: Optional[str] = None
