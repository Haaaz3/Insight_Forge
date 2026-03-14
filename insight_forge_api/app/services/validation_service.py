"""
Validation service for evaluating test patients against measures.
"""
import json
import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.enums import DataElementType, LogicalOperator, PopulationType
from app.models.measure import DataElement, LogicalClause, Measure, Population
from app.models.validation import FhirTestPatient, TestPatient
from app.schemas.validation import (
    PopulationResultDto,
    PreCheckResultDto,
    ValidationFactDto,
    ValidationNodeDto,
    ValidationTraceDto,
)

logger = logging.getLogger(__name__)


@dataclass
class ValidationSummary:
    """Summary statistics for validation results."""
    total_patients: int = 0
    in_population: int = 0
    in_numerator: int = 0
    excluded: int = 0
    not_in_numerator: int = 0
    performance_rate: float = 0.0


@dataclass
class ValidationResults:
    """Results of validating all patients against a measure."""
    measure_id: str
    measure_title: str
    summary: ValidationSummary
    traces: List[ValidationTraceDto] = field(default_factory=list)


class ValidationService:
    """Service for validating test patients against measures."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def evaluate_patient(
        self, patient_id: str, measure_id: str
    ) -> Optional[ValidationTraceDto]:
        """Evaluate a single test patient against a measure."""
        # Load measure with full criteria tree
        measure_result = await self.db.execute(
            select(Measure)
            .where(Measure.id == measure_id)
            .options(
                selectinload(Measure.populations).selectinload(Population.root_clause)
                .selectinload(LogicalClause.child_clauses),
                selectinload(Measure.populations).selectinload(Population.root_clause)
                .selectinload(LogicalClause.data_elements),
            )
        )
        measure = measure_result.scalar_one_or_none()
        if not measure:
            return None

        # Try FHIR test patient first
        fhir_result = await self.db.execute(
            select(FhirTestPatient).where(FhirTestPatient.id == patient_id)
        )
        fhir_patient = fhir_result.scalar_one_or_none()

        if fhir_patient:
            return self._evaluate_fhir_patient(fhir_patient, measure)

        # Fall back to legacy test patient
        legacy_result = await self.db.execute(
            select(TestPatient).where(TestPatient.id == patient_id)
        )
        legacy_patient = legacy_result.scalar_one_or_none()

        if legacy_patient:
            return self._evaluate_legacy_patient(legacy_patient, measure)

        return None

    async def evaluate_all_patients(self, measure_id: str) -> Optional[ValidationResults]:
        """Evaluate all test patients against a measure."""
        # Load measure
        measure_result = await self.db.execute(
            select(Measure)
            .where(Measure.id == measure_id)
            .options(
                selectinload(Measure.populations).selectinload(Population.root_clause)
                .selectinload(LogicalClause.child_clauses),
                selectinload(Measure.populations).selectinload(Population.root_clause)
                .selectinload(LogicalClause.data_elements),
            )
        )
        measure = measure_result.scalar_one_or_none()
        if not measure:
            return None

        # Get all FHIR test patients for this measure
        fhir_result = await self.db.execute(
            select(FhirTestPatient).where(FhirTestPatient.measure_id == measure_id)
        )
        fhir_patients = fhir_result.scalars().all()

        traces: List[ValidationTraceDto] = []

        for patient in fhir_patients:
            trace = self._evaluate_fhir_patient(patient, measure)
            traces.append(trace)

        # Calculate summary
        summary = self._calculate_summary(traces)

        return ValidationResults(
            measure_id=measure_id,
            measure_title=measure.title or "Untitled",
            summary=summary,
            traces=traces,
        )

    async def get_validation_summary(self, measure_id: str) -> Optional[ValidationSummary]:
        """Get validation summary for a measure."""
        results = await self.evaluate_all_patients(measure_id)
        if results:
            return results.summary
        return None

    def _evaluate_fhir_patient(
        self, patient: FhirTestPatient, measure: Measure
    ) -> ValidationTraceDto:
        """Evaluate a FHIR test patient against a measure."""
        pre_checks: List[PreCheckResultDto] = []
        population_results: List[PopulationResultDto] = []
        how_close: List[str] = []

        # Parse FHIR bundle
        bundle = {}
        if patient.fhir_bundle:
            try:
                bundle = json.loads(patient.fhir_bundle)
            except json.JSONDecodeError:
                pass

        # Pre-checks based on global constraints
        age_check = self._check_age(patient, measure, bundle)
        if age_check:
            pre_checks.append(age_check)

        gender_check = self._check_gender(patient, measure, bundle)
        if gender_check:
            pre_checks.append(gender_check)

        # Check if pre-checks passed
        all_pre_checks_passed = all(pc.met for pc in pre_checks)

        if not all_pre_checks_passed:
            final_outcome = "not_in_population"
            how_close.append("Patient did not meet demographic requirements")
        else:
            # Evaluate each population
            for pop in measure.populations or []:
                pop_result = self._evaluate_population(pop, bundle)
                population_results.append(pop_result)

            # Determine final outcome
            final_outcome = self._determine_outcome(population_results)

            if final_outcome == "not_in_numerator":
                how_close.extend(self._analyze_how_close(population_results, bundle))

        return ValidationTraceDto(
            patientId=patient.id,
            patientName=patient.test_case_name,
            patientGender=patient.patient_gender,
            narrative=f"Validation of {patient.test_case_name} against {measure.title}",
            finalOutcome=final_outcome,
            preCheckResults=pre_checks,
            populationResults=population_results,
            howClose=how_close,
        )

    def _evaluate_legacy_patient(
        self, patient: TestPatient, measure: Measure
    ) -> ValidationTraceDto:
        """Evaluate a legacy test patient against a measure."""
        pre_checks: List[PreCheckResultDto] = []
        population_results: List[PopulationResultDto] = []

        # Age check
        if patient.birth_date and measure.age_min is not None:
            age = self._calculate_age(patient.birth_date)
            age_met = True
            if measure.age_min is not None and age < measure.age_min:
                age_met = False
            if measure.age_max is not None and age > measure.age_max:
                age_met = False

            pre_checks.append(PreCheckResultDto(
                checkType="age",
                met=age_met,
                description=f"Age {age} {'within' if age_met else 'outside'} range [{measure.age_min}-{measure.age_max}]",
            ))

        # Gender check
        if measure.gender and patient.gender:
            gender_met = patient.gender.lower() == measure.gender.value.lower()
            pre_checks.append(PreCheckResultDto(
                checkType="gender",
                met=gender_met,
                description=f"Gender {patient.gender} {'matches' if gender_met else 'does not match'} {measure.gender.value}",
            ))

        all_pre_checks_passed = all(pc.met for pc in pre_checks)

        if not all_pre_checks_passed:
            final_outcome = "not_in_population"
        else:
            # Simplified population evaluation for legacy patients
            final_outcome = "in_population"

        return ValidationTraceDto(
            patientId=patient.id,
            patientName=patient.name,
            patientGender=patient.gender,
            narrative=f"Validation of {patient.name} against {measure.title}",
            finalOutcome=final_outcome,
            preCheckResults=pre_checks,
            populationResults=population_results,
            howClose=[],
        )

    def _check_age(
        self, patient: FhirTestPatient, measure: Measure, bundle: Dict
    ) -> Optional[PreCheckResultDto]:
        """Check if patient meets age requirements."""
        if measure.age_min is None and measure.age_max is None:
            return None

        # Try to get age from patient birth date
        birth_date_str = patient.patient_birth_date
        if not birth_date_str:
            # Try to extract from FHIR bundle
            birth_date_str = self._extract_birth_date_from_bundle(bundle)

        if not birth_date_str:
            return PreCheckResultDto(
                checkType="age",
                met=False,
                description="Birth date not available",
            )

        try:
            birth_date = datetime.fromisoformat(birth_date_str.replace("Z", "+00:00")).date()
            age = self._calculate_age(birth_date)

            age_met = True
            if measure.age_min is not None and age < measure.age_min:
                age_met = False
            if measure.age_max is not None and age > measure.age_max:
                age_met = False

            return PreCheckResultDto(
                checkType="age",
                met=age_met,
                description=f"Age {age} {'within' if age_met else 'outside'} range [{measure.age_min or 0}-{measure.age_max or 999}]",
            )
        except (ValueError, TypeError):
            return PreCheckResultDto(
                checkType="age",
                met=False,
                description="Could not parse birth date",
            )

    def _check_gender(
        self, patient: FhirTestPatient, measure: Measure, bundle: Dict
    ) -> Optional[PreCheckResultDto]:
        """Check if patient meets gender requirements."""
        if not measure.gender:
            return None

        patient_gender = patient.patient_gender
        if not patient_gender:
            patient_gender = self._extract_gender_from_bundle(bundle)

        if not patient_gender:
            return PreCheckResultDto(
                checkType="gender",
                met=False,
                description="Gender not available",
            )

        gender_met = patient_gender.lower() == measure.gender.value.lower()

        return PreCheckResultDto(
            checkType="gender",
            met=gender_met,
            description=f"Gender {patient_gender} {'matches' if gender_met else 'does not match'} {measure.gender.value}",
        )

    def _evaluate_population(
        self, population: Population, bundle: Dict
    ) -> PopulationResultDto:
        """Evaluate a population criteria."""
        nodes: List[ValidationNodeDto] = []
        met = True

        # If there's a root clause, evaluate it
        if population.root_clause:
            clause_result = self._evaluate_clause(population.root_clause, bundle)
            nodes.append(clause_result)
            met = clause_result.status == "met"

        return PopulationResultDto(
            populationType=population.population_type.value,
            met=met,
            nodes=nodes,
        )

    def _evaluate_clause(
        self, clause: LogicalClause, bundle: Dict
    ) -> ValidationNodeDto:
        """Evaluate a logical clause against a FHIR bundle."""
        children: List[ValidationNodeDto] = []

        # Evaluate child clauses
        if clause.child_clauses:
            for child in clause.child_clauses:
                child_result = self._evaluate_clause(child, bundle)
                children.append(child_result)

        # Evaluate data elements
        facts: List[ValidationFactDto] = []
        if clause.data_elements:
            for element in clause.data_elements:
                element_result = self._evaluate_data_element(element, bundle)
                children.append(element_result)

        # Determine clause status based on operator
        if clause.operator == LogicalOperator.OR:
            met = any(c.status == "met" for c in children) if children else True
        else:  # AND
            met = all(c.status == "met" for c in children) if children else True

        return ValidationNodeDto(
            id=clause.id,
            title=clause.description or f"{clause.operator.value} clause",
            type="clause",
            description=clause.description,
            status="met" if met else "not_met",
            facts=facts,
            children=children,
        )

    def _evaluate_data_element(
        self, element: DataElement, bundle: Dict
    ) -> ValidationNodeDto:
        """Evaluate a data element against a FHIR bundle."""
        facts: List[ValidationFactDto] = []
        met = False

        # Simple matching based on element type
        # In a full implementation, this would do actual FHIR resource matching
        if element.element_type == DataElementType.DEMOGRAPHIC:
            met = True  # Demographics usually handled in pre-checks
        else:
            # Check for matching resources in bundle
            resource_type = self._element_type_to_fhir_resource(element.element_type)
            matching_resources = self._find_matching_resources(bundle, resource_type)
            met = len(matching_resources) > 0

            for resource in matching_resources[:3]:  # Limit facts
                facts.append(ValidationFactDto(
                    code=resource.get("code", {}).get("coding", [{}])[0].get("code"),
                    display=resource.get("code", {}).get("text"),
                    date=resource.get("performedDateTime") or resource.get("effectiveDateTime"),
                    source=resource_type,
                ))

        # Handle negation
        if element.negation:
            met = not met

        return ValidationNodeDto(
            id=element.id,
            title=element.description or f"{element.element_type.value} criterion",
            type="dataElement",
            description=element.description,
            status="met" if met else "not_met",
            facts=facts,
            children=[],
        )

    def _determine_outcome(
        self, population_results: List[PopulationResultDto]
    ) -> str:
        """Determine final outcome from population results."""
        ip_met = False
        denom_met = False
        excl_met = False
        num_met = False

        for pop in population_results:
            if pop.populationType == "initial_population":
                ip_met = pop.met
            elif pop.populationType == "denominator":
                denom_met = pop.met
            elif pop.populationType == "denominator_exclusion":
                excl_met = pop.met
            elif pop.populationType == "numerator":
                num_met = pop.met

        if not ip_met:
            return "not_in_population"
        if excl_met:
            return "excluded"
        if num_met:
            return "in_numerator"
        if denom_met or ip_met:
            return "not_in_numerator"

        return "not_in_population"

    def _analyze_how_close(
        self, population_results: List[PopulationResultDto], bundle: Dict
    ) -> List[str]:
        """Analyze what criteria were not met for near-misses."""
        how_close: List[str] = []

        for pop in population_results:
            if pop.populationType == "numerator" and not pop.met:
                for node in pop.nodes:
                    unmet = self._find_unmet_criteria(node)
                    how_close.extend(unmet)

        return how_close[:5]  # Limit suggestions

    def _find_unmet_criteria(self, node: ValidationNodeDto) -> List[str]:
        """Find unmet criteria in a validation node tree."""
        unmet: List[str] = []

        if node.status == "not_met" and node.type == "dataElement":
            unmet.append(f"Missing: {node.title or node.description or 'Unknown criterion'}")

        for child in node.children:
            unmet.extend(self._find_unmet_criteria(child))

        return unmet

    def _calculate_summary(self, traces: List[ValidationTraceDto]) -> ValidationSummary:
        """Calculate summary statistics from validation traces."""
        total = len(traces)
        in_population = sum(1 for t in traces if t.finalOutcome != "not_in_population")
        in_numerator = sum(1 for t in traces if t.finalOutcome == "in_numerator")
        excluded = sum(1 for t in traces if t.finalOutcome == "excluded")
        not_in_numerator = sum(1 for t in traces if t.finalOutcome == "not_in_numerator")

        performance_rate = (in_numerator / in_population * 100) if in_population > 0 else 0.0

        return ValidationSummary(
            total_patients=total,
            in_population=in_population,
            in_numerator=in_numerator,
            excluded=excluded,
            not_in_numerator=not_in_numerator,
            performance_rate=performance_rate,
        )

    def _calculate_age(self, birth_date: date) -> int:
        """Calculate age in years from birth date."""
        today = date.today()
        age = today.year - birth_date.year
        if (today.month, today.day) < (birth_date.month, birth_date.day):
            age -= 1
        return age

    def _extract_birth_date_from_bundle(self, bundle: Dict) -> Optional[str]:
        """Extract birth date from FHIR bundle."""
        entries = bundle.get("entry", [])
        for entry in entries:
            resource = entry.get("resource", {})
            if resource.get("resourceType") == "Patient":
                return resource.get("birthDate")
        return None

    def _extract_gender_from_bundle(self, bundle: Dict) -> Optional[str]:
        """Extract gender from FHIR bundle."""
        entries = bundle.get("entry", [])
        for entry in entries:
            resource = entry.get("resource", {})
            if resource.get("resourceType") == "Patient":
                return resource.get("gender")
        return None

    def _element_type_to_fhir_resource(self, element_type: DataElementType) -> str:
        """Map data element type to FHIR resource type."""
        mapping = {
            DataElementType.DIAGNOSIS: "Condition",
            DataElementType.PROCEDURE: "Procedure",
            DataElementType.MEDICATION: "MedicationRequest",
            DataElementType.OBSERVATION: "Observation",
            DataElementType.ENCOUNTER: "Encounter",
            DataElementType.ASSESSMENT: "Observation",
            DataElementType.IMMUNIZATION: "Immunization",
        }
        return mapping.get(element_type, "Unknown")

    def _find_matching_resources(
        self, bundle: Dict, resource_type: str
    ) -> List[Dict[str, Any]]:
        """Find resources of a given type in a FHIR bundle."""
        entries = bundle.get("entry", [])
        return [
            entry.get("resource", {})
            for entry in entries
            if entry.get("resource", {}).get("resourceType") == resource_type
        ]
