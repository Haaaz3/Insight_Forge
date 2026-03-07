/**
 * API Response Transformers
 *
 * Converts backend DTOs to frontend types.
 */

                                                                                                           
                                                                   
             
                       
                       
                
              
                    
                  
               
                
                 
                  
                  
              
                      
             
                   
                  
                     
                    
                 
                    
                   
                      
                       
                 
                    
                                   

// ============================================================================
// Measure Transformers
// ============================================================================

function mapConfidence(confidence               )                  {
  if (confidence === 'HIGH' || confidence === 'high') return 'high';
  if (confidence === 'LOW' || confidence === 'low') return 'low';
  return 'medium';
}

function mapReviewStatus(status               )               {
  if (status === 'APPROVED' || status === 'approved') return 'approved';
  if (status === 'FLAGGED' || status === 'flagged') return 'flagged';
  if (status === 'NEEDS_REVISION' || status === 'needs_revision') return 'needs_revision';
  return 'pending';
}

function mapMeasureStatus(status               )                {
  if (status === 'PUBLISHED' || status === 'published') return 'published';
  return 'in_progress';
}

function mapPopulationType(type        )                 {
  const mapping                                 = {
    'INITIAL_POPULATION': 'initial-population',
    'DENOMINATOR': 'denominator',
    'DENOMINATOR_EXCLUSION': 'denominator-exclusion',
    'DENOMINATOR_EXCEPTION': 'denominator-exception',
    'NUMERATOR': 'numerator',
    'NUMERATOR_EXCLUSION': 'numerator-exclusion',
  };
  return mapping[type] || 'initial-population';
}

function mapLogicalOperator(operator        )                  {
  if (operator === 'OR') return 'OR';
  if (operator === 'NOT') return 'NOT';
  return 'AND';
}

function mapElementType(type        )                  {
  const mapping                                  = {
    'DIAGNOSIS': 'diagnosis',
    'ENCOUNTER': 'encounter',
    'PROCEDURE': 'procedure',
    'OBSERVATION': 'observation',
    'MEDICATION': 'medication',
    'DEMOGRAPHIC': 'demographic',
    'IMMUNIZATION': 'immunization',
    'DEVICE': 'device',
    'ASSESSMENT': 'assessment',
    'ALLERGY': 'allergy',
    'COMMUNICATION': 'communication',
    'GOAL': 'goal',
  };
  return mapping[type] || 'observation';
}

function mapMeasureType(type               )              {
  if (type === 'outcome') return 'outcome';
  if (type === 'structure') return 'structure';
  if (type === 'patient_experience') return 'patient_experience';
  return 'process';
}

function mapProgram(program               )                                                                {
  if (program === 'MIPS_CQM' || program === 'MIPS') return 'MIPS_CQM';
  if (program === 'eCQM') return 'eCQM';
  if (program === 'HEDIS') return 'HEDIS';
  if (program === 'QOF') return 'QOF';
  if (program === 'Registry') return 'Registry';
  return 'Custom';
}

function mapComparator(comp                           )                                                   {
  if (comp === '>' || comp === '>=' || comp === '<' || comp === '<=' || comp === '=' || comp === '!=') {
    return comp;
  }
  return undefined;
}

function transformDataElement(dto                )              {
  // Transform valueSets from backend if present
  const valueSets = dto.valueSets?.map(vs => ({
    id: vs.id || vs.oid || '',
    oid: vs.oid || '',
    name: vs.name || '',
    version: vs.version || '',
    source: vs.source || 'backend',
    verified: vs.verified || false,
    codes: vs.codes?.map(c => ({
      code: c.code || '',
      system: c.system || '',
      display: c.display || '',
    })) || [],
    totalCodeCount: vs.codes?.length || 0,
  })) || [];

  // Use first value set as the primary (backward compat with single-valueSet code paths)
  const valueSet = valueSets.length > 0 ? valueSets[0] : undefined;

  // Parse JSON fields that the backend stores as TEXT columns
  let timingWindow = undefined;
  if (dto.timingWindow) {
    try { timingWindow = JSON.parse(dto.timingWindow); } catch { /* ignore */ }
  }
  let additionalRequirements = undefined;
  if (dto.additionalRequirements) {
    try { additionalRequirements = JSON.parse(dto.additionalRequirements); } catch { /* ignore */ }
  }

  return {
    id: dto.id,
    type: mapElementType(dto.elementType),
    description: dto.description || '',
    libraryComponentId: dto.libraryComponentId || undefined,
    negation: dto.negation || false,
    negationRationale: dto.negationRationale || undefined,
    confidence: mapConfidence(dto.confidence),
    reviewStatus: mapReviewStatus(dto.reviewStatus),
    valueSet,
    valueSets,
    timingWindow,
    additionalRequirements,
    thresholds: dto.thresholds ? {
      ageMin: dto.thresholds.ageMin ?? undefined,
      ageMax: dto.thresholds.ageMax ?? undefined,
      valueMin: dto.thresholds.valueMin ?? undefined,
      valueMax: dto.thresholds.valueMax ?? undefined,
      comparator: mapComparator(dto.thresholds.comparator),
      unit: dto.thresholds.unit || undefined,
    } : undefined,
    // HEDIS-specific fields (only present for HEDIS measures on applicable element types)
    hedis: dto.hedis ? {
      collectionType: dto.hedis.collectionType || null,
      hybridSourceFlag: dto.hedis.hybridSourceFlag || false,
    } : undefined,
  };
}

function transformLogicalClause(dto                  )                {
  // Transform children - they can be either LogicalClause or DataElement
  const children                                  = [];

  // Add transformed data elements
  if (dto.dataElements) {
    children.push(...dto.dataElements.map(transformDataElement));
  }

  // Add transformed nested clauses
  if (dto.children) {
    children.push(...dto.children.map(transformLogicalClause));
  }

  return {
    id: dto.id,
    operator: mapLogicalOperator(dto.operator),
    description: dto.description || '',
    children,
    confidence: mapConfidence(null),
    reviewStatus: mapReviewStatus(null),
  };
}

function transformPopulation(dto               )                       {
  const defaultCriteria                = {
    id: `${dto.id}-criteria`,
    operator: 'AND',
    description: '',
    children: [],
    confidence: 'medium',
    reviewStatus: 'pending',
  };

  return {
    id: dto.id,
    type: mapPopulationType(dto.populationType),
    description: dto.description || '',
    narrative: dto.narrative || undefined,
    criteria: dto.rootClause ? transformLogicalClause(dto.rootClause) : defaultCriteria,
    confidence: mapConfidence(dto.confidence),
    reviewStatus: mapReviewStatus(dto.reviewStatus),
    reviewNotes: dto.reviewNotes || undefined,
    cqlDefinition: dto.cqlDefinition || undefined,
    cqlDefinitionName: dto.cqlDefinitionName || undefined,
  };
}

function transformValueSet(dto             )                    {
  return {
    id: dto.id,
    oid: dto.oid || undefined,
    url: dto.url || undefined,
    name: dto.name,
    version: dto.version || undefined,
    publisher: dto.publisher || undefined,
    purpose: dto.purpose || undefined,
    confidence: mapConfidence(dto.confidence),
    verified: dto.verified,
    source: dto.source || undefined,
    codes: dto.codes?.map(c => ({
      code: c.code,
      display: c.display || '',
      system: c.system        || 'SNOMED',
    })) || [],
  };
}

export function transformMeasureDto(dto            )                       {
  // Count review progress from populations
  let total = 0, approved = 0, pending = 0, flagged = 0;
  const countStatus = (clause                         ) => {
    if (!clause) return;
    clause.dataElements?.forEach(de => {
      total++;
      const status = mapReviewStatus(de.reviewStatus);
      if (status === 'approved') approved++;
      else if (status === 'pending') pending++;
      else if (status === 'flagged' || status === 'needs_revision') flagged++;
    });
    clause.children?.forEach(countStatus);
  };
  dto.populations?.forEach(p => countStatus(p.rootClause));

  return {
    id: dto.id,
    resourceType: 'Measure',
    metadata: {
      measureId: dto.measureId,
      title: dto.title,
      version: dto.version || '1.0.0',
      steward: dto.steward || 'Unknown',
      program: mapProgram(dto.program),
      measureType: mapMeasureType(dto.measureType),
      description: dto.description || '',
      rationale: dto.rationale || undefined,
      clinicalRecommendation: dto.clinicalRecommendation || undefined,
      measurementPeriod: {
        start: dto.periodStart || new Date().getFullYear() + '-01-01',
        end: dto.periodEnd || new Date().getFullYear() + '-12-31',
        inclusive: true,
      },
      lastUpdated: dto.updatedAt || new Date().toISOString(),
    },
    populations: dto.populations?.map(transformPopulation) || [],
    valueSets: dto.valueSets?.map(transformValueSet) || [],
    globalConstraints: dto.globalConstraints ? {
      ageRange: (dto.globalConstraints.ageMin != null || dto.globalConstraints.ageMax != null) ? {
        min: dto.globalConstraints.ageMin ?? 0,
        max: dto.globalConstraints.ageMax ?? 150,
      } : undefined,
      gender: dto.globalConstraints.gender                                         ,
    } : undefined,
    status: mapMeasureStatus(dto.status),
    overallConfidence: mapConfidence(dto.overallConfidence),
    reviewProgress: { total, approved, pending, flagged },
    createdAt: dto.createdAt || new Date().toISOString(),
    updatedAt: dto.updatedAt || new Date().toISOString(),
    createdBy: dto.createdBy || undefined,
    lockedAt: dto.lockedAt || undefined,
    lockedBy: dto.lockedBy || undefined,
    generatedCql: dto.generatedCql || undefined,
    generatedSql: dto.generatedSql || undefined,
    corrections: dto.corrections?.map(c => ({
      id: c.id,
      timestamp: c.timestamp,
      correctionType: c.correctionType       ,
      componentId: c.field || '',
      componentPath: c.field || '',
      originalValue: c.oldValue,
      correctedValue: c.newValue,
      userNotes: c.description || undefined,
      measureContext: {
        measureId: dto.measureId,
        measureType: dto.measureType || 'process',
        program: dto.program || '',
      },
    })) || [],
  };
}

// ============================================================================
// Component Transformers
// ============================================================================

function mapComponentCategory(category                           )                    {
  if (!category) {
    console.warn('[transformers] Component has null/undefined category, defaulting to clinical-observations');
    return 'clinical-observations';
  }
  const mapping                                    = {
    'DEMOGRAPHICS': 'demographics',
    'demographics': 'demographics',
    'CONDITIONS': 'conditions',
    'conditions': 'conditions',
    'ENCOUNTERS': 'encounters',
    'encounters': 'encounters',
    'PROCEDURES': 'procedures',
    'procedures': 'procedures',
    'MEDICATIONS': 'medications',
    'medications': 'medications',
    'OBSERVATIONS': 'clinical-observations',
    'observations': 'clinical-observations',
    'IMMUNIZATIONS': 'medications',
    'immunizations': 'medications',
    'ASSESSMENTS': 'assessments',
    'assessments': 'assessments',
    'CLINICAL_OBSERVATIONS': 'clinical-observations',
    'clinical-observations': 'clinical-observations',
    'EXCLUSIONS': 'exclusions',
    'exclusions': 'exclusions',
    'LABORATORY': 'laboratory',
    'laboratory': 'laboratory',
  };
  const mapped = mapping[category];
  if (!mapped) {
    console.warn(`[transformers] Unknown category "${category}", defaulting to clinical-observations`);
    return 'clinical-observations';
  }
  return mapped;
}

function mapApprovalStatus(status        )                 {
  if (status === 'APPROVED' || status === 'approved') return 'approved';
  if (status === 'ARCHIVED' || status === 'archived') return 'archived';
  if (status === 'PENDING_REVIEW' || status === 'pending_review') return 'pending_review';
  return 'draft';
}

function createDefaultValueSet()                    {
  return {
    oid: '',
    version: '',
    name: 'Unknown',
    codes: [],
  };
}

function createDefaultTiming()                   {
  return {
    operator: 'during',
    reference: 'Measurement Period',
    displayExpression: 'during Measurement Period',
  };
}

function createDefaultComplexity()                      {
  return {
    level: 'LOW',
    score: 1,
    factors: [],
  };
}

function createDefaultVersionInfo(status                )                       {
  const now = new Date().toISOString();
  return {
    versionId: '1.0',
    versionHistory: [{
      versionId: '1.0',
      status,
      createdAt: now,
      createdBy: 'system',
      changeDescription: 'Initial version',
    }],
    status,
  };
}

function _createDefaultUsage()                 {
  return {
    measureIds: [],
    usageCount: 0,
  };
}

function createDefaultMetadata(category                   )                    {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    createdBy: 'system',
    updatedAt: now,
    updatedBy: 'system',
    category,
    tags: [],
    source: { origin: 'ecqi' },
  };
}

export function transformComponentSummary(dto                  )                   {
  const category = mapComponentCategory(dto.category);
  const status = mapApprovalStatus(dto.status);

  // Map complexity level from backend
  const complexityLevel = dto.complexityLevel?.toUpperCase()                                         ;
  const complexity                      = {
    level: complexityLevel || 'LOW',
    score: complexityLevel === 'HIGH' ? 5 : complexityLevel === 'MEDIUM' ? 3 : 1,
    factors: [],
  };

  const atomic                  = {
    type: 'atomic',
    id: dto.id,
    name: dto.name,
    description: dto.description || '',
    valueSet: createDefaultValueSet(),
    timing: createDefaultTiming(),
    negation: false,
    complexity,
    versionInfo: createDefaultVersionInfo(status),
    usage: {
      measureIds: [],
      usageCount: dto.usageCount || 0,
      lastUsedAt: dto.updatedAt || undefined,
    },
    metadata: createDefaultMetadata(category),
    catalogs: dto.catalogs || [],
  };

  return atomic;
}

export function transformComponentDto(dto              )                   {
  const category = mapComponentCategory(dto.metadata?.category);
  const status = mapApprovalStatus(dto.versionInfo?.status);
  const now = new Date().toISOString();

  const versionInfo                       = {
    versionId: dto.versionInfo?.versionId || '1.0',
    versionHistory: dto.versionInfo?.versionHistory?.map(h => ({
      versionId: h.versionId,
      status: mapApprovalStatus(h.status),
      createdAt: h.createdAt,
      createdBy: h.createdBy,
      changeDescription: h.changeDescription,
    })) || [{
      versionId: dto.versionInfo?.versionId || '1.0',
      status,
      createdAt: dto.createdAt || now,
      createdBy: dto.createdBy || 'system',
      changeDescription: 'Initial version',
    }],
    status,
    approvedBy: dto.versionInfo?.approvedBy || undefined,
    approvedAt: dto.versionInfo?.approvedAt || undefined,
  };

  const usage                 = {
    measureIds: dto.usage?.measureIds || [],
    usageCount: dto.usage?.usageCount || 0,
    lastUsedAt: dto.usage?.lastUsedAt || undefined,
  };

  const metadata                    = {
    createdAt: dto.createdAt || now,
    createdBy: dto.createdBy || 'system',
    updatedAt: dto.updatedAt || now,
    updatedBy: dto.updatedBy || 'system',
    category,
    tags: dto.metadata?.tags || [],
    source: { origin: 'ecqi' },
  };

  const complexity                      = dto.complexity ? {
    level: (dto.complexity.level                             ) || 'LOW',
    score: dto.complexity.score || 1,
    factors: dto.complexity.factors || [],
  } : createDefaultComplexity();

  if (dto.type === 'composite') {
    const composite                     = {
      type: 'composite',
      id: dto.id,
      name: dto.name,
      description: dto.description || '',
      operator: 'AND',
      childRefs: dto.childComponents?.map(c => ({
        componentId: c.id,
        versionId: '1.0',
        displayName: c.name,
      })) || [],
      complexity,
      versionInfo,
      usage,
      metadata,
      catalogs: dto.catalogs || [],
    };
    return composite;
  }

  const valueSet                    = dto.valueSet ? {
    oid: dto.valueSet.oid || '',
    version: '',
    name: dto.valueSet.name || 'Unknown',
    codes: dto.valueSet.codes?.map(c => ({
      code: c.code,
      display: c.display,
      system: c.system       ,
    })) || [],
  } : createDefaultValueSet();

  const timing                   = dto.timing ? {
    operator: (dto.timing.type       ) || 'during',
    quantity: dto.timing.duration || undefined,
    unit: dto.timing.unit        || undefined,
    reference: 'Measurement Period',
    displayExpression: `${dto.timing.type || 'during'} Measurement Period`,
  } : createDefaultTiming();

  const atomic                  = {
    type: 'atomic',
    id: dto.id,
    name: dto.name,
    description: dto.description || '',
    valueSet,
    timing,
    negation: false,
    complexity,
    versionInfo,
    usage,
    metadata,
    catalogs: dto.catalogs || [],
  };

  return atomic;
}
