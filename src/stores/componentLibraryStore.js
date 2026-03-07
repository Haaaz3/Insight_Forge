/**
 * Component Library Store
 *
 * Zustand store for managing the reusable component library.
 * Fetches components from the backend API.
 */

import { create } from 'zustand';
;            
                   
                  
                     
              
                        
                     
                    
                 
                   
             
                   
                                   
import { calculateAtomicComplexity, calculateCompositeComplexity } from '../services/complexityCalculator';
import { inferCategory } from '../utils/inferCategory';
import { generateAndPackageCode } from '../services/componentCodeGenerator';
import {
  createNewVersion,
  archiveVersion,
  approveComponent,
  addUsageReference,
  removeUsageReference,
  searchComponents,
  createAtomicComponent,
} from '../services/componentLibraryService';
import {
  parseDataElementToComponent,
  findExactMatch,
  findExactMatchPrioritizeApproved,
  validateMeasureComponents,
                                 
} from '../services/componentMatcher';
import { sampleAtomics, sampleComposites } from '../data/sampleLibraryData';
;                                                                                    
import { validateReferentialIntegrity, formatMismatches } from '../utils/integrityCheck';
import { getComponents, getComponent } from '../api/components';
import { transformComponentDto, transformComponentSummary } from '../api/transformers';

// ============================================================================
// Age Component Migration
// ============================================================================

// Map old individual age component IDs to parameterized Age Requirement thresholds
const OLD_AGE_COMPONENT_MAP = {
  'comp-age-12-and-older': { ageMin: 12, ageMax: undefined },
  'comp-age-18-and-older': { ageMin: 18, ageMax: undefined },
  'comp-age-18-64': { ageMin: 18, ageMax: 64 },
  'comp-age-18-75': { ageMin: 18, ageMax: 75 },
  'comp-age-18-85': { ageMin: 18, ageMax: 85 },
  'comp-age-21-64': { ageMin: 21, ageMax: 64 },
  'comp-age-45-75-start': { ageMin: 45, ageMax: 75, referencePoint: 'start_of_measurement_period' },
  'comp-age-45-75': { ageMin: 45, ageMax: 75 },
  'comp-age-52-74': { ageMin: 52, ageMax: 74 },
  'comp-age-65-and-older': { ageMin: 65, ageMax: undefined },
  // Backend SQL IDs (without 'comp-' prefix)
  'age-12-plus': { ageMin: 12, ageMax: undefined },
  'age-18-plus': { ageMin: 18, ageMax: undefined },
  'age-18-64': { ageMin: 18, ageMax: 64 },
  'age-18-75': { ageMin: 18, ageMax: 75 },
  'age-18-85': { ageMin: 18, ageMax: 85 },
  'age-21-64': { ageMin: 21, ageMax: 64 },
  'age-45-75': { ageMin: 45, ageMax: 75 },
  'age-52-74': { ageMin: 52, ageMax: 74 },
  'age-65-plus': { ageMin: 65, ageMax: undefined },
  // Frontend sample data ID
  'age-45-75-at-start-mp': { ageMin: 45, ageMax: 75, referencePoint: 'start_of_measurement_period' },
};

/**
 * Migrate old individual age components to parameterized Age Requirement.
 * This function updates the element's componentId and thresholds.
 */
function migrateAgeComponent(element) {
  const componentId = element.componentId || element.libraryComponentId;
  if (componentId && OLD_AGE_COMPONENT_MAP[componentId]) {
    const config = OLD_AGE_COMPONENT_MAP[componentId];
    console.log(`[migrateAgeComponent] Migrating "${componentId}" to parameterized Age Requirement with thresholds:`, config);
    return {
      ...element,
      componentId: 'comp-demographic-age-requirement',
      libraryComponentId: 'comp-demographic-age-requirement',
      thresholds: { ...config },
      timing: config.referencePoint
        ? { referencePoint: config.referencePoint }
        : element.timing
    };
  }
  return element;
}

// ============================================================================
// State Interface
// ============================================================================

;                                
         
                                 
                       

                      
                            
                          
                              

             
                                          
                                 
                                         
                                                

                     
                     
                                

                       
                                           
                                                      
                                  

                
                                   

                                               
                                       
                                                               
                                                                                 
                                                      
                                                         
                                                                
                                                        
                                                                    

                       
                                                                                         
                                                                           
                                                         

                  
                                                                  
                                                                     

                            
                                                     

                  
                     
                    
                              
                       
                      
            

                    
                                                                                                                                              

                                                                                  
                                                               

                                                                              
                                                                

                                                                             
                                      
                                        
                                
                                     
                                                                                                                                          
                                            

                                     
                            
                             
                              
                                     
                                                                                                                                          
                                            

                                                     
                                                                                                                                      

                                                                
                    
                                
                       
                               
                                                                                                                                            
                                                                          

                         
                                                             
                                                  
                                                                               
                                                                        
                                                             
 

// ============================================================================
// Store
// ============================================================================

export const useComponentLibraryStore = create                       ()(
    (set, get) => {
      // ==========================================================================
      // SAFE SET COMPONENTS HELPER - Prevents accidental component wipes
      // ==========================================================================
      // This helper ensures that setting components ALWAYS merges with existing
      // components instead of replacing them. It makes it physically impossible
      // for any action to wipe the component library.
      const safeSetComponents = (
        newComponents                    ,
        additionalState                                                     
      ) => {
        set((state) => {
          // Never allow complete wipe if we have existing components
          if (newComponents.length === 0 && state.components.length > 0) {
            console.error('[BLOCKED] Attempted to set components to empty array');
            return additionalState ? { ...additionalState } : {};
          }

          // Always merge: new components + preserved existing components
          const newIds = new Set(newComponents.map(c => c.id));
          const preserved = state.components.filter(c => !newIds.has(c.id));
          const merged = [...newComponents, ...preserved];

          console.log(`[safeSetComponents] ${newComponents.length} updated/new + ${preserved.length} preserved = ${merged.length} total`);

          return { components: merged, ...(additionalState || {}) };
        });
      };

      return {
      // Initial state
      components: [],
      initialized: false,
      isLoadingFromApi: false,
      apiError: null,
      lastLoadedAt: null,
      selectedComponentId: null,
      filters: { showArchived: true },
      editingComponentId: null,
      importMatcherState: null,
      mergeMode: false,
      selectedForMerge: new Set(),
      selectedCategory: 'all',

      // Sync status tracking - tracks components that failed to sync to backend
      pendingSync: new Map(), // Map<componentId, { operation: 'create'|'update'|'delete', retryCount: number, lastError: string }>
      isSyncing: false,

      // Category selection (shared between Sidebar and LibraryBrowser)
      setSelectedCategory: (category) => set({ selectedCategory: category }),

      // Merge mode actions
      setMergeMode: (enabled) => {
        set({ mergeMode: enabled });
        if (!enabled) {
          set({ selectedForMerge: new Set() });
        }
      },
      toggleMergeSelection: (componentId) => {
        const current = get().selectedForMerge;
        const newSet = new Set(current);
        if (newSet.has(componentId)) {
          newSet.delete(componentId);
        } else {
          newSet.add(componentId);
        }
        set({ selectedForMerge: newSet });
      },
      clearMergeSelection: () => {
        set({ selectedForMerge: new Set() });
      },

      // ========================================================================
      // Sync Status Tracking
      // ========================================================================

      // Get current sync status
      getSyncStatus: () => {
        const state = get();
        const pendingCount = state.pendingSync.size;
        return {
          isSynced: pendingCount === 0,
          pendingCount,
          pendingIds: Array.from(state.pendingSync.keys()),
          isSyncing: state.isSyncing,
        };
      },

      // Mark a component as pending sync (failed to sync to backend)
      markPendingSync: (componentId, operation, error) => {
        set((state) => {
          const newPending = new Map(state.pendingSync);
          const existing = newPending.get(componentId);
          newPending.set(componentId, {
            operation,
            retryCount: existing ? existing.retryCount + 1 : 0,
            lastError: error,
            timestamp: new Date().toISOString(),
          });
          return { pendingSync: newPending };
        });
      },

      // Clear pending sync status for a component (successful sync)
      clearPendingSync: (componentId) => {
        set((state) => {
          const newPending = new Map(state.pendingSync);
          newPending.delete(componentId);
          return { pendingSync: newPending };
        });
      },

      // Retry all pending sync operations
      retryPendingSync: async () => {
        const state = get();
        if (state.isSyncing || state.pendingSync.size === 0) return;

        set({ isSyncing: true });
        const results = { succeeded: 0, failed: 0 };

        for (const [componentId, syncInfo] of state.pendingSync) {
          // Skip if too many retries (max 3)
          if (syncInfo.retryCount >= 3) {
            console.warn(`[retryPendingSync] Skipping ${componentId} - max retries exceeded`);
            continue;
          }

          const component = state.components.find(c => c.id === componentId);
          if (!component && syncInfo.operation !== 'delete') {
            // Component no longer exists locally, clear pending status
            get().clearPendingSync(componentId);
            continue;
          }

          try {
            if (syncInfo.operation === 'create' && component?.type === 'atomic') {
              const { createAtomicComponent } = await import('../api/components');
              await createAtomicComponent({
                id: component.id,
                name: component.name,
                description: component.description || '',
                valueSetOid: component.valueSet?.oid || component.name || 'unknown',
                valueSetName: component.valueSet?.name || component.name || 'Unknown',
                valueSetVersion: component.valueSet?.version || undefined,
                codes: component.valueSet?.codes?.map(c => ({
                  code: c.code,
                  system: c.system,
                  display: c.display || undefined,
                })),
                timing: component.timing,
                negation: component.negation || false,
                category: component.metadata?.category || 'uncategorized',
                catalogs: component.catalogs || [],
              });
            } else if (syncInfo.operation === 'update' && component?.type === 'atomic') {
              const { updateComponent: updateComponentApi } = await import('../api/components');
              await updateComponentApi(component.id, {
                name: component.name,
                description: component.description || '',
                valueSetOid: component.valueSet?.oid,
                valueSetName: component.valueSet?.name,
                codes: component.valueSet?.codes?.map(c => ({
                  code: c.code,
                  system: c.system,
                  display: c.display || undefined,
                })),
                timing: component.timing,
                category: component.metadata?.category,
                catalogs: component.catalogs || [],
              });
            } else if (syncInfo.operation === 'delete') {
              const { deleteComponent: deleteComponentApi } = await import('../api/components');
              await deleteComponentApi(componentId);
            }

            get().clearPendingSync(componentId);
            results.succeeded++;
            console.log(`[retryPendingSync] Successfully synced ${componentId}`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            get().markPendingSync(componentId, syncInfo.operation, errorMsg);
            results.failed++;
            console.warn(`[retryPendingSync] Failed to sync ${componentId}:`, error);
          }
        }

        set({ isSyncing: false });
        console.log(`[retryPendingSync] Completed: ${results.succeeded} succeeded, ${results.failed} failed`);
        return results;
      },

      // Load components from backend API
      // IMPORTANT: This function MERGES API components with local components to avoid
      // wiping out locally created components that haven't been synced to the backend yet.
      loadFromApi: async () => {
        // Skip if already loading
        if (get().isLoadingFromApi) return;

        set({ isLoadingFromApi: true, apiError: null });

        try {
          // Fetch component summaries
          const summaries = await getComponents();

          // Fetch full details for each component
          const fullComponents = await Promise.all(
            summaries.map(async (summary) => {
              try {
                const componentDto = await getComponent(summary.id);
                return transformComponentDto(componentDto);
              } catch (err) {
                // If fetching full details fails, use summary-based component
                console.warn(`Failed to load component details for ${summary.id}, using summary:`, err);
                return transformComponentSummary(summary);
              }
            })
          );

          // Filter out nulls and hydrate with complexity scores
          const apiComponents = fullComponents
            .filter((c)                        => c !== null)
            .map((component) => {
              if (component.type === 'atomic') {
                return {
                  ...component,
                  complexity: calculateAtomicComplexity(component                   ),
                };
              }
              return component;
            });

          // Use safeSetComponents to MERGE API components with local-only components
          // This prevents wiping out locally created components that haven't been synced yet
          const now = new Date().toISOString();
          console.log(`[loadFromApi] Loaded ${apiComponents.length} components from API`);

          safeSetComponents(apiComponents, {
            initialized: true,
            isLoadingFromApi: false,
            lastLoadedAt: now,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to load components';
          console.error('Failed to load components from API:', error);
          set({
            isLoadingFromApi: false,
            apiError: errorMessage,
          });
        }
      },

      // Initialize with sample data (fallback if API unavailable)
      initializeWithSampleData: () => {
        if (get().initialized) return;

        // Hydrate atomics with complexity scores and ensure catalogs field
        const hydratedAtomics                    = sampleAtomics.map((atomic) => ({
          ...atomic,
          catalogs: atomic.catalogs || [],
          complexity: calculateAtomicComplexity(atomic),
        }));

        // Build component lookup for composite complexity resolution
        const componentMap = new Map                          ();
        hydratedAtomics.forEach((a) => componentMap.set(a.id, a));

        // Hydrate composites with complexity scores and ensure catalogs field
        const hydratedComposites                       = sampleComposites.map((composite) => ({
          ...composite,
          catalogs: composite.catalogs || [],
          complexity: calculateCompositeComplexity(
            composite,
            (id) => componentMap.get(id) || null,
          ),
        }));

        // Use safeSetComponents to MERGE with any existing components
        safeSetComponents(
          [...hydratedAtomics, ...hydratedComposites],
          { initialized: true }
        );
      },

      // CRUD Actions
      addComponent: async (component) => {
        // Auto-assign category if categoryAutoAssigned is not explicitly set
        if (component.metadata.categoryAutoAssigned === undefined) {
          const inferred = inferCategory(component);
          component = {
            ...component,
            metadata: {
              ...component.metadata,
              category: inferred,
              categoryAutoAssigned: true,
            },
          };
        }

        // Auto-generate code for new components if not already present
        if (!component.generatedCode) {
          try {
            const allComponents = get().components;
            const generatedCode = generateAndPackageCode(component, allComponents);
            component = {
              ...component,
              generatedCode,
            };
            console.log(`[ComponentLibrary] Auto-generated code for component ${component.id}`);
          } catch (err) {
            console.warn(`[ComponentLibrary] Failed to generate code for component ${component.id}:`, err);
          }
        }

        // Add to local state first
        set((state) => ({
          components: [...state.components, component],
        }));

        // Persist to backend - use FLAT format matching backend DTO
        try {
          const { createAtomicComponent } = await import('../api/components');
          if (component.type === 'atomic') {
            const atomicComp = component                                                       ;
            await createAtomicComponent({
              id: atomicComp.id,
              name: atomicComp.name,
              description: atomicComp.description || '',
              // FLAT value set fields - required by backend
              valueSetOid: atomicComp.valueSet?.oid || atomicComp.name || 'unknown',
              valueSetName: atomicComp.valueSet?.name || atomicComp.name || 'Unknown',
              valueSetVersion: atomicComp.valueSet?.version || undefined,
              codes: atomicComp.valueSet?.codes?.map(c => ({
                code: c.code,
                system: c.system,
                display: c.display || undefined,
                version: undefined,
              })),
              timing: atomicComp.timing ? {
                operator: atomicComp.timing.operator || 'during',
                quantity: atomicComp.timing.quantity,
                unit: atomicComp.timing.unit,
                position: atomicComp.timing.position,
                reference: atomicComp.timing.reference || 'Measurement Period',
                displayExpression: atomicComp.timing.displayExpression,
              } : undefined,
              negation: atomicComp.negation || false,
              resourceType: atomicComp.resourceType || undefined,
              genderValue: atomicComp.genderValue || undefined,
              category: atomicComp.metadata?.category || 'uncategorized',
              tags: atomicComp.metadata?.tags || undefined,
              catalogs: atomicComp.catalogs || [],
            });
            console.log(`Component ${component.id} persisted to backend`);
            // Clear any pending sync status on success
            get().clearPendingSync(component.id);
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Failed to persist';
          console.warn('Failed to persist component to backend:', error);
          // Mark as pending sync for retry
          get().markPendingSync(component.id, 'create', errorMsg);
        }
      },

      updateComponent: (id, updates) => {
        // Get the existing component for merging
        const state = get();
        const existing = state.components.find((c) => c.id === id);
        if (!existing) return;

        // If category is explicitly changed, clear auto flag
        if (
          updates.metadata?.category &&
          updates.metadata.category !== existing.metadata.category
        ) {
          updates = {
            ...updates,
            metadata: {
              ...updates.metadata,
              categoryAutoAssigned: false,
            },
          };
        }

        // If component is auto-assigned and relevant fields changed, re-infer
        // Only applicable for atomic components which have valueSet, resourceType, genderValue
        if (
          existing.metadata.categoryAutoAssigned &&
          existing.type === 'atomic' &&
          ('valueSet' in updates || 'resourceType' in updates || 'genderValue' in updates)
        ) {
          const merged = { ...existing, ...updates }                    ;
          const newCategory = inferCategory(merged);
          updates = {
            ...updates,
            metadata: {
              ...existing.metadata,
              ...updates.metadata,
              category: newCategory,
            },
          };
        }

        // CRITICAL FIX: Regenerate code when code-affecting fields change
        // Fields that affect generated code: valueSet, timing, negation, resourceType, name
        const codeAffectingFields = ['valueSet', 'timing', 'negation', 'resourceType', 'name', 'childComponents'];
        const needsCodeRegen = codeAffectingFields.some(field => field in updates);

        let finalUpdates = updates;
        if (needsCodeRegen && !updates.generatedCode && !updates.codeOverrides) {
          try {
            const merged = { ...existing, ...updates }                    ;
            const generatedCode = generateAndPackageCode(merged, state.components);
            finalUpdates = { ...updates, generatedCode };
            console.log(`[ComponentLibrary] Regenerated code for updated component ${id}`);
          } catch (err) {
            console.warn(`[ComponentLibrary] Failed to regenerate code for ${id}:`, err);
          }
        }

        // Update local state
        set((s) => ({
          components: s.components.map((c) =>
            c.id === id ? ({ ...c, ...finalUpdates }                    ) : c
          ),
        }));

        // Persist to backend (async, non-blocking)
        const updatedComponent = { ...existing, ...finalUpdates };
        if (updatedComponent.type === 'atomic') {
          import('../api/components').then(async ({ updateComponent: updateComponentApi }) => {
            const atomicComp = updatedComponent                   ;
            const requestBody = {
              id: atomicComp.id,
              name: atomicComp.name,
              description: atomicComp.description || '',
              valueSetOid: atomicComp.valueSet?.oid || '',
              valueSetName: atomicComp.valueSet?.name || '',
              valueSetVersion: atomicComp.valueSet?.version || undefined,
              codes: atomicComp.valueSet?.codes?.map(c => ({
                code: c.code,
                system: c.system,
                display: c.display || undefined,
              })),
              timing: atomicComp.timing ? {
                operator: atomicComp.timing.operator || 'during',
                quantity: atomicComp.timing.quantity,
                unit: atomicComp.timing.unit,
                position: atomicComp.timing.position,
                reference: atomicComp.timing.reference || 'Measurement Period',
                displayExpression: atomicComp.timing.displayExpression,
              } : undefined,
              negation: atomicComp.negation || false,
              category: atomicComp.metadata?.category || 'uncategorized',
              tags: atomicComp.metadata?.tags || undefined,
              catalogs: atomicComp.catalogs || [],
            };
            try {
              await updateComponentApi(id, requestBody);
              console.log(`[updateComponent] Persisted component ${id} to backend`);
              // Clear any pending sync status on success
              get().clearPendingSync(id);
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : 'Failed to update';
              console.warn(`[updateComponent] Failed to persist component ${id} to backend:`, err);
              // Mark as pending sync for retry
              get().markPendingSync(id, 'update', errorMsg);
            }
          }).catch(err => {
            const errorMsg = err instanceof Error ? err.message : 'Failed to load API';
            console.warn(`[updateComponent] Failed to load API module:`, err);
            get().markPendingSync(id, 'update', errorMsg);
          });
        }
      },

      deleteComponent: async (id) => {
        // Check if component exists and is not in use
        const state = get();
        const component = state.components.find((c) => c.id === id);
        if (!component) {
          return { success: false, error: `Component ${id} not found` };
        }

        // Block deletion if component is in use by measures
        if (component.usage.measureIds.length > 0 || component.usage.usageCount > 0) {
          const measureCount = component.usage.measureIds.length || component.usage.usageCount;
          console.warn(`[deleteComponent] Blocked: component ${id} is used by ${measureCount} measure(s)`);
          return {
            success: false,
            error: `Cannot delete component "${component.name}" — it is used by ${measureCount} measure(s). Remove it from all measures first, or archive it instead.`,
            measureIds: component.usage.measureIds,
          };
        }

        // Delete from backend first
        let backendDeleted = false;
        try {
          const { deleteComponent: deleteComponentApi } = await import('../api/components');
          await deleteComponentApi(id);
          console.log(`Deleted component ${id} from backend`);
          backendDeleted = true;
          // Clear any pending sync status
          get().clearPendingSync(id);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Failed to delete';
          console.error('Failed to delete component from backend:', error);
          // Mark as pending delete for retry - but still delete locally
          // On next API load, if it still exists on backend, it will reappear
          get().markPendingSync(id, 'delete', errorMsg);
        }

        // Update local state
        set((state) => ({
          components: state.components.filter((c) => c.id !== id),
          selectedComponentId: state.selectedComponentId === id ? null : state.selectedComponentId,
          editingComponentId: state.editingComponentId === id ? null : state.editingComponentId,
        }));

        return { success: true, backendDeleted };
      },

      // UI State
      setSelectedComponent: (id) => set({ selectedComponentId: id }),

      setFilters: (filters) =>
        set((state) => ({
          filters: { ...state.filters, ...filters },
        })),

      setEditingComponent: (id) => set({ editingComponentId: id }),

      setImportMatcherState: (importState) => set({ importMatcherState: importState }),

      // Versioning
      createVersion: (id, changes, updatedBy) =>
        set((state) => {
          const component = state.components.find((c) => c.id === id);
          if (!component) return state;
          const updated = createNewVersion(component, changes, updatedBy);
          return {
            components: state.components.map((c) => (c.id === id ? updated : c)),
          };
        }),

      archiveComponentVersion: (id, supersededBy) => {
        // Check if component exists and is not in use
        const state = get();
        const component = state.components.find((c) => c.id === id);
        if (!component) {
          return { success: false, error: `Component ${id} not found` };
        }

        // Block archiving if component is in use by measures
        if (component.usage.measureIds.length > 0 || component.usage.usageCount > 0) {
          const measureCount = component.usage.measureIds.length || component.usage.usageCount;
          console.warn(`[archiveComponentVersion] Blocked: component ${id} is used by ${measureCount} measure(s)`);
          return {
            success: false,
            error: `Cannot archive component "${component.name}" — it is used by ${measureCount} measure(s). Remove it from all measures first.`,
            measureIds: component.usage.measureIds,
          };
        }

        set((s) => {
          const comp = s.components.find((c) => c.id === id);
          if (!comp) return s;
          const archived = archiveVersion(comp, supersededBy);
          return {
            components: s.components.map((c) => (c.id === id ? archived : c)),
          };
        });

        // Persist archive status to backend
        import('../api/components').then(async ({ archiveComponent }) => {
          try {
            await archiveComponent(id);
            console.log(`[archiveComponentVersion] Persisted archive status for ${id} to backend`);
          } catch (err) {
            console.warn(`[archiveComponentVersion] Failed to persist archive status for ${id}:`, err);
          }
        });

        return { success: true };
      },

      approve: (id, approvedBy) => {
        set((state) => {
          const component = state.components.find((c) => c.id === id);
          if (!component) return state;
          const approved = approveComponent(component, approvedBy);
          return {
            components: state.components.map((c) => (c.id === id ? approved : c)),
          };
        });

        // Persist approval to backend
        import('../api/components').then(async ({ approveComponent: approveApi }) => {
          try {
            await approveApi(id, approvedBy);
            console.log(`[approve] Persisted approval for ${id} to backend`);
          } catch (err) {
            console.warn(`[approve] Failed to persist approval for ${id}:`, err);
          }
        });
      },

      // Usage
      addUsage: (componentId, measureId) => {
        set((state) => {
          const component = state.components.find((c) => c.id === componentId);
          if (!component) return state;
          const updated = addUsageReference(component, measureId);
          return {
            components: state.components.map((c) => (c.id === componentId ? updated : c)),
          };
        });

        // Persist usage to backend
        import('../api/components').then(async ({ recordUsage }) => {
          try {
            await recordUsage(componentId, measureId);
            console.log(`[addUsage] Persisted usage: component ${componentId} → measure ${measureId}`);
          } catch (err) {
            console.warn(`[addUsage] Failed to persist usage for ${componentId}:`, err);
          }
        });
      },

      removeUsage: (componentId, measureId) =>
        set((state) => {
          const component = state.components.find((c) => c.id === componentId);
          if (!component) return state;
          const updated = removeUsageReference(component, measureId);
          return {
            components: state.components.map((c) => (c.id === componentId ? updated : c)),
          };
        }),

      // Code generation
      regenerateCode: (componentId) =>
        set((state) => {
          const component = state.components.find((c) => c.id === componentId);
          if (!component) return state;

          try {
            const generatedCode = generateAndPackageCode(component, state.components);
            const updated = {
              ...component,
              generatedCode,
            };
            console.log(`[ComponentLibrary] Regenerated code for component ${componentId}`);
            return {
              components: state.components.map((c) => (c.id === componentId ? updated : c)),
            };
          } catch (err) {
            console.warn(`[ComponentLibrary] Failed to regenerate code for ${componentId}:`, err);
            return state;
          }
        }),

      // Shared edit workflow
      handleSharedEdit: (id, changes, action, updatedBy) => {
        // Use updater function to avoid stale closure issues
        set((state) => {
          const component = state.components.find((c) => c.id === id);
          if (!component) return state;

          if (action === 'update_all') {
            // Create new version, archive old one
            const updated = createNewVersion(component, changes, updatedBy);
            return {
              components: state.components.map((c) => (c.id === id ? updated : c)),
            };
          } else {
            // create_version: duplicate the component with changes for this measure only
            const duplicated = createNewVersion(component, changes, updatedBy);
            const newId = `${id}-v${Date.now()}`;
            const duplicatedWithNewId = { ...duplicated, id: newId }                    ;
            return {
              components: [...state.components, duplicatedWithNewId],
            };
          }
        });
      },

      // Measure linking - extract data elements and match/create in library
      linkMeasureComponents: (measureId, populations) => {
        console.log('[linkMeasureComponents] START - measureId:', measureId, 'current components:', get().components.length);

        const state = get();
        const linkMap                         = {}; // dataElementId -> componentId

        // Build library lookup from current components
        const libraryRecord                                   = {};
        state.components.forEach((c) => { libraryRecord[c.id] = c; });

        // Collect all data elements from all populations
        const collectElements = (node                             )                => {
          if ('operator' in node && 'children' in node) {
            // It's a LogicalClause
            const clause = node                 ;
            return clause.children.flatMap(collectElements);
          }
          // It's a DataElement
          return [node               ];
        };

        // Collect all OR/AND clauses whose children are all DataElements (composite candidates)
        const collectClausesWithElements = (node                             )                  => {
          if (!('operator' in node && 'children' in node)) return [];
          const clause = node                 ;
          const results                  = [];
          // Check if ALL children are DataElements (not nested clauses)
          const allDataElements = clause.children.every(
            (c) => !('operator' in c && 'children' in c)
          );
          if (allDataElements && clause.children.length >= 2) {
            results.push(clause);
          }
          // Also recurse into nested clauses
          for (const child of clause.children) {
            if ('operator' in child && 'children' in child) {
              results.push(...collectClausesWithElements(child                 ));
            }
          }
          return results;
        };

        const allElements                = [];
        const allClauses                  = [];
        for (const pop of populations) {
          if (pop.criteria) {
            allElements.push(...collectElements(pop.criteria                               ));
            allClauses.push(...collectClausesWithElements(pop.criteria                               ));
          }
        }

        // Migrate old individual age components to parameterized Age Requirement
        const migratedElements = allElements.map(migrateAgeComponent);

        const newComponents                     = [];
        const updatedComponents                     = [];

        console.log('[linkMeasureComponents] Found', migratedElements.length, 'data elements to process');

        // Step 1: Match individual data elements (atomics) - prioritize approved components
        for (const element of migratedElements) {
          console.log('[linkMeasureComponents] Processing element:', {
            id: element.id,
            description: element.description,
            hasValueSet: !!element.valueSet,
            valueSetOid: element.valueSet?.oid,
            valueSetName: element.valueSet?.name,
            codesCount: element.valueSet?.codes?.length || 0,
            directCodesCount: element.directCodes?.length || 0,
          });

          const parsed = parseDataElementToComponent(element);
          if (!parsed) {
            console.log('[linkMeasureComponents] SKIPPED - parseDataElementToComponent returned null for:', element.description);
            continue; // Skip elements without value sets
          }

          // Try exact match against library, prioritizing approved components
          const { match, isApproved, alternateApproved } = findExactMatchPrioritizeApproved(parsed, libraryRecord);

          // If there's an approved alternative but we matched a draft, use the approved one
          const effectiveMatch = alternateApproved || match;

          if (effectiveMatch) {
            // Link to existing component (prefer approved)
            linkMap[element.id] = effectiveMatch.id;

            if (alternateApproved && match && !isApproved) {
              console.log(`[Component Library] Linked "${element.description}" to approved component "${alternateApproved.name}" instead of draft "${match.name}"`);
            }

            // Sync codes: if the matched component has no codes but the element does, update it
            const elementCodes = element.valueSet?.codes || element.directCodes || [];
            const matchCodes = (effectiveMatch.type === 'atomic' && (effectiveMatch                   ).valueSet.codes) || [];
            let componentToUpdate = effectiveMatch;
            if (elementCodes.length > 0 && matchCodes.length === 0 && effectiveMatch.type === 'atomic') {
              componentToUpdate = {
                ...effectiveMatch,
                valueSet: { ...(effectiveMatch                   ).valueSet, codes: elementCodes },
              }                   ;
              libraryRecord[effectiveMatch.id] = componentToUpdate;
            }

            // REVERSE SYNC: if library component has codes but element doesn't, copy codes to element
            if (matchCodes.length > 0 && elementCodes.length === 0 && element.valueSet) {
              element.valueSet.codes = [...matchCodes];
              // Also ensure element has the OID from the library component if missing
              if (!element.valueSet.oid && effectiveMatch.type === 'atomic' && (effectiveMatch                   ).valueSet.oid) {
                element.valueSet.oid = (effectiveMatch                   ).valueSet.oid;
              }
              console.log(`[linkMeasureComponents] REVERSE SYNC: copied ${matchCodes.length} codes from library to element "${element.description}"`);
            }

            // Add usage if not already tracked
            if (!componentToUpdate.usage.measureIds.includes(measureId)) {
              const updated = addUsageReference(componentToUpdate, measureId);
              updatedComponents.push(updated);
              libraryRecord[effectiveMatch.id] = updated;
            } else if (componentToUpdate !== effectiveMatch) {
              // Codes were updated but usage was already tracked — still need to push the update
              updatedComponents.push(componentToUpdate);
            }
          } else {
            // Check if the element has enough value set information to create a component
            // Accept: OID, name, OR codes — any of these is sufficient for component creation
            const hasValueSetInfo = !!(element.valueSet?.oid && element.valueSet.oid !== 'N/A') ||
                                    !!(element.valueSet?.name) ||
                                    (element.valueSet?.codes?.length ?? 0) > 0 ||
                                    (element.directCodes?.length ?? 0) > 0;

            console.log('[linkMeasureComponents] NO MATCH found for:', element.description, '- hasValueSetInfo:', hasValueSetInfo, {
              oid: element.valueSet?.oid,
              name: element.valueSet?.name,
              codesCount: element.valueSet?.codes?.length ?? 0,
              directCodesCount: element.directCodes?.length ?? 0,
            });

            if (!hasValueSetInfo) {
              // No value set info — cannot create meaningful component. Mark with sentinel for warning.
              console.log('[linkMeasureComponents] SKIPPING (no value set info) - element:', element.description);
              linkMap[element.id] = '__ZERO_CODES__';
              continue;
            }

            // Create new atomic component from this element
            const categoryMap                                    = {
              demographic: 'demographics',
              encounter: 'encounters',
              diagnosis: 'conditions',
              procedure: 'procedures',
              medication: 'medications',
              observation: 'clinical-observations',
              assessment: 'assessments',
            };
            const category                    = categoryMap[element.type] || 'clinical-observations';

            const vsOid = element.valueSet?.oid || '';
            const vsName = element.valueSet?.name || element.description;
            const elementCodes = element.valueSet?.codes || element.directCodes || [];
            const newComp = createAtomicComponent({
              name: vsName,
              description: element.description,
              valueSet: {
                oid: vsOid,
                version: vsOid,
                name: vsName,
                codes: elementCodes,
              },
              timing: parsed.timing || {
                operator: 'during',
                reference: 'Measurement Period',
                displayExpression: 'during Measurement Period',
              },
              negation: parsed.negation || false,
              category,
              tags: [element.type],
              createdBy: 'auto-import',
            });

            // Add usage
            const withUsage = addUsageReference(newComp, measureId);
            newComponents.push(withUsage);
            libraryRecord[withUsage.id] = withUsage;
            linkMap[element.id] = withUsage.id;
            console.log('[linkMeasureComponents] CREATED new component:', {
              id: withUsage.id,
              name: withUsage.name,
              valueSetOid: (withUsage                   ).valueSet?.oid,
              valueSetName: (withUsage                   ).valueSet?.name,
              codesCount: (withUsage                   ).valueSet?.codes?.length || 0,
            });
          }
        }

        // Step 2: Match composite patterns (OR/AND clauses of data elements against library composites)
        for (const clause of allClauses) {
          const childElements = clause.children                 ;
          const childParsed = childElements
            .map((el) => parseDataElementToComponent(el))
            .filter((p)                             => p !== null);

          if (childParsed.length < 2) continue;

          // Build a composite ParsedComponent to match against library composites
          const compositeParsed = {
            name: clause.description || 'Composite',
            children: childParsed,
            operator: clause.operator                ,
          };

          const compositeMatch = findExactMatch(compositeParsed, libraryRecord);
          if (compositeMatch) {
            // Link the clause ID to the composite
            linkMap[clause.id] = compositeMatch.id;
            if (!compositeMatch.usage.measureIds.includes(measureId)) {
              const updated = addUsageReference(compositeMatch, measureId);
              updatedComponents.push(updated);
              libraryRecord[compositeMatch.id] = updated;
            }
            console.log(`Composite match: "${compositeMatch.name}" linked to measure ${measureId}`);
          }
        }

        // Update store using safeSetComponents to MERGE, never replace
        console.log('[linkMeasureComponents] SUMMARY:', {
          newComponentsCount: newComponents.length,
          updatedComponentsCount: updatedComponents.length,
          linkMapSize: Object.keys(linkMap).length,
        });

        if (newComponents.length > 0 || updatedComponents.length > 0) {
          console.log(`[linkMeasureComponents] Calling safeSetComponents with ${newComponents.length} new + ${updatedComponents.length} updated components`);

          // Pass all updated and new components to safeSetComponents
          // It will merge with existing components, preserving any not in this set
          safeSetComponents(
            [...updatedComponents, ...newComponents],
            { initialized: true }
          );

          console.log('[linkMeasureComponents] After safeSetComponents - total components:', get().components.length);

          // Persist new components to backend (async, non-blocking)
          if (newComponents.length > 0) {
            import('../api/components').then(async ({ createAtomicComponent: createAtomicApi }) => {
              for (const comp of newComponents) {
                if (comp.type === 'atomic') {
                  const atomicComp = comp                   ;
                  // Build request in FLAT format matching backend DTO
                  const requestBody = {
                    // IMPORTANT: Send the local ID to backend so IDs match
                    id: atomicComp.id,
                    name: atomicComp.name,
                    description: atomicComp.description || '',
                    // FLAT value set fields - required by backend @NotBlank validation
                    valueSetOid: atomicComp.valueSet?.oid || atomicComp.name || 'unknown',
                    valueSetName: atomicComp.valueSet?.name || atomicComp.name || 'Unknown',
                    valueSetVersion: atomicComp.valueSet?.version || undefined,
                    codes: atomicComp.valueSet?.codes?.map(c => ({
                      code: c.code,
                      system: c.system,
                      display: c.display || undefined,
                      version: undefined,
                    })),
                    // Timing in backend format
                    timing: atomicComp.timing ? {
                      operator: atomicComp.timing.operator || 'during',
                      quantity: atomicComp.timing.quantity,
                      unit: atomicComp.timing.unit,
                      position: atomicComp.timing.position,
                      reference: atomicComp.timing.reference || 'Measurement Period',
                      displayExpression: atomicComp.timing.displayExpression,
                    } : undefined,
                    negation: atomicComp.negation || false,
                    resourceType: atomicComp.resourceType || undefined,
                    genderValue: atomicComp.genderValue || undefined,
                    category: atomicComp.metadata?.category || 'uncategorized',
                    tags: atomicComp.metadata?.tags || undefined,
                    catalogs: atomicComp.catalogs || [],
                  };
                  console.log('[linkMeasureComponents] POSTing component to backend:', requestBody);
                  try {
                    const result = await createAtomicApi(requestBody);
                    console.log('[linkMeasureComponents] ✅ Persisted to backend:', comp.id, comp.name, result);
                  } catch (err) {
                    console.error('[linkMeasureComponents] ❌ FAILED to persist:', comp.id, comp.name, err);
                    console.error('[linkMeasureComponents] Request body was:', JSON.stringify(requestBody, null, 2).slice(0, 1000));
                  }
                }
              }
            }).catch(err => {
              console.error('[linkMeasureComponents] ❌ FAILED to import api/components module:', err);
            });
          }
        }

        return linkMap;
      },

      // Recalculate usage from actual measures (resets all counts, rebuilds from scratch)
      recalculateUsage: (measures) => {
        // Helper to collect all data elements from a criteria tree
        const collectElements = (node                             )                => {
          if ('operator' in node && 'children' in node) {
            return (node                 ).children.flatMap(collectElements);
          }
          return [node               ];
        };

        // Helper to collect clauses whose children are all DataElements (composite candidates)
        const collectClausesWithElements = (node                             )                  => {
          if (!('operator' in node && 'children' in node)) return [];
          const clause = node                 ;
          const results                  = [];
          const allDataElements = clause.children.every(
            (c) => !('operator' in c && 'children' in c)
          );
          if (allDataElements && clause.children.length >= 2) {
            results.push(clause);
          }
          for (const child of clause.children) {
            if ('operator' in child && 'children' in child) {
              results.push(...collectClausesWithElements(child                 ));
            }
          }
          return results;
        };

        // Use updater function to get CURRENT state and avoid race conditions
        set((state) => {
          // Build a set of (componentId -> Set<measureId>) from actual measures
          const usageMap = new Map                     ();

          // Build a library lookup for matching using CURRENT state
          const libraryRecord                                   = {};
          state.components.forEach((c) => { libraryRecord[c.id] = c; });

          for (const measure of measures) {
            const measureId = measure.metadata.measureId;
            for (const pop of measure.populations) {
              if (!pop.criteria) continue;

              // Match individual data elements (atomics)
              const elements = collectElements(pop.criteria                               );
              for (const element of elements) {
                let componentId = element.libraryComponentId;

                if (!componentId) {
                  const parsed = parseDataElementToComponent(element);
                  if (parsed) {
                    const match = findExactMatch(parsed, libraryRecord);
                    if (match) {
                      componentId = match.id;
                    }
                  }
                }

                if (componentId && libraryRecord[componentId]) {
                  if (!usageMap.has(componentId)) {
                    usageMap.set(componentId, new Set());
                  }
                  usageMap.get(componentId) .add(measureId);
                }
              }

              // Match composite patterns (OR/AND clauses against library composites)
              const clauses = collectClausesWithElements(pop.criteria                               );
              for (const clause of clauses) {
                const childElements = clause.children                 ;
                const childParsed = childElements
                  .map((el) => parseDataElementToComponent(el))
                  .filter((p)                             => p !== null);
                if (childParsed.length < 2) continue;

                const compositeParsed = {
                  name: clause.description || 'Composite',
                  children: childParsed,
                  operator: clause.operator                ,
                };
                const compositeMatch = findExactMatch(compositeParsed, libraryRecord);
                if (compositeMatch) {
                  if (!usageMap.has(compositeMatch.id)) {
                    usageMap.set(compositeMatch.id, new Set());
                  }
                  usageMap.get(compositeMatch.id) .add(measureId);
                }
              }
            }
          }

          // Reset all components' usage, rebuild from usageMap
          // Do NOT auto-archive - only update usage counts
          const now = new Date().toISOString();
          const updatedComponents = state.components.map((c) => {
            const measureIds = usageMap.has(c.id) ? Array.from(usageMap.get(c.id) ) : [];
            const hasUsage = measureIds.length > 0;

            // ONLY un-archive if it gained usage (restore from archived state)
            // Do NOT auto-archive components just because they have no usage
            let newStatus = c.versionInfo.status;
            if (hasUsage && c.versionInfo.status === 'archived') {
              // Restore: find the last non-archived status from history, default to 'approved'
              const lastNonArchived = [...c.versionInfo.versionHistory]
                .reverse()
                .find((v) => v.status !== 'archived');
              newStatus = lastNonArchived?.status || 'approved';
            }

            return {
              ...c,
              usage: {
                ...c.usage,
                measureIds,
                usageCount: measureIds.length,
                lastUsedAt: hasUsage ? now : c.usage.lastUsedAt,
              },
              versionInfo: {
                ...c.versionInfo,
                status: newStatus,
              },
            }                    ;
          });

          return { components: updatedComponents };
        });
      },

      // Rebuild usage index from scratch - measures are the single source of truth
      rebuildUsageIndex: (measures) => {
        // Helper to collect all data elements with their libraryComponentId from a criteria tree
        const collectLinkedElements = (node                             )                                                    => {
          if ('operator' in node && 'children' in node) {
            return (node                 ).children.flatMap(collectLinkedElements);
          }
          const element = node               ;
          if (element.libraryComponentId && element.libraryComponentId !== '__ZERO_CODES__') {
            return [{ elementId: element.id, componentId: element.libraryComponentId }];
          }
          return [];
        };

        // Build map: componentId -> Set of measureIds that reference it
        const usageMap = new Map                     ();

        for (const measure of measures) {
          // Use measure.id (internal store ID), not metadata.measureId (display ID like CMS130)
          const measureId = measure.id;
          for (const pop of measure.populations) {
            if (!pop.criteria) continue;
            const linked = collectLinkedElements(pop.criteria                               );
            for (const { componentId } of linked) {
              if (!usageMap.has(componentId)) {
                usageMap.set(componentId, new Set());
              }
              usageMap.get(componentId) .add(measureId);
            }
          }
        }

        // Use updater function to get CURRENT state and avoid race conditions
        const now = new Date().toISOString();
        set((state) => {
          // Map over CURRENT components, not a stale snapshot
          const updatedComponents = state.components.map((c) => {
            const measureIds = usageMap.has(c.id) ? Array.from(usageMap.get(c.id) ) : [];
            const hasUsage = measureIds.length > 0;

            // ONLY update usage counts - do NOT auto-archive components
            // Components should only be archived through explicit user action or merge
            // Un-archive if it gained usage (restore from archived state)
            let newStatus = c.versionInfo.status;
            if (hasUsage && c.versionInfo.status === 'archived') {
              const lastNonArchived = [...c.versionInfo.versionHistory]
                .reverse()
                .find((v) => v.status !== 'archived');
              newStatus = lastNonArchived?.status || 'approved';
            }

            return {
              ...c,
              usage: {
                ...c.usage,
                measureIds,
                usageCount: measureIds.length,
                lastUsedAt: hasUsage ? now : c.usage.lastUsedAt,
              },
              versionInfo: {
                ...c.versionInfo,
                status: newStatus,
              },
            }                    ;
          });

          return { components: updatedComponents };
        });
      },

      // Update all measure DataElements that reference archived components to point to the new merged component
      updateMeasureReferencesAfterMerge: (archivedComponentIds, newComponentId, measures, batchUpdateMeasures) => {
        // Helper to walk and update libraryComponentId references
        const updateReferences = (node     )      => {
          if (!node) return node;

          // LogicalClause
          if ('operator' in node && 'children' in node) {
            return {
              ...node,
              children: node.children.map(updateReferences),
            };
          }

          // DataElement - check if it references an archived component
          if (node.libraryComponentId && archivedComponentIds.includes(node.libraryComponentId)) {
            return {
              ...node,
              libraryComponentId: newComponentId,
            };
          }

          return node;
        };

        // Collect all updates FIRST without applying
        const batchUpdates                                                                = [];

        for (const measure of measures) {
          // Check if this measure has any references to archived components
          let hasReferences = false;
          const checkForReferences = (node     )          => {
            if (!node) return false;
            if ('operator' in node && 'children' in node) {
              return node.children.some(checkForReferences);
            }
            return node.libraryComponentId && archivedComponentIds.includes(node.libraryComponentId);
          };

          for (const pop of measure.populations) {
            if (pop.criteria && checkForReferences(pop.criteria)) {
              hasReferences = true;
              break;
            }
          }

          if (hasReferences) {
            const updatedPopulations = measure.populations.map((pop) => ({
              ...pop,
              criteria: pop.criteria ? updateReferences(pop.criteria) : pop.criteria,
            }));
            batchUpdates.push({ id: measure.id, updates: { populations: updatedPopulations } });
          }
        }

        // If no updates needed, return success
        if (batchUpdates.length === 0) {
          return { success: true };
        }

        // Apply all updates atomically
        const result = batchUpdateMeasures(batchUpdates);

        // After batch update, validate referential integrity
        if (result.success) {
          const state = get();
          const mismatches = validateReferentialIntegrity(measures, state.components);
          if (mismatches.length > 0) {
            console.error('[Referential Integrity] Mismatches detected after updateMeasureReferencesAfterMerge:');
            console.error(formatMismatches(mismatches));
          }
        }

        return result;
      },

      // Sync component changes to all measures that use it
      syncComponentToMeasures: (componentId, changes, measures, batchUpdateMeasures) => {
        const component = get().components.find((c) => c.id === componentId);
        if (!component) {
          return { success: false, error: `Component ${componentId} not found` };
        }

        const affectedMeasureIds = component.usage.measureIds;

        // Validate that all affected measures exist
        const missingMeasures           = [];
        for (const measureId of affectedMeasureIds) {
          if (!measures.some((m) => m.metadata?.measureId === measureId || m.id === measureId)) {
            missingMeasures.push(measureId);
          }
        }
        if (missingMeasures.length > 0) {
          return { success: false, error: `Measures not found: ${missingMeasures.join(', ')}` };
        }

        // Helper to walk criteria tree and update matching data elements
        const updateCriteria = (node     )      => {
          if (!node) return node;

          // LogicalClause
          if ('operator' in node && 'children' in node) {
            return {
              ...node,
              children: node.children.map(updateCriteria),
            };
          }

          // DataElement — check if it's linked to this component
          if (node.libraryComponentId === componentId) {
            const updated = { ...node };
            if (changes.name) {
              updated.description = changes.name;
            }
            if (component.type === 'atomic') {
              if (changes.timing) {
                updated.timingRequirements = [{
                  description: changes.timing.displayExpression,
                  window: changes.timing.quantity ? {
                    value: changes.timing.quantity,
                    unit: changes.timing.unit || 'years',
                    direction: changes.timing.position || 'before end of',
                  } : undefined,
                }];
              }
              if (changes.negation !== undefined) {
                updated.negation = changes.negation;
              }
              // Sync codes to the DataElement's valueSet
              if (changes.codes && updated.valueSet) {
                updated.valueSet = {
                  ...updated.valueSet,
                  codes: changes.codes,
                  totalCodeCount: changes.codes.length,
                };
              }
            }
            return updated;
          }

          return node;
        };

        // Collect all updates FIRST without applying
        const batchUpdates                                                                = [];

        for (const measure of measures) {
          if (!affectedMeasureIds.includes(measure.metadata?.measureId || '')) continue;

          const updatedPopulations = measure.populations.map((pop) => ({
            ...pop,
            criteria: pop.criteria ? updateCriteria(pop.criteria) : pop.criteria,
          }));

          batchUpdates.push({ id: measure.id, updates: { populations: updatedPopulations } });
        }

        // If no updates needed, return success
        if (batchUpdates.length === 0) {
          return { success: true };
        }

        // Apply all updates atomically
        const result = batchUpdateMeasures(batchUpdates);

        // After batch update, validate referential integrity and rebuild usage index
        if (result.success) {
          const state = get();
          // Rebuild usage index with the updated measures
          // Note: We need to get the updated measures from the caller's state after batch update
          const mismatches = validateReferentialIntegrity(measures, state.components);
          if (mismatches.length > 0) {
            console.error('[Referential Integrity] Mismatches detected after syncComponentToMeasures:');
            console.error(formatMismatches(mismatches));
          }
        }

        return result;
      },

      // Validate measure component usage against library
      validateMeasureComponentUsage: (populations) => {
        const state = get();

        // Build library lookup
        const libraryRecord                                   = {};
        state.components.forEach((c) => { libraryRecord[c.id] = c; });

        // Collect all data elements
        const collectElements = (node                             )                => {
          if ('operator' in node && 'children' in node) {
            return (node                 ).children.flatMap(collectElements);
          }
          return [node               ];
        };

        const allElements                = [];
        for (const pop of populations) {
          if (pop.criteria) {
            allElements.push(...collectElements(pop.criteria                               ));
          }
        }

        return validateMeasureComponents(allElements, libraryRecord);
      },

      // Merge multiple components into one with combined value sets
      mergeComponents: (componentIds, mergedName, mergedDescription, valueSetsWithCodes) => {
        const state = get();

        // ========== VALIDATION ==========
        // Reject if fewer than 2 components selected
        if (componentIds.length < 2) {
          return { success: false, error: 'At least 2 components must be selected for merge' };
        }

        // Check all component IDs exist and are not archived
        const missingIds           = [];
        const archivedIds           = [];
        const foundComponents                    = [];

        for (const id of componentIds) {
          const comp = state.components.find(c => c.id === id);
          if (!comp) {
            missingIds.push(id);
          } else if (comp.versionInfo.status === 'archived') {
            archivedIds.push(id);
          } else if (comp.type === 'atomic') {
            foundComponents.push(comp                   );
          }
        }

        if (missingIds.length > 0) {
          return { success: false, error: `Component IDs not found: ${missingIds.join(', ')}` };
        }

        if (archivedIds.length > 0) {
          return { success: false, error: `Cannot merge archived components: ${archivedIds.join(', ')}` };
        }

        if (foundComponents.length < 2) {
          return { success: false, error: 'At least 2 atomic components are required for merge' };
        }

        // ========== COLLECT VALUE SETS ==========
        let allValueSets                                                                                                                    ;

        if (valueSetsWithCodes && valueSetsWithCodes.length > 0) {
          // Use the pre-collected value sets with codes (from measure.valueSets)
          // These are already deduplicated by the caller but preserve value set grouping
          allValueSets = valueSetsWithCodes;
        } else {
          // Fallback: collect from library components (may not have codes)
          allValueSets = [];
          const seenOids = new Set        ();

          for (const comp of foundComponents) {
            // Add from valueSets array if present, otherwise use single valueSet
            const valueSetsToAdd = comp.valueSets || [comp.valueSet];
            for (const vs of valueSetsToAdd) {
              if (!seenOids.has(vs.oid)) {
                seenOids.add(vs.oid);
                allValueSets.push(vs);
              }
            }
          }
        }

        // ========== CREATE MERGED COMPONENT ==========
        const baseComponent = foundComponents[0];

        // Combine all measure IDs from all components being merged
        const allMeasureIds = new Set        ();
        for (const comp of foundComponents) {
          for (const measureId of comp.usage.measureIds) {
            allMeasureIds.add(measureId);
          }
        }

        const now = new Date().toISOString();
        const mergedId = `merged-${Date.now()}`;

        const mergedComponent                  = {
          type: 'atomic',
          id: mergedId,
          name: mergedName,
          description: mergedDescription || `Combined component: ${foundComponents.map(c => c.name).join(' + ')}`,
          valueSet: allValueSets[0], // Primary value set for backward compatibility
          valueSets: allValueSets,   // All value sets (preserves grouping)
          timing: baseComponent.timing,
          negation: baseComponent.negation,
          complexity: baseComponent.complexity, // Will be recalculated
          versionInfo: {
            versionId: '1.0',
            versionHistory: [{
              versionId: '1.0',
              status: 'draft',
              createdAt: now,
              createdBy: 'merge',
              changeDescription: `Merged from: ${foundComponents.map(c => c.name).join(', ')}`,
            }],
            status: 'draft',
          },
          usage: {
            measureIds: Array.from(allMeasureIds),
            usageCount: allMeasureIds.size,
            lastUsedAt: now,
          },
          metadata: {
            ...baseComponent.metadata,
            createdAt: now,
            updatedAt: now,
            tags: [...new Set(foundComponents.flatMap(c => c.metadata.tags))],
          },
        };

        // ========== UPDATE STORE ==========
        // Archive original components, add merged component
        set((s) => {
          const updatedComponents = s.components.map(c => {
            if (componentIds.includes(c.id)) {
              return {
                ...c,
                versionInfo: {
                  ...c.versionInfo,
                  status: 'archived'         ,
                },
              };
            }
            return c;
          });

          return {
            components: [...updatedComponents, mergedComponent],
          };
        });

        console.log(`[mergeComponents] Merged ${foundComponents.length} components into "${mergedName}" with ${allValueSets.length} value sets`);
        return { success: true, component: mergedComponent };
      },

      // Selectors
      getComponent: (id) => {
        return get().components.find((c) => c.id === id) || null;
      },

      getFilteredComponents: () => {
        const state = get();
        return searchComponents(state.components, state.filters);
      },

      getComponentsByCategory: (category) => {
        return get().components.filter((c) => c.metadata.category === category);
      },

      getComponentsByStatus: (status) => {
        return get().components.filter((c) => c.versionInfo.status === status);
      },

      getCategoryCounts: () => {
        const components = get().components.filter(
          (c) => c.versionInfo.status !== 'archived'
        );
        const counts                         = {};
        for (const c of components) {
          counts[c.metadata.category] = (counts[c.metadata.category] || 0) + 1;
        }
        return counts                                     ;
      },
    }; // Close return object
  } // Close function body
);

// TEMPORARY: Detect component wipes with stack traces
if (typeof window !== 'undefined') {
  useComponentLibraryStore.subscribe((state, prevState) => {
    if (prevState.components.length > 0 && state.components.length < prevState.components.length) {
      console.error(
        `[COMPONENT WIPE] ${prevState.components.length} → ${state.components.length}`,
        new Error().stack
      );
    }
  });
}
