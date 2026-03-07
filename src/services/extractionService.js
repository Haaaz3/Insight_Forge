/**
 * Measure Extraction Service
 *
 * Orchestrates AI-based measure extraction by calling the backend LLM proxy.
 * Extracts metadata, populations, criteria, and value sets from measure specifications.
 */

import { post } from '../api/client';
import { useFeedbackStore } from '../stores/feedbackStore';
import {                          } from './htmlSpecParser';
import { findStandardValueSetByName } from '../constants/standardValueSets';
import { hydrateCodesFromCache } from '../data/vsacCodeCache';

// ============================================================================
// Types
// ============================================================================

;                                   
                    
                 
                                                        
 

;                                  
                   
                                   
                                
                               
                     
                 
 

;                            
                                     
                            
                        
                                
                             
                                                 
 

;                        
                                        
                       
                                    
                         
                    
                  
      
    
                       
                           
                           
                            
                    
    
                                     
                                 
 

;                              
               
                      
                     
                               
 

;                            
                          
                       
                                                        
 

;                        
               
                   
                  
 

;                             
                
                    
                      
                                                                      
                                
            
                 
                    
                    
                        
    
 

;                            
               
               
                   
                   
                      
                          
 

;                      
                  
                     
                   
                
 

// ============================================================================
// System Prompts
// ============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are an expert in healthcare quality measures, CQL (Clinical Quality Language), and FHIR.
Your task is to extract structured measure data from a quality measure specification document.

Extract the following information in valid JSON format:

{
  "metadata": {
    "measureId": "CMS measure ID (e.g., CMS130v12)",
    "title": "Full measure title",
    "version": "Version number",
    "steward": "Measure steward organization",
    "program": "Quality program (MIPS_CQM, eCQM, HEDIS, etc.)",
    "measureType": "process|outcome|structure|patient_experience",
    "description": "Brief description",
    "rationale": "Clinical rationale",
    "clinicalRecommendation": "Clinical recommendation statement",
    "measurementPeriod": {
      "start": "YYYY-01-01",
      "end": "YYYY-12-31"
    }
  },
  "globalConstraints": {
    "ageMin": number or null,
    "ageMax": number or null,
    "ageCalculation": "at_start|at_end|during",
    "gender": "any|male|female"
  },
  "populations": [
    {
      "type": "initial_population|denominator|numerator|denominator_exclusion|denominator_exception|numerator_exclusion",
      "description": "Human-readable description",
      "narrative": "Detailed narrative of criteria",
      "criteria": {
        "operator": "AND|OR",
        "children": [
          {
            "type": "dataElement|reference|logicalClause",
            "dataType": "Condition|Procedure|Encounter|Observation|MedicationRequest|etc.",
            "valueSet": { "oid": "2.16.840.1...", "name": "Value Set Name" },
            "directCodes": [{ "code": "E11.9", "display": "Type 2 diabetes", "system": "ICD10" }],
            "timing": { "type": "during|before|after|within", "period": "measurement_period|custom", "offset": "90 days", "offsetUnit": "days" },
            "description": "Description of this criterion"
          }
        ]
      }
    }
  ],
  "valueSets": [
    {
      "oid": "2.16.840.1.xxx",
      "name": "Value Set Name",
      "purpose": "What this value set represents",
      "codeSystem": "Primary code system (ICD10, SNOMED, CPT, LOINC, CVX, RxNorm)",
      "codes": [
        { "code": "E11.9", "display": "Type 2 diabetes mellitus", "system": "ICD10" },
        { "code": "44054006", "display": "Type 2 diabetes mellitus", "system": "SNOMED" }
      ]
    }
  ]
}

Important guidelines:
1. Extract ALL populations mentioned (IP, Denominator, Numerator, Exclusions, Exceptions)
2. CRITICAL: For each population, you MUST include a "criteria" object with an array of "children" data elements. Never leave criteria empty - extract at least one data element per population.
3. Capture timing constraints precisely (during measurement period, within 90 days, etc.)
4. Identify value sets by their OIDs when available
5. Use proper FHIR resource types for data elements (Condition, Procedure, Encounter, Observation, MedicationRequest, Immunization, etc.)
6. For age constraints, identify the calculation method (at start, at end, or during period)
7. Preserve the logical structure (AND/OR groupings) of criteria
8. Each data element in children MUST have: dataType (FHIR resource type), description (what this criterion checks for), and valueSet if applicable
9. CRITICAL - EXTRACT CODES: For each value set, extract ALL individual codes found in the document (look in CQL valueset declarations, XML, tables, appendices). Include code, display name, and system (ICD10, SNOMED, CPT, LOINC, CVX, RxNorm, HCPCS).
10. Look for CQL "valueset" declarations like: valueset "DTaP Vaccine": 'urn:oid:2.16.840.1...' and "code" declarations like: code "Disorder Name": '12345' from "SNOMEDCT"
11. For directCodes in criteria, extract individual codes that are NOT part of a value set but are directly referenced
12. CRITICAL - EXTRACT ALL CRITERIA: For populations with multiple criteria (especially numerator), you MUST extract EVERY criterion and sub-criterion. Do NOT abbreviate, summarize, or stop early. If a numerator has 10 vaccine requirement groups, output all 10. If criteria have OR clauses with alternatives (e.g., vaccine OR anaphylaxis exception), include BOTH branches of every OR.
13. For immunization measures like CMS117, the numerator typically requires ALL of these vaccines: DTaP, IPV, MMR, HiB, HepB, VZV/Varicella, PCV/Pneumococcal, Hepatitis A, Rotavirus, and Influenza. If your output has fewer than 10 groups in such a numerator, you have missed some — go back and include them all.

Return ONLY the JSON object, no additional text or markdown.`;

const SKELETON_SYSTEM_PROMPT = `You are an expert in healthcare quality measures. Your task is to extract a high-level skeleton of a measure from its specification.

Extract the following in valid JSON format:

{
  "metadata": {
    "measureId": "CMS measure ID",
    "title": "Full measure title",
    "version": "Version number",
    "steward": "Measure steward",
    "program": "MIPS_CQM|eCQM|HEDIS|QOF|Registry|Custom",
    "measureType": "process|outcome|structure|patient_experience",
    "description": "Brief description"
  },
  "populationTypes": ["initial_population", "denominator", "numerator", "denominator_exclusion", "etc."],
  "valueSetCount": number,
  "hasTimingConstraints": boolean,
  "hasAgeConstraints": boolean,
  "estimatedComplexity": "low|medium|high"
}

Return ONLY the JSON object, no additional text.`;

const POPULATION_DETAIL_PROMPT = `You are an expert in healthcare quality measures. Given the following measure specification text and population type, extract detailed criteria for that population.

CRITICAL: You MUST include at least one data element in the criteria.children array. Never return empty children.

Extract in this JSON format:

{
  "type": "the_population_type",
  "description": "Human-readable description of who is in this population",
  "narrative": "Full narrative text from the specification",
  "criteria": {
    "operator": "AND",
    "children": [
      {
        "type": "dataElement",
        "dataType": "Encounter",
        "valueSet": { "oid": "2.16.840.1.113883.3.464.1003.101.12.1001", "name": "Office Visit" },
        "timing": { "type": "during", "period": "measurement_period" },
        "description": "Patient had an office visit during the measurement period"
      }
    ]
  }
}

Guidelines:
- dataType must be a FHIR resource type: Condition, Procedure, Encounter, Observation, MedicationRequest, Immunization, etc.
- Always include at least one meaningful data element in children array
- Include valueSet with OID and name when referenced in the specification
- Include timing constraints when specified

Return ONLY the JSON object.`;

// ============================================================================
// Main Extraction Functions
// ============================================================================

/**
 * Extract measure data from specification text using AI.
 */
export async function extractMeasure(
  documentText        ,
  options                    = {}
)                            {
  const { onProgress, provider, model } = options;

  try {
    // Phase 1: Skeleton extraction
    onProgress?.('skeleton', 'Analyzing document structure...');

    const skeletonResult = await callLlmExtract({
      systemPrompt: SKELETON_SYSTEM_PROMPT,
      userPrompt: `Extract the measure skeleton from this specification:\n\n${documentText}`,
      provider,
      model,
      maxTokens: 4000,
    });

    const skeleton = parseJsonResponse(skeletonResult.content)                            ;
    if (!skeleton) {
      throw new Error('Failed to parse skeleton extraction response');
    }

    onProgress?.('skeleton_complete', `Found ${skeleton.populationTypes?.length || 0} populations`);

    // Phase 2: Full extraction
    onProgress?.('extraction', 'Extracting populations and criteria...');

    // Inject feedback guidance into the prompt if available
    const catalogueType = skeleton.metadata?.program?.toLowerCase() || 'unknown';
    const feedbackStore = useFeedbackStore.getState();
    const feedbackGuidance = feedbackStore.generateExtractionGuidance(catalogueType);
    const enhancedSystemPrompt = EXTRACTION_SYSTEM_PROMPT + feedbackGuidance;

    const fullResult = await callLlmExtract({
      systemPrompt: enhancedSystemPrompt,
      userPrompt: `Extract complete measure data from this specification:\n\n${documentText}`,
      provider,
      model,
      maxTokens: 16000,
    });

    const extractedData = parseJsonResponse(fullResult.content)                        ;
    if (!extractedData) {
      throw new Error('Failed to parse extraction response');
    }

    // Debug: Log extracted data
    console.log('[extractMeasure] Raw LLM response:', fullResult.content.substring(0, 500));
    console.log('[EXTRACT-RAW] First population first criterion:',
      JSON.stringify(extractedData?.populations?.[0]?.criteria?.children?.[0], null, 2));
    console.log('[extractMeasure] Extracted populations:', extractedData.populations?.map(p => ({
      type: p.type,
      hasCriteria: !!p.criteria,
      criteriaChildren: p.criteria?.children?.length || 0,
    })));

    onProgress?.('extraction_complete', `Extracted ${extractedData.populations?.length || 0} populations`);

    // Phase 3: Convert to UMS format
    onProgress?.('converting', 'Converting to UMS format...');

    const ums = convertToUMS(extractedData);

    // Debug: Log first UMS data element
    console.log('=== POST-EXTRACT-UMS REACHED ===');
    console.log('[EXTRACT-UMS] First population first data element:',
      JSON.stringify(ums?.populations?.[0]?.criteria?.children?.[0], null, 2));

    // Count DataElements with value sets for verification
    try {
      let vsCount = 0;
      function countVs(node     )       {
        if (!node) return;
        if (node.valueSet?.oid || node.valueSet?.name) vsCount++;
        if (node.children) node.children.forEach(countVs);
      }
      for (const pop of (ums?.populations || [])) {
        if (pop.criteria) countVs(pop.criteria);
      }
      console.log('[extractMeasure] FINAL: UMS has', vsCount, 'DataElements with value sets out of', (ums?.populations || []).length, 'populations');
    } catch (crashErr) {
      console.error('💥💥💥 CRASH AFTER [EXTRACT-UMS] 💥💥💥');
      console.error('💥 Error:', crashErr);
      console.error('💥 Message:', crashErr instanceof Error ? crashErr.message : String(crashErr));
      console.error('💥 Stack:', crashErr instanceof Error ? crashErr.stack : 'no stack');
    }

    // NOTE: Enrichment (HTML/CQL parsing, OID resolution, code population) is handled by
    // measureIngestion.js AFTER this function returns. This avoids duplicate parsing and
    // ensures the enrichment has access to the FULL document content (not truncated for LLM).

    try {
      console.log('=== BEFORE onProgress ===');
      onProgress?.('complete', 'Extraction complete');
      console.log('=== AFTER onProgress ===');
    } catch(e) {
      console.error('=== onProgress CRASHED ===', e);
    }

    try { console.log('=== BEFORE RETURN ==='); } catch(e) { console.error('CRASH before return:', e); }

    return {
      success: true,
      ums,
      extractedData,
      skeleton,
      tokensUsed: (skeletonResult.tokensUsed || 0) + (fullResult.tokensUsed || 0),
    };
  } catch (error) {
    console.error('💥💥💥 OUTER CATCH in extractMeasure 💥💥💥');
    console.error('💥 Extraction error:', error);
    console.error('💥 Message:', error instanceof Error ? error.message : String(error));
    console.error('💥 Stack:', error instanceof Error ? error.stack : 'no stack');
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Extraction failed',
      ums: null,
      tokensUsed: 0,
    };
  }
}

/**
 * Extract measure data using multi-pass strategy for complex documents.
 */
export async function extractMeasureMultiPass(
  documentText        ,
  options                    = {}
)                            {
  const { onProgress, provider, model } = options;

  try {
    // Phase 1: Get skeleton
    onProgress?.('skeleton', 'Analyzing document structure...');

    const skeletonResult = await callLlmExtract({
      systemPrompt: SKELETON_SYSTEM_PROMPT,
      userPrompt: `Extract the measure skeleton:\n\n${documentText}`,
      provider,
      model,
      maxTokens: 4000,
    });

    const skeleton = parseJsonResponse(skeletonResult.content)                            ;
    if (!skeleton) {
      throw new Error('Failed to parse skeleton');
    }

    const populationTypes = skeleton.populationTypes || [
      'initial_population',
      'denominator',
      'numerator',
    ];

    onProgress?.('skeleton_complete', `Found ${populationTypes.length} population types`);

    // Inject feedback guidance into the prompt if available
    const catalogueType = skeleton.metadata?.program?.toLowerCase() || 'unknown';
    const feedbackStore = useFeedbackStore.getState();
    const feedbackGuidance = feedbackStore.generateExtractionGuidance(catalogueType);
    const enhancedPopulationPrompt = POPULATION_DETAIL_PROMPT + feedbackGuidance;

    // Phase 2: Extract each population in detail
    const populations = [];
    let totalTokens = skeletonResult.tokensUsed || 0;

    for (let i = 0; i < populationTypes.length; i++) {
      const popType = populationTypes[i];
      onProgress?.('population', `Extracting ${formatPopulationType(popType)} (${i + 1}/${populationTypes.length})...`);

      const popResult = await callLlmExtract({
        systemPrompt: enhancedPopulationPrompt,
        userPrompt: `Population type: ${popType}\n\nMeasure specification:\n${documentText}`,
        provider,
        model,
        maxTokens: 8000,
      });

      const popData = parseJsonResponse(popResult.content)                              ;
      if (popData) {
        populations.push(popData);
      }

      totalTokens += popResult.tokensUsed || 0;
    }

    onProgress?.('populations_complete', `Extracted ${populations.length} populations`);

    // Phase 3: Extract value sets
    onProgress?.('valueSets', 'Identifying value sets...');

    const vsResult = await callLlmExtract({
      systemPrompt: `Extract all value sets referenced in this measure specification. Return JSON: { "valueSets": [{ "oid": "...", "name": "...", "purpose": "..." }] }`,
      userPrompt: documentText,
      provider,
      model,
      maxTokens: 4000,
    });

    const vsData = parseJsonResponse(vsResult.content)                                              ;
    totalTokens += vsResult.tokensUsed || 0;

    // Phase 4: Assemble full UMS
    onProgress?.('converting', 'Assembling UMS...');

    const extractedData                = {
      metadata: skeleton.metadata || {},
      populations,
      valueSets: vsData?.valueSets || [],
    };

    const ums = convertToUMS(extractedData);

    onProgress?.('complete', 'Multi-pass extraction complete');

    return {
      success: true,
      ums,
      extractedData,
      skeleton,
      tokensUsed: totalTokens,
    };
  } catch (error) {
    console.error('Multi-pass extraction error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Multi-pass extraction failed',
      ums: null,
      tokensUsed: 0,
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

;                            
                       
                     
                    
                 
                     
                    
 

/**
 * Call LLM for extraction - tries direct API first, falls back to backend proxy.
 */
async function callLlmExtract(request                   )                       {
  // Try to get API key from settings store for direct API call
  const { useSettingsStore } = await import('../stores/settingsStore');
  const settings = useSettingsStore.getState();
  const apiKey = settings.getActiveApiKey?.() || settings.apiKeys?.anthropic;
  const provider = request.provider || settings.selectedProvider || 'anthropic';
  const model = request.model || settings.selectedModel || 'claude-sonnet-4-20250514';

  // If we have an API key, use direct API call (bypasses backend WebClient issues)
  if (apiKey) {
    console.log('[callLlmExtract] Using direct API call with frontend API key');
    const { callLLM } = await import('./llmClient');

    const response = await callLLM({
      provider: provider                                                ,
      model,
      apiKey,
      systemPrompt: request.systemPrompt,
      userPrompt: request.userPrompt,
      maxTokens: request.maxTokens || 16000,
      images: request.images,
    });

    return {
      content: response.content,
      tokensUsed: response.tokensUsed || 0,
    };
  }

  // Fall back to backend proxy
  console.log('[callLlmExtract] Using backend proxy (no frontend API key)');
  const response = await post             ('/llm/extract', {
    systemPrompt: request.systemPrompt,
    userPrompt: request.userPrompt,
    provider: provider || null,
    model: model || null,
    maxTokens: request.maxTokens || 16000,
    images: request.images || null,
  });

  return response;
}

/**
 * Parse JSON from LLM response, handling markdown code blocks.
 */
function parseJsonResponse(content        )                 {
  if (!content) return null;

  try {
    // Try direct parse first
    return JSON.parse(content);
  } catch {
    // Try extracting from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // Fall through
      }
    }

    // Try finding JSON object boundaries
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1));
      } catch {
        // Fall through
      }
    }

    console.warn('Failed to parse JSON response:', content.slice(0, 200));
    return null;
  }
}

/**
 * Determine if a data element type should have HEDIS fields.
 * HEDIS fields apply to: encounter, procedure, laboratory, medication, condition (diagnosis)
 */
function isHedisApplicableType(type        )          {
  const hedisTypes = ['encounter', 'procedure', 'laboratory', 'medication', 'diagnosis', 'condition'];
  return hedisTypes.includes(type?.toLowerCase() || '');
}

/**
 * Convert extracted data to UMS format for the frontend.
 */
function convertToUMS(extractedData               )                       {
  const now = new Date().toISOString();
  const metadata = extractedData.metadata || {};

  // Check if this is a HEDIS measure
  const isHedisMeasure = mapProgram(metadata.program) === 'HEDIS';

  // Helper for unique IDs - prevents duplicate entity errors in backend
  const uniqueId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Debug: Log input populations
  console.log('[convertToUMS] Input populations:', extractedData.populations?.length || 0);
  extractedData.populations?.forEach((pop, i) => {
    console.log(`[convertToUMS] Pop ${i}: type=${pop.type}, criteria=${JSON.stringify(pop.criteria)?.substring(0, 200)}`);
  });

  // Build populations array
  const populations                         = (extractedData.populations || []).map((pop, idx) => {
    const criteria = convertCriteria(pop.criteria, isHedisMeasure);
    console.log(`[convertToUMS] Converted pop ${idx}: type=${pop.type}, criteriaChildren=${criteria.children?.length || 0}`);
    return {
      id: `pop-${uniqueId()}`,
      type: mapPopulationType(pop.type),
      description: pop.description || '',
      narrative: pop.narrative || pop.description || '',
      criteria,
      confidence: 'medium'                   ,
      reviewStatus: 'pending'                ,
    };
  });

  // Ensure we have at least IP, Denominator, Numerator
  const existingTypes = new Set(populations.map(p => p.type));
  const requiredTypes                                      = ['initial-population', 'denominator', 'numerator'];

  for (const type of requiredTypes) {
    if (!existingTypes.has(type)) {
      populations.push({
        id: `pop-${uniqueId()}`,
        type,
        description: formatPopulationType(type),
        narrative: '',
        criteria: {
          id: `clause-${uniqueId()}`,
          operator: 'AND',
          description: '',
          children: [],
          confidence: 'medium'                   ,
          reviewStatus: 'pending'                ,
        },
        confidence: 'low'                   ,
        reviewStatus: 'pending'                ,
      });
    }
  }

  // Build value sets array - preserve codes from LLM extraction
  const valueSets                      = (extractedData.valueSets || []).map((vs, _idx) => ({
    id: `vs-${uniqueId()}`,
    oid: vs.oid || '',
    name: vs.name || 'Unnamed Value Set',
    purpose: vs.purpose || '',
    version: vs.version || '',
    codes: (vs.codes || []).map(c => ({
      code: c.code,
      display: c.display || '',
      system: c.system || '',
    })),
  }));

  return {
    id: `ums-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    resourceType: 'Measure',
    metadata: {
      measureId: metadata.measureId || 'NEW-001',
      title: metadata.title || 'Extracted Measure',
      version: metadata.version || '1.0',
      steward: metadata.steward || '',
      program: mapProgram(metadata.program),
      measureType: mapMeasureType(metadata.measureType),
      description: metadata.description || '',
      rationale: metadata.rationale || '',
      clinicalRecommendation: metadata.clinicalRecommendation || '',
      measurementPeriod: {
        start: metadata.measurementPeriod?.start || `${new Date().getFullYear()}-01-01`,
        end: metadata.measurementPeriod?.end || `${new Date().getFullYear()}-12-31`,
        inclusive: true,
      },
      lastUpdated: now,
    },
    globalConstraints: extractedData.globalConstraints ? {
      ageRange: {
        min: extractedData.globalConstraints.ageMin ?? 0,
        max: extractedData.globalConstraints.ageMax ?? 150,
      },
      gender: (extractedData.globalConstraints.gender                             ) || 'any',
    } : undefined,
    populations,
    valueSets,
    status: 'in_progress',
    overallConfidence: 'medium'                   ,
    reviewProgress: {
      total: populations.length,
      approved: 0,
      pending: populations.length,
      flagged: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Convert extracted criteria to UMS LogicalClause format.
 * @param criteria - The extracted criteria from LLM
 * @param isHedisMeasure - Whether this is a HEDIS measure (adds hedis block to applicable elements)
 */
let convertCriteriaDepth = 0;
function convertCriteria(criteria                    , isHedisMeasure          = false)                {
  convertCriteriaDepth++;
  console.log('[convertCriteria] ENTER depth=' + convertCriteriaDepth);

  // Helper to generate truly unique IDs
  const uniqueId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  if (!criteria) {
    console.log('[convertCriteria] No criteria provided, returning empty clause');
    convertCriteriaDepth--;
    return {
      id: `clause-${uniqueId()}`,
      operator: 'AND',
      description: '',
      children: [],
      confidence: 'medium'                   ,
      reviewStatus: 'pending'                ,
    };
  }
  console.log(`[convertCriteria] Converting criteria: operator=${criteria.operator}, children=${criteria.children?.length || 0}`);

  const clause                = {
    id: `clause-${uniqueId()}`,
    operator: criteria.operator || 'AND',
    description: criteria.description || '',
    children: [],
    confidence: 'medium'                   ,
    reviewStatus: 'pending'                ,
  };

  if (Array.isArray(criteria.children)) {
    clause.children = criteria.children.map((child, _idx) => {
      // Check if it's a nested clause (has operator property)
      if ('operator' in child) {
        return convertCriteria(child                     , isHedisMeasure);
      }

      // Data element - use unique IDs to avoid duplicates across populations
      const criterion = child                      ;
      const elemId = uniqueId();
      const dataElement              = {
        id: `elem-${elemId}`,
        type: mapElementType(criterion.dataType),
        description: criterion.description || '',
        confidence: 'medium'                   ,
        reviewStatus: 'pending'                ,
      };

      if (criterion.valueSet && (criterion.valueSet.oid || criterion.valueSet.name)) {
        dataElement.valueSet = {
          id: `vs-${uniqueId()}`,
          oid: criterion.valueSet.oid || '',
          name: criterion.valueSet.name || '',
          // Preserve codes from LLM extraction
          codes: (criterion.valueSet.codes || []).map(c => ({
            code: c.code,
            display: c.display || '',
            system: c.system || '',
          })),
          confidence: 'medium'                   ,
        };
        // DTaP trace logging
        if (criterion.description?.includes('DTaP') || criterion.valueSet?.name?.includes('DTaP')) {
          console.log('[TRACE-DTaP] Criterion:', JSON.stringify({ desc: criterion.description?.substring(0, 40), vsOid: criterion.valueSet.oid, vsName: criterion.valueSet.name }));
          console.log('[TRACE-DTaP] DataElement:', JSON.stringify({ id: dataElement.id, desc: dataElement.description?.substring(0, 40), vsOid: dataElement.valueSet?.oid, vsName: dataElement.valueSet?.name }));
        }
      }

      // Handle directCodes (codes not part of a value set)
      if (criterion.directCodes && criterion.directCodes.length > 0) {
        dataElement.directCodes = criterion.directCodes.map(c => ({
          code: c.code,
          display: c.display || '',
          system: c.system || '',
        }));
      }

      // Add HEDIS block for applicable data element types when measure is HEDIS-tagged
      // Types: encounter, procedure, laboratory, medication, condition (diagnosis)
      if (isHedisMeasure && isHedisApplicableType(dataElement.type)) {
        dataElement.hedis = {
          collectionType: criterion.collectionType || null,
          hybridSourceFlag: criterion.hybridSourceFlag || false,
        };
      }

      return dataElement;
    });
  }

  convertCriteriaDepth--;
  return clause;
}

/**
 * Map population type string to UMS type.
 */
function mapPopulationType(type        )                               {
  const mapping                                               = {
    'initial_population': 'initial-population',
    'INITIAL_POPULATION': 'initial-population',
    'denominator': 'denominator',
    'DENOMINATOR': 'denominator',
    'denominator_exclusion': 'denominator-exclusion',
    'DENOMINATOR_EXCLUSION': 'denominator-exclusion',
    'denominator_exception': 'denominator-exception',
    'DENOMINATOR_EXCEPTION': 'denominator-exception',
    'numerator': 'numerator',
    'NUMERATOR': 'numerator',
    'numerator_exclusion': 'numerator-exclusion',
    'NUMERATOR_EXCLUSION': 'numerator-exclusion',
    'measure_population': 'measure-population',
    'MEASURE_POPULATION': 'measure-population',
    'measure_observation': 'measure-observation',
    'MEASURE_OBSERVATION': 'measure-observation',
  };
  return mapping[type] || 'initial-population';
}

/**
 * Map element type to UMS DataElement type.
 */
function mapElementType(type         )                      {
  if (!type) return 'observation';
  const mapping                                      = {
    'Condition': 'diagnosis',
    'condition': 'diagnosis',
    'Encounter': 'encounter',
    'encounter': 'encounter',
    'Procedure': 'procedure',
    'procedure': 'procedure',
    'Observation': 'observation',
    'observation': 'observation',
    'MedicationRequest': 'medication',
    'medication': 'medication',
    'Immunization': 'immunization',
    'immunization': 'immunization',
    'Patient': 'demographic',
    'demographic': 'demographic',
    'Device': 'device',
    'device': 'device',
    'Assessment': 'assessment',
    'assessment': 'assessment',
    'AllergyIntolerance': 'allergy',
    'allergy': 'allergy',
  };
  return mapping[type] || 'observation';
}

/**
 * Map program string to MeasureMetadata program type.
 */
function mapProgram(program         )                             {
  if (!program) return 'Custom';
  if (program.includes('MIPS') || program === 'MIPS_CQM') return 'MIPS_CQM';
  if (program === 'eCQM' || program === 'ECQM') return 'eCQM';
  if (program === 'HEDIS') return 'HEDIS';
  if (program === 'QOF') return 'QOF';
  if (program === 'Registry') return 'Registry';
  return 'Custom';
}

/**
 * Map measure type string to MeasureMetadata measureType.
 */
function mapMeasureType(type         )                                 {
  if (!type) return 'process';
  if (type === 'outcome') return 'outcome';
  if (type === 'structure') return 'structure';
  if (type === 'patient_experience') return 'patient_experience';
  return 'process';
}

/**
 * Format population type for display.
 */
function formatPopulationType(type        )         {
  const labels                         = {
    'initial_population': 'Initial Population',
    'initial-population': 'Initial Population',
    'denominator': 'Denominator',
    'numerator': 'Numerator',
    'denominator_exclusion': 'Denominator Exclusion',
    'denominator-exclusion': 'Denominator Exclusion',
    'denominator_exception': 'Denominator Exception',
    'denominator-exception': 'Denominator Exception',
    'numerator_exclusion': 'Numerator Exclusion',
    'numerator-exclusion': 'Numerator Exclusion',
    'measure_population': 'Measure Population',
    'measure-population': 'Measure Population',
    'measure_observation': 'Measure Observation',
    'measure-observation': 'Measure Observation',
  };
  return labels[type] || type.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ============================================================================
// PDF Text Extraction (client-side)
// ============================================================================

/**
 * Extract text from a PDF file using pdf.js.
 */
export async function extractTextFromPDF(file      )                  {
  // Dynamic import pdf.js
  const pdfjsLib = await import('pdfjs-dist');

  // Use local worker from public folder to avoid CORS issues
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const textParts           = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item                  ) => item.str || '').join(' ');
    textParts.push(pageText);
  }

  return textParts.join('\n\n');
}

/**
 * Extract text from uploaded files (PDF or text).
 */
export async function extractTextFromFiles(files        )                  {
  const textParts           = [];

  for (const file of files) {
    if (file.type === 'application/pdf') {
      try {
        const pdfText = await extractTextFromPDF(file);
        textParts.push(`--- ${file.name} ---\n${pdfText}`);
      } catch (error) {
        console.error(`Failed to extract PDF ${file.name}:`, error);
        textParts.push(`--- ${file.name} (extraction failed) ---`);
      }
    } else if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      const text = await file.text();
      textParts.push(`--- ${file.name} ---\n${text}`);
    } else {
      console.warn(`Unsupported file type: ${file.type} for ${file.name}`);
    }
  }

  return textParts.join('\n\n');
}

// ============================================================================
// Enrichment Functions
// These enrich DataElements with real OIDs, codes, and mappings from HTML/CQL
// ============================================================================

/**
 * Enrich UMS DataElements with HTML-parsed value sets and data element mappings.
 * This replaces placeholder OIDs with real OIDs from the specification.
 */
export function enrichDataElementsWithHtmlSpec(
  ums                      ,
  htmlResult                     
)       {
  // Build lookup maps
  const vsNameToOid = new Map                ();
  const oidToVsName = new Map                ();
  for (const vs of htmlResult.valueSets) {
    vsNameToOid.set(vs.name.toLowerCase(), vs.oid);
    oidToVsName.set(vs.oid, vs.name);
  }

  // Build data element mapping index
  const descriptionToMapping = new Map                                                  ();
  for (const mapping of htmlResult.dataElementMappings) {
    descriptionToMapping.set(mapping.fullDescription.toLowerCase(), mapping);
    descriptionToMapping.set(mapping.description.toLowerCase(), mapping);
  }

  // Build map of direct reference codes from HTML (these are typically anaphylaxis SNOMED codes)
  // These codes should NOT be fuzzy-matched to value sets - they belong to specific data elements
  // that reference them directly via the data element mappings
  const directRefCodes = new Map                                                                  ();
  for (const code of htmlResult.codes) {
    // Key by code value + system for exact lookup
    const key = `${code.system}:${code.code}`.toLowerCase();
    directRefCodes.set(key, {
      code: code.code,
      display: code.display,
      system: code.system,
    });
  }

  // NOTE: We intentionally DO NOT fuzzy-match codes to value sets here.
  // The previous fuzzy matching caused cross-contamination (e.g., "Mumps" value set
  // getting anaphylaxis codes because they mention "Mumps" in their description).
  //
  // Actual value set codes should come from:
  // 1. VSAC API expansion (preferred)
  // 2. Bundled value set expansion files
  // 3. AI-assisted expansion during import
  //
  // Direct reference codes (like anaphylaxis SNOMED codes) are handled via
  // the data element mappings below, which explicitly pair codes to specific data elements.
  const vsNameToCodes = new Map                                                                  ();

  let enrichedCount = 0;
  let oidsAttached = 0;
  let codesAttached = 0;

  function isDataElement(node                             )                      {
    return 'type' in node && !('children' in node);
  }

  // Helper: check if an OID looks like a real OID (starts with digit and has dots)
  const isRealOid = (oid        ) => /^\d+\.\d+/.test(oid);

  // Helper: attach codes to a DataElement's valueSet if it doesn't already have codes
  function attachCodesToValueSet(elem             )       {
    if (!elem.valueSet?.name) return;
    if (elem.valueSet.codes && elem.valueSet.codes.length > 0) return; // Already has codes

    const vsNameLower = elem.valueSet.name.toLowerCase();
    const matchedCodes = vsNameToCodes.get(vsNameLower);

    if (matchedCodes && matchedCodes.length > 0) {
      elem.valueSet.codes = matchedCodes.map(c => ({
        code: c.code,
        display: c.display,
        system: c.system       ,
      }));
      codesAttached += matchedCodes.length;
      console.log(`[enrichHtml] Attached ${matchedCodes.length} codes to "${elem.valueSet.name}"`);
    }
  }

  function walkAndEnrich(node                             )       {
    if (!node) return;

    if (isDataElement(node)) {
      const elem = node;
      const desc = (elem.description || '').toLowerCase().trim();
      const vsName = (elem.valueSet?.name || '').toLowerCase().trim();

      // Strategy 1: Match by description against Data Criteria mappings
      let mapping = descriptionToMapping.get(desc);
      if (!mapping && vsName) {
        mapping = descriptionToMapping.get(vsName);
      }
      // Try partial matching
      if (!mapping) {
        for (const [key, m] of descriptionToMapping.entries()) {
          if (desc && (key.includes(desc) || desc.includes(key))) {
            mapping = m;
            break;
          }
        }
      }

      if (mapping) {
        if (mapping.valueSetOid) {
          if (!elem.valueSet) {
            (elem       ).valueSet = { id: '', oid: '', name: '', codes: [], confidence: 'medium' };
          }
          // ALWAYS override OID with HTML spec's OID — the HTML spec is authoritative
          // Previous logic skipped elements with "real" OIDs, but MAT OIDs (2.16.840.1.113883.3.117.*)
          // look real but are from a different namespace than VSAC OIDs (2.16.840.1.113883.3.464.*)
          const previousOid = elem.valueSet?.oid;
          if (previousOid !== mapping.valueSetOid) {
            console.log(`[enrichHtml] Corrected OID for "${elem.description}": ${previousOid || '(none)'} → ${mapping.valueSetOid}`);
            elem.valueSet .oid = mapping.valueSetOid;
            oidsAttached++;
          }
          if (!elem.valueSet .name || elem.valueSet .name === '') {
            elem.valueSet .name = mapping.valueSetName || oidToVsName.get(mapping.valueSetOid) || '';
          }
        }

        // Attach direct code from mapping
        if (mapping.directCode && (!elem.directCodes || elem.directCodes.length === 0)) {
          elem.directCodes = [{
            code: mapping.directCode,
            display: mapping.directCodeDisplay || mapping.description,
            system: (mapping.directCodeSystem       ) || 'SNOMED',
          }];
          codesAttached++;
          console.log(`[enrichHtml] Attached direct code ${mapping.directCode} to "${elem.description}"`);
        }
      }

      // Strategy 2: If element has a value set name, look up its OID from HTML
      // ALWAYS override if we find a matching OID — the HTML spec is authoritative
      if (elem.valueSet?.name) {
        const realOid = vsNameToOid.get(elem.valueSet.name.toLowerCase());
        if (realOid) {
          const currentOid = elem.valueSet.oid || '';
          if (currentOid !== realOid) {
            console.log(`[enrichHtml] Replacing OID for ${elem.valueSet.name}: "${currentOid}" → "${realOid}"`);
            elem.valueSet.oid = realOid;
            oidsAttached++;
          }
        }
      }

      // Strategy 3: If element has a value set OID, look up its name from HTML
      if (elem.valueSet?.oid && (!elem.valueSet?.name || elem.valueSet.name === '')) {
        const name = oidToVsName.get(elem.valueSet.oid);
        if (name) {
          elem.valueSet.name = name;
          enrichedCount++;
        }
      }

      // Strategy 4: Attach codes to the DataElement's valueSet from parsed HTML codes
      // This populates valueSet.codes based on name matching
      attachCodesToValueSet(elem);

      // Strategy 5: For elements without direct codes, try to match against HTML codes by description
      // This handles anaphylaxis codes that are direct references in the HTML spec
      if (!elem.directCodes || elem.directCodes.length === 0) {
        const descLower = (elem.description || '').toLowerCase();
        for (const code of htmlResult.codes) {
          const codeDisplayLower = (code.display || '').toLowerCase();
          // Look for specific keyword matches (e.g., "dtap" in description matches "anaphylaxis...dtap")
          // Only match if the description mentions anaphylaxis/adverse reaction AND matches a specific vaccine
          const isAnaphylaxisElement = descLower.includes('anaphyla') || descLower.includes('adverse') || descLower.includes('reaction');
          if (isAnaphylaxisElement) {
            // Check for vaccine type overlap
            const vaccineKeywords = ['dtap', 'dtp', 'ipv', 'polio', 'mmr', 'measles', 'mumps', 'rubella', 'hib', 'hep b', 'hepatitis b', 'hep a', 'hepatitis a', 'varicella', 'vzv', 'chickenpox', 'pneumococcal', 'pcv', 'rotavirus', 'influenza', 'flu'];
            for (const keyword of vaccineKeywords) {
              if (descLower.includes(keyword) && codeDisplayLower.includes(keyword)) {
                elem.directCodes = [{
                  code: code.code,
                  display: code.display,
                  system: code.system || 'SNOMED',
                }];
                codesAttached++;
                console.log(`[enrichHtml] Matched code ${code.code} to anaphylaxis element "${elem.description}"`);
                break;
              }
            }
            if (elem.directCodes && elem.directCodes.length > 0) break;
          }
        }
      }

      if (mapping || (elem.valueSet?.oid && isRealOid(elem.valueSet.oid))) enrichedCount++;
    } else {
      // LogicalClause — recurse into children
      const clause = node                 ;
      if (clause.children) clause.children.forEach(walkAndEnrich);
    }
  }

  // Walk all populations
  for (const pop of ums.populations || []) {
    if (pop.criteria) walkAndEnrich(pop.criteria);
  }

  // Also add HTML-parsed value sets to the UMS valueSets array
  // Include any matched codes for each value set
  const existingOids = new Set((ums.valueSets || []).map(vs => vs.oid));
  for (const htmlVs of htmlResult.valueSets) {
    if (!existingOids.has(htmlVs.oid)) {
      if (!ums.valueSets) ums.valueSets = [];
      const matchedCodes = vsNameToCodes.get(htmlVs.name.toLowerCase()) || [];
      ums.valueSets.push({
        id: `vs-html-${htmlVs.oid.replace(/\./g, '-')}`,
        oid: htmlVs.oid,
        name: htmlVs.name,
        purpose: '',
        version: '',
        codes: matchedCodes.map(c => ({
          code: c.code,
          display: c.display,
          system: c.system       ,
        })),
        confidence: 'high',
        verified: true,
      });
    }
  }

  console.log(`[enrichDataElementsWithHtmlSpec] Enriched ${enrichedCount} DataElements, ${oidsAttached} OIDs attached, ${codesAttached} codes attached`);
}

/**
 * Enrich UMS DataElements with CQL-parsed value sets and codes.
 * Fills in missing OIDs/names from CQL valueset declarations.
 */
export function enrichDataElementsWithCqlCodes(
  ums                      ,
  cqlResult                ,
  normalizeCodeSystem                       
)       {
  // Build OID -> valueset lookup
  const oidToVs = new Map                                       ();
  const nameToVs = new Map                                       ();
  for (const vs of cqlResult.valueSets) {
    oidToVs.set(vs.oid, vs);
    nameToVs.set(vs.name.toLowerCase(), vs);
  }

  let enrichedCount = 0;
  let codesAttached = 0;

  // Helper: check if an OID looks like a real OID
  const isRealOid = (oid        ) => /^\d+\.\d+/.test(oid);

  function walkAndEnrich(node                             )       {
    if (!node) return;

    if ('type' in node && !('children' in node)) {
      // DataElement
      const elem = node               ;

      // 1. If DataElement has valueSet with OID, try to fill in name from CQL
      if (elem.valueSet?.oid && isRealOid(elem.valueSet.oid)) {
        const cqlVs = oidToVs.get(elem.valueSet.oid);
        if (cqlVs) {
          if (!elem.valueSet.name || elem.valueSet.name === '') {
            elem.valueSet.name = cqlVs.name;
            enrichedCount++;
          }
          elem.valueSet.version = elem.valueSet.version || cqlVs.version;
        }
      }

      // 2. If DataElement has valueSet with name, try to fill in/replace OID from CQL
      if (elem.valueSet?.name) {
        const cqlVs = nameToVs.get(elem.valueSet.name.toLowerCase());
        if (cqlVs) {
          const currentOid = elem.valueSet.oid || '';
          if (!currentOid || !isRealOid(currentOid)) {
            console.log(`[enrichCql] Replacing OID for ${elem.valueSet.name}: "${currentOid}" → "${cqlVs.oid}"`);
            elem.valueSet.oid = cqlVs.oid;
            elem.valueSet.version = elem.valueSet.version || cqlVs.version;
            enrichedCount++;
          }
        }
      }

      // 3. Try to match CQL codes to DataElement by description
      if (!elem.directCodes || elem.directCodes.length === 0) {
        const descLower = (elem.description || '').toLowerCase();
        for (const cqlCode of cqlResult.codes) {
          const codeNameLower = cqlCode.name.toLowerCase();
          if (descLower.includes(codeNameLower) || codeNameLower.includes(descLower.split(' ').slice(0, 3).join(' '))) {
            elem.directCodes = [{
              code: cqlCode.code,
              display: cqlCode.name,
              system: normalizeCodeSystem(cqlCode.system),
            }];
            codesAttached++;
            break;
          }
        }
      }
    } else {
      // LogicalClause — recurse
      const clause = node                 ;
      if (clause.children) clause.children.forEach(walkAndEnrich);
    }
  }

  // Walk all populations
  for (const pop of ums.populations || []) {
    if (pop.criteria) walkAndEnrich(pop.criteria);
  }

  console.log('[enrichDataElementsWithCqlCodes] Enriched', enrichedCount, 'DataElements,', codesAttached, 'codes attached');
}

/**
 * Generic enrichment: Match data elements to value sets from HTML/CQL parsed sources.
 * Uses fuzzy matching on descriptions and value set names - works for ANY measure.
 */
export function enrichDataElementsFromParsedSources(
  ums                      ,
  htmlParsed                                                                                                ,
  cqlParsed
)       {
  // Collect all value sets from both deterministic sources
  const knownValueSets = new Map                                         ();

  // From HTML parser
  for (const vs of htmlParsed?.valueSets || []) {
    if (vs.oid && vs.name) {
      knownValueSets.set(vs.name.toLowerCase(), { oid: vs.oid, name: vs.name });
    }
  }

  // From CQL parser
  for (const vs of cqlParsed?.valueSets || []) {
    if (vs.oid && vs.name) {
      knownValueSets.set(vs.name.toLowerCase(), { oid: vs.oid, name: vs.name });
    }
  }

  // Collect data element mappings from HTML parser
  const descriptionMappings = htmlParsed?.dataElementMappings || [];

  let enrichedCount = 0;

  // Helper: check if element already has a valid OID
  const hasValidOid = (node     )          => {
    const oid = node.valueSet?.oid || node.valueSetOid;
    return oid && /^\d+\.\d+/.test(oid);
  };

  // Fuzzy match: do two descriptions refer to the same thing?
  const fuzzyDescriptionMatch = (desc1        , desc2        )          => {
    if (!desc1 || !desc2) return false;
    const stopwords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'not', 'are', 'was', 'has', 'been', 'during', 'before', 'after', 'between', 'prior', 'service', 'services', 'different', 'dates', 'days', 'administered']);
    const getWords = (s        ) => s.split(/\W+/).filter(w => w.length >= 3 && !stopwords.has(w));
    const words1 = getWords(desc1);
    const words2 = getWords(desc2);
    if (words1.length === 0 || words2.length === 0) return false;

    const set2 = new Set(words2);
    const overlap = words1.filter(w => set2.has(w)).length;
    const overlapRatio = overlap / Math.min(words1.length, words2.length);

    return overlapRatio >= 0.5;
  };

  // Does a description contain a value set name's key terms?
  const descContainsValueSetName = (desc        , vsNameLower        )          => {
    const keyTerms = vsNameLower.split(/\W+/).filter(w => w.length >= 3);
    if (keyTerms.length === 0) return false;
    const matchCount = keyTerms.filter(term => desc.includes(term)).length;
    return matchCount >= Math.ceil(keyTerms.length * 0.6);
  };

  // Apply a match to a node
  const applyMatch = (node     , match                              )       => {
    console.log(`[enrichFromParsedSources] Matched "${node.description}" → ${match.name} (${match.oid})`);
    if (!node.valueSet) {
      node.valueSet = { oid: match.oid, name: match.name, codes: [] };
    } else {
      if (!node.valueSet.oid || !/^\d+\.\d+/.test(node.valueSet.oid)) {
        node.valueSet.oid = match.oid;
      }
      if (!node.valueSet.name) {
        node.valueSet.name = match.name;
      }
    }
    node.valueSetOid = match.oid;
    node.valueSetName = match.name;

    // Fix type based on value set name patterns
    const nameLower = match.name.toLowerCase();
    if (nameLower.includes('vaccine') || nameLower.includes('immuniz')) {
      node.type = 'immunization';
    }
  };

  // Walk the criteria tree
  function walkAndEnrich(node     )       {
    if (!node) return;

    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        walkAndEnrich(child);
      }
      return;
    }

    // Skip if already has a valid OID
    if (hasValidOid(node)) return;

    const desc = (node.description || '').toLowerCase();
    const existingName = (node.valueSet?.name || node.valueSetName || '').toLowerCase();

    // Strategy 1: Match by existing valueSet name (LLM gave name but no/bad OID)
    if (existingName && knownValueSets.has(existingName)) {
      const match = knownValueSets.get(existingName);
      if (match) {
        applyMatch(node, match);
        enrichedCount++;
        return;
      }
    }

    // Strategy 2: Match by HTML data element mappings (description → value set)
    for (const mapping of descriptionMappings) {
      const mappingDesc = (mapping.description || '').toLowerCase();
      if (fuzzyDescriptionMatch(desc, mappingDesc) && mapping.valueSetOid) {
        applyMatch(node, { oid: mapping.valueSetOid, name: mapping.valueSetName || '' });
        enrichedCount++;
        return;
      }
    }

    // Strategy 3: Fuzzy match description against known value set names
    for (const [vsNameLower, vsInfo] of knownValueSets) {
      if (descContainsValueSetName(desc, vsNameLower)) {
        applyMatch(node, vsInfo);
        enrichedCount++;
        return;
      }
    }

    // Strategy 4: For non-demographics, try standard value set catalog matching by name
    // This catches components that weren't matched by the above strategies
    if (node.type !== 'demographic' && node.category !== 'demographics') {
      // Skip if already has an OID
      if (node.valueSet?.oid && /^\d+\.\d+/.test(node.valueSet.oid)) {
        // Strategy 5: Hydrate codes from VSAC cache if OID exists but no codes
        const codes = node.valueSet?.codes || [];
        if (codes.length === 0) {
          const cachedCodes = hydrateCodesFromCache(node.valueSet.oid);
          if (cachedCodes && cachedCodes.length > 0) {
            node.valueSet.codes = cachedCodes;
            console.log(`[enrichFromParsedSources] Hydrated ${cachedCodes.length} codes from cache for OID ${node.valueSet.oid}`);
          }
        }
        return;
      }

      // Try to find a matching standard value set by name
      const vsName = node.valueSet?.name || node.description;
      const match = findStandardValueSetByName(vsName);
      if (match) {
        applyMatch(node, match);
        enrichedCount++;

        // Also try to hydrate codes from cache for the matched OID
        const codes = node.valueSet?.codes || [];
        if (codes.length === 0) {
          const cachedCodes = hydrateCodesFromCache(match.oid);
          if (cachedCodes && cachedCodes.length > 0) {
            node.valueSet.codes = cachedCodes;
            console.log(`[enrichFromParsedSources] Hydrated ${cachedCodes.length} codes from cache for matched OID ${match.oid}`);
          }
        }
        return;
      }
    }
  }

  // Walk all populations
  for (const pop of ums.populations || []) {
    if (pop.criteria) walkAndEnrich(pop.criteria);
  }

  console.log(`[enrichFromParsedSources] Enriched ${enrichedCount} DataElements from HTML/CQL parsed sources`);
}

export default {
  extractMeasure,
  extractMeasureMultiPass,
  extractTextFromPDF,
  extractTextFromFiles,
};
