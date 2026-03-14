"""
Validation REST API router.
Endpoints for test patient validation.
"""
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.deps import DbSession
from app.schemas.test_patient import (
    CreateTestPatientRequest,
    FhirTestPatientDetailDto,
    FhirTestPatientSummaryDto,
    UpdateTestPatientRequest,
)
from app.schemas.validation import ValidationTraceDto
from app.services.test_patient_service import TestPatientService
from app.services.validation_service import ValidationService

router = APIRouter(prefix="/validation", tags=["Validation"])


# ============================================================================
# Response DTOs
# ============================================================================


class ValidationSummaryDto(BaseModel):
    """Summary statistics for validation."""
    totalPatients: int = 0
    inPopulation: int = 0
    inNumerator: int = 0
    excluded: int = 0
    notInNumerator: int = 0
    performanceRate: float = 0.0


class ValidationResultsDto(BaseModel):
    """Results of validating all patients against a measure."""
    measureId: str
    measureTitle: str
    summary: ValidationSummaryDto
    traces: List[ValidationTraceDto] = []


# ============================================================================
# Test Patient Endpoints
# ============================================================================


@router.get("/patients", response_model=List[FhirTestPatientSummaryDto])
async def get_all_test_patients(db: DbSession):
    """Get all FHIR test patients."""
    service = TestPatientService(db)
    return await service.get_all_fhir_test_patients()


@router.get("/patients/for-measure/{measure_id}", response_model=List[FhirTestPatientSummaryDto])
async def get_test_patients_for_measure(measure_id: str, db: DbSession):
    """Get test patients for a specific measure."""
    service = TestPatientService(db)
    return await service.get_fhir_test_patients_for_measure(measure_id)


@router.get("/patients/{patient_id}", response_model=FhirTestPatientDetailDto)
async def get_test_patient(patient_id: str, db: DbSession):
    """Get a specific test patient with full details."""
    service = TestPatientService(db)
    patient = await service.get_fhir_test_patient_by_id(patient_id)
    if not patient:
        raise HTTPException(status_code=404, detail="Test patient not found")
    return patient


@router.post("/patients", response_model=FhirTestPatientDetailDto)
async def create_test_patient(request: CreateTestPatientRequest, db: DbSession):
    """Create a new FHIR test patient."""
    service = TestPatientService(db)
    return await service.create_fhir_test_patient(request)


@router.put("/patients/{patient_id}", response_model=FhirTestPatientDetailDto)
async def update_test_patient(
    patient_id: str,
    request: UpdateTestPatientRequest,
    db: DbSession,
):
    """Update an existing test patient."""
    service = TestPatientService(db)
    patient = await service.update_fhir_test_patient(patient_id, request)
    if not patient:
        raise HTTPException(status_code=404, detail="Test patient not found")
    return patient


@router.delete("/patients/{patient_id}", status_code=204)
async def delete_test_patient(patient_id: str, db: DbSession):
    """Delete a test patient."""
    service = TestPatientService(db)
    if not await service.delete_fhir_test_patient(patient_id):
        raise HTTPException(status_code=404, detail="Test patient not found")


# ============================================================================
# Validation Endpoints
# ============================================================================


@router.get("/evaluate/{measure_id}/{patient_id}", response_model=ValidationTraceDto)
async def evaluate_patient(measure_id: str, patient_id: str, db: DbSession):
    """Evaluate a single test patient against a measure."""
    service = ValidationService(db)
    trace = await service.evaluate_patient(patient_id, measure_id)
    if not trace:
        raise HTTPException(status_code=404, detail="Measure or patient not found")
    return trace


@router.get("/evaluate/{measure_id}", response_model=ValidationResultsDto)
async def evaluate_all_patients(measure_id: str, db: DbSession):
    """Evaluate all test patients against a measure."""
    service = ValidationService(db)
    results = await service.evaluate_all_patients(measure_id)
    if not results:
        raise HTTPException(status_code=404, detail="Measure not found")

    return ValidationResultsDto(
        measureId=results.measure_id,
        measureTitle=results.measure_title,
        summary=ValidationSummaryDto(
            totalPatients=results.summary.total_patients,
            inPopulation=results.summary.in_population,
            inNumerator=results.summary.in_numerator,
            excluded=results.summary.excluded,
            notInNumerator=results.summary.not_in_numerator,
            performanceRate=results.summary.performance_rate,
        ),
        traces=results.traces,
    )


@router.get("/summary/{measure_id}", response_model=ValidationSummaryDto)
async def get_validation_summary(measure_id: str, db: DbSession):
    """Get validation summary for a measure."""
    service = ValidationService(db)
    summary = await service.get_validation_summary(measure_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Measure not found")

    return ValidationSummaryDto(
        totalPatients=summary.total_patients,
        inPopulation=summary.in_population,
        inNumerator=summary.in_numerator,
        excluded=summary.excluded,
        notInNumerator=summary.not_in_numerator,
        performanceRate=summary.performance_rate,
    )
