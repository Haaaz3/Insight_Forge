"""
Pydantic schemas for Validation-related DTOs.
Used for test patient validation endpoints.
"""
from typing import List, Optional

from pydantic import BaseModel


# ============================================================================
# Validation Trace DTOs
# ============================================================================

class ValidationFactDto(BaseModel):
    """Fact supporting a validation node."""

    code: Optional[str] = None
    display: Optional[str] = None
    date: Optional[str] = None
    source: Optional[str] = None


class ValidationNodeDto(BaseModel):
    """Node in the validation tree (recursive)."""

    id: str
    title: Optional[str] = None
    type: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    facts: List[ValidationFactDto] = []
    children: List["ValidationNodeDto"] = []


# Forward reference resolution
ValidationNodeDto.model_rebuild()


class PopulationResultDto(BaseModel):
    """Result for a single population."""

    populationType: str
    met: bool
    nodes: List[ValidationNodeDto] = []


class PreCheckResultDto(BaseModel):
    """Pre-check result (age, gender, enrollment, etc.)."""

    checkType: str
    met: bool
    description: Optional[str] = None


class ValidationTraceDto(BaseModel):
    """Full validation trace for a test patient."""

    patientId: str
    patientName: Optional[str] = None
    patientGender: Optional[str] = None
    narrative: Optional[str] = None
    finalOutcome: Optional[str] = None
    preCheckResults: List[PreCheckResultDto] = []
    populationResults: List[PopulationResultDto] = []
    howClose: List[str] = []


# ============================================================================
# Classifier Feedback DTOs
# ============================================================================

class ClassifierFeedbackRequest(BaseModel):
    """Request DTO for recording classifier feedback."""

    documentName: Optional[str] = None
    detectedType: Optional[str] = None
    confirmedType: str  # Required
    wasOverridden: bool = False
    confidence: Optional[str] = None
    signals: List[str] = []
    timestamp: Optional[str] = None


class ClassifierFeedbackStatsDto(BaseModel):
    """Statistics about classifier feedback."""

    totalFeedback: int = 0
    overrideRate: float = 0.0
    byType: dict = {}
