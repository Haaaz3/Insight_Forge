"""
Enum types for the Insight Forge domain model.
Maps to Java enums from the Spring Boot backend.
"""
from enum import Enum


class PopulationType(str, Enum):
    """FHIR Measure population types."""
    INITIAL_POPULATION = "initial-population"
    DENOMINATOR = "denominator"
    DENOMINATOR_EXCLUSION = "denominator-exclusion"
    DENOMINATOR_EXCEPTION = "denominator-exception"
    NUMERATOR = "numerator"
    NUMERATOR_EXCLUSION = "numerator-exclusion"


class DataElementType(str, Enum):
    """Types of data elements in measure criteria."""
    DIAGNOSIS = "diagnosis"
    ENCOUNTER = "encounter"
    PROCEDURE = "procedure"
    OBSERVATION = "observation"
    MEDICATION = "medication"
    DEMOGRAPHIC = "demographic"
    ASSESSMENT = "assessment"
    IMMUNIZATION = "immunization"
    DEVICE = "device"
    COMMUNICATION = "communication"
    ALLERGY = "allergy"
    GOAL = "goal"


class LogicalOperator(str, Enum):
    """Logical operators for combining criteria."""
    AND = "AND"
    OR = "OR"
    NOT = "NOT"


class MeasureStatus(str, Enum):
    """Status of a measure in the workflow."""
    IN_PROGRESS = "in_progress"
    PUBLISHED = "published"


class MeasureProgram(str, Enum):
    """Quality measure programs/catalogues."""
    MIPS_CQM = "MIPS_CQM"
    ECQM = "eCQM"
    HEDIS = "HEDIS"
    QOF = "QOF"
    REGISTRY = "Registry"
    CUSTOM = "Custom"


class Gender(str, Enum):
    """FHIR Administrative Gender."""
    MALE = "male"
    FEMALE = "female"


class ConfidenceLevel(str, Enum):
    """Confidence levels for AI-parsed content."""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ReviewStatus(str, Enum):
    """Review status for elements."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    NEEDS_REVISION = "needs_revision"


class ApprovalStatus(str, Enum):
    """Approval status for library components."""
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    ARCHIVED = "archived"


class ComplexityLevel(str, Enum):
    """Complexity levels for components."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class TimingOperator(str, Enum):
    """Timing operators for temporal constraints."""
    DURING = "during"
    BEFORE = "before"
    AFTER = "after"
    STARTS_DURING = "starts during"
    ENDS_DURING = "ends during"
    STARTS_BEFORE = "starts before"
    STARTS_AFTER = "starts after"
    ENDS_BEFORE = "ends before"
    ENDS_AFTER = "ends after"
    WITHIN = "within"
    OVERLAPS = "overlaps"
    BEFORE_END_OF = "before end of"
    AFTER_START_OF = "after start of"


class CodeSystem(str, Enum):
    """Clinical terminology code systems."""
    ICD10 = "ICD10"
    ICD10CM = "ICD10CM"
    ICD10PCS = "ICD10PCS"
    SNOMED = "SNOMED"
    CPT = "CPT"
    HCPCS = "HCPCS"
    LOINC = "LOINC"
    RXNORM = "RxNorm"
    CVX = "CVX"
    NDC = "NDC"

    @property
    def uri(self) -> str:
        """Return the FHIR URI for this code system."""
        uris = {
            "ICD10": "http://hl7.org/fhir/sid/icd-10",
            "ICD10CM": "http://hl7.org/fhir/sid/icd-10-cm",
            "ICD10PCS": "http://www.cms.gov/Medicare/Coding/ICD10",
            "SNOMED": "http://snomed.info/sct",
            "CPT": "http://www.ama-assn.org/go/cpt",
            "HCPCS": "https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets",
            "LOINC": "http://loinc.org",
            "RxNorm": "http://www.nlm.nih.gov/research/umls/rxnorm",
            "CVX": "http://hl7.org/fhir/sid/cvx",
            "NDC": "http://hl7.org/fhir/sid/ndc",
        }
        return uris.get(self.value, "")


class CorrectionType(str, Enum):
    """Types of extraction corrections."""
    ELEMENT_TYPE = "element_type"
    TIMING = "timing"
    VALUE_SET = "value_set"
    THRESHOLD = "threshold"
    NEGATION = "negation"
    DESCRIPTION = "description"
    OTHER = "other"


class ComponentCategory(str, Enum):
    """Categories for library components."""
    DIAGNOSIS = "diagnosis"
    ENCOUNTER = "encounter"
    PROCEDURE = "procedure"
    OBSERVATION = "observation"
    MEDICATION = "medication"
    DEMOGRAPHIC = "demographic"
    ASSESSMENT = "assessment"
    IMMUNIZATION = "immunization"
    DEVICE = "device"
    COMMUNICATION = "communication"
    ALLERGY = "allergy"
    GOAL = "goal"
    COMPOSITE = "composite"
    OTHER = "other"
