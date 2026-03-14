"""
Component Library REST API router.
"""
from typing import Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.deps import DbSession
from app.schemas.component import (
    ApproveComponentRequest,
    ComponentDto,
    ComponentStatsDto,
    ComponentSummaryDto,
    CreateAtomicComponentRequest,
    CreateCompositeComponentRequest,
    SetCategoryRequest,
    UpdateComponentRequest,
)
from app.services.component_service import ComponentService

router = APIRouter(prefix="/components", tags=["Components"])


# ============================================================================
# Read Endpoints
# ============================================================================

@router.get("", response_model=List[ComponentSummaryDto])
async def get_all_components(
    db: DbSession,
    category: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    includeArchived: bool = Query(False),
):
    """Get all components with optional filtering."""
    service = ComponentService(db)
    return await service.get_all_components(
        category=category,
        status=status,
        search=search,
        include_archived=includeArchived,
    )


@router.get("/stats", response_model=ComponentStatsDto)
async def get_stats(db: DbSession):
    """Get library statistics."""
    service = ComponentService(db)
    return await service.get_stats()


@router.get("/{component_id}", response_model=ComponentDto)
async def get_component(component_id: str, db: DbSession):
    """Get a single component by ID."""
    service = ComponentService(db)
    component = await service.get_component_by_id(component_id)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


# ============================================================================
# Create Endpoints
# ============================================================================

@router.post("/atomic", response_model=ComponentDto, status_code=201)
async def create_atomic_component(
    request: CreateAtomicComponentRequest, db: DbSession
):
    """Create a new atomic component."""
    service = ComponentService(db)
    return await service.create_atomic_component(request)


@router.post("/composite", response_model=ComponentDto, status_code=201)
async def create_composite_component(
    request: CreateCompositeComponentRequest, db: DbSession
):
    """Create a new composite component."""
    service = ComponentService(db)
    return await service.create_composite_component(request)


# ============================================================================
# Update Endpoints
# ============================================================================

@router.put("/{component_id}", response_model=ComponentDto)
async def update_component(
    component_id: str, request: UpdateComponentRequest, db: DbSession
):
    """Update a component."""
    service = ComponentService(db)
    component = await service.update_component(component_id, request)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.put("/{component_id}/category", response_model=ComponentDto)
async def set_category(
    component_id: str, request: SetCategoryRequest, db: DbSession
):
    """Set component category manually (disables auto-assignment)."""
    service = ComponentService(db)
    component = await service.set_category(component_id, request.category)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


# ============================================================================
# Delete Endpoints
# ============================================================================

@router.delete("/{component_id}", status_code=204)
async def delete_component(component_id: str, db: DbSession):
    """Delete a component."""
    service = ComponentService(db)
    if not await service.delete_component(component_id):
        raise HTTPException(status_code=404, detail="Component not found")


# ============================================================================
# Versioning Endpoints
# ============================================================================

class CreateVersionRequest(BaseModel):
    """Request body for creating a new version."""
    changeDescription: Optional[str] = None
    createdBy: Optional[str] = None


@router.post("/{component_id}/versions", response_model=ComponentDto)
async def create_version(
    component_id: str, request: CreateVersionRequest, db: DbSession
):
    """Create a new version of a component."""
    # TODO: Implement versioning
    service = ComponentService(db)
    component = await service.get_component_by_id(component_id)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.post("/{component_id}/approve", response_model=ComponentDto)
async def approve_component(
    component_id: str, request: ApproveComponentRequest, db: DbSession
):
    """Approve a component."""
    service = ComponentService(db)
    component = await service.approve_component(component_id, request.approvedBy)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


@router.post("/{component_id}/archive", response_model=ComponentDto)
async def archive_component(component_id: str, db: DbSession):
    """Archive a component."""
    service = ComponentService(db)
    component = await service.archive_component(component_id)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return component


# ============================================================================
# Usage Tracking Endpoints
# ============================================================================

@router.post("/{component_id}/usage/{measure_id}", status_code=200)
async def add_usage(component_id: str, measure_id: str, db: DbSession):
    """Add a measure reference to component usage."""
    service = ComponentService(db)
    if not await service.add_usage(component_id, measure_id):
        raise HTTPException(status_code=404, detail="Component not found")


@router.delete("/{component_id}/usage/{measure_id}", status_code=204)
async def remove_usage(component_id: str, measure_id: str, db: DbSession):
    """Remove a measure reference from component usage."""
    service = ComponentService(db)
    if not await service.remove_usage(component_id, measure_id):
        raise HTTPException(status_code=404, detail="Component not found")


# ============================================================================
# Matching Endpoints
# ============================================================================

@router.get("/{component_id}/identity", response_model=Dict[str, str])
async def get_component_identity(component_id: str, db: DbSession):
    """Get readable identity string for a component."""
    service = ComponentService(db)
    component = await service.get_component_by_id(component_id)
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    # TODO: Implement component hashing
    return {
        "hash": component_id,
        "readable": f"{component.type}:{component.name}",
    }


@router.get("/compare", response_model=Dict[str, object])
async def compare_components(
    id1: str = Query(...),
    id2: str = Query(...),
    db: DbSession = None,
):
    """Check if two components are identical."""
    service = ComponentService(db)
    comp1 = await service.get_component_by_id(id1)
    comp2 = await service.get_component_by_id(id2)

    if not comp1:
        raise HTTPException(status_code=404, detail=f"Component not found: {id1}")
    if not comp2:
        raise HTTPException(status_code=404, detail=f"Component not found: {id2}")

    # TODO: Implement proper comparison
    identical = comp1.id == comp2.id

    return {
        "identical": identical,
        "hash1": id1,
        "hash2": id2,
    }
