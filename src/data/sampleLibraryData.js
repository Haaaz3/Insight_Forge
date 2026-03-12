/**
 * Sample Component Library Test Data
 *
 * Use this to seed the library for testing and development.
 *
 * Codes are sourced from the public FHIR VSAC package:
 * https://github.com/FHIR/packages/tree/master/packages/us.nlm.vsac
 */

// Real VSAC codes for Office Visit (OID: 2.16.840.1.113883.3.464.1003.101.12.1001)
const OFFICE_VISIT_CODES = [
  { code: '185349003', display: 'Encounter for check up (procedure)', system: 'SNOMED' },
  { code: '185463005', display: 'Visit out of hours (procedure)', system: 'SNOMED' },
  { code: '185464004', display: 'Out of hours visit - not night visit (procedure)', system: 'SNOMED' },
  { code: '185465003', display: 'Weekend visit (procedure)', system: 'SNOMED' },
  { code: '3391000175108', display: 'Office visit for pediatric care and assessment (procedure)', system: 'SNOMED' },
  { code: '439740005', display: 'Postoperative follow-up visit (procedure)', system: 'SNOMED' },
  { code: '99202', display: 'Office or other outpatient visit for new patient evaluation (straightforward)', system: 'CPT' },
  { code: '99203', display: 'Office or other outpatient visit for new patient evaluation (low complexity)', system: 'CPT' },
  { code: '99204', display: 'Office or other outpatient visit for new patient evaluation (moderate complexity)', system: 'CPT' },
  { code: '99205', display: 'Office or other outpatient visit for new patient evaluation (high complexity)', system: 'CPT' },
  { code: '99212', display: 'Office or other outpatient visit for established patient (straightforward)', system: 'CPT' },
  { code: '99213', display: 'Office or other outpatient visit for established patient (low complexity)', system: 'CPT' },
  { code: '99214', display: 'Office or other outpatient visit for established patient (moderate complexity)', system: 'CPT' },
  { code: '99215', display: 'Office or other outpatient visit for established patient (high complexity)', system: 'CPT' },
];

// Real VSAC codes for Home Healthcare Services (OID: 2.16.840.1.113883.3.464.1003.101.12.1016)
const HOME_HEALTHCARE_CODES = [
  { code: '185460008', display: 'Home visit request by patient (procedure)', system: 'SNOMED' },
  { code: '185462000', display: 'Home visit request by relative (procedure)', system: 'SNOMED' },
  { code: '185466002', display: 'Home visit for urgent condition (procedure)', system: 'SNOMED' },
  { code: '185467006', display: 'Home visit for acute condition (procedure)', system: 'SNOMED' },
  { code: '185468001', display: 'Home visit for chronic condition (procedure)', system: 'SNOMED' },
  { code: '185470005', display: 'Home visit elderly assessment (procedure)', system: 'SNOMED' },
  { code: '225929007', display: 'Joint home visit (procedure)', system: 'SNOMED' },
  { code: '315205008', display: 'Bank holiday home visit (procedure)', system: 'SNOMED' },
  { code: '439708006', display: 'Home visit (procedure)', system: 'SNOMED' },
  { code: '698704008', display: 'Home visit for rheumatology service (procedure)', system: 'SNOMED' },
  { code: '704126008', display: 'Home visit for anticoagulant drug monitoring (procedure)', system: 'SNOMED' },
  { code: '99341', display: 'Home or residence visit for evaluation and management of new patient', system: 'CPT' },
  { code: '99342', display: 'Home or residence visit for evaluation and management of new patient', system: 'CPT' },
  { code: '99344', display: 'Home or residence visit for evaluation and management of new patient', system: 'CPT' },
  { code: '99345', display: 'Home or residence visit for evaluation and management of new patient', system: 'CPT' },
  { code: '99347', display: 'Home or residence visit for evaluation and management of established patient', system: 'CPT' },
  { code: '99348', display: 'Home or residence visit for evaluation and management of established patient', system: 'CPT' },
  { code: '99349', display: 'Home or residence visit for evaluation and management of established patient', system: 'CPT' },
  { code: '99350', display: 'Home or residence visit for evaluation and management of established patient', system: 'CPT' },
];

// Real VSAC codes for Preventive Care Services (OID: 2.16.840.1.113883.3.464.1003.101.12.1027)
const PREVENTIVE_CARE_CODES = [
  { code: '99411', display: 'Preventive medicine counseling and/or risk factor reduction intervention(s) provided to individuals in a group setting (separate procedure); approximately 30 minutes', system: 'CPT' },
  { code: '99412', display: 'Preventive medicine counseling and/or risk factor reduction intervention(s) provided to individuals in a group setting (separate procedure); approximately 60 minutes', system: 'CPT' },
];

// Real VSAC codes for Annual Wellness Visit (OID: 2.16.840.1.113883.3.526.3.1240)
const ANNUAL_WELLNESS_CODES = [
  { code: '444971000124105', display: 'Annual wellness visit (procedure)', system: 'SNOMED' },
  { code: '456201000124103', display: 'Medicare annual wellness visit (procedure)', system: 'SNOMED' },
  { code: '86013001', display: 'Periodic reevaluation and management of healthy individual (procedure)', system: 'SNOMED' },
  { code: '866149003', display: 'Annual visit (procedure)', system: 'SNOMED' },
  { code: '90526000', display: 'Initial evaluation and management of healthy individual (procedure)', system: 'SNOMED' },
  { code: 'G0402', display: 'Initial preventive physical examination; face-to-face visit, services limited to new beneficiary during the first 12 months of medicare enrollment', system: 'HCPCS' },
  { code: 'G0438', display: 'Annual wellness visit; includes a personalized prevention plan of service (pps), initial visit', system: 'HCPCS' },
  { code: 'G0439', display: 'Annual wellness visit, includes a personalized prevention plan of service (pps), subsequent visit', system: 'HCPCS' },
];

// Real VSAC codes for Online Assessments (OID: 2.16.840.1.113883.3.464.1003.101.12.1089)
const ONLINE_ASSESSMENT_CODES = [
  { code: '98970', display: 'Nonphysician qualified health care professional online digital assessment and management, for an established patient, for up to 7 days, cumulative time during the 7 days; 5-10 minutes', system: 'CPT' },
  { code: '98971', display: 'Nonphysician qualified health care professional online digital assessment and management, for an established patient, for up to 7 days, cumulative time during the 7 days; 11-20 minutes', system: 'CPT' },
  { code: '98972', display: 'Nonphysician qualified health care professional online digital assessment and management, for an established patient, for up to 7 days, cumulative time during the 7 days; 21 or more minutes', system: 'CPT' },
  { code: '98980', display: 'Remote therapeutic monitoring treatment management services, physician or other qualified health care professional time in a calendar month requiring at least one interactive communication with the patient or caregiver during the calendar month; first 20 minutes', system: 'CPT' },
  { code: '98981', display: 'Remote therapeutic monitoring treatment management services, physician or other qualified health care professional time in a calendar month requiring at least one interactive communication with the patient or caregiver during the calendar month; each additional 20 minutes', system: 'CPT' },
  { code: '99421', display: 'Online digital evaluation and management service, for an established patient, for up to 7 days, cumulative time during the 7 days; 5-10 minutes', system: 'CPT' },
  { code: '99422', display: 'Online digital evaluation and management service, for an established patient, for up to 7 days, cumulative time during the 7 days; 11-20 minutes', system: 'CPT' },
  { code: '99423', display: 'Online digital evaluation and management service, for an established patient, for up to 7 days, cumulative time during the 7 days; 21 or more minutes', system: 'CPT' },
  { code: '99457', display: 'Remote physiologic monitoring treatment management services, clinical staff/physician/other qualified health care professional time in a calendar month requiring interactive communication with the patient/caregiver during the month; first 20 minutes', system: 'CPT' },
  { code: '99458', display: 'Remote physiologic monitoring treatment management services, clinical staff/physician/other qualified health care professional time in a calendar month requiring interactive communication with the patient/caregiver during the month; each additional 20 minutes', system: 'CPT' },
  { code: 'G0071', display: 'Payment for communication technology-based services for 5 minutes or more of a virtual (non-face-to-face) communication between an rural health clinic (rhc) or federally qualified health center (fqhc) practitioner and rhc or fqhc patient', system: 'HCPCS' },
  { code: 'G2010', display: 'Remote evaluation of recorded video and/or images submitted by an established patient (e.g., store and forward), including interpretation with follow-up with the patient within 24 business hours', system: 'HCPCS' },
  { code: 'G2250', display: 'Remote assessment of recorded video and/or images submitted by an established patient (e.g., store and forward), including interpretation with follow-up with the patient within 24 business hours', system: 'HCPCS' },
  { code: 'G2251', display: 'Brief communication technology-based service, e.g. virtual check-in, by a qualified health care professional who cannot report evaluation and management services, provided to an established patient; 5-10 minutes of clinical discussion', system: 'HCPCS' },
  { code: 'G2252', display: 'Brief communication technology-based service, e.g. virtual check-in, by a physician or other qualified health care professional who can report evaluation and management services, provided to an established patient; 11-20 minutes of medical discussion', system: 'HCPCS' },
];

// Real VSAC codes for Hospice Care Ambulatory (OID: 2.16.840.1.113762.1.4.1108.15)
const HOSPICE_INTERVENTION_CODES = [
  { code: '170935008', display: 'Full care by hospice (finding)', system: 'SNOMED' },
  { code: '170936009', display: 'Shared care - hospice and general practitioner (finding)', system: 'SNOMED' },
  { code: '385763009', display: 'Hospice care (regime/therapy)', system: 'SNOMED' },
];





// Import standard value sets for code backfilling
import {
  COLONOSCOPY_VALUE_SET,
  HOSPICE_CARE_VALUE_SET,
  HYSTERECTOMY_NO_CERVIX_VALUE_SET,
} from '../constants/standardValueSets';

// ============================================================================
// Sample Atomic Components
// ============================================================================

export const sampleAtomics                                        = [
  // Demographics - Parameterized Age Requirement component
  {
    type: 'atomic',
    id: 'comp-demographic-age-requirement',
    name: 'Age Requirement',
    description: 'Configurable patient age range during the measurement period',
    subtype: 'age',
    // No hardcoded thresholds — these live on the measure instance
    // The component is a template; each measure configures its own range
    thresholds: null,
    valueSet: {
      oid: 'N/A',
      version: 'N/A',
      name: 'Demographic Constraint',
    },
    timing: {
      referencePoint: 'end_of_measurement_period', // default, user can change
    },
    negation: false,
    dueDateDays: null, // Demographics - not applicable
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version - parameterized age requirement',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'demographics',
      tags: ['age', 'standard', 'configurable'],
      source: { origin: 'ecqi' },
    },
  },

  // Patient Sex: Female - Demographics (Sex/Gender component)
  {
    type: 'atomic',
    id: 'patient-sex-female',
    name: 'Patient Sex: Female',
    description: 'Patient administrative gender is female (FHIR Patient.gender = "female"). Used for sex-specific measures like Breast Cancer Screening and Cervical Cancer Screening.',
    // Sex/Gender component detection fields
    resourceType: 'Patient',
    genderValue: 'female',
    valueSet: {
      oid: '2.16.840.1.113883.4.642.3.1',
      version: 'FHIR R4',
      name: 'Administrative Gender',
    },
    // Sex is immutable - no timing constraint
    timing: null,
    negation: false,
    dueDateDays: null, // Demographics - not applicable
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version - Patient sex demographic component',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'demographics',
      tags: ['sex', 'gender', 'female', 'demographic', 'patient'],
      source: { origin: 'ecqi' },
    },
  },

  // Patient Sex: Male - Demographics (Sex/Gender component)
  {
    type: 'atomic',
    id: 'patient-sex-male',
    name: 'Patient Sex: Male',
    description: 'Patient administrative gender is male (FHIR Patient.gender = "male"). Used for sex-specific measures like Prostate Cancer Screening.',
    // Sex/Gender component detection fields
    resourceType: 'Patient',
    genderValue: 'male',
    valueSet: {
      oid: '2.16.840.1.113883.4.642.3.1',
      version: 'FHIR R4',
      name: 'Administrative Gender',
    },
    // Sex is immutable - no timing constraint
    timing: null,
    negation: false,
    dueDateDays: null, // Demographics - not applicable
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version - Patient sex demographic component',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'demographics',
      tags: ['sex', 'gender', 'male', 'demographic', 'patient'],
      source: { origin: 'ecqi' },
    },
  },

  // Patient Sex: Female (Generic) - Simple variant for HEDIS/MIPS/QOF measures
  {
    type: 'atomic',
    id: 'patient-sex-female-generic',
    name: 'Patient Sex: Female (Simple)',
    description: 'Patient sex: Female. Simple demographic constraint for non-FHIR measures.',
    // Sex/Gender component detection fields
    resourceType: 'Patient',
    genderValue: 'female',
    valueSet: null,
    // Sex is immutable - no timing constraint
    timing: null,
    negation: false,
    dueDateDays: null,
    dueDateDaysOverridden: false,
    catalogues: ['HEDIS', 'MIPS', 'eCQM', 'QOF'],
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version - Generic patient sex component',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'demographics',
      tags: ['sex', 'gender', 'female', 'demographic', 'patient', 'simple'],
      source: { origin: 'ecqi' },
    },
  },

  // Patient Sex: Male (Generic) - Simple variant for HEDIS/MIPS/QOF measures
  {
    type: 'atomic',
    id: 'patient-sex-male-generic',
    name: 'Patient Sex: Male (Simple)',
    description: 'Patient sex: Male. Simple demographic constraint for non-FHIR measures.',
    // Sex/Gender component detection fields
    resourceType: 'Patient',
    genderValue: 'male',
    valueSet: null,
    // Sex is immutable - no timing constraint
    timing: null,
    negation: false,
    dueDateDays: null,
    dueDateDaysOverridden: false,
    catalogues: ['HEDIS', 'MIPS', 'eCQM', 'QOF'],
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version - Generic patient sex component',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'demographics',
      tags: ['sex', 'gender', 'male', 'demographic', 'patient', 'simple'],
      source: { origin: 'ecqi' },
    },
  },

  // Encounters - Low complexity
  {
    type: 'atomic',
    id: 'office-visit-during-mp',
    name: 'Office Visit during MP',
    description: 'Office visit encounter during the measurement period',
    valueSet: {
      oid: '2.16.840.1.113883.3.464.1003.101.12.1001',
      version: '20240101',
      name: 'Office Visit',
      codes: OFFICE_VISIT_CODES,
    },
    timing: {
      operator: 'during',
      reference: 'Measurement Period',
      displayExpression: 'during Measurement Period',
    },
    negation: false,
    dueDateDays: 365, // During MP → Annual
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'encounters',
      tags: ['encounter', 'outpatient', 'standard'],
      source: { origin: 'ecqi' },
    },
  },

  {
    type: 'atomic',
    id: 'home-healthcare-during-mp',
    name: 'Home Healthcare Services during MP',
    description: 'Home healthcare services encounter during the measurement period',
    valueSet: {
      oid: '2.16.840.1.113883.3.464.1003.101.12.1016',
      version: '20240101',
      name: 'Home Healthcare Services',
      codes: HOME_HEALTHCARE_CODES,
    },
    timing: {
      operator: 'during',
      reference: 'Measurement Period',
      displayExpression: 'during Measurement Period',
    },
    negation: false,
    dueDateDays: 365, // During MP → Annual
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'encounters',
      tags: ['encounter', 'home health', 'standard'],
      source: { origin: 'ecqi' },
    },
  },

  {
    type: 'atomic',
    id: 'preventive-care-during-mp',
    name: 'Preventive Care Services during MP',
    description: 'Preventive care services encounter during the measurement period',
    valueSet: {
      oid: '2.16.840.1.113883.3.464.1003.101.12.1027',
      version: '20240101',
      name: 'Preventive Care Services - Established Office Visit, 18 and Up',
      codes: PREVENTIVE_CARE_CODES,
    },
    timing: {
      operator: 'during',
      reference: 'Measurement Period',
      displayExpression: 'during Measurement Period',
    },
    negation: false,
    dueDateDays: 365, // During MP → Annual
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'encounters',
      tags: ['encounter', 'preventive', 'standard'],
      source: { origin: 'ecqi' },
    },
  },

  {
    type: 'atomic',
    id: 'annual-wellness-during-mp',
    name: 'Annual Wellness Visit during MP',
    description: 'Annual wellness visit encounter during the measurement period',
    valueSet: {
      oid: '2.16.840.1.113883.3.526.3.1240',
      version: '20240101',
      name: 'Annual Wellness Visit',
      codes: ANNUAL_WELLNESS_CODES,
    },
    timing: {
      operator: 'during',
      reference: 'Measurement Period',
      displayExpression: 'during Measurement Period',
    },
    negation: false,
    dueDateDays: 365, // During MP → Annual
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'encounters',
      tags: ['encounter', 'wellness', 'standard'],
      source: { origin: 'ecqi' },
    },
  },

  {
    type: 'atomic',
    id: 'online-assessment-during-mp',
    name: 'Online Assessment during MP',
    description: 'Online assessment encounter during the measurement period',
    valueSet: {
      oid: '2.16.840.1.113883.3.464.1003.101.12.1089',
      version: '20240101',
      name: 'Online Assessments',
      codes: ONLINE_ASSESSMENT_CODES,
    },
    timing: {
      operator: 'during',
      reference: 'Measurement Period',
      displayExpression: 'during Measurement Period',
    },
    negation: false,
    dueDateDays: 365, // During MP → Annual
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'encounters',
      tags: ['encounter', 'telehealth', 'standard'],
      source: { origin: 'ecqi' },
    },
  },

  // Procedures - Medium complexity (longer lookback)
  {
    type: 'atomic',
    id: 'colonoscopy-within-10-years',
    name: 'Colonoscopy within 10 years before end of MP',
    description: 'Colonoscopy procedure performed within 10 years before the end of measurement period',
    valueSet: {
      oid: COLONOSCOPY_VALUE_SET.oid,
      version: '20240101',
      name: COLONOSCOPY_VALUE_SET.name,
      codes: COLONOSCOPY_VALUE_SET.codes,
    },
    timing: {
      operator: 'within',
      quantity: 10,
      unit: 'years',
      position: 'before end of',
      reference: 'Measurement Period',
      displayExpression: 'within 10 years before end of Measurement Period',
    },
    negation: false,
    dueDateDays: 3650, // 10 years × 365
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'procedures',
      tags: ['screening', 'colorectal'],
      source: { origin: 'ecqi', originalMeasureId: 'CMS130' },
    },
  },

  // Exclusions - Medium complexity
  {
    type: 'atomic',
    id: 'hospice-encounter-during-mp',
    name: 'Hospice Encounter during MP',
    description: 'Hospice care encounter during the measurement period',
    valueSet: {
      oid: HOSPICE_CARE_VALUE_SET.oid,
      version: '20240101',
      name: 'Hospice Encounter',
      codes: HOSPICE_CARE_VALUE_SET.codes,
    },
    timing: {
      operator: 'during',
      reference: 'Measurement Period',
      displayExpression: 'during Measurement Period',
    },
    negation: false,
    dueDateDays: 365, // During MP → Annual
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'exclusions',
      tags: ['hospice', 'exclusion', 'standard'],
      source: { origin: 'ecqi' },
    },
  },

  {
    type: 'atomic',
    id: 'hospice-intervention-during-mp',
    name: 'Hospice Intervention during MP',
    description: 'Hospice intervention during the measurement period',
    valueSet: {
      oid: '2.16.840.1.113762.1.4.1108.15',
      version: '20240101',
      name: 'Hospice Care Ambulatory',
      codes: HOSPICE_INTERVENTION_CODES,
    },
    timing: {
      operator: 'during',
      reference: 'Measurement Period',
      displayExpression: 'during Measurement Period',
    },
    negation: false,
    dueDateDays: 365, // During MP → Annual
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'exclusions',
      tags: ['hospice', 'exclusion', 'standard'],
      source: { origin: 'ecqi' },
    },
  },

  // Conditions with negation - Higher complexity
  {
    type: 'atomic',
    id: 'absence-of-cervix',
    name: 'Absence of Cervix',
    description: 'Patient has documented absence of cervix (congenital or surgical)',
    valueSet: {
      oid: HYSTERECTOMY_NO_CERVIX_VALUE_SET.oid,
      version: '20240101',
      name: 'Absence of Cervix',
      codes: HYSTERECTOMY_NO_CERVIX_VALUE_SET.codes,
    },
    timing: {
      operator: 'starts before',
      position: 'before end of',
      reference: 'Measurement Period',
      displayExpression: 'starts before end of Measurement Period',
    },
    negation: true, // This is used as an exclusion - "absence of" concept
    dueDateDays: null, // Negation - not applicable
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T10:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T10:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T10:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T10:00:00Z',
      updatedBy: 'system',
      category: 'exclusions',
      tags: ['exclusion', 'anatomical'],
      source: { origin: 'ecqi', originalMeasureId: 'CMS125' },
    },
  },
];

// ============================================================================
// Sample Composite Components  
// ============================================================================

export const sampleComposites                                           = [
  {
    type: 'composite',
    id: 'qualifying-encounter-cms130',
    name: 'Qualifying Encounter (Standard)',
    description: 'Standard eCQM qualifying encounter pattern used across multiple measures',
    operator: 'OR',
    children: [
      { componentId: 'office-visit-during-mp', versionId: '1.0', displayName: 'Office Visit during MP' },
      { componentId: 'home-healthcare-during-mp', versionId: '1.0', displayName: 'Home Healthcare Services during MP' },
      { componentId: 'preventive-care-during-mp', versionId: '1.0', displayName: 'Preventive Care Services during MP' },
      { componentId: 'annual-wellness-during-mp', versionId: '1.0', displayName: 'Annual Wellness Visit during MP' },
      { componentId: 'online-assessment-during-mp', versionId: '1.0', displayName: 'Online Assessment during MP' },
    ],
    dueDateDays: 365, // Composite default - Annual
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T12:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T12:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T12:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T12:00:00Z',
      updatedBy: 'system',
      category: 'encounters',
      tags: ['qualifying', 'standard', 'ecqm'],
      source: { origin: 'ecqi' },
    },
  },

  {
    type: 'composite',
    id: 'hospice-exclusion',
    name: 'Hospice Exclusion',
    description: 'Standard hospice exclusion pattern - encounter OR intervention during MP',
    operator: 'OR',
    children: [
      { componentId: 'hospice-encounter-during-mp', versionId: '1.0', displayName: 'Hospice Encounter during MP' },
      { componentId: 'hospice-intervention-during-mp', versionId: '1.0', displayName: 'Hospice Intervention during MP' },
    ],
    dueDateDays: 365, // Composite default - Annual
    dueDateDaysOverridden: false,
    versionInfo: {
      versionId: '1.0',
      versionHistory: [
        {
          versionId: '1.0',
          status: 'approved',
          createdAt: '2024-01-15T12:00:00Z',
          createdBy: 'system',
          changeDescription: 'Initial version',
        },
      ],
      status: 'approved',
      approvedBy: 'admin',
      approvedAt: '2024-01-15T12:00:00Z',
    },
    usage: {
      measureIds: [],
      usageCount: 0,
    },
    metadata: {
      createdAt: '2024-01-15T12:00:00Z',
      createdBy: 'system',
      updatedAt: '2024-01-15T12:00:00Z',
      updatedBy: 'system',
      category: 'exclusions',
      tags: ['hospice', 'exclusion', 'standard'],
      source: { origin: 'ecqi' },
    },
  },
];

// ============================================================================
// Sample Library Structure
// ============================================================================

export const sampleCategories                  = [
  {
    category: 'demographics',
    displayName: 'Demographics',
    componentIds: ['comp-demographic-age-requirement', 'patient-sex-female', 'patient-sex-male', 'patient-sex-female-generic', 'patient-sex-male-generic'],
    sortOrder: 1,
  },
  {
    category: 'encounters',
    displayName: 'Encounters',
    componentIds: [
      'office-visit-during-mp',
      'home-healthcare-during-mp',
      'preventive-care-during-mp',
      'annual-wellness-during-mp',
      'online-assessment-during-mp',
      'qualifying-encounter-cms130',
    ],
    sortOrder: 2,
  },
  {
    category: 'procedures',
    displayName: 'Procedures',
    componentIds: ['colonoscopy-within-10-years'],
    sortOrder: 3,
  },
  {
    category: 'exclusions',
    displayName: 'Exclusions',
    componentIds: [
      'hospice-encounter-during-mp',
      'hospice-intervention-during-mp',
      'hospice-exclusion',
      'absence-of-cervix',
    ],
    sortOrder: 4,
  },
];

// ============================================================================
// Expected Complexity Scores (for testing)
// ============================================================================

export const expectedComplexityScores                                                   = {
  'office-visit-during-mp': { score: 2, level: 'low' },           // base(1) + timing(1)
  'home-healthcare-during-mp': { score: 2, level: 'low' },        // base(1) + timing(1)
  'colonoscopy-within-10-years': { score: 3, level: 'low' },      // base(1) + timing(2) - "within X before"
  'absence-of-cervix': { score: 5, level: 'medium' },             // base(1) + timing(2) + negation(2)
  'hospice-exclusion': { score: 4, level: 'medium' },             // 2 children * 2 each = 4
  'qualifying-encounter-cms130': { score: 10, level: 'high' },    // 5 children * 2 each = 10
};
