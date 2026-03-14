"""
HDI SQL Generator Service.

Converts Universal Measure Specifications (UMS) into production-ready SQL
queries following the HDI (HealtheIntent) platform patterns.

Output SQL structure:
- CTE-based (ONT, DEMOG, PRED_*)
- Ontology joins for terminology resolution
- Predicate-based patient filtering
- INTERSECT/UNION/EXCEPT for population logic

Ported from: backend/src/main/java/com/algoaccel/service/hdi/HdiSqlGeneratorService.java
"""
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Set

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import DataElementType, LogicalOperator, PopulationType
from app.models.measure import (
    DataElement,
    LogicalClause,
    Measure,
    MeasureValueSet,
    Population,
)

logger = logging.getLogger(__name__)


@dataclass
class HdiSqlConfig:
    """Configuration for HDI SQL generation."""
    population_id: str
    ontology_contexts: List[str] = field(default_factory=lambda: ["HEALTHE INTENT Demographics"])
    exclude_snapshots_and_archives: bool = True
    include_comments: bool = True
    intake_period_start: Optional[str] = None
    intake_period_end: Optional[str] = None
    measurement_period_start: Optional[str] = None
    measurement_period_end: Optional[str] = None

    @classmethod
    def default_config(cls, population_id: str) -> "HdiSqlConfig":
        return cls(population_id=population_id)


@dataclass
class PredicateInfo:
    """Information about a predicate CTE."""
    type: str
    alias: str
    description: str
    value_set_oid: Optional[str] = None
    age_min: Optional[int] = None
    age_max: Optional[int] = None
    gender_include: Optional[List[str]] = None
    lookback_days: Optional[int] = None
    lookback_years: Optional[int] = None


@dataclass
class PredicateGroup:
    """Group of predicates with an operator."""
    operator: str  # UNION or INTERSECT
    children: List[str] = field(default_factory=list)


@dataclass
class SqlMetadata:
    """Metadata about generated SQL."""
    predicate_count: int
    data_models_used: List[str]
    estimated_complexity: str
    generated_at: str


@dataclass
class SqlGenerationResult:
    """Result of SQL generation."""
    success: bool
    sql: str
    errors: Optional[List[str]]
    warnings: Optional[List[str]]
    metadata: SqlMetadata


class HdiSqlGeneratorService:
    """Service for generating HDI SQL from measure specifications."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_hdi_sql(
        self, measure_id: str, population_id: Optional[str] = None
    ) -> SqlGenerationResult:
        """Generate HDI SQL from a measure by ID."""
        # Load measure with full relationship tree
        result = await self.db.execute(
            select(Measure)
            .where(Measure.id == measure_id)
            .options(
                selectinload(Measure.populations).selectinload(Population.root_clause)
                .selectinload(LogicalClause.child_clauses),
                selectinload(Measure.populations).selectinload(Population.root_clause)
                .selectinload(LogicalClause.data_elements).selectinload(DataElement.value_sets),
                selectinload(Measure.value_sets),
            )
        )
        measure = result.scalar_one_or_none()

        if not measure:
            return SqlGenerationResult(
                success=False,
                sql="",
                errors=[f"Measure not found: {measure_id}"],
                warnings=None,
                metadata=SqlMetadata(0, [], "low", datetime.utcnow().isoformat()),
            )

        return self._generate_hdi_sql_from_measure(measure, population_id)

    def _generate_hdi_sql_from_measure(
        self, measure: Measure, population_id: Optional[str] = None
    ) -> SqlGenerationResult:
        """Generate HDI SQL from a measure entity."""
        errors: List[str] = []
        warnings: List[str] = []

        try:
            config = HdiSqlConfig.default_config(population_id or "${POPULATION_ID}")

            # Extract predicates from UMS
            predicates, populations = self._extract_predicates_from_measure(measure)

            if not predicates:
                warnings.append("No clinical criteria found - generating demographics-only query")

            # Generate CTE for each predicate
            predicate_ctes: List[str] = []
            for pred in predicates:
                try:
                    predicate_ctes.append(self._generate_predicate_cte(pred, config))
                except Exception as e:
                    errors.append(f"Failed to generate CTE for predicate {pred.alias}: {e}")
                    predicate_ctes.append(f"-- ERROR: Failed to generate {pred.alias}")

            # Auto-configure ontology contexts
            data_models_used: Set[str] = {pred.type for pred in predicates}
            auto_contexts = self._derive_ontology_contexts(data_models_used)
            config.ontology_contexts = auto_contexts

            # Generate population combination logic
            population_sql = self._generate_population_logic(populations)

            # Assemble full SQL
            sql = self._generate_full_sql(predicate_ctes, population_sql, config)

            return SqlGenerationResult(
                success=len(errors) == 0,
                sql=sql,
                errors=errors if errors else None,
                warnings=warnings if warnings else None,
                metadata=SqlMetadata(
                    predicate_count=len(predicates),
                    data_models_used=list(data_models_used),
                    estimated_complexity=self._estimate_complexity(predicates),
                    generated_at=datetime.utcnow().isoformat(),
                ),
            )

        except Exception as e:
            logger.error(f"SQL generation failed: {e}", exc_info=True)
            errors.append(f"SQL generation failed: {e}")
            return SqlGenerationResult(
                success=False,
                sql="",
                errors=errors,
                warnings=warnings if warnings else None,
                metadata=SqlMetadata(0, [], "low", datetime.utcnow().isoformat()),
            )

    def _extract_predicates_from_measure(
        self, measure: Measure
    ) -> tuple[List[PredicateInfo], Dict[PopulationType, PredicateGroup]]:
        """Extract predicates and population structure from measure."""
        predicates: List[PredicateInfo] = []
        populations: Dict[PopulationType, PredicateGroup] = {}
        predicate_counter = [0]  # Use list for mutability in nested function

        # Extract global demographic constraints
        if measure.age_min is not None or measure.age_max is not None or measure.gender is not None:
            predicate_counter[0] += 1
            gender_include = None
            if measure.gender:
                gender_include = self._map_gender_to_fhir_concepts(measure.gender.value)

            predicates.append(PredicateInfo(
                type="demographics",
                alias=f"PRED_DEMOG_{predicate_counter[0]}",
                description="Global demographic constraints",
                age_min=measure.age_min,
                age_max=measure.age_max,
                gender_include=gender_include,
            ))

        # Process each population
        if not measure.populations:
            return predicates, populations

        for population in measure.populations:
            pop_predicate_aliases: List[str] = []

            if population.root_clause:
                extracted_predicates, extracted_aliases = self._extract_from_logical_clause(
                    population.root_clause, predicate_counter
                )
                predicates.extend(extracted_predicates)
                pop_predicate_aliases.extend(extracted_aliases)

            # Determine operator
            operator = "UNION"
            if population.root_clause and population.root_clause.operator == LogicalOperator.AND:
                operator = "INTERSECT"

            populations[population.population_type] = PredicateGroup(
                operator=operator,
                children=pop_predicate_aliases,
            )

        return predicates, populations

    def _extract_from_logical_clause(
        self, clause: LogicalClause, counter: List[int]
    ) -> tuple[List[PredicateInfo], List[str]]:
        """Extract predicates from a logical clause recursively."""
        predicates: List[PredicateInfo] = []
        aliases: List[str] = []

        if not clause:
            return predicates, aliases

        # Process child clauses (nested)
        if clause.child_clauses:
            for child_clause in clause.child_clauses:
                nested_predicates, nested_aliases = self._extract_from_logical_clause(child_clause, counter)
                predicates.extend(nested_predicates)
                aliases.extend(nested_aliases)

        # Process data elements (leaf nodes)
        if clause.data_elements:
            for element in clause.data_elements:
                pred = self._data_element_to_predicate(element, counter)
                if pred:
                    predicates.append(pred)
                    aliases.append(pred.alias)

        return predicates, aliases

    def _data_element_to_predicate(
        self, element: DataElement, counter: List[int]
    ) -> Optional[PredicateInfo]:
        """Convert a data element to a predicate."""
        if not element or not element.element_type:
            return None

        # Find value set
        value_set_oid: Optional[str] = None
        value_set_name: Optional[str] = None
        if element.value_sets:
            for vs in element.value_sets:
                value_set_oid = vs.oid
                value_set_name = vs.name
                break

        description = element.description or value_set_name or "Clinical criterion"
        counter[0] += 1

        element_type = element.element_type

        if element_type == DataElementType.DIAGNOSIS:
            return PredicateInfo(
                type="condition",
                alias=f"PRED_COND_{counter[0]}",
                description=description,
                value_set_oid=value_set_oid,
            )

        if element_type == DataElementType.PROCEDURE:
            return PredicateInfo(
                type="procedure",
                alias=f"PRED_PROC_{counter[0]}",
                description=description,
                value_set_oid=value_set_oid,
            )

        if element_type == DataElementType.MEDICATION:
            return PredicateInfo(
                type="medication",
                alias=f"PRED_MED_{counter[0]}",
                description=description,
                value_set_oid=value_set_oid,
            )

        if element_type in (DataElementType.OBSERVATION, DataElementType.ASSESSMENT):
            return PredicateInfo(
                type="result",
                alias=f"PRED_RESULT_{counter[0]}",
                description=description,
                value_set_oid=value_set_oid,
            )

        if element_type == DataElementType.IMMUNIZATION:
            return PredicateInfo(
                type="immunization",
                alias=f"PRED_IMMUN_{counter[0]}",
                description=description,
                value_set_oid=value_set_oid,
            )

        if element_type == DataElementType.ENCOUNTER:
            return PredicateInfo(
                type="encounter",
                alias=f"PRED_ENC_{counter[0]}",
                description=description,
                value_set_oid=value_set_oid,
            )

        if element_type == DataElementType.DEMOGRAPHIC:
            gender_include = None
            if element.gender_value:
                gender_include = self._map_gender_to_fhir_concepts(element.gender_value.value)

            return PredicateInfo(
                type="demographics",
                alias=f"PRED_DEMOG_{counter[0]}",
                description=description,
                age_min=element.threshold_age_min,
                age_max=element.threshold_age_max,
                gender_include=gender_include,
            )

        return None

    def _generate_predicate_cte(self, pred: PredicateInfo, config: HdiSqlConfig) -> str:
        """Generate CTE for a predicate."""
        if pred.type == "demographics":
            return self._generate_demographics_predicate_cte(pred, config)
        if pred.type == "condition":
            return self._generate_condition_predicate_cte(pred, config)
        if pred.type == "result":
            return self._generate_result_predicate_cte(pred, config)
        if pred.type == "procedure":
            return self._generate_procedure_predicate_cte(pred, config)
        if pred.type == "medication":
            return self._generate_medication_predicate_cte(pred, config)
        if pred.type == "immunization":
            return self._generate_immunization_predicate_cte(pred, config)
        if pred.type == "encounter":
            return self._generate_encounter_predicate_cte(pred, config)

        return f"-- WARNING: Unknown predicate type: {pred.type}\n{pred.alias} as (\n  select distinct empi_id from DEMOG -- Placeholder\n)"

    def _generate_demographics_predicate_cte(self, pred: PredicateInfo, config: HdiSqlConfig) -> str:
        """Generate demographics predicate CTE."""
        conditions: List[str] = []

        if pred.age_min is not None:
            conditions.append(f"age_in_years >= {pred.age_min}")
        if pred.age_max is not None:
            conditions.append(f"age_in_years <= {pred.age_max}")

        if pred.gender_include:
            genders = ", ".join(f"'{g}'" for g in pred.gender_include)
            conditions.append(f"gender_concept_name in ({genders})")

        where_clause = "\n    and ".join(conditions) if conditions else "1=1"
        description = f"-- {pred.description}\n" if pred.description else ""

        return f"""{description}{pred.alias} as (
  select distinct
    population_id
    , empi_id
    , 'Demographics' as data_model
    , null as identifier
    , null as clinical_start_date
    , null as clinical_end_date
    , '{self._escape_sql(pred.description)}' as description
  from DEMOG
  where
    {where_clause}
)"""

    def _generate_condition_predicate_cte(self, pred: PredicateInfo, config: HdiSqlConfig) -> str:
        """Generate condition predicate CTE."""
        conditions = [f"C.population_id = '{config.population_id}'"]

        if pred.value_set_oid:
            conditions.append(f"""exists (
      select 1 from valueset_codes VS
      where VS.valueset_oid = '{pred.value_set_oid}'
        and VS.code = C.condition_code
    )""")

        if pred.lookback_years is not None:
            conditions.append(f"C.effective_date >= DATEADD(YEAR, -{pred.lookback_years}, GETDATE())")
        if pred.lookback_days is not None:
            conditions.append(f"C.effective_date >= DATEADD(DAY, -{pred.lookback_days}, GETDATE())")

        where_clause = "\n    and ".join(conditions)
        description = f"-- {pred.description}\n" if pred.description else ""

        return f"""{description}{pred.alias} as (
  select distinct
    C.population_id
    , C.empi_id
    , 'Condition' as data_model
    , C.condition_id as identifier
    , C.effective_date as clinical_start_date
    , null as clinical_end_date
    , '{self._escape_sql(pred.description)}' as description
  from ph_f_condition C
  where
    {where_clause}
)"""

    def _generate_result_predicate_cte(self, pred: PredicateInfo, config: HdiSqlConfig) -> str:
        """Generate result predicate CTE."""
        conditions = [f"R.population_id = '{config.population_id}'"]

        if pred.value_set_oid:
            conditions.append(f"""exists (
      select 1 from valueset_codes VS
      where VS.valueset_oid = '{pred.value_set_oid}'
        and VS.code = R.result_code
    )""")

        if pred.lookback_years is not None:
            conditions.append(f"R.service_date >= DATEADD(YEAR, -{pred.lookback_years}, GETDATE())")
        if pred.lookback_days is not None:
            conditions.append(f"R.service_date >= DATEADD(DAY, -{pred.lookback_days}, GETDATE())")

        where_clause = "\n    and ".join(conditions)
        description = f"-- {pred.description}\n" if pred.description else ""

        return f"""{description}{pred.alias} as (
  select distinct
    R.population_id
    , R.empi_id
    , 'Result' as data_model
    , R.result_id as identifier
    , R.service_date as clinical_start_date
    , null as clinical_end_date
    , '{self._escape_sql(pred.description)}' as description
  from ph_f_result R
  where
    {where_clause}
)"""

    def _generate_procedure_predicate_cte(self, pred: PredicateInfo, config: HdiSqlConfig) -> str:
        """Generate procedure predicate CTE."""
        conditions = [f"PR.population_id = '{config.population_id}'"]

        if pred.value_set_oid:
            conditions.append(f"""exists (
      select 1 from valueset_codes VS
      where VS.valueset_oid = '{pred.value_set_oid}'
        and VS.code = PR.procedure_code
    )""")

        if pred.lookback_years is not None:
            conditions.append(f"PR.performed_date >= DATEADD(YEAR, -{pred.lookback_years}, GETDATE())")
        if pred.lookback_days is not None:
            conditions.append(f"PR.performed_date >= DATEADD(DAY, -{pred.lookback_days}, GETDATE())")

        where_clause = "\n    and ".join(conditions)
        description = f"-- {pred.description}\n" if pred.description else ""

        return f"""{description}{pred.alias} as (
  select distinct
    PR.population_id
    , PR.empi_id
    , 'Procedure' as data_model
    , PR.procedure_id as identifier
    , PR.performed_date as clinical_start_date
    , null as clinical_end_date
    , '{self._escape_sql(pred.description)}' as description
  from ph_f_procedure PR
  where
    {where_clause}
)"""

    def _generate_medication_predicate_cte(self, pred: PredicateInfo, config: HdiSqlConfig) -> str:
        """Generate medication predicate CTE."""
        conditions = [f"M.population_id = '{config.population_id}'"]

        if pred.value_set_oid:
            conditions.append(f"""exists (
      select 1 from valueset_codes VS
      where VS.valueset_oid = '{pred.value_set_oid}'
        and VS.code = M.medication_code
    )""")

        if pred.lookback_days is not None:
            conditions.append(f"M.effective_date >= DATEADD(DAY, -{pred.lookback_days}, GETDATE())")

        where_clause = "\n    and ".join(conditions)
        description = f"-- {pred.description}\n" if pred.description else ""

        return f"""{description}{pred.alias} as (
  select distinct
    M.population_id
    , M.empi_id
    , 'Medication' as data_model
    , M.medication_id as identifier
    , M.effective_date as clinical_start_date
    , M.end_date as clinical_end_date
    , '{self._escape_sql(pred.description)}' as description
  from ph_f_medication M
  where
    {where_clause}
)"""

    def _generate_immunization_predicate_cte(self, pred: PredicateInfo, config: HdiSqlConfig) -> str:
        """Generate immunization predicate CTE."""
        conditions = [f"I.population_id = '{config.population_id}'"]

        if pred.value_set_oid:
            conditions.append(f"""exists (
      select 1 from valueset_codes VS
      where VS.valueset_oid = '{pred.value_set_oid}'
        and VS.code = I.immunization_code
    )""")

        if pred.lookback_years is not None:
            conditions.append(f"I.administration_date >= DATEADD(YEAR, -{pred.lookback_years}, GETDATE())")
        if pred.lookback_days is not None:
            conditions.append(f"I.administration_date >= DATEADD(DAY, -{pred.lookback_days}, GETDATE())")

        where_clause = "\n    and ".join(conditions)
        description = f"-- {pred.description}\n" if pred.description else ""

        return f"""{description}{pred.alias} as (
  select distinct
    I.population_id
    , I.empi_id
    , 'Immunization' as data_model
    , I.immunization_id as identifier
    , I.administration_date as clinical_start_date
    , null as clinical_end_date
    , '{self._escape_sql(pred.description)}' as description
  from ph_f_immunization I
  where
    {where_clause}
)"""

    def _generate_encounter_predicate_cte(self, pred: PredicateInfo, config: HdiSqlConfig) -> str:
        """Generate encounter predicate CTE."""
        conditions = [f"E.population_id = '{config.population_id}'"]

        if pred.value_set_oid:
            conditions.append(f"""exists (
      select 1 from valueset_codes VS
      where VS.valueset_oid = '{pred.value_set_oid}'
        and VS.code = E.encounter_type_code
    )""")

        if pred.lookback_days is not None:
            conditions.append(f"E.service_date >= DATEADD(DAY, -{pred.lookback_days}, GETDATE())")

        where_clause = "\n    and ".join(conditions)
        description = f"-- {pred.description}\n" if pred.description else ""

        return f"""{description}{pred.alias} as (
  select distinct
    E.population_id
    , E.empi_id
    , 'Encounter' as data_model
    , E.encounter_id as identifier
    , E.service_date as clinical_start_date
    , E.discharge_date as clinical_end_date
    , '{self._escape_sql(pred.description)}' as description
  from ph_f_encounter E
  where
    {where_clause}
)"""

    def _generate_population_logic(self, populations: Dict[PopulationType, PredicateGroup]) -> str:
        """Generate population combination logic."""
        sections: List[str] = []

        # Initial Population
        ip = populations.get(PopulationType.INITIAL_POPULATION)
        if ip:
            sections.append(self._generate_population_section(
                "INITIAL_POPULATION", ip,
                "Initial Population: Patients meeting all baseline criteria", False
            ))

        has_ip = ip is not None

        # Denominator
        denom = populations.get(PopulationType.DENOMINATOR)
        if denom and denom.children:
            sections.append(self._generate_population_section(
                "DENOMINATOR", denom,
                "Denominator: Patients eligible for the measure", has_ip
            ))
        elif has_ip:
            sections.append("""-- Denominator: Equals Initial Population
DENOMINATOR as (
  select empi_id from INITIAL_POPULATION
)""")

        # Denominator Exclusions
        denom_excl = populations.get(PopulationType.DENOMINATOR_EXCLUSION)
        if denom_excl and denom_excl.children:
            sections.append(self._generate_population_section(
                "DENOM_EXCLUSION", denom_excl,
                "Denominator Exclusions: Patients to exclude from calculation", False
            ))

        # Denominator Exceptions
        denom_excep = populations.get(PopulationType.DENOMINATOR_EXCEPTION)
        if denom_excep and denom_excep.children:
            sections.append(self._generate_population_section(
                "DENOM_EXCEPTION", denom_excep,
                "Denominator Exceptions: Patients with valid exceptions", False
            ))

        # Numerator
        num = populations.get(PopulationType.NUMERATOR)
        if num and num.children:
            sections.append(self._generate_population_section(
                "NUMERATOR", num,
                "Numerator: Patients meeting the measure criteria", False
            ))

        # Numerator Exclusions
        num_excl = populations.get(PopulationType.NUMERATOR_EXCLUSION)
        if num_excl and num_excl.children:
            sections.append(self._generate_population_section(
                "NUM_EXCLUSION", num_excl,
                "Numerator Exclusions: Patients excluded from numerator", False
            ))

        # Final calculation
        sections.append(self._generate_final_calculation(populations))

        return ",\n--\n".join(sections)

    def _generate_population_section(
        self, alias: str, group: PredicateGroup, comment: str, has_ip: bool
    ) -> str:
        """Generate a population section."""
        if not group.children:
            fallback_source = "INITIAL_POPULATION" if alias == "DENOMINATOR" and has_ip else "DEMOG"
            return f"""-- {comment}
{alias} as (
  select distinct empi_id from {fallback_source}
)"""

        set_op = "union" if group.operator == "UNION" else "intersect"
        selects = [f"  select empi_id from {child_alias}" for child_alias in group.children]

        if len(selects) == 1:
            return f"""-- {comment}
{alias} as (
{selects[0]}
)"""

        joined = f"\n  {set_op}\n".join(selects)
        return f"""-- {comment}
{alias} as (
{joined}
)"""

    def _generate_final_calculation(self, populations: Dict[PopulationType, PredicateGroup]) -> str:
        """Generate final measure calculation."""
        has_exclusions = PopulationType.DENOMINATOR_EXCLUSION in populations and populations[PopulationType.DENOMINATOR_EXCLUSION].children
        has_exceptions = PopulationType.DENOMINATOR_EXCEPTION in populations and populations[PopulationType.DENOMINATOR_EXCEPTION].children
        has_numerator = PopulationType.NUMERATOR in populations and populations[PopulationType.NUMERATOR].children

        sql = """-- Final Measure Calculation
MEASURE_RESULT as (
  select
    'Initial Population' as population_type
    , count(distinct empi_id) as patient_count
  from INITIAL_POPULATION
  union all
  select
    'Denominator' as population_type
    , count(distinct empi_id) as patient_count
  from DENOMINATOR"""

        if has_exclusions:
            sql += """
  union all
  select
    'Denominator Exclusion' as population_type
    , count(distinct empi_id) as patient_count
  from DENOM_EXCLUSION"""

        if has_exceptions:
            sql += """
  union all
  select
    'Denominator Exception' as population_type
    , count(distinct empi_id) as patient_count
  from DENOM_EXCEPTION"""

        if has_numerator:
            sql += """
  union all
  select
    'Numerator' as population_type
    , count(distinct empi_id) as patient_count
  from NUMERATOR"""

        sql += """
)
select * from MEASURE_RESULT"""

        return sql

    def _generate_full_sql(
        self, predicate_ctes: List[str], combination: str, config: HdiSqlConfig
    ) -> str:
        """Assemble the full SQL query."""
        header = ""
        if config.include_comments:
            header = f"""-- ============================================================================
-- Generated SQL for HDI Platform
-- Population ID: {config.population_id}
-- Dialect: synapse
-- Generated: {datetime.utcnow().isoformat()}
-- ============================================================================
"""

        ont_cte = self._generate_ontology_cte(config)
        demog_cte = self._generate_demographics_cte(config)

        predicate_section = ""
        if predicate_ctes:
            predicate_section = ",\n--\n" + ",\n--\n".join(predicate_ctes)

        return f"""{header}with {ont_cte},
{demog_cte}{predicate_section},
--
-- Final population combination
{combination}"""

    def _generate_ontology_cte(self, config: HdiSqlConfig) -> str:
        """Generate ontology CTE."""
        contexts = ",\n      ".join(f"'{c}'" for c in config.ontology_contexts)

        exclusions = ""
        if config.exclude_snapshots_and_archives:
            exclusions = """O.population_id not like '%SNAPSHOT%'
      and O.population_id not like '%ARCHIVE%'
      and """

        return f"""-- Retrieve necessary terminology contexts and concepts.
ONT as (
  select distinct
    O.*
  from ph_d_ontology O
  where
    {exclusions}(
      O.context_name in (
        {contexts}
      )
    )
)"""

    def _generate_demographics_cte(self, config: HdiSqlConfig) -> str:
        """Generate demographics CTE."""
        return f"""--
-- Retrieve demographics for all persons along with relevant terminology concepts.
DEMOG as (
  select
    P.population_id
    , P.empi_id
    , P.gender_coding_system_id
    , P.gender_code
    , GENDO.concept_name as gender_concept_name
    , P.birth_date
    , DATEDIFF(YEAR, P.birth_date, GETDATE())
      - CASE
        WHEN FORMAT(GETDATE(), 'MMdd') < FORMAT(P.birth_date, 'MMdd') THEN 1
        ELSE 0
      END as age_in_years
    , P.deceased
    , P.deceased_dt_tm
    , P.postal_cd as raw_postal_cd
    , STATEO.concept_name as state_concept_name
    , CO.concept_name as country_concept_name
  from ph_d_person P
  left join ONT GENDO
    on P.gender_coding_system_id = GENDO.code_system_id
    and P.gender_code = GENDO.code_oid
    and GENDO.concept_class_name = 'Gender'
  left join ONT STATEO
    on P.state_coding_system_id = STATEO.code_system_id
    and P.state_code = STATEO.code_oid
    and STATEO.concept_class_name = 'Environment'
  left join ONT CO
    on P.country_coding_system_id = CO.code_system_id
    and P.country_code = CO.code_oid
    and CO.concept_class_name = 'Unspecified'
  where
    P.population_id = '{config.population_id}'
)"""

    def _derive_ontology_contexts(self, data_models_used: Set[str]) -> List[str]:
        """Derive ontology contexts from data models used."""
        contexts = ["HEALTHE INTENT Demographics"]

        model_to_context = {
            "encounter": "HEALTHE INTENT Encounters",
            "condition": "HEALTHE INTENT Conditions",
            "procedure": "HEALTHE INTENT Procedures",
            "result": "HEALTHE INTENT Results",
            "medication": "HEALTHE INTENT Medications",
            "immunization": "HEALTHE INTENT Immunizations",
        }

        for model in data_models_used:
            if model in model_to_context:
                contexts.append(model_to_context[model])

        return contexts

    def _estimate_complexity(self, predicates: List[PredicateInfo]) -> str:
        """Estimate query complexity."""
        predicate_count = len(predicates)
        data_model_count = len(set(p.type for p in predicates))

        if predicate_count <= 3 and data_model_count <= 2:
            return "low"
        if predicate_count <= 8 and data_model_count <= 4:
            return "medium"
        return "high"

    def _map_gender_to_fhir_concepts(self, gender: str) -> List[str]:
        """Map gender string to FHIR concepts."""
        gender_lower = gender.lower()
        if gender_lower == "male":
            return ["FHIR Male", "FHIR Male Gender Identity"]
        if gender_lower == "female":
            return ["FHIR Female", "FHIR Female Gender Identity"]
        return [gender]

    def _escape_sql(self, s: str) -> str:
        """Escape single quotes in SQL."""
        return s.replace("'", "''") if s else ""
