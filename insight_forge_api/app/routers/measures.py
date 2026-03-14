"""
Measure REST API router.
"""
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.deps import DbSession
from app.schemas.measure import (
    CreateMeasureRequest,
    MeasureDto,
    MeasureSummaryDto,
    UpdateMeasureRequest,
)
from app.schemas.validation import ValidationTraceDto
from app.services.measure_service import MeasureService

router = APIRouter(prefix="/measures", tags=["Measures"])


# ============================================================================
# Validation Summary DTO
# ============================================================================

class ValidationSummary(BaseModel):
    """Validation summary statistics."""
    totalPatients: int = 0
    inPopulation: int = 0
    inNumerator: int = 0
    excluded: int = 0
    performanceRate: float = 0.0


# ============================================================================
# Read Endpoints
# ============================================================================

@router.get("", response_model=List[MeasureSummaryDto])
async def get_all_measures(
    db: DbSession,
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """Get all measures with optional filtering."""
    service = MeasureService(db)

    if search:
        return await service.search_measures(search)
    elif status:
        return await service.get_measures_by_status(status)
    else:
        return await service.get_all_measures()


@router.get("/full", response_model=List[MeasureDto])
async def get_all_measures_full(db: DbSession):
    """
    Get all measures with full details in a single request.
    Eliminates N+1 query problem by fetching all measures with complete data.
    """
    service = MeasureService(db)
    return await service.get_all_measures_full()


@router.get("/{measure_id}", response_model=MeasureDto)
async def get_measure_by_id(measure_id: str, db: DbSession):
    """Get a measure by ID."""
    service = MeasureService(db)
    measure = await service.get_measure_by_id(measure_id)
    if not measure:
        raise HTTPException(status_code=404, detail="Measure not found")
    return measure


@router.get("/by-measure-id/{cms_measure_id}", response_model=MeasureDto)
async def get_measure_by_cms_id(cms_measure_id: str, db: DbSession):
    """Get a measure by CMS measure ID."""
    service = MeasureService(db)
    measure = await service.get_measure_by_measure_id(cms_measure_id)
    if not measure:
        raise HTTPException(status_code=404, detail="Measure not found")
    return measure


# ============================================================================
# Create/Update/Delete Endpoints
# ============================================================================

@router.post("", response_model=MeasureDto)
async def create_measure(request: CreateMeasureRequest, db: DbSession):
    """Create a new measure."""
    service = MeasureService(db)
    return await service.create_measure(request)


@router.put("/{measure_id}", response_model=MeasureDto)
async def update_measure(
    measure_id: str,
    request: UpdateMeasureRequest,
    db: DbSession,
):
    """Update an existing measure."""
    service = MeasureService(db)
    measure = await service.update_measure(measure_id, request)
    if not measure:
        raise HTTPException(status_code=404, detail="Measure not found")
    return measure


@router.delete("/{measure_id}", status_code=204)
async def delete_measure(measure_id: str, db: DbSession):
    """Delete a measure."""
    service = MeasureService(db)
    if not await service.delete_measure(measure_id):
        raise HTTPException(status_code=404, detail="Measure not found")


# ============================================================================
# Lock/Unlock Endpoints
# ============================================================================

class LockRequest(BaseModel):
    """Request body for locking a measure."""
    lockedBy: str = "system"


@router.post("/{measure_id}/lock", response_model=MeasureDto)
async def lock_measure(measure_id: str, request: LockRequest, db: DbSession):
    """Lock a measure to prevent editing."""
    service = MeasureService(db)
    measure = await service.lock_measure(measure_id, request.lockedBy)
    if not measure:
        raise HTTPException(status_code=404, detail="Measure not found")
    return measure


@router.post("/{measure_id}/unlock", response_model=MeasureDto)
async def unlock_measure(measure_id: str, db: DbSession):
    """Unlock a measure."""
    service = MeasureService(db)
    measure = await service.unlock_measure(measure_id)
    if not measure:
        raise HTTPException(status_code=404, detail="Measure not found")
    return measure


# ============================================================================
# Validation Endpoints
# ============================================================================

@router.get("/{measure_id}/validate", response_model=List[ValidationTraceDto])
async def validate_measure(measure_id: str, db: DbSession):
    """Validate a measure against test patients."""
    service = MeasureService(db)
    measure = await service.get_measure_by_id(measure_id)
    if not measure:
        raise HTTPException(status_code=404, detail="Measure not found")
    # TODO: Implement validation against test patients
    return []


@router.get("/{measure_id}/validate/summary", response_model=ValidationSummary)
async def get_validation_summary(measure_id: str, db: DbSession):
    """Get validation summary for a measure."""
    service = MeasureService(db)
    measure = await service.get_measure_by_id(measure_id)
    if not measure:
        raise HTTPException(status_code=404, detail="Measure not found")
    # TODO: Implement validation summary
    return ValidationSummary()


# Code generation endpoints are in code_generation.py router
