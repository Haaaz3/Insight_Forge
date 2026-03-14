"""
Seed initial data for Insight Forge.
Ported from Spring Boot Flyway migrations V9 and V10.
"""
import logging
from datetime import date, datetime
from typing import Optional

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.component import LibraryComponent
from app.models.measure import (
    DataElement,
    LogicalClause,
    Measure,
    MeasureValueSet,
    Population,
    ValueSetCode,
)
from app.models.validation import TestPatient

logger = logging.getLogger(__name__)


async def check_seeds_needed(session: AsyncSession) -> bool:
    """Check if seeds have already been applied."""
    result = await session.execute(
        select(LibraryComponent).where(LibraryComponent.id == "age-65-plus")
    )
    return result.scalar_one_or_none() is None


async def seed_database(session: AsyncSession) -> None:
    """Seed the database with initial data if not already seeded."""

    if not await check_seeds_needed(session):
        logger.info("Seeds already applied, skipping")
        return

    logger.info("Seeding database with initial data...")

    # =========================================================================
    # V9: Basic components and test patient
    # =========================================================================

    # Patient Sex components
    session.add(LibraryComponent(
        id="patient-sex-female",
        component_type="atomic",
        name="Patient Sex: Female",
        description='Patient administrative gender is female (FHIR Patient.gender = "female")',
        complexity_level="LOW",
        complexity_score=1,
        version_id="1.0",
        version_status="APPROVED",
        category="DEMOGRAPHICS",
        category_auto_assigned=False,
        source_origin="ecqi",
        value_set_oid="2.16.840.1.113883.4.642.3.1",
        value_set_name="Administrative Gender",
        value_set_version="FHIR R4",
        timing_operator="DURING",
        timing_reference="Measurement Period",
        timing_display="N/A - Patient demographic",
        negation=False,
        resource_type="Patient",
        gender_value="FEMALE",
        created_by="system",
        updated_by="system",
    ))

    session.add(LibraryComponent(
        id="patient-sex-male",
        component_type="atomic",
        name="Patient Sex: Male",
        description='Patient administrative gender is male (FHIR Patient.gender = "male")',
        complexity_level="LOW",
        complexity_score=1,
        version_id="1.0",
        version_status="APPROVED",
        category="DEMOGRAPHICS",
        category_auto_assigned=False,
        source_origin="ecqi",
        value_set_oid="2.16.840.1.113883.4.642.3.1",
        value_set_name="Administrative Gender",
        value_set_version="FHIR R4",
        timing_operator="DURING",
        timing_reference="Measurement Period",
        timing_display="N/A - Patient demographic",
        negation=False,
        resource_type="Patient",
        gender_value="MALE",
        created_by="system",
        updated_by="system",
    ))

    session.add(LibraryComponent(
        id="age-65-plus",
        component_type="atomic",
        name="Age 65 and Older",
        description="Patient age is 65 years or older during the measurement period",
        complexity_level="LOW",
        complexity_score=1,
        version_id="1.0",
        version_status="APPROVED",
        category="DEMOGRAPHICS",
        category_auto_assigned=False,
        source_origin="ecqi",
        timing_operator="DURING",
        timing_reference="Measurement Period",
        timing_display="Age >= 65 during Measurement Period",
        negation=False,
        resource_type="Patient",
        created_by="system",
        updated_by="system",
    ))

    # Test patient
    session.add(TestPatient(
        id="test-patient-001",
        name="Paul Atreides",
        birth_date=date(1970, 6, 15),
        gender="male",
        race="White",
        ethnicity="Non-Hispanic",
        diagnoses='[{"code":"I10","system":"ICD10CM","display":"Essential Hypertension","onsetDate":"2020-01-15"}]',
        encounters='[{"code":"99213","system":"CPT","display":"Office Visit","date":"2024-03-15","type":"outpatient"}]',
        procedures='[{"code":"45378","system":"CPT","display":"Colonoscopy","date":"2022-06-01"}]',
        observations='[{"code":"4548-4","system":"LOINC","display":"HbA1c","value":6.2,"unit":"%","date":"2024-02-01"}]',
        medications='[{"code":"314076","system":"RxNorm","display":"Lisinopril 10mg","startDate":"2020-02-01","status":"active"}]',
        immunizations="[]",
    ))

    # =========================================================================
    # V10: Age components
    # =========================================================================

    age_components = [
        ("age-12-plus", "Age 12 and Older", "Patient age is 12 years or older during the measurement period", 1),
        ("age-18-plus", "Age 18 and Older", "Patient age is 18 years or older during the measurement period", 4),
        ("age-18-64", "Age 18-64 Years", "Patient age is between 18 and 64 years during the measurement period", 1),
        ("age-18-75", "Age 18-75 Years", "Patient age is between 18 and 75 years during the measurement period", 1),
        ("age-18-85", "Age 18-85 Years", "Patient age is between 18 and 85 years during the measurement period", 1),
        ("age-21-64", "Age 21-64 Years", "Patient age is between 21 and 64 years during the measurement period", 1),
        ("age-45-75", "Age 45-75 Years", "Patient age is between 45 and 75 years during the measurement period", 1),
        ("age-52-74", "Age 52-74 Years", "Patient age is between 52 and 74 years during the measurement period", 1),
    ]

    for comp_id, name, desc, usage in age_components:
        session.add(LibraryComponent(
            id=comp_id,
            component_type="atomic",
            name=name,
            description=desc,
            complexity_level="LOW",
            complexity_score=1,
            version_id="1.0",
            version_status="APPROVED",
            category="DEMOGRAPHICS",
            category_auto_assigned=False,
            source_origin="ecqi",
            negation=False,
            resource_type="Patient",
            usage_count=usage,
            created_by="system",
            updated_by="system",
        ))

    # =========================================================================
    # V10: Encounter components
    # =========================================================================

    encounter_components = [
        ("enc-office-visit", "Qualifying Encounter: Office Visit", "Office visit encounter during the measurement period",
         "2.16.840.1.113883.3.464.1003.101.12.1001", "Office Visit", "Encounter", 9),
        ("enc-preventive-care", "Qualifying Encounter: Preventive Care", "Preventive care services encounter during the measurement period",
         "2.16.840.1.113883.3.464.1003.101.12.1027", "Preventive Care Services - Established Office Visit, 18 and Up", "Encounter", 6),
        ("enc-telehealth", "Qualifying Encounter: Telehealth", "Telehealth or virtual encounter during the measurement period",
         "2.16.840.1.113883.3.464.1003.101.12.1089", "Online Assessments", "Encounter", 3),
        ("enc-psych-visit", "Qualifying Encounter: Psych Visit", "Psychiatric or mental health encounter during the measurement period",
         "2.16.840.1.113883.3.526.3.1492", "Outpatient Consultation", "Encounter", 1),
        ("enc-annual-wellness", "Annual Wellness Visit", "Annual wellness visit during the measurement period",
         "2.16.840.1.113883.3.526.3.1240", "Annual Wellness Visit", "Encounter", 6),
    ]

    for comp_id, name, desc, oid, vs_name, resource, usage in encounter_components:
        session.add(LibraryComponent(
            id=comp_id,
            component_type="atomic",
            name=name,
            description=desc,
            complexity_level="LOW",
            complexity_score=1,
            version_id="1.0",
            version_status="APPROVED",
            category="ENCOUNTERS",
            category_auto_assigned=False,
            source_origin="ecqi",
            value_set_oid=oid,
            value_set_name=vs_name,
            value_set_version="20240101",
            timing_operator="DURING",
            timing_reference="Measurement Period",
            timing_display="during Measurement Period",
            negation=False,
            resource_type=resource,
            usage_count=usage,
            created_by="system",
            updated_by="system",
        ))

    # =========================================================================
    # V10: Exclusion components
    # =========================================================================

    exclusion_components = [
        ("excl-hospice", "Hospice Care Exclusion", "Patient receiving hospice care services - common exclusion across quality measures",
         "2.16.840.1.113883.3.526.3.1584", "Hospice Care Ambulatory", "Encounter", 6, "LOW", 1),
        ("excl-palliative", "Palliative Care Exclusion", "Patient receiving palliative care services",
         "2.16.840.1.113883.3.464.1003.101.12.1090", "Palliative Care Encounter", "Encounter", 5, "LOW", 1),
        ("excl-advanced-illness", "Advanced Illness Exclusion", "Patient with advanced illness and frailty",
         "2.16.840.1.113883.3.464.1003.111.12.1059", "Advanced Illness", "Condition", 2, "MEDIUM", 2),
        ("excl-pregnancy", "Pregnancy Exclusion", "Patient with active pregnancy diagnosis",
         "2.16.840.1.113883.3.526.3.378", "Pregnancy", "Condition", 2, "LOW", 1),
    ]

    for comp_id, name, desc, oid, vs_name, resource, usage, complexity, score in exclusion_components:
        session.add(LibraryComponent(
            id=comp_id,
            component_type="atomic",
            name=name,
            description=desc,
            complexity_level=complexity,
            complexity_score=score,
            version_id="1.0",
            version_status="APPROVED",
            category="EXCLUSIONS",
            category_auto_assigned=False,
            source_origin="ecqi",
            value_set_oid=oid,
            value_set_name=vs_name,
            value_set_version="20240101",
            timing_operator="DURING",
            timing_reference="Measurement Period",
            timing_display="during Measurement Period",
            negation=False,
            resource_type=resource,
            usage_count=usage,
            created_by="system",
            updated_by="system",
        ))

    await session.commit()
    logger.info("Initial seed data committed successfully")

    # Note: The full V10 with all 9 measures, populations, clauses, and data elements
    # is very large (1300+ lines of SQL). For the full seed, run the SQL file directly
    # or import measures via the UI. The above seeds the core component library.
