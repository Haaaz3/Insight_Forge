"""
Validation-related models.
Contains TestPatient and ClassifierFeedback entities.
"""
from datetime import date, datetime
from typing import Optional

from sqlalchemy import Boolean, Date, DateTime, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import AuditableEntity


class TestPatient(AuditableEntity):
    """
    Test patient for measure validation.
    Contains static clinical data used to test measure criteria.
    """

    __tablename__ = "test_patient"
    __table_args__ = (
        Index("idx_test_patient_name", "name"),
        Index("idx_test_patient_gender", "gender"),
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    gender: Mapped[str] = mapped_column(String(20), nullable=False)
    race: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ethnicity: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # JSON arrays of clinical data
    diagnoses: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    encounters: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    procedures: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    observations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    medications: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    immunizations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class FhirTestPatient(AuditableEntity):
    """
    FHIR-based test patient with expected outcomes.
    Contains a full FHIR bundle and expected measure results.
    """

    __tablename__ = "fhir_test_patient"
    __table_args__ = (
        Index("idx_fhir_test_patient_measure", "measure_id"),
        Index("idx_fhir_test_patient_name", "test_case_name"),
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    measure_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    test_case_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # FHIR bundle as JSON string
    fhir_bundle: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Expected outcomes
    expected_ip: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    expected_den: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    expected_denex: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    expected_num: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    expected_denexcep: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Patient demographics extracted from bundle
    patient_gender: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    patient_birth_date: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)


class ClassifierFeedback(AuditableEntity):
    """
    Entity for storing classifier feedback/training signals.
    Records user confirmations and overrides of catalogue type detection
    for future classifier improvement.
    """

    __tablename__ = "classifier_feedback"
    __table_args__ = (
        Index("idx_classifier_feedback_type", "confirmed_type"),
        Index("idx_classifier_feedback_override", "was_overridden"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_name: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    detected_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    confirmed_type: Mapped[str] = mapped_column(String(50), nullable=False)
    was_overridden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    confidence: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    signals: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
