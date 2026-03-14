"""
Import service for Zustand export format.
"""
import json
import logging
import uuid
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    DataElement,
    LibraryComponent,
    LogicalClause,
    Measure,
    MeasureValueSet,
    Population,
    ValueSetCode,
)
from app.models.component import AtomicComponent, CompositeComponent
from app.models.enums import (
    ApprovalStatus,
    CodeSystem,
    ConfidenceLevel,
    DataElementType,
    LogicalOperator,
    MeasureProgram,
    MeasureStatus,
    PopulationType,
    TimingOperator,
)
from app.schemas.import_schema import ImportRequest, ImportResultDto

logger = logging.getLogger(__name__)


class ImportService:
    """Service for importing data from Zustand export format."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def import_data(self, request: ImportRequest) -> ImportResultDto:
        """
        Import data from Zustand export format.
        Components must be imported before measures (foreign key dependency).
        """
        try:
            # Import components first
            components_imported = await self._import_components(request.components or [])

            # Then import measures
            measures_imported = await self._import_measures(request.measures or [])

            # Validation traces (if any)
            traces_imported = 0
            # TODO: Import validation traces

            await self.db.commit()

            return ImportResultDto(
                componentsImported=components_imported,
                measuresImported=measures_imported,
                validationTracesImported=traces_imported,
                success=True,
                message=f"Successfully imported {components_imported} components and {measures_imported} measures",
            )

        except Exception as e:
            logger.error(f"Import failed: {e}", exc_info=True)
            await self.db.rollback()
            return ImportResultDto(
                componentsImported=0,
                measuresImported=0,
                validationTracesImported=0,
                success=False,
                message=str(e),
            )

    async def _import_components(self, components: List[Dict[str, Any]]) -> int:
        """Import components from Zustand format."""
        count = 0
        for comp_data in components:
            try:
                comp_id = comp_data.get("id")
                if not comp_id:
                    continue

                # Check if component already exists
                result = await self.db.execute(
                    select(LibraryComponent).where(LibraryComponent.id == comp_id)
                )
                existing = result.scalar_one_or_none()
                if existing:
                    # Update existing component
                    await self._update_component(existing, comp_data)
                else:
                    # Create new component
                    await self._create_component(comp_data)
                count += 1

            except Exception as e:
                logger.warning(f"Failed to import component {comp_data.get('id')}: {e}")

        return count

    async def _create_component(self, data: Dict[str, Any]) -> None:
        """Create a new component from Zustand format."""
        comp_type = data.get("type", "atomic")

        if comp_type == "atomic":
            component = AtomicComponent(
                id=data.get("id"),
                component_type="atomic",
                name=data.get("name", ""),
                description=data.get("description"),
            )
            # Value set
            value_set = data.get("valueSet")
            if value_set:
                component.value_set_oid = value_set.get("oid")
                component.value_set_name = value_set.get("name")
                component.value_set_version = value_set.get("version")
                component.value_set_codes = json.dumps(value_set.get("codes", []))

            # Additional value sets
            if data.get("additionalValueSets"):
                component.additional_value_sets = json.dumps(data["additionalValueSets"])

            # Timing
            timing = data.get("timing")
            if timing:
                if timing.get("operator"):
                    try:
                        component.timing_operator = TimingOperator(timing["operator"])
                    except ValueError:
                        pass
                component.timing_quantity = timing.get("quantity")
                component.timing_unit = timing.get("unit")
                component.timing_position = timing.get("position")
                component.timing_reference = timing.get("reference")
                component.timing_display = timing.get("displayExpression")

            component.negation = data.get("negation", False)
            component.resource_type = data.get("resourceType")
            component.gender_value = data.get("genderValue")

        else:
            component = CompositeComponent(
                id=data.get("id"),
                component_type="composite",
                name=data.get("name", ""),
                description=data.get("description"),
            )
            if data.get("operator"):
                try:
                    component.logical_operator = LogicalOperator(data["operator"])
                except ValueError:
                    component.logical_operator = LogicalOperator.AND

            if data.get("children"):
                component.children = json.dumps(data["children"])

        # Common fields
        metadata = data.get("metadata", {})
        component.category = metadata.get("category")
        component.category_auto_assigned = metadata.get("categoryAutoAssigned", False)
        component.tags = json.dumps(metadata.get("tags", []))

        component.catalogs = json.dumps(data.get("catalogs", []))
        component.catalogue_defaults = json.dumps(data.get("catalogueDefaults")) if data.get("catalogueDefaults") else None

        # Version info
        version_info = data.get("versionInfo", {})
        component.version_id = version_info.get("versionId", "1.0.0")
        if version_info.get("status"):
            try:
                component.version_status = ApprovalStatus(version_info["status"])
            except ValueError:
                component.version_status = ApprovalStatus.DRAFT
        component.version_history = json.dumps(version_info.get("versionHistory", []))

        # Usage
        usage = data.get("usage", {})
        component.usage_count = usage.get("usageCount", 0)
        component.measure_ids = json.dumps(usage.get("measureIds", []))

        # Complexity
        complexity = data.get("complexity", {})
        if complexity.get("level"):
            try:
                component.complexity_level = ComplexityLevel(complexity["level"])
            except ValueError:
                pass
        component.complexity_score = complexity.get("score")
        component.complexity_factors = json.dumps(complexity) if complexity else None

        self.db.add(component)

    async def _update_component(self, component: LibraryComponent, data: Dict[str, Any]) -> None:
        """Update an existing component from Zustand format."""
        component.name = data.get("name", component.name)
        component.description = data.get("description", component.description)

        if isinstance(component, AtomicComponent):
            value_set = data.get("valueSet")
            if value_set:
                component.value_set_oid = value_set.get("oid")
                component.value_set_name = value_set.get("name")
                component.value_set_version = value_set.get("version")
                component.value_set_codes = json.dumps(value_set.get("codes", []))

        # Update other fields as needed

    async def _import_measures(self, measures: List[Dict[str, Any]]) -> int:
        """Import measures from Zustand format."""
        count = 0
        for measure_data in measures:
            try:
                measure_id = measure_data.get("id")
                if not measure_id:
                    continue

                # Check if measure already exists
                result = await self.db.execute(
                    select(Measure).where(Measure.id == measure_id)
                )
                existing = result.scalar_one_or_none()
                if existing:
                    # Update existing measure
                    await self._update_measure(existing, measure_data)
                else:
                    # Create new measure
                    await self._create_measure(measure_data)
                count += 1

            except Exception as e:
                logger.warning(f"Failed to import measure {measure_data.get('id')}: {e}")

        return count

    async def _create_measure(self, data: Dict[str, Any]) -> None:
        """Create a new measure from Zustand format."""
        measure = Measure(
            id=data.get("id"),
            measure_id=data.get("measureId"),
            title=data.get("title"),
            version=data.get("version"),
            steward=data.get("steward"),
            measure_type=data.get("measureType"),
            description=data.get("description"),
            rationale=data.get("rationale"),
            clinical_recommendation=data.get("clinicalRecommendation"),
            period_start=data.get("periodStart"),
            period_end=data.get("periodEnd"),
            generated_cql=data.get("generatedCql"),
            generated_sql=data.get("generatedSql"),
        )

        # Program
        if data.get("program"):
            try:
                measure.program = MeasureProgram(data["program"])
            except ValueError:
                pass

        # Status
        if data.get("status"):
            try:
                measure.status = MeasureStatus(data["status"])
            except ValueError:
                measure.status = MeasureStatus.IN_PROGRESS

        # Global constraints
        gc = data.get("globalConstraints", {})
        if gc:
            measure.age_min = gc.get("ageMin")
            measure.age_max = gc.get("ageMax")
            measure.age_calculation = gc.get("ageCalculation")

        self.db.add(measure)
        await self.db.flush()  # Get ID for relationships

        # Import populations
        for pop_data in data.get("populations", []):
            await self._create_population(measure, pop_data)

        # Import value sets
        for vs_data in data.get("valueSets", []):
            await self._create_value_set(measure, vs_data)

    async def _update_measure(self, measure: Measure, data: Dict[str, Any]) -> None:
        """Update an existing measure from Zustand format."""
        measure.title = data.get("title", measure.title)
        measure.description = data.get("description", measure.description)
        # Update other fields as needed

    async def _create_population(self, measure: Measure, data: Dict[str, Any]) -> None:
        """Create a population from Zustand format."""
        population = Population(
            id=data.get("id", str(uuid.uuid4())),
            measure_id=measure.id,
            description=data.get("description"),
            narrative=data.get("narrative"),
            display_order=data.get("displayOrder", 0),
            cql_definition=data.get("cqlDefinition"),
            cql_definition_name=data.get("cqlDefinitionName"),
        )

        # Population type
        if data.get("populationType"):
            try:
                population.population_type = PopulationType(data["populationType"])
            except ValueError:
                population.population_type = PopulationType.INITIAL_POPULATION

        self.db.add(population)
        await self.db.flush()

        # Import root clause
        if data.get("rootClause"):
            root_clause = await self._create_clause(data["rootClause"], None)
            population.root_clause_id = root_clause.id

    async def _create_clause(
        self, data: Dict[str, Any], parent_id: Optional[str]
    ) -> LogicalClause:
        """Create a logical clause from Zustand format (recursive)."""
        clause = LogicalClause(
            id=data.get("id", str(uuid.uuid4())),
            parent_clause_id=parent_id,
            description=data.get("description"),
            display_order=data.get("displayOrder", 0),
        )

        # Operator
        if data.get("operator"):
            try:
                clause.operator = LogicalOperator(data["operator"])
            except ValueError:
                clause.operator = LogicalOperator.AND
        else:
            clause.operator = LogicalOperator.AND

        self.db.add(clause)
        await self.db.flush()

        # Import child clauses
        for child_data in data.get("children", []):
            await self._create_clause(child_data, clause.id)

        # Import data elements
        for elem_data in data.get("dataElements", []):
            await self._create_data_element(clause, elem_data)

        return clause

    async def _create_data_element(
        self, clause: LogicalClause, data: Dict[str, Any]
    ) -> None:
        """Create a data element from Zustand format."""
        element = DataElement(
            id=data.get("id", str(uuid.uuid4())),
            clause_id=clause.id,
            resource_type=data.get("resourceType"),
            description=data.get("description"),
            negation=data.get("negation", False),
            negation_rationale=data.get("negationRationale"),
            timing_override=json.dumps(data.get("timingOverride")) if data.get("timingOverride") else None,
            timing_window=json.dumps(data.get("timingWindow")) if data.get("timingWindow") else None,
            additional_requirements=json.dumps(data.get("additionalRequirements")) if data.get("additionalRequirements") else None,
            display_order=data.get("displayOrder", 0),
            library_component_id=data.get("libraryComponentId"),
        )

        # Element type
        if data.get("elementType"):
            try:
                element.element_type = DataElementType(data["elementType"])
            except ValueError:
                element.element_type = DataElementType.OBSERVATION

        # Thresholds
        thresholds = data.get("thresholds", {})
        if thresholds:
            element.threshold_age_min = thresholds.get("ageMin")
            element.threshold_age_max = thresholds.get("ageMax")
            element.value_min = thresholds.get("valueMin")
            element.value_max = thresholds.get("valueMax")
            element.value_comparator = thresholds.get("comparator")
            element.value_unit = thresholds.get("unit")

        self.db.add(element)

    async def _create_value_set(self, measure: Measure, data: Dict[str, Any]) -> None:
        """Create a value set from Zustand format."""
        value_set = MeasureValueSet(
            id=data.get("id", str(uuid.uuid4())),
            measure_id=measure.id,
            oid=data.get("oid"),
            url=data.get("url"),
            name=data.get("name", ""),
            version=data.get("version"),
            publisher=data.get("publisher"),
            purpose=data.get("purpose"),
            verified=data.get("verified", False),
            source=data.get("source"),
        )

        self.db.add(value_set)
        await self.db.flush()

        # Import codes
        for code_data in data.get("codes", []):
            code = ValueSetCode(
                id=code_data.get("id", str(uuid.uuid4())),
                value_set_id=value_set.id,
                code=code_data.get("code", ""),
                display=code_data.get("display"),
                version=code_data.get("version"),
                system_uri=code_data.get("systemUri"),
            )

            # Code system
            if code_data.get("system"):
                try:
                    code.code_system = CodeSystem(code_data["system"])
                except ValueError:
                    code.code_system = CodeSystem.SNOMED

            self.db.add(code)

    async def export_data(self) -> Dict[str, Any]:
        """Export all data to Zustand format."""
        # Get all measures
        result = await self.db.execute(select(Measure))
        measures = result.scalars().all()

        # Get all components
        result = await self.db.execute(select(LibraryComponent))
        components = result.scalars().all()

        return {
            "measures": [self._measure_to_export(m) for m in measures],
            "components": [self._component_to_export(c) for c in components],
            "validationTraces": [],
            "codeStates": {},
            "version": 1,
        }

    def _measure_to_export(self, measure: Measure) -> Dict[str, Any]:
        """Convert measure to export format."""
        return {
            "id": measure.id,
            "measureId": measure.measure_id,
            "title": measure.title,
            "version": measure.version,
            "steward": measure.steward,
            "program": measure.program.value if measure.program else None,
            "measureType": measure.measure_type,
            "description": measure.description,
            "status": measure.status.value if measure.status else None,
        }

    def _component_to_export(self, component: LibraryComponent) -> Dict[str, Any]:
        """Convert component to export format."""
        return {
            "id": component.id,
            "type": component.component_type,
            "name": component.name,
            "description": component.description,
        }
