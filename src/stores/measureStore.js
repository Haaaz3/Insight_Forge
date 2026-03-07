import { create } from 'zustand';
import { useFeedbackStore } from './feedbackStore';
;            
                       
               
                
                         
                    
                 
                
                   
                   
                 
               
                      
import { setOperatorBetween } from '../types/ums';
;                                                   
import { syncAgeConstraints } from '../utils/constraintSync';
import { calculateDataElementComplexity } from '../services/complexityCalculator';
import { migrateMeasure, needsMigration, backfillMissingOIDs } from '../utils/measureMigration';
import { getMeasuresFull, importMeasures } from '../api/measures';
import { transformMeasureDto } from '../api/transformers';
import { getAllStandardValueSets } from '../constants/standardValueSets';

;                                                

;                       
                     
                                   
                                 

                      
                            
                          
                              

             
                                                                                                       
                               
                       
                         

                    
                                       

               
                                             
                               

                
                                   
                                                                                                  

            
                                                      
                                                                              
                                                                                                                                        
                                               
                                                
                                                         
                                                     
                                                
                                               
                                                            

                   
                                                                                                             
                                                       

                            
                                           
                                             
                                                  

                      
                                                                       

                       
                                                              
                                              

                                                                
                                                                                                              
                                                                                                                 
                                                                                                                                                        

                                      
                                                                            

                              
                                                                                                                                                           
                                                                                                        
                                                                                               

                                    
                                                                       
                                                                                                                       
                                                                                                                      
                                                                                                                                       
                                                                    

                            
                                                                                                            
                                                                                                      
                                                                                   

                          
                                                                                                      
                                                                    

             
                                                      
                                                                                                                  
                                                             
 

// Helper to load persisted viewed measures from localStorage
const loadViewedMeasures = () => {
  try {
    const stored = localStorage.getItem('viewed-measures');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// Helper to save viewed measures to localStorage
const saveViewedMeasures = (viewedMeasures) => {
  try {
    localStorage.setItem('viewed-measures', JSON.stringify(viewedMeasures));
  } catch {
    // Ignore storage errors
  }
};

export const useMeasureStore = create              ()(
    (set, get) => ({
      measures: [],
      activeMeasureId: null,
      isLoadingFromApi: false,
      apiError: null,
      lastLoadedAt: null,
      activeTab: 'library',
      editorSection: null,
      isUploading: false,
      uploadProgress: 0,
      selectedCodeFormat: 'cql',
      validationTraces: [],
      activeTraceId: null,
      lastGeneratedCode: { cql: null, sql: null, measureId: null },
      measureCodeOverrides: {}, // Keyed by `${measureId}::${format}`

      // Track viewed measures for "New" badge (persisted to localStorage)
      viewedMeasures: loadViewedMeasures(),

      // Mark a measure as viewed (clears the "New" badge)
      markMeasureViewed: (measureId) => {
        const { viewedMeasures } = get();
        if (!viewedMeasures.includes(measureId)) {
          const newViewedMeasures = [...viewedMeasures, measureId];
          saveViewedMeasures(newViewedMeasures);
          set({ viewedMeasures: newViewedMeasures });
        }
      },

      // Load measures from backend API
      loadFromApi: async () => {
        // Skip if already loading
        if (get().isLoadingFromApi) return;

        set({ isLoadingFromApi: true, apiError: null });

        try {
          // Fetch all measures with full details in a single request (avoids N+1)
          const measureDtos = await getMeasuresFull();

          // Transform DTOs and apply migrations
          let validMeasures = measureDtos
            .map(dto => {
              try {
                return transformMeasureDto(dto);
              } catch (err) {
                console.error(`Failed to transform measure ${dto.id}:`, err);
                return null;
              }
            })
            .filter((m)                            => m !== null)
            .map((measure) => {
              if (needsMigration(measure)) {
                console.log(`Migrating measure ${measure.id} to FHIR-aligned schema`);
                return migrateMeasure(measure);
              }
              return measure;
            });

          // Filter out measures that were deleted locally (backend 403 workaround)
          validMeasures = validMeasures.filter(m => {
            const isDeleted = localStorage.getItem(`measure-deleted-${m.metadata.measureId}`);
            if (isDeleted) {
              console.log(`[measureStore] Filtering out deleted measure: ${m.metadata.measureId}`);
              return false;
            }
            return true;
          });

          // Replace backend measures with local versions if they exist (backend 403 workaround)
          // Local versions have enriched data from successful imports
          validMeasures = validMeasures.map(m => {
            const localVersionJson = localStorage.getItem(`measure-local-${m.metadata.measureId}`);
            if (localVersionJson) {
              try {
                const localMeasure = JSON.parse(localVersionJson);
                // Debug: log numerator criteria count to help diagnose stale cache issues
                const numeratorPop = localMeasure.populations?.find(p => p.type === 'numerator');
                const criteriaCount = numeratorPop?.criteria?.children?.length || 0;
                console.log(`[measureStore] Using local version of ${m.metadata.measureId} (numerator has ${criteriaCount} criteria)`);
                return localMeasure                        ;
              } catch (e) {
                console.error(`[measureStore] Failed to parse local measure ${m.metadata.measureId}:`, e);
              }
            }
            return m;
          });

          // Also add any locally-imported measures that aren't in the backend yet
          const backendMeasureIds = new Set(validMeasures.map(m => m.metadata?.measureId?.trim()).filter(Boolean));
          const localMeasureKeys = Object.keys(localStorage).filter(k => k.startsWith('measure-local-'));
          for (const key of localMeasureKeys) {
            const measureId = key.replace('measure-local-', '').trim();
            if (!backendMeasureIds.has(measureId) && !localStorage.getItem(`measure-deleted-${measureId}`)) {
              try {
                const localMeasure = JSON.parse(localStorage.getItem(key) || '');
                console.log(`[measureStore] Adding locally-imported measure: ${measureId}`);
                validMeasures.push(localMeasure);
              } catch (e) {
                console.error(`[measureStore] Failed to parse local measure ${measureId}:`, e);
              }
            }
          }

          // Deduplicate by measureId - keep the first occurrence (which is the local/enriched version)
          // Normalize measureIds by trimming whitespace for robust comparison
          const seenMeasureIds = new Set();
          const deduplicatedMeasures = validMeasures.filter(m => {
            const measureId = m.metadata?.measureId?.trim();
            if (!measureId) {
              console.log(`[measureStore] Removing measure with no measureId`);
              return false;
            }
            if (seenMeasureIds.has(measureId)) {
              console.log(`[measureStore] Removing duplicate measure: ${measureId} (keeping first occurrence)`);
              return false;
            }
            seenMeasureIds.add(measureId);
            return true;
          });

          if (deduplicatedMeasures.length !== validMeasures.length) {
            console.log(`[measureStore] Deduplicated ${validMeasures.length - deduplicatedMeasures.length} measures`);
          }

          set({
            measures: deduplicatedMeasures,
            isLoadingFromApi: false,
            lastLoadedAt: new Date().toISOString(),
          });

          console.log(`Loaded ${validMeasures.length} measures from API (with local overrides)`);

          // After setting measures, re-enrich data elements that are missing value sets
          // This covers the case where backend doesn't return value sets on DataElementDto
          setTimeout(() => {
            const currentMeasures = get().measures;
            let anyUpdated = false;

            const enrichedMeasures = currentMeasures.map(measure => {
              const enrichedPopulations = reEnrichPopulations(measure);
              if (enrichedPopulations !== measure.populations) {
                anyUpdated = true;
                return { ...measure, populations: enrichedPopulations };
              }
              return measure;
            });

            if (anyUpdated) {
              set({ measures: enrichedMeasures });
              console.log('[measureStore] Re-enriched data elements with standard value sets');
            }
          }, 100); // Defer to avoid blocking initial render
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load measures';
          console.error('Failed to load measures from API:', error);
          set({
            isLoadingFromApi: false,
            apiError: errorMessage,
          });
        }
      },

      // Import a measure to the backend and add to local state
      // NOTE: Backend may return 403 due to auth issues, but we ALWAYS save locally
      importMeasure: async (measure) => {
        // IMPORTANT: Clear any stale localStorage cache FIRST before processing
        // This ensures the new import always takes precedence over old cached data
        const incomingMeasureId = measure.metadata?.measureId;
        if (incomingMeasureId) {
          localStorage.removeItem(`measure-local-${incomingMeasureId}`);
          localStorage.removeItem(`measure-deleted-${incomingMeasureId}`);
          console.log(`[importMeasure] Cleared stale localStorage for ${incomingMeasureId}`);
        }

        // Add to local state with FHIR alignment FIRST (before backend attempt)
        let fhirMeasure = measure.resourceType === 'Measure'
          ? measure
          : needsMigration(measure)
            ? migrateMeasure(measure)
            : { ...measure, resourceType: 'Measure'          };

        // Link data elements to component library
        // This creates new components or links to existing ones based on value set matching
        try {
          const { useComponentLibraryStore } = await import('./componentLibraryStore');
          const componentStore = useComponentLibraryStore.getState();
          const linkMap = componentStore.linkMeasureComponents(
            fhirMeasure.id,
            fhirMeasure.populations
          );

          // Update the measure's data elements with their libraryComponentIds
          // Also populate hedis block from catalogueDefaults for HEDIS measures
          if (Object.keys(linkMap).length > 0) {
            const isHedisMeasure = fhirMeasure.metadata?.program === 'HEDIS';
            const hedisApplicableTypes = ['encounter', 'procedure', 'laboratory', 'medication', 'diagnosis', 'condition'];

            const updateElementLinks = (node     )      => {
              if (!node) return node;
              if ('operator' in node && 'children' in node) {
                return {
                  ...node,
                  children: node.children.map(updateElementLinks),
                };
              }
              // It's a DataElement - update libraryComponentId if we have a link
              if (linkMap[node.id] && linkMap[node.id] !== '__ZERO_CODES__') {
                const linkedComponentId = linkMap[node.id];
                let updatedNode = { ...node, libraryComponentId: linkedComponentId };

                // For HEDIS measures, populate hedis block from component's catalogueDefaults
                if (isHedisMeasure && hedisApplicableTypes.includes(node.type?.toLowerCase())) {
                  const linkedComponent = componentStore.components[linkedComponentId];
                  const catalogueDefaults = linkedComponent?.catalogueDefaults;
                  const hedisDefaults = catalogueDefaults?.hedis;

                  // Only set hedis block if element doesn't already have one or has null values
                  if (!updatedNode.hedis || updatedNode.hedis.collectionType === null) {
                    updatedNode = {
                      ...updatedNode,
                      hedis: {
                        collectionType: hedisDefaults?.collectionType || updatedNode.hedis?.collectionType || null,
                        hybridSourceFlag: hedisDefaults?.hybridSourceFlag ?? updatedNode.hedis?.hybridSourceFlag ?? false,
                      },
                    };
                  }
                }

                return updatedNode;
              }
              return node;
            };

            fhirMeasure = {
              ...fhirMeasure,
              populations: fhirMeasure.populations.map((pop) => ({
                ...pop,
                criteria: pop.criteria ? updateElementLinks(pop.criteria) : pop.criteria,
              })),
            };

            console.log(`[importMeasure] Linked ${Object.keys(linkMap).length} data elements to component library`);
          }
        } catch (linkError) {
          console.error('[importMeasure] Failed to link components:', linkError);
          // Continue without linking - not a fatal error
        }

        // Replace existing measure with same measureId, or append if new
        // Also set as active and navigate to editor
        // Mark new imports with isNew flag for "New" badge
        const measureWithNew = { ...fhirMeasure, isNew: true };

        set((state) => {
          const measureId = measureWithNew.metadata.measureId;
          const existingIndex = state.measures.findIndex(m => m.metadata.measureId === measureId);

          if (existingIndex >= 0) {
            // Replace existing measure with new version
            console.log(`[importMeasure] Replacing existing measure ${measureId} at index ${existingIndex}`);
            const updatedMeasures = [...state.measures];
            updatedMeasures[existingIndex] = measureWithNew;
            return {
              measures: updatedMeasures,
              activeMeasureId: measureWithNew.id,
              activeTab: 'editor',
            };
          } else {
            // Append new measure
            return {
              measures: [...state.measures, measureWithNew],
              activeMeasureId: measureWithNew.id,
              activeTab: 'editor',
            };
          }
        });

        // Save to localStorage for persistence (backend 403 workaround)
        // This ensures the enriched measure survives page refresh
        try {
          const measureId = measureWithNew.metadata.measureId;
          localStorage.setItem(`measure-local-${measureId}`, JSON.stringify(measureWithNew));
          // Clear any deleted flag for this measure
          localStorage.removeItem(`measure-deleted-${measureId}`);
          console.log(`[importMeasure] Saved measure ${measureId} to localStorage`);
        } catch (e) {
          console.error('[importMeasure] Failed to save to localStorage:', e);
        }

        // Try backend import (may fail with 403, but we've already saved locally)
        try {
          const converted = convertUmsToImportFormat(measure);
          const importRequest = {
            measures: [converted],
            components: [],
            validationTraces: [],
            codeStates: {},
            version: 1,
            exportedAt: new Date().toISOString(),
          };

          const result = await importMeasures(importRequest);

          if (result.success) {
            console.log(`[importMeasure] Backend import successful for ${measure.metadata.measureId}`);
          } else {
            console.warn(`[importMeasure] Backend import failed (403?): ${result.message} - measure saved locally`);
          }
        } catch (error) {
          console.warn('[importMeasure] Backend import error (403?):', error, '- measure saved locally');
        }

        // Always return success since we saved locally
        return { success: true };
      },

      addMeasure: (measure) => {
        // If measure already has resourceType, it's already formatted - don't migrate
        // This preserves copied measures exactly as they are
        let fhirMeasure = measure.resourceType === 'Measure'
          ? measure
          : needsMigration(measure)
            ? migrateMeasure(measure)
            : { ...measure, resourceType: 'Measure'          };

        // Backfill missing OIDs from standard catalog
        fhirMeasure = backfillMissingOIDs(fhirMeasure);

        // Link data elements to component library (async, non-blocking for initial add)
        // Import the store dynamically to avoid circular dependency
        import('./componentLibraryStore').then(({ useComponentLibraryStore }) => {
          const componentStore = useComponentLibraryStore.getState();
          const linkMap = componentStore.linkMeasureComponents(
            fhirMeasure.id,
            fhirMeasure.populations
          );

          // Update the measure's data elements with their libraryComponentIds
          // Also populate hedis block from catalogueDefaults for HEDIS measures
          if (Object.keys(linkMap).length > 0) {
            const isHedisMeasure = fhirMeasure.metadata?.program === 'HEDIS';
            const hedisApplicableTypes = ['encounter', 'procedure', 'laboratory', 'medication', 'diagnosis', 'condition'];

            const updateElementLinks = (node     )      => {
              if (!node) return node;
              if ('operator' in node && 'children' in node) {
                return {
                  ...node,
                  children: node.children.map(updateElementLinks),
                };
              }
              // It's a DataElement - update libraryComponentId if we have a link
              if (linkMap[node.id] && linkMap[node.id] !== '__ZERO_CODES__') {
                const linkedComponentId = linkMap[node.id];
                let updatedNode = { ...node, libraryComponentId: linkedComponentId };

                // For HEDIS measures, populate hedis block from component's catalogueDefaults
                if (isHedisMeasure && hedisApplicableTypes.includes(node.type?.toLowerCase())) {
                  const linkedComponent = componentStore.components[linkedComponentId];
                  const catalogueDefaults = linkedComponent?.catalogueDefaults;
                  const hedisDefaults = catalogueDefaults?.hedis;

                  // Only set hedis block if element doesn't already have one or has null values
                  if (!updatedNode.hedis || updatedNode.hedis.collectionType === null) {
                    updatedNode = {
                      ...updatedNode,
                      hedis: {
                        collectionType: hedisDefaults?.collectionType || updatedNode.hedis?.collectionType || null,
                        hybridSourceFlag: hedisDefaults?.hybridSourceFlag ?? updatedNode.hedis?.hybridSourceFlag ?? false,
                      },
                    };
                  }
                }

                return updatedNode;
              }
              return node;
            };

            // Update the measure in state with linked components
            set((state) => ({
              measures: state.measures.map((m) =>
                m.id === fhirMeasure.id
                  ? {
                      ...m,
                      populations: m.populations.map((pop) => ({
                        ...pop,
                        criteria: pop.criteria ? updateElementLinks(pop.criteria) : pop.criteria,
                      })),
                    }
                  : m
              ),
            }));

            console.log(`[addMeasure] Linked ${Object.keys(linkMap).length} data elements to component library`);
          }
        }).catch((err) => {
          console.error('[addMeasure] Failed to link components:', err);
        });

        set((state) => ({
          measures: [...state.measures, fhirMeasure],
          activeMeasureId: fhirMeasure.id,
          activeTab: 'editor',
        }));
      },

      updateMeasure: (id, updates) =>
        set((state) => ({
          measures: state.measures.map((m) =>
            m.id === id ? { ...m, ...updates, updatedAt: new Date().toISOString() } : m
          ),
        })),

      batchUpdateMeasures: (updates) => {
        const state = get();
        const now = new Date().toISOString();

        // Validate all measure IDs exist before applying any updates
        const missingIds           = [];
        for (const update of updates) {
          if (!state.measures.some((m) => m.id === update.id)) {
            missingIds.push(update.id);
          }
        }

        if (missingIds.length > 0) {
          const error = `Batch update rejected: measure IDs not found: ${missingIds.join(', ')}`;
          console.error(error);
          return { success: false, error };
        }

        // Build a map of updates for efficient lookup
        const updateMap = new Map                                       ();
        for (const update of updates) {
          updateMap.set(update.id, update.updates);
        }

        // Apply all updates in a single state transition
        set((s) => ({
          measures: s.measures.map((m) => {
            const measureUpdates = updateMap.get(m.id);
            if (measureUpdates) {
              return { ...m, ...measureUpdates, updatedAt: now };
            }
            return m;
          }),
        }));

        return { success: true };
      },

      deleteMeasure: async (id) => {
        // Get the measure before deleting to update component usage
        const measure = get().measures.find((m) => m.id === id);

        try {
          // Delete from backend first
          const { deleteMeasure: deleteMeasureApi } = await import('../api/measures');
          await deleteMeasureApi(id);
          console.log(`Deleted measure ${id} from backend`);
        } catch (error) {
          // 404 means the resource is already gone - treat as success
          if (error?.status === 404 || error?.message?.includes('404')) {
            console.log(`Measure ${id} already deleted from backend (404)`);
          } else {
            console.error('Failed to delete measure from backend:', error);
          }
          // Continue with local delete even if backend fails
        }

        // Update component usage - remove this measure from all components that reference it
        // IMPORTANT: Components are NOT deleted, only their usage count is decremented
        if (measure) {
          try {
            const { useComponentLibraryStore } = await import('./componentLibraryStore');
            const componentStore = useComponentLibraryStore.getState();

            // Collect all libraryComponentIds from the measure
            const collectComponentIds = (node     )           => {
              if (!node) return [];
              if ('operator' in node && 'children' in node) {
                return node.children.flatMap(collectComponentIds);
              }
              // It's a DataElement - check for libraryComponentId
              return node.libraryComponentId ? [node.libraryComponentId] : [];
            };

            const componentIds = new Set        ();
            for (const pop of measure.populations) {
              if (pop.criteria) {
                const ids = collectComponentIds(pop.criteria);
                ids.forEach((cid) => componentIds.add(cid));
              }
            }

            // Remove usage for each component (decrement, don't delete)
            for (const componentId of componentIds) {
              componentStore.removeUsage(componentId, id);
            }

            console.log(`Updated usage for ${componentIds.size} components after deleting measure ${id}`);
          } catch (error) {
            console.error('Failed to update component usage after measure delete:', error);
          }
        }

        // Always update local state
        set((state) => ({
          measures: state.measures.filter((m) => m.id !== id),
          activeMeasureId: state.activeMeasureId === id ? null : state.activeMeasureId,
        }));

        // Mark as deleted in localStorage (backend 403 workaround)
        // This ensures the delete persists across page refresh
        if (measure) {
          const measureId = measure.metadata.measureId;
          localStorage.setItem(`measure-deleted-${measureId}`, 'true');
          localStorage.removeItem(`measure-local-${measureId}`);
          console.log(`[deleteMeasure] Marked ${measureId} as deleted in localStorage`);
        }
      },

      setActiveMeasure: (id) => set({ activeMeasureId: id, activeTab: id ? 'editor' : 'library' }),
      setActiveTab: (tab) => set({ activeTab: tab }),
      setEditorSection: (section) => set({ editorSection: section }),
      setUploadProgress: (progress) => set({ uploadProgress: progress }),
      setIsUploading: (uploading) => set({ isUploading: uploading }),
      setSelectedCodeFormat: (format) => set({ selectedCodeFormat: format }),
      setLastGeneratedCode: (cql, sql, measureId) =>
        set({ lastGeneratedCode: { cql, sql, measureId } }),

      // Measure-level code overrides (for CodeGeneration page)
      saveMeasureCodeOverride: (measureId, format, code, note, originalGeneratedCode) => {
        const key = `${measureId}::${format}`;
        const now = new Date().toISOString();

        // Get current code before this edit (for diff tracking)
        const existingOverride = get().measureCodeOverrides[key];
        const previousCode = existingOverride?.code || originalGeneratedCode;

        const noteEntry = {
          id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: now,
          author: 'User',
          content: note,
          format,
          // Store before/after for this specific edit (enables diff viewing in history)
          codeBefore: previousCode,
          codeAfter: code,
        };

        set((state) => {
          const existing = state.measureCodeOverrides[key];
          return {
            measureCodeOverrides: {
              ...state.measureCodeOverrides,
              [key]: {
                format,
                code,
                originalGeneratedCode: existing?.originalGeneratedCode || originalGeneratedCode,
                createdAt: existing?.createdAt || now,
                updatedAt: now,
                notes: [...(existing?.notes || []), noteEntry],
              },
            },
          };
        });
      },

      revertMeasureCodeOverride: (measureId, format) => {
        const key = `${measureId}::${format}`;
        set((state) => {
          const { [key]: _removed, ...rest } = state.measureCodeOverrides;
          return { measureCodeOverrides: rest };
        });
      },

      getMeasureCodeOverride: (measureId, format) => {
        const key = `${measureId}::${format}`;
        return get().measureCodeOverrides[key] || null;
      },

      updateReviewStatus: (measureId, componentId, status, notes) =>
        set((state) => {
          // First pass: update the specific component
          const updateComponent = (obj     )      => {
            if (!obj) return obj;
            if (obj.id === componentId) {
              return { ...obj, reviewStatus: status, reviewNotes: notes };
            }
            if (obj.criteria) {
              return { ...obj, criteria: updateComponent(obj.criteria) };
            }
            if (obj.children) {
              return { ...obj, children: obj.children.map(updateComponent) };
            }
            return obj;
          };

          // Second pass: auto-approve parents if all children are approved
          const autoApproveParents = (obj     )      => {
            if (!obj) return obj;

            // First, recursively process children
            let updated = obj;
            if (updated.criteria) {
              updated = { ...updated, criteria: autoApproveParents(updated.criteria) };
            }
            if (updated.children) {
              updated = { ...updated, children: updated.children.map(autoApproveParents) };
            }

            // Check if this node has children and all are approved
            const children = updated.children || (updated.criteria ? [updated.criteria] : []);
            if (children.length > 0) {
              const allChildrenApproved = children.every((child     ) => {
                if (!child) return true;
                // Check the child's status
                if (child.reviewStatus !== 'approved') return false;
                // Also check nested children recursively
                const nestedChildren = child.children || (child.criteria ? [child.criteria] : []);
                return nestedChildren.length === 0 || nestedChildren.every((nc     ) => nc?.reviewStatus === 'approved');
              });

              // If all children are approved, auto-approve this parent (if not already)
              if (allChildrenApproved && updated.reviewStatus === 'pending') {
                updated = { ...updated, reviewStatus: 'approved'                 };
              }
            }

            return updated;
          };

          return {
            measures: state.measures.map((m) => {
              if (m.id !== measureId) return m;
              // First update the component, then auto-approve parents
              const updatedPops = m.populations.map(updateComponent);
              const finalPops = updatedPops.map(autoApproveParents);
              return {
                ...m,
                populations: finalPops,
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        }),

      approveAllLowComplexity: (measureId) =>
        set((state) => {
          const approveLowComplexity = (obj     )      => {
            if (!obj) return obj;
            // For data elements (leaf nodes with type), check complexity
            const isDataElement = obj.type && !obj.operator;
            let updated = obj;
            if (isDataElement && obj.reviewStatus === 'pending') {
              const complexity = calculateDataElementComplexity(obj);
              if (complexity === 'low') {
                updated = { ...obj, reviewStatus: 'approved'                 };
              }
            }
            if (updated.criteria) {
              return { ...updated, criteria: approveLowComplexity(updated.criteria) };
            }
            if (updated.children) {
              return { ...updated, children: updated.children.map(approveLowComplexity) };
            }
            return updated;
          };

          // Auto-approve parents if all children are approved
          const autoApproveParents = (obj     )      => {
            if (!obj) return obj;

            let updated = obj;
            if (updated.criteria) {
              updated = { ...updated, criteria: autoApproveParents(updated.criteria) };
            }
            if (updated.children) {
              updated = { ...updated, children: updated.children.map(autoApproveParents) };
            }

            const children = updated.children || (updated.criteria ? [updated.criteria] : []);
            if (children.length > 0) {
              const allChildrenApproved = children.every((child     ) => {
                if (!child) return true;
                if (child.reviewStatus !== 'approved') return false;
                const nestedChildren = child.children || (child.criteria ? [child.criteria] : []);
                return nestedChildren.length === 0 || nestedChildren.every((nc     ) => nc?.reviewStatus === 'approved');
              });

              if (allChildrenApproved && updated.reviewStatus === 'pending') {
                updated = { ...updated, reviewStatus: 'approved'                 };
              }
            }

            return updated;
          };

          return {
            measures: state.measures.map((m) => {
              if (m.id !== measureId) return m;
              const approvedPops = m.populations.map(approveLowComplexity);
              const finalPops = approvedPops.map(autoApproveParents);
              return {
                ...m,
                populations: finalPops,
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        }),

      lockMeasure: (measureId) =>
        set((state) => ({
          measures: state.measures.map((m) =>
            m.id === measureId
              ? { ...m, lockedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
              : m
          ),
        })),

      unlockMeasure: (measureId) =>
        set((state) => ({
          measures: state.measures.map((m) =>
            m.id === measureId
              ? { ...m, lockedAt: undefined, lockedBy: undefined, updatedAt: new Date().toISOString() }
              : m
          ),
        })),

      isMeasureLocked: (measureId) => {
        const measure = get().measures.find((m) => m.id === measureId);
        return !!measure?.lockedAt;
      },

      setMeasureStatus: (measureId, status) =>
        set((state) => ({
          measures: state.measures.map((m) =>
            m.id === measureId
              ? { ...m, status, updatedAt: new Date().toISOString() }
              : m
          ),
        })),

      addValidationTrace: (trace) =>
        set((state) => ({
          validationTraces: [...state.validationTraces, trace],
        })),

      setActiveTrace: (id) => set({ activeTraceId: id }),

      // Value set editing with correction tracking
      addCodeToValueSet: (measureId, valueSetId, code, userNotes) => {
        // Record to feedback store for analytics
        const measure = get().measures.find((m) => m.id === measureId);
        if (measure) {
          try {
            const feedbackStore = useFeedbackStore.getState();
            if (feedbackStore.feedbackEnabled && measure._originalExtraction) {
              const valueSet = measure.valueSets.find((vs) => vs.id === valueSetId);
              feedbackStore.recordCorrection({
                measureId: measure.id,
                measureTitle: measure.metadata?.title || measure.title || 'Unknown',
                catalogueType: measure.metadata?.catalogueType || 'unknown',
                extractionTimestamp: measure.metadata?.extractedAt,
                fieldPath: `${valueSetId}.valueSet.codes`,
                fieldLabel: 'Value Set Code Added',
                originalValue: 'NOT_IN_SET',
                correctedValue: { code: code.code, display: code.display, system: code.system },
                dataElementName: valueSet?.name || '',
                populationName: '',
                userNote: userNotes || '',
              });
            }
          } catch (err) {
            console.error('[feedback] Add code capture error:', err);
          }
        }

        set((state) => {
          const m = state.measures.find((m) => m.id === measureId);
          if (!m) return state;

          const valueSet = m.valueSets.find((vs) => vs.id === valueSetId);
          const originalCodes = valueSet?.codes ? [...valueSet.codes] : [];

          // Create correction record
          const correction = {
            id: `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            correctionType: 'code_added',
            componentId: valueSetId,
            componentPath: `valueSets[${m.valueSets.findIndex((vs) => vs.id === valueSetId)}].codes`,
            originalValue: originalCodes,
            correctedValue: [...originalCodes, code],
            userNotes,
            measureContext: {
              measureId: m.metadata.measureId,
              measureType: m.metadata.measureType,
              program: m.metadata.program,
            },
          };

          return {
            measures: state.measures.map((measure) => {
              if (measure.id !== measureId) return measure;
              return {
                ...measure,
                valueSets: measure.valueSets.map((vs) =>
                  vs.id === valueSetId
                    ? { ...vs, codes: [...(vs.codes || []), code] }
                    : vs
                ),
                corrections: [...(measure.corrections || []), correction],
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        });
      },

      removeCodeFromValueSet: (measureId, valueSetId, codeValue, userNotes) => {
        // Record to feedback store for analytics
        const measure = get().measures.find((m) => m.id === measureId);
        if (measure) {
          try {
            const feedbackStore = useFeedbackStore.getState();
            if (feedbackStore.feedbackEnabled && measure._originalExtraction) {
              const valueSet = measure.valueSets.find((vs) => vs.id === valueSetId);
              const removedCode = valueSet?.codes?.find((c) => c.code === codeValue);
              feedbackStore.recordCorrection({
                measureId: measure.id,
                measureTitle: measure.metadata?.title || measure.title || 'Unknown',
                catalogueType: measure.metadata?.catalogueType || 'unknown',
                extractionTimestamp: measure.metadata?.extractedAt,
                fieldPath: `${valueSetId}.valueSet.codes`,
                fieldLabel: 'Value Set Code Removed',
                originalValue: removedCode ? { code: removedCode.code, display: removedCode.display, system: removedCode.system } : codeValue,
                correctedValue: 'REMOVED_FROM_SET',
                dataElementName: valueSet?.name || '',
                populationName: '',
                userNote: userNotes || '',
              });
            }
          } catch (err) {
            console.error('[feedback] Remove code capture error:', err);
          }
        }

        set((state) => {
          const m = state.measures.find((m) => m.id === measureId);
          if (!m) return state;

          const valueSet = m.valueSets.find((vs) => vs.id === valueSetId);
          const originalCodes = valueSet?.codes ? [...valueSet.codes] : [];
          const removedCode = originalCodes.find((c) => c.code === codeValue);
          const newCodes = originalCodes.filter((c) => c.code !== codeValue);

          const correction = {
            id: `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            correctionType: 'code_removed',
            componentId: valueSetId,
            componentPath: `valueSets[${m.valueSets.findIndex((vs) => vs.id === valueSetId)}].codes`,
            originalValue: removedCode,
            correctedValue: null,
            userNotes,
            measureContext: {
              measureId: m.metadata.measureId,
              measureType: m.metadata.measureType,
              program: m.metadata.program,
            },
          };

          return {
            measures: state.measures.map((measure) => {
              if (measure.id !== measureId) return measure;
              return {
                ...measure,
                valueSets: measure.valueSets.map((vs) =>
                  vs.id === valueSetId
                    ? { ...vs, codes: newCodes }
                    : vs
                ),
                corrections: [...(measure.corrections || []), correction],
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        });
      },

      updateDataElement: (measureId, componentId, updates, correctionType, userNotes) =>
        set((state) => {
          const measure = state.measures.find((m) => m.id === measureId);
          if (!measure) return state;

          // Find and capture original value
          let originalValue      = null;
          let componentPath = '';

          const findAndCapture = (obj     , path        )          => {
            if (obj?.id === componentId) {
              originalValue = { ...obj };
              componentPath = path;
              return true;
            }
            if (obj?.criteria) {
              if (findAndCapture(obj.criteria, `${path}.criteria`)) return true;
            }
            if (obj?.children) {
              for (let i = 0; i < obj.children.length; i++) {
                if (findAndCapture(obj.children[i], `${path}.children[${i}]`)) return true;
              }
            }
            return false;
          };

          for (let i = 0; i < measure.populations.length; i++) {
            if (findAndCapture(measure.populations[i], `populations[${i}]`)) break;
          }

          const correction                    = {
            id: `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toISOString(),
            correctionType,
            componentId,
            componentPath,
            originalValue,
            correctedValue: { ...originalValue, ...updates },
            userNotes,
            measureContext: {
              measureId: measure.metadata.measureId,
              measureType: measure.metadata.measureType,
              program: measure.metadata.program,
            },
          };

          // Record to feedback store for analytics (compare to original extraction)
          try {
            const feedbackStore = useFeedbackStore.getState();
            if (feedbackStore.feedbackEnabled && measure._originalExtraction) {
              // Find original extraction value for this element
              const findOriginalElement = (nodes, targetId) => {
                if (!nodes) return null;
                for (const node of nodes) {
                  if (node?.id === targetId) return node;
                  if (node?.criteria) {
                    const found = findOriginalElement([node.criteria], targetId);
                    if (found) return found;
                  }
                  if (node?.children) {
                    const found = findOriginalElement(node.children, targetId);
                    if (found) return found;
                  }
                }
                return null;
              };

              const originalElement = findOriginalElement(measure._originalExtraction, componentId);

              // Record corrections for each field that changed from original extraction
              Object.entries(updates).forEach(([fieldKey, newValue]) => {
                const origVal = originalElement?.[fieldKey];
                // Only record if we have an original extraction value and it differs
                if (originalElement && origVal !== undefined && JSON.stringify(origVal) !== JSON.stringify(newValue)) {
                  feedbackStore.recordCorrection({
                    measureId: measure.id,
                    measureTitle: measure.metadata?.title || 'Unknown Measure',
                    catalogueType: measure.metadata?.catalogueType || 'unknown',
                    extractionTimestamp: measure.metadata?.extractedAt,
                    fieldPath: `${componentId}.${fieldKey}`,
                    originalValue: origVal,
                    correctedValue: newValue,
                    dataElementName: originalValue?.description || originalValue?.name || '',
                    populationName: componentPath.match(/populations\[(\d+)\]/)?.[1] ? `Population ${parseInt(componentPath.match(/populations\[(\d+)\]/)[1]) + 1}` : '',
                    userNote: userNotes || '',
                  });
                }
              });
            }
          } catch (feedbackError) {
            // Never let feedback capture block the actual edit
            console.error('[measureStore] Feedback capture error:', feedbackError);
          }

          const updateComponent = (obj     )      => {
            if (!obj) return obj;
            if (obj.id === componentId) {
              return { ...obj, ...updates };
            }
            if (obj.criteria) {
              return { ...obj, criteria: updateComponent(obj.criteria) };
            }
            if (obj.children) {
              return { ...obj, children: obj.children.map(updateComponent) };
            }
            return obj;
          };

          return {
            measures: state.measures.map((m) => {
              if (m.id !== measureId) return m;
              return {
                ...m,
                populations: m.populations.map(updateComponent),
                corrections: [...(m.corrections || []), correction],
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        }),

      // Update a single field on a data element WITHOUT creating a correction record
      // Used for configuration changes like status/intent filters
      updateElementField: (measureId, elementId, field, value) =>
        set((state) => {
          const measure = state.measures.find((m) => m.id === measureId);
          if (!measure) return state;

          const updateNode = (obj) => {
            if (!obj) return obj;
            if (obj.id === elementId) return { ...obj, [field]: value };
            if (obj.criteria) return { ...obj, criteria: updateNode(obj.criteria) };
            if (obj.children) return { ...obj, children: obj.children.map(updateNode) };
            return obj;
          };

          return {
            measures: state.measures.map((m) => {
              if (m.id !== measureId) return m;
              return {
                ...m,
                populations: m.populations.map(updateNode),
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        }),

      // Global constraint synchronization - updates age everywhere in the measure
      syncAgeRange: (measureId, minAge, maxAge) =>
        set((state) => {
          const measure = state.measures.find((m) => m.id === measureId);
          if (!measure) return state;

          // Use the centralized sync utility to update all age references
          const syncedMeasure = syncAgeConstraints(measure, minAge, maxAge);

          return {
            measures: state.measures.map((m) =>
              m.id === measureId ? syncedMeasure : m
            ),
          };
        }),

      // Component builder: add a new component to a population's criteria
      // Always adds directly to the root criteria children (no "Additional Criteria" wrapper)
      addComponentToPopulation: (measureId, populationId, component, logicOperator) => {
        // Get measure to check if this is a new component (not in original extraction)
        const measure = get().measures.find((m) => m.id === measureId);
        const population = measure?.populations.find((p) => p.id === populationId);

        // Record addition to feedback store if component wasn't in original extraction
        if (measure && component) {
          try {
            const feedbackStore = useFeedbackStore.getState();
            if (feedbackStore.feedbackEnabled && measure._originalExtraction) {
              // Check if this component existed in the original extraction
              const findOriginalElement = (nodes, targetId) => {
                if (!nodes) return null;
                for (const node of nodes) {
                  if (node?.id === targetId) return node;
                  if (node?.criteria) {
                    const found = findOriginalElement([node.criteria], targetId);
                    if (found) return found;
                  }
                  if (node?.children) {
                    const found = findOriginalElement(node.children, targetId);
                    if (found) return found;
                  }
                }
                return null;
              };

              const originalElement = findOriginalElement(measure._originalExtraction, component.id);
              if (!originalElement) {
                // This component was NOT in the original extraction - LLM missed it
                console.log('[feedback] Captured addition:', component.id, component.description || component.name);
                feedbackStore.recordCorrection({
                  measureId: measure.id,
                  measureTitle: measure.metadata?.title || measure.title || 'Unknown',
                  catalogueType: measure.metadata?.catalogueType || 'unknown',
                  extractionTimestamp: measure.metadata?.extractedAt,
                  fieldPath: `${component.id}.ADDED`,
                  fieldLabel: 'Component Added (Missing from extraction)',
                  originalValue: 'NOT_EXTRACTED',
                  correctedValue: {
                    name: component.name || component.description,
                    resourceType: component.resourceType || component.type,
                    valueSet: component.valueSet?.name || component.valueSet?.oid,
                  },
                  dataElementName: component.name || component.description || '',
                  populationName: population?.type || '',
                  userNote: '',
                });
              }
            }
          } catch (err) {
            console.error('[feedback] Addition capture error:', err);
          }
        }

        // Now perform the actual addition
        set((state) => ({
          measures: state.measures.map((m) => {
            if (m.id !== measureId) return m;
            return {
              ...m,
              populations: m.populations.map((pop) => {
                if (pop.id !== populationId) return pop;

                if (!pop.criteria) {
                  // No criteria yet — create a new clause with the chosen operator
                  return {
                    ...pop,
                    criteria: {
                      id: `${pop.type}-criteria-new`,
                      operator: (logicOperator || 'AND'),
                      description: 'Criteria',
                      confidence: 'high',
                      reviewStatus: 'pending',
                      children: [component],
                    },
                  };
                }

                const criteria = pop.criteria;

                // Always append directly to the root criteria children
                // The component inherits the same operator context as its siblings
                return {
                  ...pop,
                  criteria: {
                    ...criteria,
                    children: [...(criteria.children || []), component],
                  },
                };
              }),
              updatedAt: new Date().toISOString(),
            };
          }),
        }));
      },

      // Component builder: delete a component from a population
      deleteComponentFromPopulation: (measureId, populationId, componentId) =>
        set((state) => ({
          measures: state.measures.map((m) => {
            if (m.id !== measureId) return m;

            const removeComponent = (children       )        =>
              children.filter((c) => c.id !== componentId).map((c) => ({
                ...c,
                children: c.children ? removeComponent(c.children) : undefined,
              }));

            return {
              ...m,
              populations: m.populations.map((pop) => {
                if (pop.id !== populationId || !pop.criteria) return pop;
                return {
                  ...pop,
                  criteria: {
                    ...pop.criteria,
                    children: removeComponent(pop.criteria.children || []),
                  },
                };
              }),
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      // Component builder: add a new value set to the measure
      addValueSet: (measureId, valueSet) =>
        set((state) => ({
          measures: state.measures.map((m) => {
            if (m.id !== measureId) return m;
            return {
              ...m,
              valueSets: [...m.valueSets, valueSet],
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      // Toggle AND/OR/NOT logical operator
      toggleLogicalOperator: (measureId, clauseId) => {
        // Capture original operator for feedback
        const measure = get().measures.find((m) => m.id === measureId);
        let originalOperator = null;
        let newOperator = null;

        if (measure) {
          // Find the clause and its current operator
          const findClause = (node) => {
            if (!node) return null;
            if (node.id === clauseId && 'operator' in node) return node;
            if (node.criteria) {
              const found = findClause(node.criteria);
              if (found) return found;
            }
            if (node.children) {
              for (const child of node.children) {
                const found = findClause(child);
                if (found) return found;
              }
            }
            return null;
          };

          for (const pop of measure.populations) {
            const clause = findClause(pop);
            if (clause) {
              originalOperator = clause.operator;
              newOperator = originalOperator === 'AND' ? 'OR' : originalOperator === 'OR' ? 'NOT' : 'AND';
              break;
            }
          }

          // Record operator change to feedback store
          if (originalOperator && newOperator) {
            try {
              const feedbackStore = useFeedbackStore.getState();
              if (feedbackStore.feedbackEnabled && measure._originalExtraction) {
                // Find original clause in extraction
                const findOriginalClause = (nodes, targetId) => {
                  if (!nodes) return null;
                  for (const node of nodes) {
                    if (node?.id === targetId && 'operator' in node) return node;
                    if (node?.criteria) {
                      const found = findOriginalClause([node.criteria], targetId);
                      if (found) return found;
                    }
                    if (node?.children) {
                      const found = findOriginalClause(node.children, targetId);
                      if (found) return found;
                    }
                  }
                  return null;
                };

                const originalClause = findOriginalClause(measure._originalExtraction, clauseId);
                // Only record if original extraction had this clause and operator is different
                if (originalClause && originalClause.operator !== newOperator) {
                  feedbackStore.recordCorrection({
                    measureId: measure.id,
                    measureTitle: measure.metadata?.title || measure.title || 'Unknown',
                    catalogueType: measure.metadata?.catalogueType || 'unknown',
                    extractionTimestamp: measure.metadata?.extractedAt,
                    fieldPath: `${clauseId}.operator`,
                    fieldLabel: 'Logical Operator',
                    originalValue: originalClause.operator,
                    correctedValue: newOperator,
                    dataElementName: '',
                    populationName: '',
                    userNote: '',
                  });
                }
              }
            } catch (err) {
              console.error('[feedback] Operator toggle capture error:', err);
            }
          }
        }

        // Now perform the actual toggle
        set((state) => {
          const toggleOperator = (obj) => {
            if (!obj) return obj;
            if (obj.id === clauseId && 'operator' in obj) {
              // Cycle through: AND -> OR -> NOT -> AND
              const nextOperator = obj.operator === 'AND' ? 'OR' : obj.operator === 'OR' ? 'NOT' : 'AND';
              return { ...obj, operator: nextOperator };
            }
            if (obj.criteria) {
              return { ...obj, criteria: toggleOperator(obj.criteria) };
            }
            if (obj.children) {
              return { ...obj, children: obj.children.map(toggleOperator) };
            }
            return obj;
          };

          return {
            measures: state.measures.map((m) => {
              if (m.id !== measureId) return m;
              return {
                ...m,
                populations: m.populations.map(toggleOperator),
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        });
      },

      // Reorder a component within its parent (move up/down)
      reorderComponent: (measureId, parentClauseId, componentId, direction) =>
        set((state) => {
          const reorder = (obj     )      => {
            if (!obj) return obj;

            // Check if this is the parent clause
            if (obj.id === parentClauseId && obj.children) {
              const children = [...obj.children];
              const idx = children.findIndex((c     ) => c.id === componentId);
              if (idx === -1) return obj;

              const newIdx = direction === 'up' ? idx - 1 : idx + 1;
              if (newIdx < 0 || newIdx >= children.length) return obj;

              // Swap elements
              [children[idx], children[newIdx]] = [children[newIdx], children[idx]];
              return { ...obj, children };
            }

            if (obj.criteria) {
              return { ...obj, criteria: reorder(obj.criteria) };
            }
            if (obj.children) {
              return { ...obj, children: obj.children.map(reorder) };
            }
            return obj;
          };

          return {
            measures: state.measures.map((m) => {
              if (m.id !== measureId) return m;
              return {
                ...m,
                populations: m.populations.map(reorder),
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        }),

      // Move a component to a specific index within its parent clause (for drag-and-drop)
      moveComponentToIndex: (measureId, parentClauseId, componentId, targetIndex) =>
        set((state) => {
          const moveInTree = (obj     )      => {
            if (!obj) return obj;

            if (obj.id === parentClauseId && obj.children) {
              const children = [...obj.children];
              const fromIdx = children.findIndex((c     ) => c.id === componentId);
              if (fromIdx === -1 || fromIdx === targetIndex) return obj;

              // Remove the element from its current position
              const [moved] = children.splice(fromIdx, 1);

              // Adjust target index: if we removed from before the target,
              // the target index shifts down by 1
              let adjustedTarget = targetIndex;
              if (fromIdx < targetIndex) {
                adjustedTarget = targetIndex - 1;
              }

              children.splice(adjustedTarget, 0, moved);
              return { ...obj, children };
            }

            if (obj.criteria) {
              return { ...obj, criteria: moveInTree(obj.criteria) };
            }
            if (obj.children) {
              return { ...obj, children: obj.children.map(moveInTree) };
            }
            return obj;
          };

          return {
            measures: state.measures.map((m) => {
              if (m.id !== measureId) return m;
              return {
                ...m,
                populations: m.populations.map(moveInTree),
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        }),

      // Set operator between two specific siblings in a clause
      setOperatorBetweenSiblings: (measureId, clauseId, index1, index2, operator) => {
        // Record operator change to feedback store
        const measure = get().measures.find((m) => m.id === measureId);
        if (measure) {
          try {
            const feedbackStore = useFeedbackStore.getState();
            if (feedbackStore.feedbackEnabled && measure._originalExtraction) {
              feedbackStore.recordCorrection({
                measureId: measure.id,
                measureTitle: measure.metadata?.title || measure.title || 'Unknown',
                catalogueType: measure.metadata?.catalogueType || 'unknown',
                extractionTimestamp: measure.metadata?.extractedAt,
                fieldPath: `${clauseId}.operator.between`,
                fieldLabel: 'Logical Operator (Between Siblings)',
                originalValue: 'previous',
                correctedValue: operator,
                dataElementName: '',
                populationName: '',
                userNote: '',
              });
            }
          } catch (err) {
            console.error('[feedback] Operator between siblings capture error:', err);
          }
        }

        set((state) => {
          const updateClause = (obj) => {
            if (!obj) return obj;

            if (obj.id === clauseId && 'operator' in obj && 'children' in obj) {
              return setOperatorBetween(obj, index1, index2, operator);
            }

            if (obj.criteria) {
              return { ...obj, criteria: updateClause(obj.criteria) };
            }
            if (obj.children) {
              return { ...obj, children: obj.children.map(updateClause) };
            }
            return obj;
          };

          return {
            measures: state.measures.map((m) => {
              if (m.id !== measureId) return m;
              return {
                ...m,
                populations: m.populations.map(updateClause),
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        });
      },

      // Delete a component from anywhere in the tree
      deleteComponent: (measureId, componentId) => {
        // Capture the element before deletion for feedback
        const measure = get().measures.find((m) => m.id === measureId);
        let deletedElement = null;
        let populationName = '';

        if (measure) {
          // Find the element being deleted
          const findElement = (node, popName = '') => {
            if (!node) return null;
            if (node.id === componentId) return { element: node, popName };
            if (node.criteria) {
              const found = findElement(node.criteria, popName);
              if (found) return found;
            }
            if (node.children) {
              for (const child of node.children) {
                const found = findElement(child, popName);
                if (found) return found;
              }
            }
            return null;
          };

          for (const pop of measure.populations) {
            const found = findElement(pop.criteria, pop.type);
            if (found) {
              deletedElement = found.element;
              populationName = found.popName;
              break;
            }
          }

          // Record deletion to feedback store
          if (deletedElement) {
            try {
              const feedbackStore = useFeedbackStore.getState();
              if (feedbackStore.feedbackEnabled && measure._originalExtraction) {
                // Check if this element existed in the original extraction
                const findOriginalElement = (nodes, targetId) => {
                  if (!nodes) return null;
                  for (const node of nodes) {
                    if (node?.id === targetId) return node;
                    if (node?.criteria) {
                      const found = findOriginalElement([node.criteria], targetId);
                      if (found) return found;
                    }
                    if (node?.children) {
                      const found = findOriginalElement(node.children, targetId);
                      if (found) return found;
                    }
                  }
                  return null;
                };

                const originalElement = findOriginalElement(measure._originalExtraction, componentId);
                if (originalElement) {
                  // This element was in the original extraction - record as hallucination
                  console.log('[feedback] Captured deletion:', componentId, originalElement.description || originalElement.name);
                  feedbackStore.recordCorrection({
                    measureId: measure.id,
                    measureTitle: measure.metadata?.title || measure.title || 'Unknown',
                    catalogueType: measure.metadata?.catalogueType || 'unknown',
                    extractionTimestamp: measure.metadata?.extractedAt,
                    fieldPath: `${componentId}.DELETED`,
                    fieldLabel: 'Component Deleted',
                    originalValue: {
                      name: originalElement.name || originalElement.description,
                      resourceType: originalElement.resourceType || originalElement.type,
                      valueSet: originalElement.valueSet?.name || originalElement.valueSet?.oid,
                    },
                    correctedValue: 'DELETED',
                    dataElementName: originalElement.name || originalElement.description || '',
                    populationName: populationName,
                    userNote: '',
                  });
                }
              }
            } catch (err) {
              console.error('[feedback] Delete capture error:', err);
            }
          }
        }

        // Now perform the actual deletion
        set((state) => {
          const removeFromTree = (obj) => {
            if (!obj) return obj;

            if (obj.criteria) {
              // If criteria is the component to delete, set to null
              if (obj.criteria.id === componentId) {
                return { ...obj, criteria: null };
              }
              return { ...obj, criteria: removeFromTree(obj.criteria) };
            }

            if (obj.children) {
              const filteredChildren = obj.children
                .filter((c) => c.id !== componentId)
                .map(removeFromTree);
              return { ...obj, children: filteredChildren };
            }

            return obj;
          };

          return {
            measures: state.measures.map((m) => {
              if (m.id !== measureId) return m;
              return {
                ...m,
                populations: m.populations.map(removeFromTree),
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        });
      },

      // Replace a component in a parent clause at the same position (atomic swap)
      replaceComponent: (measureId, parentClauseId, oldComponentId, newComponent) =>
        set((state) => {
          const replaceInTree = (obj     )      => {
            if (!obj) return obj;

            // Found the parent clause - do the swap
            if (obj.id === parentClauseId && obj.children) {
              const children = [...obj.children];
              const idx = children.findIndex((c     ) => c.id === oldComponentId);
              if (idx !== -1) {
                // Replace old component with new one at the same index
                children[idx] = newComponent;
                return { ...obj, children };
              }
            }

            // Recurse into nested structures
            if (obj.criteria) {
              return { ...obj, criteria: replaceInTree(obj.criteria) };
            }
            if (obj.children) {
              return { ...obj, children: obj.children.map(replaceInTree) };
            }
            return obj;
          };

          return {
            measures: state.measures.map((m) => {
              if (m.id !== measureId) return m;
              return {
                ...m,
                populations: m.populations.map(replaceInTree),
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        }),

      updateTimingOverride: (measureId, componentId, modified) => {
        // Record timing change to feedback store
        const measure = get().measures.find((m) => m.id === measureId);
        if (measure) {
          try {
            const feedbackStore = useFeedbackStore.getState();
            if (feedbackStore.feedbackEnabled && measure._originalExtraction) {
              // Find the element to get its name
              const findElement = (nodes, targetId) => {
                if (!nodes) return null;
                for (const node of nodes) {
                  if (node?.id === targetId) return node;
                  if (node?.criteria) {
                    const found = findElement([node.criteria], targetId);
                    if (found) return found;
                  }
                  if (node?.children) {
                    const found = findElement(node.children, targetId);
                    if (found) return found;
                  }
                }
                return null;
              };

              const element = findElement(measure.populations, componentId);
              const originalElement = findElement(measure._originalExtraction, componentId);

              if (element && originalElement) {
                const originalTiming = originalElement.timingOverride;
                feedbackStore.recordCorrection({
                  measureId: measure.id,
                  measureTitle: measure.metadata?.title || measure.title || 'Unknown',
                  catalogueType: measure.metadata?.catalogueType || 'unknown',
                  extractionTimestamp: measure.metadata?.extractedAt,
                  fieldPath: `${componentId}.timing`,
                  fieldLabel: 'Timing Override',
                  originalValue: originalTiming ? JSON.stringify(originalTiming) : 'none',
                  correctedValue: JSON.stringify(modified),
                  dataElementName: element.name || element.description || '',
                  populationName: '',
                  userNote: '',
                });
              }
            }
          } catch (err) {
            console.error('[feedback] Timing override capture error:', err);
          }
        }

        set((state) => {
          const updateComponent = (obj) => {
            if (!obj) return obj;
            if (obj.id === componentId) {
              // If the component has a timingOverride, update it
              if (obj.timingOverride) {
                return {
                  ...obj,
                  timingOverride: {
                    ...obj.timingOverride,
                    modified,
                    modifiedAt: modified ? new Date().toISOString() : null,
                    modifiedBy: modified ? 'user' : null,
                  },
                };
              }
              return obj;
            }
            if (obj.criteria) {
              return { ...obj, criteria: updateComponent(obj.criteria) };
            }
            if (obj.children) {
              return { ...obj, children: obj.children.map(updateComponent) };
            }
            return obj;
          };

          return {
            measures: state.measures.map((m) => {
              if (m.id !== measureId) return m;
              return {
                ...m,
                populations: m.populations.map(updateComponent),
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        });
      },

      updateTimingWindow: (measureId, componentId, modified) =>
        set((state) => {
          const updateComponent = (obj     )      => {
            if (!obj) return obj;
            if (obj.id === componentId) {
              // If the component has a timingWindow, update it
              if (obj.timingWindow) {
                return {
                  ...obj,
                  timingWindow: {
                    ...obj.timingWindow,
                    modified,
                    modifiedAt: modified ? new Date().toISOString() : null,
                    modifiedBy: modified ? 'user' : null,
                  },
                };
              }
              return obj;
            }
            if (obj.criteria) {
              return { ...obj, criteria: updateComponent(obj.criteria) };
            }
            if (obj.children) {
              return { ...obj, children: obj.children.map(updateComponent) };
            }
            return obj;
          };

          return {
            measures: state.measures.map((m) => {
              if (m.id !== measureId) return m;
              return {
                ...m,
                populations: m.populations.map(updateComponent),
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        }),

      updateMeasurementPeriod: (measureId, start, end) =>
        set((state) => ({
          measures: state.measures.map((m) => {
            if (m.id !== measureId) return m;
            return {
              ...m,
              metadata: {
                ...m.metadata,
                measurementPeriod: {
                  ...m.metadata.measurementPeriod,
                  start,
                  end,
                },
              },
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      addCorrection: (measureId, correction) =>
        set((state) => ({
          measures: state.measures.map((m) => {
            if (m.id !== measureId) return m;
            const fullCorrection                    = {
              ...correction,
              id: `corr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              timestamp: new Date().toISOString(),
            };
            return {
              ...m,
              corrections: [...(m.corrections || []), fullCorrection],
              updatedAt: new Date().toISOString(),
            };
          }),
        })),

      exportCorrections: (measureId) => {
        const measure = get().measures.find((m) => m.id === measureId);
        if (!measure || !measure.corrections?.length) return null;

        const byType                         = {};
        const byPopulation                         = {};

        measure.corrections.forEach((c) => {
          byType[c.correctionType] = (byType[c.correctionType] || 0) + 1;
          if (c.measureContext.populationType) {
            byPopulation[c.measureContext.populationType] = (byPopulation[c.measureContext.populationType] || 0) + 1;
          }
        });

        return {
          exportedAt: new Date().toISOString(),
          measureId: measure.metadata.measureId,
          measureTitle: measure.metadata.title,
          totalCorrections: measure.corrections.length,
          corrections: measure.corrections,
          summary: {
            byType: byType                                  ,
            byPopulation,
          },
        };
      },

      getActiveMeasure: () => {
        const state = get();
        return state.measures.find((m) => m.id === state.activeMeasureId) || null;
      },

      getReviewProgress: (measureId) => {
        const measure = get().measures.find((m) => m.id === measureId);
        if (!measure) return { total: 0, approved: 0, pending: 0, flagged: 0 };

        let total = 0, approved = 0, pending = 0, flagged = 0;

        const countStatus = (obj     ) => {
          if (!obj) return;
          if (obj.reviewStatus) {
            total++;
            if (obj.reviewStatus === 'approved') approved++;
            else if (obj.reviewStatus === 'pending') pending++;
            else if (obj.reviewStatus === 'flagged' || obj.reviewStatus === 'needs_revision') flagged++;
          }
          if (obj.criteria) countStatus(obj.criteria);
          if (obj.children) obj.children.forEach(countStatus);
        };

        measure.populations.forEach(countStatus);
        return { total, approved, pending, flagged };
      },

      getCorrections: (measureId) => {
        const measure = get().measures.find((m) => m.id === measureId);
        return measure?.corrections || [];
      },
    })
);

// ─── Auto-save: persist measure changes to localStorage + backend ───
// The store's loadFromApi already reads from localStorage as an overlay,
// so saving here ensures edits survive page refresh.
let _prevMeasureIds = '';
let _backendSaveTimer                            = null;

useMeasureStore.subscribe((state) => {
  // Quick fingerprint to detect actual measure changes
  const fingerprint = state.measures.map(m => m.id + ':' + (m.updatedAt || '')).join('|');
  if (fingerprint === _prevMeasureIds) return;
  _prevMeasureIds = fingerprint;

  // Save each measure to localStorage immediately
  for (const measure of state.measures) {
    const key = measure.metadata?.measureId || measure.id;
    if (!key) continue;
    try {
      localStorage.setItem(`measure-local-${key}`, JSON.stringify(measure));
    } catch {
      // localStorage full or unavailable — skip silently
    }
  }

  // Debounced backend save (3s after last edit)
  if (_backendSaveTimer) clearTimeout(_backendSaveTimer);
  _backendSaveTimer = setTimeout(async () => {
    for (const measure of useMeasureStore.getState().measures) {
      try {
        const converted = convertUmsToImportFormat(measure);
        if (!converted) continue;
        const { importMeasures } = await import('../api/measures');
        await importMeasures({ measures: [converted], components: [] });
      } catch (e) {
        // Backend save failed — localStorage still has the data
        console.warn('[auto-save] Backend save failed for', measure.id, e.message);
      }
    }
  }, 3000);
});

/**
 * Convert UMS format to the import format expected by the backend.
 * Backend expects a specific structure for populations with rootClause instead of criteria.
 */
function convertUmsToImportFormat(ums                      )                          {
  const mapPopulationType = (type        )         => {
    const mapping                         = {
      'initial-population': 'INITIAL_POPULATION',
      'denominator': 'DENOMINATOR',
      'denominator-exclusion': 'DENOMINATOR_EXCLUSION',
      'denominator-exception': 'DENOMINATOR_EXCEPTION',
      'numerator': 'NUMERATOR',
      'numerator-exclusion': 'NUMERATOR_EXCLUSION',
      'measure-population': 'MEASURE_POPULATION',
      'measure-observation': 'MEASURE_OBSERVATION',
    };
    return mapping[type] || type.toUpperCase().replace(/-/g, '_');
  };

  const mapElementType = (type        )         => {
    const mapping                         = {
      'diagnosis': 'DIAGNOSIS',
      'encounter': 'ENCOUNTER',
      'procedure': 'PROCEDURE',
      'observation': 'OBSERVATION',
      'medication': 'MEDICATION',
      'immunization': 'IMMUNIZATION',
      'demographic': 'DEMOGRAPHIC',
      'device': 'DEVICE',
      'assessment': 'ASSESSMENT',
      'allergy': 'ALLERGY',
    };
    return mapping[type] || type.toUpperCase();
  };

  const convertClause = (clause                                      )                          => {
    const dataElements                            = [];
    const childClauses                            = [];

    if (clause.children) {
      clause.children.forEach((child, idx) => {
        if ('operator' in child) {
          // Nested clause
          childClauses.push(convertClause(child                                        ));
        } else {
          // Data element
          const de = child                                      ;
          dataElements.push({
            id: de.id,
            elementType: mapElementType(de.type),
            resourceType: de.type,
            description: de.description || '',
            libraryComponentId: de.libraryComponentId || null,
            negation: de.negation || false,
            negationRationale: de.negationRationale || null,
            confidence: (de.confidence || 'MEDIUM').toUpperCase(),
            reviewStatus: (de.reviewStatus || 'PENDING').toUpperCase(),
            displayOrder: idx,
            thresholds: de.thresholds || null,
          });
        }
      });
    }

    return {
      id: clause.id,
      operator: clause.operator || 'AND',
      description: clause.description || '',
      displayOrder: 0,
      children: childClauses,
      dataElements,
    };
  };

  return {
    id: ums.id,
    measureId: ums.metadata.measureId,
    title: ums.metadata.title,
    version: ums.metadata.version || '1.0',
    steward: ums.metadata.steward || '',
    program: ums.metadata.program || 'Custom',
    measureType: ums.metadata.measureType || 'process',
    description: ums.metadata.description || '',
    rationale: ums.metadata.rationale || '',
    clinicalRecommendation: ums.metadata.clinicalRecommendation || '',
    periodStart: ums.metadata.measurementPeriod?.start || `${new Date().getFullYear()}-01-01`,
    periodEnd: ums.metadata.measurementPeriod?.end || `${new Date().getFullYear()}-12-31`,
    globalConstraints: ums.globalConstraints ? {
      ageMin: ums.globalConstraints.ageRange?.min ?? null,
      ageMax: ums.globalConstraints.ageRange?.max ?? null,
      gender: ums.globalConstraints.gender || 'any',
    } : null,
    status: (ums.status || 'in_progress').toUpperCase().replace(/_/g, '_'),
    overallConfidence: (ums.overallConfidence || 'MEDIUM').toUpperCase(),
    populations: ums.populations.map((pop, idx) => ({
      id: pop.id,
      populationType: mapPopulationType(pop.type),
      description: pop.description || '',
      narrative: pop.narrative || '',
      displayOrder: idx,
      confidence: (pop.confidence || 'MEDIUM').toUpperCase(),
      reviewStatus: (pop.reviewStatus || 'PENDING').toUpperCase(),
      rootClause: pop.criteria ? convertClause(pop.criteria) : null,
    })),
    valueSets: ums.valueSets.map(vs => ({
      id: vs.id,
      oid: vs.oid || '',
      name: vs.name,
      version: vs.version || '',
      publisher: vs.publisher || '',
      purpose: vs.purpose || '',
      verified: vs.verified || false,
      codes: (vs.codes || []).map(c => ({
        code: c.code,
        system: c.system || 'SNOMED',
        display: c.display || '',
      })),
    })),
    corrections: [],
  };
}

// ============================================================================
// RE-ENRICHMENT: Populate missing value sets from standard catalog
// ============================================================================

/**
 * Re-enrich data elements that are missing value sets.
 * Matches element descriptions against the standard value set catalog
 * to re-populate OIDs and codes.
 */
function reEnrichPopulations(measure) {
  const allStandardVS = getAllStandardValueSets();
  if (!allStandardVS || allStandardVS.length === 0) return measure.populations;

  // Build a lookup: lowercase name → value set
  const vsLookup = new Map();
  for (const vs of allStandardVS) {
    vsLookup.set(vs.name.toLowerCase(), vs);
    // Also index by keywords
    const words = vs.name.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 4 && !['during', 'within', 'before', 'after', 'period'].includes(word)) {
        if (!vsLookup.has(word)) vsLookup.set(word, vs);
      }
    }
  }

  let changed = false;

  const enrichNode = (node) => {
    if (!node) return node;

    // If it's a clause with children, recurse
    if (node.operator && node.children) {
      const newChildren = node.children.map(enrichNode);
      const childChanged = newChildren.some((c, i) => c !== node.children[i]);
      return childChanged ? { ...node, children: newChildren } : node;
    }

    // It's a data element
    const element = node;

    // NEVER overwrite a linked element — the library component is the source of truth
    if (element.libraryComponentId) return element;

    // Skip if it already has a value set with codes
    if (element.valueSet?.codes?.length > 0) return element;
    // Skip if it already has an OID that's not 'N/A'
    if (element.valueSet?.oid && element.valueSet.oid !== 'N/A' && element.valueSet.oid !== '') return element;

    // Try to match by description
    const desc = (element.description || '').toLowerCase();
    if (!desc) return element;

    // Try exact name match
    let matched = null;
    for (const [key, vs] of vsLookup.entries()) {
      if (desc.includes(key) || key.includes(desc.split(' during ')[0].split(' within ')[0].split(' before ')[0])) {
        matched = vs;
        break;
      }
    }

    // Try keyword matching
    if (!matched) {
      const descWords = desc.split(/\s+/).filter(w => w.length > 3);
      for (const vs of allStandardVS) {
        const vsWords = vs.name.toLowerCase().split(/\s+/);
        const overlap = descWords.filter(w => vsWords.includes(w));
        if (overlap.length >= 2) {
          matched = vs;
          break;
        }
      }
    }

    if (matched) {
      changed = true;
      return {
        ...element,
        valueSet: {
          id: matched.id,
          name: matched.name,
          oid: matched.oid,
          codes: matched.codes.map(c => ({ code: c.code, display: c.display, system: c.system })),
          confidence: 'high',
          totalCodeCount: matched.codes.length,
          source: 'Standard Value Set (re-enriched)',
        },
      };
    }

    return element;
  };

  const enrichedPopulations = measure.populations.map(pop => {
    if (!pop.criteria) return pop;
    const newCriteria = enrichNode(pop.criteria);
    return newCriteria !== pop.criteria ? { ...pop, criteria: newCriteria } : pop;
  });

  return changed ? enrichedPopulations : measure.populations;
}
