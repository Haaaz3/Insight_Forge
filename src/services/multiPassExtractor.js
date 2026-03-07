/**
 * Multi-Pass Extraction Service (1.B)
 *
 * Implements a three-pass extraction pipeline to improve accuracy:
 * - Pass 1 (SKELETON): Extract structure and population names
 * - Pass 2 (DETAIL): One call per population for focused extraction
 * - Pass 3 (VALIDATION): Cross-reference to catch omissions/hallucinations
 *
 * This replaces single-shot extraction with iterative refinement.
 */

import { callLLM,                        } from './llmClient';
import { validateOID,                          } from './oidValidator';
import { generateFewShotExamples } from './feedbackLoop';
import {
  chunkDocument as chunkDocumentSemantic,
                     
                       
} from './promptChunker';
;            
                       
                       
                 
              
                    
                
                  
                  
                      

// Threshold for triggering chunked extraction (in characters)
const LARGE_DOCUMENT_THRESHOLD = 20000;

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
                               
                         
                 
 

// ============================================================================
// Main Extraction Function
// ============================================================================

/**
 * Extract measure data using multi-pass approach
 *
 * For large documents (> LARGE_DOCUMENT_THRESHOLD), uses semantic chunking
 * from promptChunker to split the document and merge extraction results.
 */
export async function extractWithMultiPass(
  documentText        ,
  options                   
)                            {
  // Check if document is large enough to require chunking
  if (isLargeDocument(documentText, LARGE_DOCUMENT_THRESHOLD)) {
    return extractWithChunking(documentText, options);
  }

  const errors           = [];
  const warnings           = [];
  const timings = { skeletonMs: 0, populationsMs: 0, validationMs: 0, totalMs: 0 };
  const startTotal = performance.now();

  const progress = options.onProgress || (() => {});

  try {
    // =========================================================================
    // PASS 1: SKELETON EXTRACTION
    // =========================================================================
    progress({
      phase: 'skeleton',
      currentStep: 1,
      totalSteps: 3,
      message: 'Extracting measure structure...',
    });

    const startSkeleton = performance.now();
    const skeleton = await extractSkeleton(documentText, options);
    timings.skeletonMs = performance.now() - startSkeleton;

    if (!skeleton) {
      return {
        success: false,
        errors: ['Failed to extract measure skeleton'],
        warnings,
        timings: { ...timings, totalMs: performance.now() - startTotal },
      };
    }

    // =========================================================================
    // PASS 2: POPULATION DETAIL EXTRACTION
    // =========================================================================
    const populationResults                               = [];
    const allValueSets                      = [];

    const startPop = performance.now();

    for (let i = 0; i < skeleton.populations.length; i++) {
      const popSkeleton = skeleton.populations[i];

      progress({
        phase: 'populations',
        currentStep: i + 1,
        totalSteps: skeleton.populations.length,
        message: `Extracting ${popSkeleton.name}...`,
        details: popSkeleton.briefDescription,
      });

      const popResult = await extractPopulationDetail(
        documentText,
        skeleton,
        popSkeleton,
        options
      );

      populationResults.push(popResult);

      if (popResult.valueSets) {
        allValueSets.push(...popResult.valueSets);
      }

      if (!popResult.success) {
        errors.push(`Failed to extract ${popSkeleton.type}: ${popResult.errors.join(', ')}`);
      }
      if (popResult.warnings.length > 0) {
        warnings.push(...popResult.warnings);
      }
    }

    timings.populationsMs = performance.now() - startPop;

    // =========================================================================
    // PASS 3: CROSS-REFERENCE VALIDATION
    // =========================================================================
    let validationResult                                  ;

    if (!options.skipValidationPass) {
      progress({
        phase: 'validation',
        currentStep: 1,
        totalSteps: 1,
        message: 'Validating extraction completeness...',
      });

      const startValidation = performance.now();
      validationResult = await crossReferenceValidation(
        documentText,
        skeleton,
        populationResults,
        options
      );
      timings.validationMs = performance.now() - startValidation;

      if (!validationResult.valid) {
        warnings.push(`Validation found potential issues: ${validationResult.suggestions.join('; ')}`);
      }
    }

    // =========================================================================
    // ASSEMBLE UMS
    // =========================================================================
    progress({
      phase: 'complete',
      currentStep: 1,
      totalSteps: 1,
      message: 'Assembling measure specification...',
    });

    const ums = assembleUMS(skeleton, populationResults, allValueSets);

    timings.totalMs = performance.now() - startTotal;

    return {
      success: errors.length === 0,
      ums,
      skeleton,
      populationResults,
      validationResult,
      errors,
      warnings,
      timings,
    };
  } catch (err) {
    return {
      success: false,
      errors: [err instanceof Error ? err.message : 'Unknown extraction error'],
      warnings,
      timings: { ...timings, totalMs: performance.now() - startTotal },
    };
  }
}

// ============================================================================
// Pass 1: Skeleton Extraction
// ============================================================================

const SKELETON_SYSTEM_PROMPT = `You are a clinical quality measure expert. Extract ONLY the structural overview of this measure specification.

DO NOT extract detailed criteria yet - just identify the structure.

Return a JSON object with this exact structure:
{
  "measureId": "CMS123v10",
  "title": "Measure Title",
  "version": "10.0.0",
  "programType": "eCQM",
  "measureType": "process",
  "scoring": "proportion",
  "steward": "Organization Name",
  "description": "Brief description",
  "measurementPeriod": {
    "start": "2025-01-01",
    "end": "2025-12-31",
    "type": "calendar_year"
  },
  "populations": [
    {
      "type": "initial-population",
      "name": "Initial Population",
      "briefDescription": "Patients aged 18-75 with diabetes",
      "specSection": "Page 5, Section 2.1",
      "estimatedCriteriaCount": 3
    },
    // ... other populations
  ],
  "confidence": "high"
}

Population types must be one of:
- initial-population
- denominator
- denominator-exclusion
- denominator-exception
- numerator
- numerator-exclusion

Only include populations that are explicitly defined in the spec.`;

async function extractSkeleton(
  documentText        ,
  options                   
)                                  {
  const llmOptions                    = {
    provider: options.provider || 'anthropic',
    apiKey: options.apiKey,
    model: options.model,
    systemPrompt: SKELETON_SYSTEM_PROMPT,
    userPrompt: `Extract the structural overview from this measure specification:\n\n${documentText.substring(0, 50000)}`,
    maxTokens: 4000,
    useBackendProxy: options.useBackendProxy,
  };

  const response = await callLLM(llmOptions);

  try {
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in skeleton response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed                   ;
  } catch (err) {
    console.error('Failed to parse skeleton:', err);
    return null;
  }
}

// ============================================================================
// Pass 2: Population Detail Extraction
// ============================================================================

function getPopulationDetailPrompt(skeleton                 , popSkeleton                    )         {
  // Add HEDIS-specific instructions when this is a HEDIS measure
  const isHedisMeasure = skeleton.programType?.toLowerCase() === 'hedis';
  const hedisInstructions = isHedisMeasure ? `
5. For HEDIS measures: Infer the collection type for each data element from the specification.
   Use only these values:
   - "administrative" — data sourced from claims only (default)
   - "hybrid" — combination of claims and medical record review
   - "ecd" — Electronic Clinical Data (EHR/lab feeds)
   - "ecds" — Electronic Clinical Data Systems
   Set hybridSourceFlag: true only if this element is specifically identified as a medical record review element.
` : '';

  return `You are extracting DETAILED criteria for the ${popSkeleton.type} population of measure ${skeleton.measureId}.

Context:
- Measure: ${skeleton.title}
- Population: ${popSkeleton.name}
- Brief description: ${popSkeleton.briefDescription}
${popSkeleton.specSection ? `- Spec location: ${popSkeleton.specSection}` : ''}

Extract ALL criteria for this specific population. For each criterion:
1. Identify the clinical data type (diagnosis, procedure, medication, observation, encounter, demographic, immunization)
2. Extract the EXACT value set OID if present (format: 2.16.840.1.113883.x.x.x)
3. Extract timing requirements precisely
4. Note any negation (absence of condition, no procedure, etc.)${hedisInstructions}

Return JSON:
{
  "populationType": "${popSkeleton.type}",
  "criteria": {
    "operator": "AND",
    "children": [
      {
        "id": "crit_1",
        "type": "diagnosis",
        "description": "Diabetes diagnosis",
        "valueSet": {
          "name": "Diabetes",
          "oid": "2.16.840.1.113883.3.464.1003.103.12.1001"
        },
        "timingRequirements": [{
          "description": "Active during measurement period",
          "relativeTo": "Measurement Period",
          "operator": "during",
          "confidence": "high"
        }],
        "negation": false,
        "confidence": "high"${isHedisMeasure ? `,
        "collectionType": "administrative",
        "hybridSourceFlag": false` : ''}
      }
    ],
    "confidence": "high"
  },
  "valueSets": [
    {
      "id": "vs_1",
      "name": "Diabetes",
      "oid": "2.16.840.1.113883.3.464.1003.103.12.1001",
      "codes": []
    }
  ],
  "narrative": "Natural language description of this population",
  "warnings": []
}

IMPORTANT:
- Extract OIDs EXACTLY as written in the spec - do not guess or invent OIDs
- If an OID is not clearly stated, set oid to null and add a warning
- Use proper nesting for complex logic (A AND (B OR C))`;
}

async function extractPopulationDetail(
  documentText        ,
  skeleton                 ,
  popSkeleton                    ,
  options                   
)                                      {
  const errors           = [];
  const warnings           = [];

  // Include few-shot examples if enabled
  let systemPrompt = getPopulationDetailPrompt(skeleton, popSkeleton);
  if (options.includeFewShotExamples) {
    const examples = generateFewShotExamples(skeleton.programType);
    if (examples) {
      systemPrompt += `\n\n${examples}`;
    }
  }

  const llmOptions                    = {
    provider: options.provider || 'anthropic',
    apiKey: options.apiKey,
    model: options.model,
    systemPrompt,
    userPrompt: `Extract detailed criteria for the ${popSkeleton.type} population from this spec:\n\n${documentText.substring(0, 40000)}`,
    maxTokens: 8000,
    useBackendProxy: options.useBackendProxy,
  };

  try {
    const response = await callLLM(llmOptions);

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        populationType: popSkeleton.type                  ,
        success: false,
        errors: ['No JSON found in response'],
        warnings,
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate OIDs
    const oidValidations                        = [];
    if (parsed.valueSets) {
      for (const vs of parsed.valueSets) {
        if (vs.oid) {
          const validation = validateOID(vs.oid, vs.name);
          oidValidations.push(validation);

          if (!validation.valid) {
            warnings.push(`OID validation failed for "${vs.name}": ${validation.errors.map(e => e.message).join(', ')}`);
          }
        }
      }
    }

    // Build population definition
    const population                       = {
      id: `pop_${popSkeleton.type}_${Date.now()}`,
      type: popSkeleton.type                  ,
      description: popSkeleton.briefDescription,
      narrative: parsed.narrative || popSkeleton.briefDescription,
      criteria: buildLogicalClause(parsed.criteria),
      confidence: parsed.criteria?.confidence || 'medium',
      reviewStatus: 'pending',
    };

    // Add any warnings from the LLM
    if (parsed.warnings) {
      warnings.push(...parsed.warnings);
    }

    return {
      populationType: popSkeleton.type                  ,
      success: true,
      population,
      valueSets: parsed.valueSets?.map(normalizeValueSet) || [],
      oidValidations,
      errors,
      warnings,
    };
  } catch (err) {
    return {
      populationType: popSkeleton.type                  ,
      success: false,
      errors: [err instanceof Error ? err.message : 'Unknown error'],
      warnings,
    };
  }
}

// ============================================================================
// Pass 3: Cross-Reference Validation
// ============================================================================

const VALIDATION_SYSTEM_PROMPT = `You are validating a measure specification extraction. Compare the original spec with what was extracted.

Identify:
1. Populations mentioned in the spec but MISSING from extraction
2. Criteria within populations that were NOT captured
3. Extracted criteria that DON'T appear in the original spec (hallucinations)
4. Any stratification requirements that were missed
5. Any supplemental data elements that were missed

Return JSON:
{
  "valid": true/false,
  "missingPopulations": ["list of population names that should exist but don't"],
  "missingCriteria": [
    {
      "specText": "Exact text from spec describing the criterion",
      "populationType": "which population it belongs to",
      "confidence": "high/medium/low"
    }
  ],
  "possibleHallucinations": [
    {
      "criterionDescription": "Description of extracted criterion",
      "populationType": "which population",
      "reason": "Why this might be hallucinated"
    }
  ],
  "suggestions": ["Actionable suggestions for fixing issues"]
}

Be thorough but conservative - only flag clear misses or hallucinations.`;

async function crossReferenceValidation(
  documentText        ,
  skeleton                 ,
  populationResults                              ,
  options                   
)                                {
  // Build summary of what was extracted
  const extractedSummary = {
    measureId: skeleton.measureId,
    populations: populationResults.map(pr => ({
      type: pr.populationType,
      criteriaCount: pr.population?.criteria?.children?.length || 0,
      criteria: pr.population?.criteria?.children?.map((c     ) => c.description) || [],
    })),
  };

  const llmOptions                    = {
    provider: options.provider || 'anthropic',
    apiKey: options.apiKey,
    model: options.model,
    systemPrompt: VALIDATION_SYSTEM_PROMPT,
    userPrompt: `Original Specification:\n${documentText.substring(0, 30000)}\n\n---\n\nExtracted Data:\n${JSON.stringify(extractedSummary, null, 2)}\n\nValidate the extraction and identify any gaps or errors.`,
    maxTokens: 4000,
    useBackendProxy: options.useBackendProxy,
  };

  try {
    const response = await callLLM(llmOptions);

    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        valid: true,
        missingPopulations: [],
        missingCriteria: [],
        possibleHallucinations: [],
        suggestions: ['Could not parse validation response'],
      };
    }

    return JSON.parse(jsonMatch[0])                        ;
  } catch (err) {
    return {
      valid: true,
      missingPopulations: [],
      missingCriteria: [],
      possibleHallucinations: [],
      suggestions: [`Validation error: ${err instanceof Error ? err.message : 'Unknown'}`],
    };
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function buildLogicalClause(criteria     )                {
  if (!criteria) {
    return {
      id: `clause_${Date.now()}`,
      operator: 'AND',
      description: 'Empty criteria',
      children: [],
      confidence: 'low',
      reviewStatus: 'pending',
    };
  }

  return {
    id: criteria.id || `clause_${Date.now()}`,
    operator: criteria.operator || 'AND',
    description: criteria.description || '',
    children: (criteria.children || []).map((child     ) => {
      if (child.operator && child.children) {
        // Nested clause
        return buildLogicalClause(child);
      }
      // Data element
      return buildDataElement(child);
    }),
    confidence: criteria.confidence || 'medium',
    reviewStatus: 'pending',
  };
}

function buildDataElement(raw     )              {
  return {
    id: raw.id || `elem_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    type: raw.type || 'observation',
    description: raw.description || '',
    valueSet: raw.valueSet ? {
      id: `vs_${Date.now()}`,
      name: raw.valueSet.name || '',
      oid: raw.valueSet.oid,
      codes: [],
      confidence: 'medium',
    } : undefined,
    timingRequirements: raw.timingRequirements || [],
    negation: raw.negation || false,
    confidence: raw.confidence || 'medium',
    reviewStatus: 'pending',
  };
}

function normalizeValueSet(vs     )                    {
  return {
    id: vs.id || `vs_${Date.now()}`,
    name: vs.name || '',
    oid: vs.oid,
    url: vs.oid ? `http://cts.nlm.nih.gov/fhir/ValueSet/${vs.oid}` : undefined,
    codes: vs.codes || [],
    confidence: vs.confidence || 'medium',
  };
}

function assembleUMS(
  skeleton                 ,
  populationResults                              ,
  valueSets                     
)                       {
  // Deduplicate value sets by OID
  const uniqueValueSets = new Map                           ();
  for (const vs of valueSets) {
    const key = vs.oid || vs.name;
    if (!uniqueValueSets.has(key)) {
      uniqueValueSets.set(key, vs);
    }
  }

  const populations = populationResults
    .filter(pr => pr.success && pr.population)
    .map(pr => pr.population );

  const metadata                  = {
    measureId: skeleton.measureId,
    title: skeleton.title,
    version: skeleton.version || '1.0.0',
    program: skeleton.programType       ,
    measureType: skeleton.measureType       ,
    steward: skeleton.steward || 'Unknown',
    description: skeleton.description || '',
    measurementPeriod: {
      start: skeleton.measurementPeriod?.start,
      end: skeleton.measurementPeriod?.end,
      inclusive: true,
    },
    lastUpdated: new Date().toISOString(),
    scoring: skeleton.scoring       ,
  };

  return {
    id: `ums_${Date.now()}`,
    resourceType: 'Measure',
    metadata,
    populations,
    valueSets: Array.from(uniqueValueSets.values()),
    status: 'in_progress',
    overallConfidence: skeleton.confidence,
    reviewProgress: {
      total: populations.length,
      approved: 0,
      pending: populations.length,
      flagged: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// Chunking for Large Documents
// ============================================================================

/**
 * Chunk a large document for processing
 */
export function chunkDocument(
  text        ,
  maxChunkSize         = 30000,
  overlap         = 1000
)           {
  if (text.length <= maxChunkSize) {
    return [text];
  }

  const chunks           = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxChunkSize, text.length);

    // Try to break at a paragraph or sentence boundary
    if (end < text.length) {
      const lastParagraph = text.lastIndexOf('\n\n', end);
      const lastSentence = text.lastIndexOf('. ', end);

      if (lastParagraph > start + maxChunkSize / 2) {
        end = lastParagraph + 2;
      } else if (lastSentence > start + maxChunkSize / 2) {
        end = lastSentence + 2;
      }
    }

    chunks.push(text.substring(start, end));
    start = end - overlap;
  }

  return chunks;
}

/**
 * Check if document is too large for single-pass
 */
export function isLargeDocument(text        , threshold         = LARGE_DOCUMENT_THRESHOLD)          {
  return text.length > threshold;
}

// ============================================================================
// Chunk Result Merging
// ============================================================================

/**
 * Partial extraction result from a single chunk
 */
;                                  
                       
                             
                                                  
                                 
 

/**
 * Merge extraction results from multiple document chunks.
 *
 * Simple concatenation strategy:
 * - Skeleton: use first non-null skeleton (metadata should be in first chunk)
 * - Populations: deduplicate by type, merge criteria from overlapping chunks
 * - ValueSets: deduplicate by OID, merge codes
 */
export function mergeChunkExtractionResults(
  partialResults                           
)                                                                                                                        {
  if (partialResults.length === 0) {
    return { skeleton: null, populationResults: [], valueSets: [] };
  }

  if (partialResults.length === 1) {
    return {
      skeleton: partialResults[0].skeleton || null,
      populationResults: partialResults[0].populationResults,
      valueSets: partialResults[0].valueSets,
    };
  }

  // Use first skeleton found (metadata should be at start of document)
  const skeleton = partialResults.find(r => r.skeleton)?.skeleton || null;

  // Merge populations by type
  const populationsByType = new Map                                      ();
  for (const result of partialResults) {
    for (const popResult of result.populationResults) {
      const existing = populationsByType.get(popResult.populationType) || [];
      existing.push(popResult);
      populationsByType.set(popResult.populationType, existing);
    }
  }

  const mergedPopulations                               = [];
  for (const [_type, results] of populationsByType) {
    if (results.length === 1) {
      mergedPopulations.push(results[0]);
    } else {
      // Merge multiple results for same population type
      const merged = mergePopulationResults(results);
      mergedPopulations.push(merged);
    }
  }

  // Merge value sets by OID/name
  const valueSetsByKey = new Map                             ();
  for (const result of partialResults) {
    for (const vs of result.valueSets) {
      const key = vs.oid || vs.name.toLowerCase().trim();
      const existing = valueSetsByKey.get(key) || [];
      existing.push(vs);
      valueSetsByKey.set(key, existing);
    }
  }

  const mergedValueSets                      = [];
  for (const [_key, vsList] of valueSetsByKey) {
    if (vsList.length === 1) {
      mergedValueSets.push(vsList[0]);
    } else {
      // Merge codes from all instances
      const merged = { ...vsList[0] };
      const codeKeys = new Set        ();
      const allCodes        = [];

      for (const vs of vsList) {
        for (const code of vs.codes || []) {
          const codeKey = `${code.code}|${code.system}`;
          if (!codeKeys.has(codeKey)) {
            codeKeys.add(codeKey);
            allCodes.push(code);
          }
        }
      }

      merged.codes = allCodes;
      mergedValueSets.push(merged);
    }
  }

  return { skeleton, populationResults: mergedPopulations, valueSets: mergedValueSets };
}

/**
 * Merge multiple extraction results for the same population type
 */
function mergePopulationResults(results                              )                             {
  const successful = results.filter(r => r.success && r.population);

  if (successful.length === 0) {
    // All failed, return first with combined errors
    return {
      populationType: results[0].populationType,
      success: false,
      errors: results.flatMap(r => r.errors),
      warnings: results.flatMap(r => r.warnings),
    };
  }

  // Start with first successful result
  const base = { ...successful[0] };
  const population = { ...base.population  };

  // Merge criteria from all successful results (deduplicate by description)
  const criteriaSet = new Set        ();
  const allChildren                                  = [];

  for (const result of successful) {
    if (result.population?.criteria?.children) {
      for (const child of result.population.criteria.children) {
        const key = 'description' in child ? child.description : child.id;
        if (!criteriaSet.has(key)) {
          criteriaSet.add(key);
          allChildren.push(child);
        }
      }
    }
  }

  population.criteria = {
    ...population.criteria ,
    children: allChildren,
  };

  // Use longest narrative
  const longestNarrative = successful
    .map(r => r.population?.narrative || '')
    .sort((a, b) => b.length - a.length)[0];
  population.narrative = longestNarrative;

  // Combine value sets
  const allValueSets = successful.flatMap(r => r.valueSets || []);

  // Combine OID validations
  const allOidValidations = successful.flatMap(r => r.oidValidations || []);

  return {
    populationType: base.populationType,
    success: true,
    population,
    valueSets: allValueSets,
    oidValidations: allOidValidations,
    errors: results.flatMap(r => r.errors),
    warnings: results.flatMap(r => r.warnings),
  };
}

// ============================================================================
// Chunked Extraction for Large Documents
// ============================================================================

/**
 * Extract from a large document using semantic chunking
 */
async function extractWithChunking(
  documentText        ,
  options                   
)                            {
  const errors           = [];
  const warnings           = [];
  const timings = { skeletonMs: 0, populationsMs: 0, validationMs: 0, totalMs: 0 };
  const startTotal = performance.now();

  const progress = options.onProgress || (() => {});

  // Chunk the document using semantic boundaries
  const chunkingResult = chunkDocumentSemantic(documentText, {
    maxChunkSize: 40000, // Smaller chunks for LLM context
    overlapSize: 2000,
    preserveHeaders: true,
    minChunkSize: 5000,
  });

  warnings.push(`Document chunked into ${chunkingResult.chunks.length} parts for processing`);

  const partialResults                            = [];

  // Process each chunk
  for (let i = 0; i < chunkingResult.chunks.length; i++) {
    const chunk = chunkingResult.chunks[i];

    progress({
      phase: 'skeleton',
      currentStep: i + 1,
      totalSteps: chunkingResult.chunks.length,
      message: `Processing chunk ${i + 1} of ${chunkingResult.chunks.length}...`,
      details: `Sections: ${chunk.sections.map(s => s.type).join(', ')}`,
    });

    const partial                          = {
      chunk,
      populationResults: [],
      valueSets: [],
    };

    // Extract skeleton only from first chunk (metadata should be at start)
    if (i === 0) {
      const startSkeleton = performance.now();
      partial.skeleton = await extractSkeleton(chunk.content, options) || undefined;
      timings.skeletonMs = performance.now() - startSkeleton;
    }

    // Extract populations from chunks that contain population sections
    const hasPopulationSections = chunk.sections.some(s =>
      ['initial_population', 'denominator', 'denominator_exclusion',
       'denominator_exception', 'numerator', 'numerator_exclusion'].includes(s.type)
    );

    if (hasPopulationSections && partial.skeleton || partialResults[0]?.skeleton) {
      const skeleton = partial.skeleton || partialResults[0]?.skeleton ;
      const startPop = performance.now();

      for (const popSkeleton of skeleton.populations) {
        // Check if this population is likely in this chunk
        const popSectionType = popSkeleton.type.replace('-', '_');
        const inThisChunk = chunk.sections.some(s => s.type === popSectionType);

        if (inThisChunk) {
          const popResult = await extractPopulationDetail(
            chunk.content,
            skeleton,
            popSkeleton,
            options
          );

          partial.populationResults.push(popResult);
          if (popResult.valueSets) {
            partial.valueSets.push(...popResult.valueSets);
          }
        }
      }

      timings.populationsMs += performance.now() - startPop;
    }

    partialResults.push(partial);
  }

  // Merge results from all chunks
  const { skeleton, populationResults, valueSets } = mergeChunkExtractionResults(partialResults);

  if (!skeleton) {
    return {
      success: false,
      errors: ['Failed to extract measure skeleton from any chunk'],
      warnings,
      timings: { ...timings, totalMs: performance.now() - startTotal },
    };
  }

  // Run validation pass on full document (truncated)
  let validationResult                                  ;
  if (!options.skipValidationPass) {
    progress({
      phase: 'validation',
      currentStep: 1,
      totalSteps: 1,
      message: 'Validating extraction completeness...',
    });

    const startValidation = performance.now();
    validationResult = await crossReferenceValidation(
      documentText.substring(0, 30000),
      skeleton,
      populationResults,
      options
    );
    timings.validationMs = performance.now() - startValidation;
  }

  // Assemble UMS
  progress({
    phase: 'complete',
    currentStep: 1,
    totalSteps: 1,
    message: 'Assembling measure specification...',
  });

  const ums = assembleUMS(skeleton, populationResults, valueSets);

  timings.totalMs = performance.now() - startTotal;

  return {
    success: errors.length === 0,
    ums,
    skeleton,
    populationResults,
    validationResult,
    errors,
    warnings,
    timings,
  };
}
