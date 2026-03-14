"""
Import/Export REST API router.
"""
from typing import Any, Dict

from fastapi import APIRouter

from app.deps import DbSession
from app.schemas.import_schema import ImportRequest, ImportResultDto
from app.services.import_service import ImportService

router = APIRouter(prefix="/import", tags=["Import"])


@router.post("", response_model=ImportResultDto)
async def import_data(request: ImportRequest, db: DbSession):
    """
    Import data from Zustand export format.
    Components are imported before measures (foreign key dependency).
    """
    service = ImportService(db)
    result = await service.import_data(request)

    # Note: FastAPI will handle 400 status code based on success field
    # The frontend expects the result regardless of success
    return result


@router.get("/export", response_model=Dict[str, Any])
async def export_data(db: DbSession):
    """Export all data to Zustand format."""
    service = ImportService(db)
    return await service.export_data()
