"""
CQL Generator Service.

Generates Clinical Quality Language (CQL) from Universal Measure Spec entities.
Supports FHIR R4, QI-Core profiles, and eCQM standards.

Ported from: backend/src/main/java/com/algoaccel/service/CqlGeneratorService.java
"""
import logging
import re
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

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
class CqlMetadata:
    """Metadata about generated CQL."""
    library_name: str
    version: str
    population_count: int
    value_set_count: int
    definition_count: int


@dataclass
class CqlGenerationResult:
    """Result of CQL generation."""
    success: bool
    cql: str
    errors: Optional[List[str]]
    warnings: Optional[List[str]]
    metadata: CqlMetadata


class CqlGeneratorService:
    """Service for generating CQL from measure specifications."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_cql(self, measure_id: str) -> CqlGenerationResult:
        """Generate complete CQL library from a measure by ID."""
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
            return CqlGenerationResult(
                success=False,
                cql="",
                errors=[f"Measure not found: {measure_id}"],
                warnings=None,
                metadata=CqlMetadata("", "", 0, 0, 0),
            )

        return self._generate_cql_from_measure(measure)

    def _generate_cql_from_measure(self, measure: Measure) -> CqlGenerationResult:
        """Generate complete CQL library from a measure entity."""
        errors: List[str] = []
        warnings: List[str] = []

        try:
            # Validate minimum requirements
            if not measure.measure_id:
                errors.append("Measure ID is required")
            if not measure.populations:
                errors.append("At least one population definition is required")

            if errors:
                return CqlGenerationResult(
                    success=False,
                    cql="",
                    errors=errors,
                    warnings=warnings if warnings else None,
                    metadata=CqlMetadata("", "", 0, 0, 0),
                )

            # Generate library name from measure ID
            library_name = self._sanitize_library_name(measure.measure_id)
            version = measure.version or "1.0.0"

            # Generate CQL sections
            header = self._generate_header(measure, library_name, version)
            value_sets = self._generate_value_set_declarations(measure.value_sets, warnings)
            parameters = self._generate_parameters(measure)
            helper_definitions = self._generate_helper_definitions(measure)
            population_definitions = self._generate_population_definitions(measure)
            supplemental_data = self._generate_supplemental_data()

            # Assemble complete CQL
            cql = f"{header}\n{value_sets}\n{parameters}\ncontext Patient\n\n{helper_definitions}\n{population_definitions}\n{supplemental_data}"

            # Count definitions
            definition_count = self._count_definitions(cql)

            return CqlGenerationResult(
                success=True,
                cql=cql,
                errors=None,
                warnings=warnings if warnings else None,
                metadata=CqlMetadata(
                    library_name=library_name,
                    version=version,
                    population_count=len(measure.populations),
                    value_set_count=len(measure.value_sets) if measure.value_sets else 0,
                    definition_count=definition_count,
                ),
            )

        except Exception as e:
            logger.error(f"CQL generation failed: {e}", exc_info=True)
            errors.append(str(e) or "Unknown error during CQL generation")
            return CqlGenerationResult(
                success=False,
                cql="",
                errors=errors,
                warnings=warnings if warnings else None,
                metadata=CqlMetadata("", "", 0, 0, 0),
            )

    def _generate_header(self, measure: Measure, library_name: str, version: str) -> str:
        """Generate CQL header with library declaration and includes."""
        title = measure.title or "Untitled"
        steward = measure.steward or "Not specified"
        measure_type = measure.measure_type or "process"
        description = self._truncate(measure.description, 200) if measure.description else "No description provided"

        return f"""/*
 * Library: {library_name}
 * Title: {title}
 * Measure ID: {measure.measure_id}
 * Version: {version}
 * Steward: {steward}
 * Type: {measure_type}
 * Scoring: proportion
 *
 * Description: {description}
 *
 * Generated: {datetime.utcnow().isoformat()}
 * Generator: InsightForge CQL Generator v1.0
 */

library {library_name} version '{version}'

using FHIR version '4.0.1'

include FHIRHelpers version '4.0.1' called FHIRHelpers
include QICoreCommon version '2.0.0' called QICoreCommon
include MATGlobalCommonFunctions version '7.0.000' called Global
include SupplementalDataElements version '3.4.000' called SDE
include Hospice version '6.9.000' called Hospice

// Code Systems
codesystem "LOINC": 'http://loinc.org'
codesystem "SNOMEDCT": 'http://snomed.info/sct'
codesystem "ICD10CM": 'http://hl7.org/fhir/sid/icd-10-cm'
codesystem "CPT": 'http://www.ama-assn.org/go/cpt'
codesystem "HCPCS": 'https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets'
codesystem "RxNorm": 'http://www.nlm.nih.gov/research/umls/rxnorm'
codesystem "CVX": 'http://hl7.org/fhir/sid/cvx'
"""

    def _generate_value_set_declarations(
        self, value_sets: Optional[List[MeasureValueSet]], warnings: List[str]
    ) -> str:
        """Generate value set declarations."""
        if not value_sets:
            return "// No value sets defined\n"

        lines = ["// Value Sets"]
        for vs in value_sets:
            if not vs:
                continue

            url = vs.url
            if not url and vs.oid:
                url = f"http://cts.nlm.nih.gov/fhir/ValueSet/{vs.oid}"

            if url:
                has_codes = vs.codes and len(vs.codes) > 0
                lines.append(f'valueset "{self._sanitize_identifier(vs.name)}": \'{url}\'')
                if not has_codes:
                    lines.append(f'  /* WARNING: Value set "{vs.name}" has no codes defined - may need expansion */')
                    warnings.append(f'Value set "{vs.name}" has no codes defined')
            else:
                lines.append(f'// valueset "{self._sanitize_identifier(vs.name)}": \'OID_NOT_SPECIFIED\'')
                warnings.append(f'Value set "{vs.name}" has no OID or URL specified')

        return "\n".join(lines) + "\n"

    def _generate_parameters(self, measure: Measure) -> str:
        """Generate measurement period parameter."""
        year = datetime.now().year
        mp_start = measure.period_start or f"{year}-01-01"
        mp_end = measure.period_end or f"{year}-12-31"

        return f"""// Parameters
parameter "Measurement Period" Interval<DateTime>
  default Interval[@{mp_start}T00:00:00.0, @{mp_end}T23:59:59.999]
"""

    def _generate_helper_definitions(self, measure: Measure) -> str:
        """Generate helper definitions based on measure content."""
        lines = ["// Helper Definitions"]

        # Age calculation
        if measure.age_min is not None and measure.age_max is not None:
            lines.append("""
define "Age at End of Measurement Period":
  AgeInYearsAt(date from end of "Measurement Period")

define "Patient Age Valid":
  "Age at End of Measurement Period" in Interval[""" + str(measure.age_min) + ", " + str(measure.age_max) + "]")

        # Gender requirement
        if measure.gender:
            lines.append(f"""
define "Patient Gender Valid":
  Patient.gender = '{measure.gender.value}'""")

        # Qualifying encounters helper
        if self._has_data_element_type(measure, DataElementType.ENCOUNTER):
            lines.append("""
define "Qualifying Encounter During Measurement Period":
  ( [Encounter: "Office Visit"]
    union [Encounter: "Annual Wellness Visit"]
    union [Encounter: "Preventive Care Services Established Office Visit, 18 and Up"]
    union [Encounter: "Home Healthcare Services"]
    union [Encounter: "Online Assessments"]
    union [Encounter: "Telephone Visits"]
  ) Encounter
    where Encounter.status = 'finished'
      and Encounter.period during "Measurement Period"
""")

        # Hospice check
        lines.append("""
define "Has Hospice Services":
  Hospice."Has Hospice Services"
""")

        # Detect measure type and add specific helpers
        title = (measure.title or "").lower()
        measure_id_upper = (measure.measure_id or "").upper()

        if "colorectal" in title or "CMS130" in measure_id_upper:
            lines.append(self._generate_crc_helpers())

        if "cervical" in title or "CMS124" in measure_id_upper:
            lines.append(self._generate_cervical_helpers())

        if ("breast" in title and "screen" in title) or "CMS125" in measure_id_upper:
            lines.append(self._generate_breast_cancer_helpers())

        return "\n".join(lines)

    def _generate_crc_helpers(self) -> str:
        """Generate colorectal cancer screening helpers."""
        return """
// Colorectal Cancer Screening Helpers
define "Colonoscopy Performed":
  [Procedure: "Colonoscopy"] Colonoscopy
    where Colonoscopy.status = 'completed'
      and Colonoscopy.performed ends 10 years or less before end of "Measurement Period"

define "Fecal Occult Blood Test Performed":
  [Observation: "Fecal Occult Blood Test (FOBT)"] FOBT
    where FOBT.status in { 'final', 'amended', 'corrected' }
      and FOBT.effective ends 1 year or less before end of "Measurement Period"
      and FOBT.value is not null

define "Flexible Sigmoidoscopy Performed":
  [Procedure: "Flexible Sigmoidoscopy"] Sigmoidoscopy
    where Sigmoidoscopy.status = 'completed'
      and Sigmoidoscopy.performed ends 5 years or less before end of "Measurement Period"

define "FIT DNA Test Performed":
  [Observation: "FIT DNA"] FITTest
    where FITTest.status in { 'final', 'amended', 'corrected' }
      and FITTest.effective ends 3 years or less before end of "Measurement Period"
      and FITTest.value is not null

define "CT Colonography Performed":
  [Procedure: "CT Colonography"] CTCol
    where CTCol.status = 'completed'
      and CTCol.performed ends 5 years or less before end of "Measurement Period"

define "Has Colorectal Cancer":
  exists ([Condition: "Malignant Neoplasm of Colon"] Cancer
    where Cancer.clinicalStatus ~ QICoreCommon."active")

define "Has Total Colectomy":
  exists ([Procedure: "Total Colectomy"] Colectomy
    where Colectomy.status = 'completed'
      and Colectomy.performed starts before end of "Measurement Period")
"""

    def _generate_cervical_helpers(self) -> str:
        """Generate cervical cancer screening helpers."""
        return """
// Cervical Cancer Screening Helpers
define "Cervical Cytology Within 3 Years":
  [Observation: "Pap Test"] Pap
    where Pap.status in { 'final', 'amended', 'corrected' }
      and Pap.effective ends 3 years or less before end of "Measurement Period"
      and Pap.value is not null

define "HPV Test Within 5 Years":
  [Observation: "HPV Test"] HPV
    where HPV.status in { 'final', 'amended', 'corrected' }
      and HPV.effective ends 5 years or less before end of "Measurement Period"
      and HPV.value is not null

define "Has Hysterectomy":
  exists ([Procedure: "Hysterectomy with No Residual Cervix"] Hyst
    where Hyst.status = 'completed'
      and Hyst.performed starts before end of "Measurement Period")

define "Absence of Cervix Diagnosis":
  exists ([Condition: "Congenital or Acquired Absence of Cervix"] Absence
    where Absence.clinicalStatus ~ QICoreCommon."active")
"""

    def _generate_breast_cancer_helpers(self) -> str:
        """Generate breast cancer screening helpers."""
        return """
// Breast Cancer Screening Helpers
define "Mammography Within 27 Months":
  [DiagnosticReport: "Mammography"] Mammogram
    where Mammogram.status in { 'final', 'amended', 'corrected' }
      and Mammogram.effective ends 27 months or less before end of "Measurement Period"

define "Has Bilateral Mastectomy":
  exists ([Procedure: "Bilateral Mastectomy"] Mastectomy
    where Mastectomy.status = 'completed'
      and Mastectomy.performed starts before end of "Measurement Period")

define "Has Unilateral Mastectomy Left":
  exists ([Procedure: "Unilateral Mastectomy Left"] LeftMastectomy
    where LeftMastectomy.status = 'completed')

define "Has Unilateral Mastectomy Right":
  exists ([Procedure: "Unilateral Mastectomy Right"] RightMastectomy
    where RightMastectomy.status = 'completed')
"""

    def _generate_population_definitions(self, measure: Measure) -> str:
        """Generate population definitions."""
        lines = ["// Population Definitions"]

        # Initial Population
        ip_pop = self._find_population(measure.populations, PopulationType.INITIAL_POPULATION)
        if ip_pop:
            lines.append(self._generate_population_definition(ip_pop, "Initial Population"))

        # Denominator
        denom_pop = self._find_population(measure.populations, PopulationType.DENOMINATOR)
        lines.append(self._generate_denominator_definition(denom_pop))

        # Denominator Exclusions
        excl_pop = self._find_population(measure.populations, PopulationType.DENOMINATOR_EXCLUSION)
        lines.append(self._generate_exclusion_definition(excl_pop, measure))

        # Denominator Exceptions
        excep_pop = self._find_population(measure.populations, PopulationType.DENOMINATOR_EXCEPTION)
        if excep_pop:
            lines.append(self._generate_population_definition(excep_pop, "Denominator Exception"))

        # Numerator
        num_pop = self._find_population(measure.populations, PopulationType.NUMERATOR)
        lines.append(self._generate_numerator_definition(num_pop, measure))

        # Numerator Exclusions
        num_excl_pop = self._find_population(measure.populations, PopulationType.NUMERATOR_EXCLUSION)
        if num_excl_pop:
            lines.append(self._generate_population_definition(num_excl_pop, "Numerator Exclusion"))

        return "\n".join(lines)

    def _generate_population_definition(self, pop: Population, name: str) -> str:
        """Generate a single population definition."""
        lines = []

        # Add narrative as comment
        if pop.narrative:
            lines.append(f"\n/*\n * {name}\n * {self._truncate(pop.narrative, 200)}\n */")

        # Generate criteria expression
        criteria_expr = "true"
        if pop.root_clause:
            criteria_expr = self._generate_criteria_expression(pop.root_clause)

        lines.append(f'define "{name}":')
        lines.append(f"  {criteria_expr}")

        return "\n".join(lines)

    def _generate_denominator_definition(self, pop: Optional[Population]) -> str:
        """Generate denominator definition."""
        if pop and pop.root_clause and self._has_children(pop.root_clause):
            return self._generate_population_definition(pop, "Denominator")

        return """
/*
 * Denominator
 * Equals Initial Population
 */
define "Denominator":
  "Initial Population"
"""

    def _generate_exclusion_definition(self, pop: Optional[Population], measure: Measure) -> str:
        """Generate denominator exclusion definition."""
        narrative = self._truncate(pop.narrative, 200) if pop and pop.narrative else "Patients meeting exclusion criteria"

        exclusion_criteria = ['"Has Hospice Services"']

        # Add measure-specific exclusions
        title = (measure.title or "").lower()
        measure_id_upper = (measure.measure_id or "").upper()

        if "colorectal" in title or "CMS130" in measure_id_upper:
            exclusion_criteria.extend(['"Has Colorectal Cancer"', '"Has Total Colectomy"'])

        if "cervical" in title or "CMS124" in measure_id_upper:
            exclusion_criteria.extend(['"Has Hysterectomy"', '"Absence of Cervix Diagnosis"'])

        if ("breast" in title and "screen" in title) or "CMS125" in measure_id_upper:
            exclusion_criteria.extend([
                '"Has Bilateral Mastectomy"',
                '("Has Unilateral Mastectomy Left" and "Has Unilateral Mastectomy Right")',
            ])

        # Add custom exclusions from population criteria
        if pop and pop.root_clause and self._has_children(pop.root_clause):
            custom_expr = self._generate_criteria_expression(pop.root_clause)
            if custom_expr not in ("true", "false"):
                exclusion_criteria.append(f"({custom_expr})")

        criteria_str = "\n    or ".join(exclusion_criteria)

        return f"""
/*
 * Denominator Exclusion
 * {narrative}
 */
define "Denominator Exclusion":
  {criteria_str}
"""

    def _generate_numerator_definition(self, pop: Optional[Population], measure: Measure) -> str:
        """Generate numerator definition."""
        title = (measure.title or "").lower()
        measure_id_upper = (measure.measure_id or "").upper()
        narrative = self._truncate(pop.narrative, 200) if pop and pop.narrative else "Patients meeting numerator criteria"

        # Measure-specific numerator logic
        if "colorectal" in title or "CMS130" in measure_id_upper:
            return f"""
/*
 * Numerator
 * {narrative}
 */
define "Numerator":
  exists "Colonoscopy Performed"
    or exists "Fecal Occult Blood Test Performed"
    or exists "Flexible Sigmoidoscopy Performed"
    or exists "FIT DNA Test Performed"
    or exists "CT Colonography Performed"
"""

        if "cervical" in title or "CMS124" in measure_id_upper:
            return f"""
/*
 * Numerator
 * {narrative}
 */
define "Numerator":
  exists "Cervical Cytology Within 3 Years"
    or (AgeInYearsAt(date from end of "Measurement Period") >= 30
        and exists "HPV Test Within 5 Years")
"""

        if ("breast" in title and "screen" in title) or "CMS125" in measure_id_upper:
            return f"""
/*
 * Numerator
 * {narrative}
 */
define "Numerator":
  exists "Mammography Within 27 Months"
"""

        # Generic numerator from criteria
        if pop and pop.root_clause and self._has_children(pop.root_clause):
            criteria_expr = self._generate_criteria_expression(pop.root_clause)
            return f"""
/*
 * Numerator
 * {narrative}
 */
define "Numerator":
  {criteria_expr}
"""

        return f"""
/*
 * Numerator
 * {narrative}
 */
define "Numerator":
  /* WARNING: No numerator criteria defined in measure specification */
  true
"""

    def _generate_criteria_expression(self, clause: LogicalClause) -> str:
        """Generate CQL expression from a logical clause."""
        if not clause:
            return "true"

        expressions: List[str] = []

        # Process child clauses
        if clause.child_clauses:
            for child_clause in clause.child_clauses:
                nested = self._generate_criteria_expression(child_clause)
                if nested != "true":
                    expressions.append(f"({nested})")

        # Process data elements
        if clause.data_elements:
            for element in clause.data_elements:
                expr = self._generate_data_element_expression(element)
                expressions.append(expr)

        if not expressions:
            return "true"

        operator = "\n    or " if clause.operator == LogicalOperator.OR else "\n    and "
        return operator.join(expressions)

    def _generate_data_element_expression(self, element: DataElement) -> str:
        """Generate CQL expression for a data element."""
        if not element:
            return "/* WARNING: Null data element encountered */\n  true"

        # Handle demographic type with gender
        if element.element_type == DataElementType.DEMOGRAPHIC:
            return self._generate_demographic_expression(element)

        # Get value set name
        vs_name = self._get_value_set_name(element)
        if not vs_name:
            desc = element.description or f"{element.element_type.value} criterion"
            return f'/* WARNING: No value set defined for "{desc}" */\n  true'

        # Get timing expression
        timing = self._generate_timing_expression(element)

        # Generate based on type
        timing_clause = f"\n        {timing}" if timing else ""

        if element.element_type == DataElementType.DIAGNOSIS:
            return f'''exists ([Condition: "{vs_name}"] C
      where C.clinicalStatus ~ QICoreCommon."active"{timing_clause})'''

        if element.element_type == DataElementType.ENCOUNTER:
            return f'''exists ([Encounter: "{vs_name}"] E
      where E.status = 'finished'{timing_clause})'''

        if element.element_type == DataElementType.PROCEDURE:
            return f'''exists ([Procedure: "{vs_name}"] P
      where P.status = 'completed'{timing_clause})'''

        if element.element_type in (DataElementType.OBSERVATION, DataElementType.ASSESSMENT):
            return f'''exists ([Observation: "{vs_name}"] O
      where O.status in {{ 'final', 'amended', 'corrected' }}
        and O.value is not null{timing_clause})'''

        if element.element_type == DataElementType.MEDICATION:
            return f'''exists ([MedicationRequest: "{vs_name}"] M
      where M.status in {{ 'active', 'completed' }}{timing_clause})'''

        if element.element_type == DataElementType.IMMUNIZATION:
            return f'''exists ([Immunization: "{vs_name}"] I
      where I.status = 'completed'{timing_clause})'''

        return f"// TODO: {element.description or 'Unknown criterion'}"

    def _generate_demographic_expression(self, element: DataElement) -> str:
        """Generate CQL expression for demographic checks."""
        if element.gender_value:
            return f"Patient.gender = '{element.gender_value.value}'"

        if element.threshold_age_min is not None or element.threshold_age_max is not None:
            age_min = element.threshold_age_min or 0
            age_max = element.threshold_age_max or 999
            return f'AgeInYearsAt(date from end of "Measurement Period") in Interval[{age_min}, {age_max}]'

        return '"Patient Age Valid"'

    def _generate_timing_expression(self, element: DataElement) -> str:
        """Generate timing expression for a data element."""
        # Default timing
        return 'and occurs during "Measurement Period"'

    def _generate_supplemental_data(self) -> str:
        """Generate supplemental data elements."""
        return """
// Supplemental Data Elements
define "SDE Ethnicity":
  SDE."SDE Ethnicity"

define "SDE Payer":
  SDE."SDE Payer"

define "SDE Race":
  SDE."SDE Race"

define "SDE Sex":
  SDE."SDE Sex"
"""

    # Helper methods

    def _sanitize_library_name(self, measure_id: str) -> str:
        """Sanitize measure ID for use as library name."""
        sanitized = re.sub(r"[^a-zA-Z0-9]", "", measure_id)
        if sanitized and sanitized[0].isdigit():
            sanitized = "_" + sanitized
        return sanitized

    def _sanitize_identifier(self, name: str) -> str:
        """Sanitize string for use as CQL identifier."""
        return name.replace('"', '\\"').strip()

    def _truncate(self, text: Optional[str], max_length: int) -> str:
        """Truncate text to max length."""
        if not text:
            return ""
        if len(text) <= max_length:
            return text
        return text[:max_length] + "..."

    def _find_population(
        self, populations: List[Population], pop_type: PopulationType
    ) -> Optional[Population]:
        """Find population by type."""
        if not populations:
            return None
        for pop in populations:
            if pop.population_type == pop_type:
                return pop
        return None

    def _has_children(self, clause: Optional[LogicalClause]) -> bool:
        """Check if clause has children or data elements."""
        if not clause:
            return False
        return bool(clause.child_clauses) or bool(clause.data_elements)

    def _has_data_element_type(self, measure: Measure, element_type: DataElementType) -> bool:
        """Check if measure has any data elements of the given type."""
        if not measure.populations:
            return False

        for pop in measure.populations:
            if pop.root_clause and self._has_data_element_type_in_clause(pop.root_clause, element_type):
                return True
        return False

    def _has_data_element_type_in_clause(self, clause: LogicalClause, element_type: DataElementType) -> bool:
        """Check if clause tree contains data element of given type."""
        if clause.data_elements:
            for element in clause.data_elements:
                if element.element_type == element_type:
                    return True

        if clause.child_clauses:
            for child in clause.child_clauses:
                if self._has_data_element_type_in_clause(child, element_type):
                    return True

        return False

    def _get_value_set_name(self, element: DataElement) -> Optional[str]:
        """Get the name of the first value set associated with a data element."""
        if element.value_sets:
            for vs in element.value_sets:
                return vs.name
        return None

    def _count_definitions(self, cql: str) -> int:
        """Count number of definitions in CQL."""
        return len(re.findall(r'^define\s+"', cql, re.MULTILINE))
