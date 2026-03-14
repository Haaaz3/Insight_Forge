"""
Measure service for CRUD operations.
"""
import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    DataElement,
    LogicalClause,
    Measure,
    MeasureCorrection,
    MeasureValueSet,
    Population,
    ValueSetCode,
)
from app.models.enums import MeasureStatus
from app.schemas.measure import (
    CorrectionDto,
    CreateMeasureRequest,
    DataElementDto,
    GlobalConstraintsDto,
    LogicalClauseDto,
    MeasureDto,
    MeasureSummaryDto,
    MeasureValueSetDto,
    PopulationDto,
    ThresholdDto,
    UpdateMeasureRequest,
    ValueSetCodeDto,
    ValueSetRefDto,
)

logger = logging.getLogger(__name__)


class MeasureService:
    """Service for measure CRUD operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_measures(self) -> List[MeasureSummaryDto]:
        """Get all measures as summaries."""
        result = await self.db.execute(
            select(Measure).options(selectinload(Measure.populations))
        )
        measures = result.scalars().all()
        return [self._to_summary_dto(m) for m in measures]

    async def get_all_measures_full(self) -> List[MeasureDto]:
        """Get all measures with full details (avoids N+1 queries)."""
        result = await self.db.execute(
            select(Measure)
            .options(
                selectinload(Measure.populations).selectinload(Population.root_clause),
                selectinload(Measure.value_sets).selectinload(MeasureValueSet.codes),
                selectinload(Measure.corrections),
            )
        )
        measures = result.scalars().all()
        return [await self._to_dto(m) for m in measures]

    async def get_measures_by_status(self, status: str) -> List[MeasureSummaryDto]:
        """Get measures filtered by status."""
        try:
            measure_status = MeasureStatus(status)
            result = await self.db.execute(
                select(Measure)
                .where(Measure.status == measure_status)
                .options(selectinload(Measure.populations))
            )
            measures = result.scalars().all()
            return [self._to_summary_dto(m) for m in measures]
        except ValueError:
            logger.warning(f"Invalid status filter: {status}")
            return await self.get_all_measures()

    async def search_measures(self, query: str) -> List[MeasureSummaryDto]:
        """Search measures by title, description, or measure ID."""
        result = await self.db.execute(
            select(Measure).options(selectinload(Measure.populations))
        )
        measures = result.scalars().all()
        query_lower = query.lower()
        filtered = [
            m for m in measures
            if (m.title and query_lower in m.title.lower()) or
               (m.description and query_lower in m.description.lower()) or
               (m.measure_id and query_lower in m.measure_id.lower())
        ]
        return [self._to_summary_dto(m) for m in filtered]

    async def get_measure_by_id(self, measure_id: str) -> Optional[MeasureDto]:
        """Get a measure by ID with full tree."""
        result = await self.db.execute(
            select(Measure)
            .where(Measure.id == measure_id)
            .options(
                selectinload(Measure.populations).selectinload(Population.root_clause),
                selectinload(Measure.value_sets).selectinload(MeasureValueSet.codes),
                selectinload(Measure.corrections),
            )
        )
        measure = result.scalar_one_or_none()
        if measure:
            return await self._to_dto(measure)
        return None

    async def get_measure_by_measure_id(self, cms_measure_id: str) -> Optional[MeasureDto]:
        """Get a measure by CMS measure ID."""
        result = await self.db.execute(
            select(Measure)
            .where(Measure.measure_id == cms_measure_id)
            .options(
                selectinload(Measure.populations).selectinload(Population.root_clause),
                selectinload(Measure.value_sets).selectinload(MeasureValueSet.codes),
                selectinload(Measure.corrections),
            )
        )
        measure = result.scalar_one_or_none()
        if measure:
            return await self._to_dto(measure)
        return None

    async def create_measure(self, request: CreateMeasureRequest) -> MeasureDto:
        """Create a new measure."""
        measure = Measure(
            id=str(uuid.uuid4()),
            measure_id=request.measureId,
            title=request.title,
            version=request.version,
            steward=request.steward,
            program=request.program,
            measure_type=request.measureType,
            description=request.description,
            rationale=request.rationale,
            clinical_recommendation=request.clinicalRecommendation,
            period_start=request.periodStart,
            period_end=request.periodEnd,
            status=MeasureStatus(request.status) if request.status else MeasureStatus.IN_PROGRESS,
        )

        if request.globalConstraints:
            measure.age_min = request.globalConstraints.ageMin
            measure.age_max = request.globalConstraints.ageMax
            measure.age_calculation = request.globalConstraints.ageCalculation
            if request.globalConstraints.gender:
                from app.models.enums import Gender
                measure.gender = Gender(request.globalConstraints.gender)

        self.db.add(measure)
        await self.db.commit()

        logger.info(f"Created measure: {measure.title} ({measure.id})")

        # Re-query with eager loading to avoid lazy loading issues
        return await self.get_measure_by_id(measure.id)

    async def update_measure(
        self, measure_id: str, request: UpdateMeasureRequest
    ) -> Optional[MeasureDto]:
        """Update an existing measure."""
        result = await self.db.execute(
            select(Measure).where(Measure.id == measure_id)
        )
        measure = result.scalar_one_or_none()
        if not measure:
            return None

        # Update fields if provided
        if request.measureId is not None:
            measure.measure_id = request.measureId
        if request.title is not None:
            measure.title = request.title
        if request.version is not None:
            measure.version = request.version
        if request.steward is not None:
            measure.steward = request.steward
        if request.program is not None:
            measure.program = request.program
        if request.measureType is not None:
            measure.measure_type = request.measureType
        if request.description is not None:
            measure.description = request.description
        if request.rationale is not None:
            measure.rationale = request.rationale
        if request.clinicalRecommendation is not None:
            measure.clinical_recommendation = request.clinicalRecommendation
        if request.periodStart is not None:
            measure.period_start = request.periodStart
        if request.periodEnd is not None:
            measure.period_end = request.periodEnd
        if request.status is not None:
            measure.status = MeasureStatus(request.status)

        if request.globalConstraints:
            if request.globalConstraints.ageMin is not None:
                measure.age_min = request.globalConstraints.ageMin
            if request.globalConstraints.ageMax is not None:
                measure.age_max = request.globalConstraints.ageMax
            if request.globalConstraints.ageCalculation is not None:
                measure.age_calculation = request.globalConstraints.ageCalculation
            if request.globalConstraints.gender is not None:
                from app.models.enums import Gender
                measure.gender = Gender(request.globalConstraints.gender)

        await self.db.commit()
        await self.db.refresh(measure)

        logger.info(f"Updated measure: {measure.title} ({measure.id})")
        return await self.get_measure_by_id(measure_id)

    async def delete_measure(self, measure_id: str) -> bool:
        """Delete a measure."""
        result = await self.db.execute(
            select(Measure).where(Measure.id == measure_id)
        )
        measure = result.scalar_one_or_none()
        if not measure:
            return False

        await self.db.delete(measure)
        await self.db.commit()
        logger.info(f"Deleted measure: {measure_id}")
        return True

    async def lock_measure(self, measure_id: str, locked_by: str) -> Optional[MeasureDto]:
        """Lock a measure to prevent editing."""
        result = await self.db.execute(
            select(Measure).where(Measure.id == measure_id)
        )
        measure = result.scalar_one_or_none()
        if not measure:
            return None

        measure.locked_at = datetime.utcnow()
        measure.locked_by = locked_by
        await self.db.commit()
        await self.db.refresh(measure)

        logger.info(f"Locked measure: {measure_id} by {locked_by}")
        return await self.get_measure_by_id(measure_id)

    async def unlock_measure(self, measure_id: str) -> Optional[MeasureDto]:
        """Unlock a measure."""
        result = await self.db.execute(
            select(Measure).where(Measure.id == measure_id)
        )
        measure = result.scalar_one_or_none()
        if not measure:
            return None

        measure.locked_at = None
        measure.locked_by = None
        await self.db.commit()
        await self.db.refresh(measure)

        logger.info(f"Unlocked measure: {measure_id}")
        return await self.get_measure_by_id(measure_id)

    def _to_summary_dto(self, measure: Measure) -> MeasureSummaryDto:
        """Convert Measure entity to summary DTO."""
        return MeasureSummaryDto(
            id=measure.id,
            measureId=measure.measure_id,
            title=measure.title,
            program=measure.program.value if measure.program else None,
            status=measure.status.value if measure.status else None,
            populationCount=len(measure.populations) if measure.populations else 0,
            updatedAt=measure.updated_at,
        )

    async def _to_dto(self, measure: Measure) -> MeasureDto:
        """Convert Measure entity to full DTO."""
        # Build global constraints
        global_constraints = None
        if measure.age_min is not None or measure.age_max is not None or measure.gender:
            global_constraints = GlobalConstraintsDto(
                ageMin=measure.age_min,
                ageMax=measure.age_max,
                ageCalculation=measure.age_calculation,
                gender=measure.gender.value if measure.gender else None,
                measurementPeriodType=None,
                measurementPeriodAnchor=None,
            )

        # Build populations with their clause trees
        populations = []
        for pop in measure.populations or []:
            pop_dto = await self._population_to_dto(pop)
            populations.append(pop_dto)

        # Build value sets
        value_sets = []
        for vs in measure.value_sets or []:
            vs_dto = self._value_set_to_dto(vs)
            value_sets.append(vs_dto)

        # Build corrections
        corrections = []
        for corr in measure.corrections or []:
            corr_dto = CorrectionDto(
                id=corr.id,
                correctionType=corr.correction_type.value if corr.correction_type else None,
                description=None,
                author=corr.created_by,
                timestamp=corr.timestamp,
                field=None,
                oldValue=corr.original_value,
                newValue=corr.corrected_value,
            )
            corrections.append(corr_dto)

        return MeasureDto(
            id=measure.id,
            measureId=measure.measure_id,
            title=measure.title,
            version=measure.version,
            steward=measure.steward,
            program=measure.program.value if measure.program else None,
            measureType=measure.measure_type,
            description=measure.description,
            rationale=measure.rationale,
            clinicalRecommendation=measure.clinical_recommendation,
            periodStart=measure.period_start,
            periodEnd=measure.period_end,
            globalConstraints=global_constraints,
            status=measure.status.value if measure.status else None,
            overallConfidence=measure.overall_confidence.value if measure.overall_confidence else None,
            lockedAt=measure.locked_at,
            lockedBy=measure.locked_by,
            populations=populations,
            valueSets=value_sets,
            corrections=corrections,
            generatedCql=measure.generated_cql,
            generatedSql=measure.generated_sql,
            createdAt=measure.created_at,
            createdBy=measure.created_by,
            updatedAt=measure.updated_at,
            updatedBy=measure.updated_by,
        )

    async def _population_to_dto(self, pop: Population) -> PopulationDto:
        """Convert Population entity to DTO."""
        root_clause_dto = None
        if pop.root_clause:
            root_clause_dto = await self._clause_to_dto(pop.root_clause)

        return PopulationDto(
            id=pop.id,
            populationType=pop.population_type.value if pop.population_type else None,
            description=pop.description,
            narrative=pop.narrative,
            rootClause=root_clause_dto,
            displayOrder=pop.display_order or 0,
            confidence=pop.confidence.value if pop.confidence else None,
            reviewStatus=pop.review_status.value if pop.review_status else None,
            reviewNotes=pop.review_notes,
            cqlDefinition=pop.cql_definition,
            cqlDefinitionName=pop.cql_definition_name,
        )

    async def _clause_to_dto(self, clause: LogicalClause) -> LogicalClauseDto:
        """Convert LogicalClause entity to DTO (recursive)."""
        # Load children if not already loaded
        children_dtos = []
        for child in clause.child_clauses or []:
            child_dto = await self._clause_to_dto(child)
            children_dtos.append(child_dto)

        # Convert data elements
        data_element_dtos = []
        for elem in clause.data_elements or []:
            elem_dto = self._data_element_to_dto(elem)
            data_element_dtos.append(elem_dto)

        return LogicalClauseDto(
            id=clause.id,
            operator=clause.operator.value if clause.operator else "AND",
            description=clause.description,
            displayOrder=clause.display_order or 0,
            children=children_dtos,
            dataElements=data_element_dtos,
        )

    def _data_element_to_dto(self, elem: DataElement) -> DataElementDto:
        """Convert DataElement entity to DTO."""
        # Build thresholds
        thresholds = None
        if elem.threshold_age_min is not None or elem.value_min is not None:
            thresholds = ThresholdDto(
                ageMin=elem.threshold_age_min,
                ageMax=elem.threshold_age_max,
                valueMin=elem.value_min,
                valueMax=elem.value_max,
                comparator=elem.value_comparator,
                unit=elem.value_unit,
            )

        # Build value set refs
        value_sets = []
        for vs in elem.value_sets or []:
            vs_ref = ValueSetRefDto(
                id=vs.id,
                oid=vs.oid,
                name=vs.name,
                version=vs.version,
                source=vs.source,
                verified=vs.verified or False,
                codes=[
                    ValueSetCodeDto(
                        id=code.id,
                        code=code.code,
                        system=code.code_system.value if code.code_system else None,
                        display=code.display,
                        version=code.version,
                    )
                    for code in vs.codes or []
                ],
            )
            value_sets.append(vs_ref)

        return DataElementDto(
            id=elem.id,
            elementType=elem.element_type.value if elem.element_type else None,
            resourceType=elem.resource_type,
            description=elem.description,
            libraryComponentId=elem.library_component_id,
            negation=elem.negation or False,
            negationRationale=elem.negation_rationale,
            genderValue=elem.gender_value.value if elem.gender_value else None,
            thresholds=thresholds,
            timingOverride=elem.timing_override,
            timingWindow=elem.timing_window,
            additionalRequirements=elem.additional_requirements,
            confidence=elem.confidence.value if elem.confidence else None,
            reviewStatus=elem.review_status.value if elem.review_status else None,
            displayOrder=elem.display_order or 0,
            valueSets=value_sets,
        )

    def _value_set_to_dto(self, vs: MeasureValueSet) -> MeasureValueSetDto:
        """Convert MeasureValueSet entity to DTO."""
        codes = [
            ValueSetCodeDto(
                id=code.id,
                code=code.code,
                system=code.code_system.value if code.code_system else None,
                display=code.display,
                version=code.version,
            )
            for code in vs.codes or []
        ]

        return MeasureValueSetDto(
            id=vs.id,
            oid=vs.oid,
            url=vs.url,
            name=vs.name,
            version=vs.version,
            publisher=vs.publisher,
            purpose=vs.purpose,
            confidence=vs.confidence.value if vs.confidence else None,
            verified=vs.verified or False,
            source=vs.source,
            codes=codes,
        )
