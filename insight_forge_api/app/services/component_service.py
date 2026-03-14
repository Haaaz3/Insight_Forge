"""
Component library service for CRUD operations.
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.component import AtomicComponent, CompositeComponent, LibraryComponent
from app.models.enums import ApprovalStatus, ComplexityLevel, LogicalOperator, TimingOperator
from app.schemas.component import (
    CodeDto,
    ComplexityDto,
    ComponentDto,
    ComponentReferenceDto,
    ComponentStatsDto,
    ComponentSummaryDto,
    CreateAtomicComponentRequest,
    CreateCompositeComponentRequest,
    MetadataDto,
    TimingDto,
    UpdateComponentRequest,
    UsageDto,
    ValueSetDto,
    VersionHistoryEntryDto,
    VersionInfoDto,
)

logger = logging.getLogger(__name__)


class ComponentService:
    """Service for component library operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_components(
        self,
        category: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        include_archived: bool = False,
    ) -> List[ComponentSummaryDto]:
        """Get all components with optional filtering."""
        query = select(LibraryComponent)

        # Filter by status
        if status:
            try:
                approval_status = ApprovalStatus(status)
                query = query.where(LibraryComponent.version_status == approval_status)
            except ValueError:
                pass

        # Exclude archived unless requested
        if not include_archived:
            query = query.where(
                (LibraryComponent.version_status != ApprovalStatus.ARCHIVED) |
                (LibraryComponent.version_status.is_(None))
            )

        result = await self.db.execute(query)
        components = result.scalars().all()

        # Apply category filter in Python (since it's stored as string)
        if category:
            components = [c for c in components if c.category == category]

        # Apply search filter
        if search:
            search_lower = search.lower()
            components = [
                c for c in components
                if (c.name and search_lower in c.name.lower()) or
                   (c.description and search_lower in c.description.lower())
            ]

        return [self._to_summary_dto(c) for c in components]

    async def get_component_by_id(self, component_id: str) -> Optional[ComponentDto]:
        """Get a component by ID."""
        result = await self.db.execute(
            select(LibraryComponent).where(LibraryComponent.id == component_id)
        )
        component = result.scalar_one_or_none()
        if component:
            return self._to_dto(component)
        return None

    async def get_stats(self) -> ComponentStatsDto:
        """Get library statistics."""
        result = await self.db.execute(select(LibraryComponent))
        components = result.scalars().all()

        by_category: Dict[str, int] = {}
        by_status: Dict[str, int] = {}

        for comp in components:
            # Count by category
            cat = comp.category or "other"
            by_category[cat] = by_category.get(cat, 0) + 1

            # Count by status
            status = comp.version_status.value if comp.version_status else "draft"
            by_status[status] = by_status.get(status, 0) + 1

        return ComponentStatsDto(
            totalComponents=len(components),
            byCategory=by_category,
            byStatus=by_status,
        )

    async def create_atomic_component(
        self, request: CreateAtomicComponentRequest
    ) -> ComponentDto:
        """Create a new atomic component."""
        component = AtomicComponent(
            id=request.id or f"comp-{uuid.uuid4()}",
            component_type="atomic",
            name=request.name,
            description=request.description,
            # Value set
            value_set_oid=request.valueSetOid,
            value_set_name=request.valueSetName,
            value_set_version=request.valueSetVersion,
            value_set_codes=json.dumps([c.model_dump() for c in request.codes]) if request.codes else None,
            additional_value_sets=json.dumps([vs.model_dump() for vs in request.additionalValueSets]) if request.additionalValueSets else None,
            # Timing
            timing_operator=TimingOperator(request.timing.operator) if request.timing and request.timing.operator else None,
            timing_quantity=request.timing.quantity if request.timing else None,
            timing_unit=request.timing.unit if request.timing else None,
            timing_position=request.timing.position if request.timing else None,
            timing_reference=request.timing.reference if request.timing else None,
            timing_display=request.timing.displayExpression if request.timing else None,
            # Other
            negation=request.negation,
            resource_type=request.resourceType,
            gender_value=request.genderValue,
            # Metadata
            category=request.category,
            tags=json.dumps(request.tags) if request.tags else None,
            catalogs=json.dumps(request.catalogs) if request.catalogs else None,
            catalogue_defaults=json.dumps(request.catalogueDefaults) if request.catalogueDefaults else None,
            # Version
            version_status=ApprovalStatus.DRAFT,
            version_id="1.0.0",
        )

        self.db.add(component)
        await self.db.commit()
        await self.db.refresh(component)

        logger.info(f"Created atomic component: {component.name} ({component.id})")
        return self._to_dto(component)

    async def create_composite_component(
        self, request: CreateCompositeComponentRequest
    ) -> ComponentDto:
        """Create a new composite component."""
        component = CompositeComponent(
            id=f"composite-{uuid.uuid4()}",
            component_type="composite",
            name=request.name,
            description=request.description,
            logical_operator=LogicalOperator(request.operator) if request.operator else LogicalOperator.AND,
            children=json.dumps([c.model_dump() for c in request.children]) if request.children else None,
            # Metadata
            category=request.category or "composite",
            tags=json.dumps(request.tags) if request.tags else None,
            catalogs=json.dumps(request.catalogs) if request.catalogs else None,
            catalogue_defaults=json.dumps(request.catalogueDefaults) if request.catalogueDefaults else None,
            # Version
            version_status=ApprovalStatus.DRAFT,
            version_id="1.0.0",
        )

        self.db.add(component)
        await self.db.commit()
        await self.db.refresh(component)

        logger.info(f"Created composite component: {component.name} ({component.id})")
        return self._to_dto(component)

    async def update_component(
        self, component_id: str, request: UpdateComponentRequest
    ) -> Optional[ComponentDto]:
        """Update a component."""
        result = await self.db.execute(
            select(LibraryComponent).where(LibraryComponent.id == component_id)
        )
        component = result.scalar_one_or_none()
        if not component:
            return None

        # Update common fields
        if request.name is not None:
            component.name = request.name
        if request.description is not None:
            component.description = request.description
        if request.category is not None:
            component.category = request.category
        if request.tags is not None:
            component.tags = json.dumps(request.tags)
        if request.catalogs is not None:
            component.catalogs = json.dumps(request.catalogs)
        if request.catalogueDefaults is not None:
            component.catalogue_defaults = json.dumps(request.catalogueDefaults)

        # Update atomic-specific fields
        if isinstance(component, AtomicComponent):
            if request.valueSetOid is not None:
                component.value_set_oid = request.valueSetOid
            if request.valueSetName is not None:
                component.value_set_name = request.valueSetName
            if request.valueSetVersion is not None:
                component.value_set_version = request.valueSetVersion
            if request.codes is not None:
                component.value_set_codes = json.dumps([c.model_dump() for c in request.codes])
            if request.additionalValueSets is not None:
                component.additional_value_sets = json.dumps([vs.model_dump() for vs in request.additionalValueSets])
            if request.timing is not None:
                if request.timing.operator:
                    component.timing_operator = TimingOperator(request.timing.operator)
                component.timing_quantity = request.timing.quantity
                component.timing_unit = request.timing.unit
                component.timing_position = request.timing.position
                component.timing_reference = request.timing.reference
                component.timing_display = request.timing.displayExpression
            if request.negation is not None:
                component.negation = request.negation
            if request.resourceType is not None:
                component.resource_type = request.resourceType
            if request.genderValue is not None:
                component.gender_value = request.genderValue

        # Update composite-specific fields
        if isinstance(component, CompositeComponent):
            if request.operator is not None:
                component.logical_operator = LogicalOperator(request.operator)
            if request.children is not None:
                component.children = json.dumps([c.model_dump() for c in request.children])

        await self.db.commit()
        await self.db.refresh(component)

        logger.info(f"Updated component: {component.name} ({component.id})")
        return self._to_dto(component)

    async def delete_component(self, component_id: str) -> bool:
        """Delete a component."""
        result = await self.db.execute(
            select(LibraryComponent).where(LibraryComponent.id == component_id)
        )
        component = result.scalar_one_or_none()
        if not component:
            return False

        await self.db.delete(component)
        await self.db.commit()
        logger.info(f"Deleted component: {component_id}")
        return True

    async def approve_component(
        self, component_id: str, approved_by: str
    ) -> Optional[ComponentDto]:
        """Approve a component."""
        result = await self.db.execute(
            select(LibraryComponent).where(LibraryComponent.id == component_id)
        )
        component = result.scalar_one_or_none()
        if not component:
            return None

        component.version_status = ApprovalStatus.APPROVED
        component.approved_by = approved_by
        component.approved_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(component)

        logger.info(f"Approved component: {component.name} by {approved_by}")
        return self._to_dto(component)

    async def set_category(
        self, component_id: str, category: str
    ) -> Optional[ComponentDto]:
        """Set component category manually."""
        result = await self.db.execute(
            select(LibraryComponent).where(LibraryComponent.id == component_id)
        )
        component = result.scalar_one_or_none()
        if not component:
            return None

        component.category = category
        component.category_auto_assigned = False

        await self.db.commit()
        await self.db.refresh(component)

        logger.info(f"Set category for component {component_id}: {category}")
        return self._to_dto(component)

    async def archive_component(self, component_id: str) -> Optional[ComponentDto]:
        """Archive a component."""
        result = await self.db.execute(
            select(LibraryComponent).where(LibraryComponent.id == component_id)
        )
        component = result.scalar_one_or_none()
        if not component:
            return None

        component.version_status = ApprovalStatus.ARCHIVED

        await self.db.commit()
        await self.db.refresh(component)

        logger.info(f"Archived component: {component.name}")
        return self._to_dto(component)

    async def add_usage(self, component_id: str, measure_id: str) -> bool:
        """Add a measure reference to component usage."""
        result = await self.db.execute(
            select(LibraryComponent).where(LibraryComponent.id == component_id)
        )
        component = result.scalar_one_or_none()
        if not component:
            return False

        # Parse existing measure IDs
        measure_ids = json.loads(component.measure_ids) if component.measure_ids else []
        if measure_id not in measure_ids:
            measure_ids.append(measure_id)
            component.measure_ids = json.dumps(measure_ids)
            component.usage_count = len(measure_ids)
            component.last_used_at = datetime.utcnow()

            await self.db.commit()

        return True

    async def remove_usage(self, component_id: str, measure_id: str) -> bool:
        """Remove a measure reference from component usage."""
        result = await self.db.execute(
            select(LibraryComponent).where(LibraryComponent.id == component_id)
        )
        component = result.scalar_one_or_none()
        if not component:
            return False

        # Parse existing measure IDs
        measure_ids = json.loads(component.measure_ids) if component.measure_ids else []
        if measure_id in measure_ids:
            measure_ids.remove(measure_id)
            component.measure_ids = json.dumps(measure_ids)
            component.usage_count = len(measure_ids)

            await self.db.commit()

        return True

    def _to_summary_dto(self, component: LibraryComponent) -> ComponentSummaryDto:
        """Convert component to summary DTO."""
        return ComponentSummaryDto(
            id=component.id,
            type=component.component_type,
            name=component.name,
            description=component.description,
            category=component.category,
            status=component.version_status.value if component.version_status else None,
            complexityLevel=component.complexity_level.value if component.complexity_level else None,
            usageCount=component.usage_count or 0,
            updatedAt=component.updated_at,
        )

    def _to_dto(self, component: LibraryComponent) -> ComponentDto:
        """Convert component to full DTO."""
        # Parse JSON fields
        catalogs = json.loads(component.catalogs) if component.catalogs else []
        catalogue_defaults = json.loads(component.catalogue_defaults) if component.catalogue_defaults else None
        tags = json.loads(component.tags) if component.tags else []
        measure_ids = json.loads(component.measure_ids) if component.measure_ids else []

        # Build value set (for atomic)
        value_set = None
        additional_value_sets = []
        timing = None
        children = []

        if component.component_type == "atomic":
            # Value set
            if component.value_set_oid or component.value_set_name:
                codes_data = json.loads(component.value_set_codes) if component.value_set_codes else []
                codes = [CodeDto(**c) for c in codes_data]
                value_set = ValueSetDto(
                    oid=component.value_set_oid,
                    name=component.value_set_name,
                    version=component.value_set_version,
                    codes=codes,
                )

            # Additional value sets
            if component.additional_value_sets:
                avs_data = json.loads(component.additional_value_sets)
                for vs in avs_data:
                    codes = [CodeDto(**c) for c in vs.get("codes", [])]
                    additional_value_sets.append(ValueSetDto(
                        oid=vs.get("oid"),
                        name=vs.get("name"),
                        version=vs.get("version"),
                        codes=codes,
                    ))

            # Timing
            if component.timing_operator or component.timing_quantity:
                timing = TimingDto(
                    operator=component.timing_operator.value if component.timing_operator else None,
                    quantity=component.timing_quantity,
                    unit=component.timing_unit,
                    position=component.timing_position,
                    reference=component.timing_reference,
                    displayExpression=component.timing_display,
                )

        elif component.component_type == "composite":
            # Children
            if component.children:
                children_data = json.loads(component.children)
                children = [ComponentReferenceDto(**c) for c in children_data]

        # Build complexity
        complexity = None
        if component.complexity_level or component.complexity_score:
            complexity = ComplexityDto(
                level=component.complexity_level.value if component.complexity_level else None,
                score=component.complexity_score or 0,
                valueSetCount=0,
                timingCount=0,
                nestedDepth=0,
                explanation=None,
            )

        # Build version info
        version_info = None
        if component.version_id or component.version_status:
            version_history = []
            if component.version_history:
                vh_data = json.loads(component.version_history)
                version_history = [VersionHistoryEntryDto(**v) for v in vh_data]
            version_info = VersionInfoDto(
                versionId=component.version_id,
                status=component.version_status.value if component.version_status else None,
                versionHistory=version_history,
                approvedBy=component.approved_by,
                approvedAt=component.approved_at,
                reviewNotes=component.review_notes,
            )

        # Build usage
        usage = UsageDto(
            usageCount=component.usage_count or 0,
            measureIds=measure_ids,
            lastUsedAt=component.last_used_at,
        )

        # Build metadata
        metadata = MetadataDto(
            category=component.category,
            categoryAutoAssigned=component.category_auto_assigned or False,
            tags=tags,
        )

        return ComponentDto(
            id=component.id,
            type=component.component_type,
            name=component.name,
            description=component.description,
            valueSet=value_set,
            additionalValueSets=additional_value_sets,
            timing=timing,
            negation=component.negation or False,
            resourceType=component.resource_type,
            genderValue=component.gender_value.value if component.gender_value else None,
            operator=component.logical_operator.value if component.logical_operator else None,
            children=children,
            complexity=complexity,
            versionInfo=version_info,
            usage=usage,
            metadata=metadata,
            catalogs=catalogs,
            catalogueDefaults=catalogue_defaults,
            createdAt=component.created_at,
            createdBy=component.created_by,
            updatedAt=component.updated_at,
            updatedBy=component.updated_by,
        )
