"""
Pydantic schemas for Test Patient DTOs.
Used for FHIR test patient endpoints.
"""
from typing import Optional

from pydantic import BaseModel, Field


class FhirTestPatientSummaryDto(BaseModel):
    """Summary DTO for FHIR test patients (excludes large fhirBundle)."""

    id: str
    measureId: Optional[str] = None
    testCaseName: Optional[str] = None
    description: Optional[str] = None
    expectedIp: Optional[int] = None
    expectedDen: Optional[int] = None
    expectedDenex: Optional[int] = None
    expectedNum: Optional[int] = None
    expectedDenexcep: Optional[int] = None
    patientGender: Optional[str] = None
    patientBirthDate: Optional[str] = None


class FhirTestPatientDetailDto(BaseModel):
    """Full detail DTO for FHIR test patients (includes fhirBundle)."""

    id: str
    measureId: Optional[str] = None
    testCaseName: Optional[str] = None
    description: Optional[str] = None
    fhirBundle: Optional[str] = None  # JSON string
    expectedIp: Optional[int] = None
    expectedDen: Optional[int] = None
    expectedDenex: Optional[int] = None
    expectedNum: Optional[int] = None
    expectedDenexcep: Optional[int] = None
    patientGender: Optional[str] = None
    patientBirthDate: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class CreateTestPatientRequest(BaseModel):
    """Request DTO for creating a test patient."""

    measureId: str = Field(..., min_length=1)
    testCaseName: str = Field(..., min_length=1)
    description: Optional[str] = None
    fhirBundle: str = Field(..., min_length=1)  # Required JSON string
    expectedIp: Optional[int] = None
    expectedDen: Optional[int] = None
    expectedDenex: Optional[int] = None
    expectedNum: Optional[int] = None
    expectedDenexcep: Optional[int] = None
    patientGender: Optional[str] = None
    patientBirthDate: Optional[str] = None


class UpdateTestPatientRequest(BaseModel):
    """Request DTO for updating a test patient."""

    testCaseName: Optional[str] = None
    description: Optional[str] = None
    fhirBundle: Optional[str] = None
    expectedIp: Optional[int] = None
    expectedDen: Optional[int] = None
    expectedDenex: Optional[int] = None
    expectedNum: Optional[int] = None
    expectedDenexcep: Optional[int] = None
    patientGender: Optional[str] = None
    patientBirthDate: Optional[str] = None
