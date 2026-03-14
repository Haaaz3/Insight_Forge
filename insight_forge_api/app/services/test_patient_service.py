"""
Test patient service for CRUD operations.
"""
import json
import logging
import uuid
from datetime import date, datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.validation import FhirTestPatient, TestPatient
from app.schemas.test_patient import (
    CreateTestPatientRequest,
    FhirTestPatientDetailDto,
    FhirTestPatientSummaryDto,
    UpdateTestPatientRequest,
)

logger = logging.getLogger(__name__)


class TestPatientService:
    """Service for test patient CRUD operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # FHIR Test Patients
    # =========================================================================

    async def get_all_fhir_test_patients(self) -> List[FhirTestPatientSummaryDto]:
        """Get all FHIR test patients as summaries."""
        result = await self.db.execute(select(FhirTestPatient))
        patients = result.scalars().all()
        return [self._to_fhir_summary_dto(p) for p in patients]

    async def get_fhir_test_patients_for_measure(
        self, measure_id: str
    ) -> List[FhirTestPatientSummaryDto]:
        """Get FHIR test patients for a specific measure."""
        result = await self.db.execute(
            select(FhirTestPatient).where(FhirTestPatient.measure_id == measure_id)
        )
        patients = result.scalars().all()
        return [self._to_fhir_summary_dto(p) for p in patients]

    async def get_fhir_test_patient_by_id(
        self, patient_id: str
    ) -> Optional[FhirTestPatientDetailDto]:
        """Get a FHIR test patient by ID with full details."""
        result = await self.db.execute(
            select(FhirTestPatient).where(FhirTestPatient.id == patient_id)
        )
        patient = result.scalar_one_or_none()
        if patient:
            return self._to_fhir_detail_dto(patient)
        return None

    async def create_fhir_test_patient(
        self, request: CreateTestPatientRequest
    ) -> FhirTestPatientDetailDto:
        """Create a new FHIR test patient."""
        patient = FhirTestPatient(
            id=str(uuid.uuid4()),
            measure_id=request.measureId,
            test_case_name=request.testCaseName,
            description=request.description,
            fhir_bundle=request.fhirBundle,
            expected_ip=request.expectedIp,
            expected_den=request.expectedDen,
            expected_denex=request.expectedDenex,
            expected_num=request.expectedNum,
            expected_denexcep=request.expectedDenexcep,
            patient_gender=request.patientGender,
            patient_birth_date=request.patientBirthDate,
        )

        self.db.add(patient)
        await self.db.commit()
        await self.db.refresh(patient)

        logger.info(f"Created FHIR test patient: {patient.test_case_name} ({patient.id})")
        return self._to_fhir_detail_dto(patient)

    async def update_fhir_test_patient(
        self, patient_id: str, request: UpdateTestPatientRequest
    ) -> Optional[FhirTestPatientDetailDto]:
        """Update an existing FHIR test patient."""
        result = await self.db.execute(
            select(FhirTestPatient).where(FhirTestPatient.id == patient_id)
        )
        patient = result.scalar_one_or_none()
        if not patient:
            return None

        if request.testCaseName is not None:
            patient.test_case_name = request.testCaseName
        if request.description is not None:
            patient.description = request.description
        if request.fhirBundle is not None:
            patient.fhir_bundle = request.fhirBundle
        if request.expectedIp is not None:
            patient.expected_ip = request.expectedIp
        if request.expectedDen is not None:
            patient.expected_den = request.expectedDen
        if request.expectedDenex is not None:
            patient.expected_denex = request.expectedDenex
        if request.expectedNum is not None:
            patient.expected_num = request.expectedNum
        if request.expectedDenexcep is not None:
            patient.expected_denexcep = request.expectedDenexcep
        if request.patientGender is not None:
            patient.patient_gender = request.patientGender
        if request.patientBirthDate is not None:
            patient.patient_birth_date = request.patientBirthDate

        await self.db.commit()
        await self.db.refresh(patient)

        logger.info(f"Updated FHIR test patient: {patient.test_case_name} ({patient.id})")
        return self._to_fhir_detail_dto(patient)

    async def delete_fhir_test_patient(self, patient_id: str) -> bool:
        """Delete a FHIR test patient."""
        result = await self.db.execute(
            select(FhirTestPatient).where(FhirTestPatient.id == patient_id)
        )
        patient = result.scalar_one_or_none()
        if not patient:
            return False

        await self.db.delete(patient)
        await self.db.commit()

        logger.info(f"Deleted FHIR test patient: {patient_id}")
        return True

    # =========================================================================
    # Legacy Test Patients
    # =========================================================================

    async def get_all_test_patients(self) -> List[TestPatient]:
        """Get all legacy test patients."""
        result = await self.db.execute(select(TestPatient))
        return list(result.scalars().all())

    async def get_test_patient_by_id(self, patient_id: str) -> Optional[TestPatient]:
        """Get a legacy test patient by ID."""
        result = await self.db.execute(
            select(TestPatient).where(TestPatient.id == patient_id)
        )
        return result.scalar_one_or_none()

    # =========================================================================
    # DTO Conversion
    # =========================================================================

    def _to_fhir_summary_dto(self, patient: FhirTestPatient) -> FhirTestPatientSummaryDto:
        """Convert FHIR test patient to summary DTO."""
        return FhirTestPatientSummaryDto(
            id=patient.id,
            measureId=patient.measure_id,
            testCaseName=patient.test_case_name,
            description=patient.description,
            expectedIp=patient.expected_ip,
            expectedDen=patient.expected_den,
            expectedDenex=patient.expected_denex,
            expectedNum=patient.expected_num,
            expectedDenexcep=patient.expected_denexcep,
            patientGender=patient.patient_gender,
            patientBirthDate=patient.patient_birth_date,
        )

    def _to_fhir_detail_dto(self, patient: FhirTestPatient) -> FhirTestPatientDetailDto:
        """Convert FHIR test patient to detail DTO."""
        return FhirTestPatientDetailDto(
            id=patient.id,
            measureId=patient.measure_id,
            testCaseName=patient.test_case_name,
            description=patient.description,
            fhirBundle=patient.fhir_bundle,
            expectedIp=patient.expected_ip,
            expectedDen=patient.expected_den,
            expectedDenex=patient.expected_denex,
            expectedNum=patient.expected_num,
            expectedDenexcep=patient.expected_denexcep,
            patientGender=patient.patient_gender,
            patientBirthDate=patient.patient_birth_date,
            createdAt=patient.created_at.isoformat() if patient.created_at else None,
            updatedAt=patient.updated_at.isoformat() if patient.updated_at else None,
        )
