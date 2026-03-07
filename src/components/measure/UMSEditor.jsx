import { useState, useRef, useEffect, Fragment, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, ChevronDown, CheckCircle, AlertTriangle, X, Sparkles, ExternalLink, Plus, Trash2, Download, History, Edit3, Save, XCircle, Settings2, ArrowUp, ArrowDown, Search, Library as LibraryIcon, Import, FileText, Link, ShieldCheck, GripVertical, Loader2, Combine, Square, CheckSquare, Database, ArrowLeftRight } from 'lucide-react';
import { InlineErrorBanner, InlineSuccessBanner } from '../shared/ErrorBoundary';
import { validateReferentialIntegrity, formatMismatches } from '../../utils/integrityCheck';
import { useMeasureStore } from '../../stores/measureStore';
import { useComponentLibraryStore } from '../../stores/componentLibraryStore';
import { useComponentCodeStore } from '../../stores/componentCodeStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { ComponentBuilder } from './ComponentBuilder';
import { ComponentDetailPanel } from './ComponentDetailPanel';
import { getOperatorBetween } from '../../types/ums';
import { MeasurePeriodBar, TimingBadge, TimingEditorPanel } from './TimingEditor';
import { TimingSection, deriveDueDateDays } from '../shared/TimingSection';
import { getEffectiveWindow, getEffectiveTiming } from '../../types/ums';
import { calculateDataElementComplexity, calculatePopulationComplexity, calculateMeasureComplexity } from '../../services/complexityCalculator';
import { getAllStandardValueSets, searchStandardValueSets } from '../../constants/standardValueSets';
import SharedEditWarning from '../library/SharedEditWarning';
import AddComponentModal from '../library/AddComponentModal';
import {
  recordComponentFeedback,
  snapshotFromDataElement,
} from '../../services/feedbackLoop';
import { fetchValueSetExpansion } from '../../services/vsacService';

// Program/catalogue options for measure metadata
const MEASURE_PROGRAMS = [
  { value: 'MIPS_CQM', label: 'MIPS CQM' },
  { value: 'eCQM', label: 'eCQM' },
  { value: 'HEDIS', label: 'HEDIS' },
  { value: 'QOF', label: 'QOF' },
  { value: 'Registry', label: 'Registry' },
  { value: 'Custom', label: 'Custom' },
];

/** Strip standalone AND/OR/NOT operators that appear as line separators in descriptions */
function cleanDescription(desc                    )         {
  if (!desc) return '';
  return desc
    .replace(/\n\s*(AND|OR|NOT)\s*\n/gi, ' ')
    .replace(/\n\s*(AND|OR|NOT)\s*$/gi, '')
    .replace(/^\s*(AND|OR|NOT)\s*\n/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Map component category to element type for display badge */
function categoryToElementType(category) {
  if (!category) return 'observation';
  const cat = category.toLowerCase();
  if (cat === 'demographics') return 'demographic';
  if (cat === 'encounters') return 'encounter';
  if (cat === 'procedures') return 'procedure';
  if (cat === 'conditions') return 'diagnosis';
  if (cat === 'medications') return 'medication';
  if (cat === 'immunizations') return 'immunization';
  if (cat === 'assessments') return 'assessment';
  if (cat === 'exclusions') return 'exclusion';
  if (cat.includes('observation')) return 'observation';
  return 'observation';
}

/** Format age thresholds for display in criteria tree */
function formatAgeRange(thresholds) {
  if (!thresholds) return '18–65 years'; // Default range
  const { ageMin, ageMax } = thresholds;
  if (ageMin !== undefined && ageMax !== undefined) return `${ageMin}–${ageMax} years`;
  if (ageMin !== undefined) return `${ageMin}+ years`;
  if (ageMax !== undefined) return `≤${ageMax} years`;
  return '18–65 years'; // Default range
}

/** Robust check for Age Requirement component across multiple identifiers */
function isAgeRequirementComponent(component) {
  if (!component) return false;
  // Check subtype
  if (component.subtype === 'age') return true;
  // Check component IDs
  if (component.id === 'comp-demographic-age-requirement') return true;
  if (component.libraryComponentId === 'comp-demographic-age-requirement') return true;
  if (component.libraryRef === 'comp-demographic-age-requirement') return true;
  if (component.componentId === 'comp-demographic-age-requirement') return true;
  // Check name
  if (component.name === 'Age Requirement') return true;
  if (component.name?.toLowerCase().includes('age requirement')) return true;
  // Check category + name pattern for demographics with "age" in name
  const category = component.metadata?.category || component.category || '';
  if (category.toLowerCase() === 'demographics' && component.name?.toLowerCase().includes('age')) return true;
  return false;
}

/** Compact number stepper for age input */
function NumberStepper({ value, min, max, onChange }) {
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);
  const valueRef = useRef(value);

  // Keep valueRef in sync
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const startHold = (delta) => {
    // Immediate first change
    const newVal = Math.max(min, Math.min(max, valueRef.current + delta));
    onChange(newVal);
    valueRef.current = newVal;
    // Start repeating after a short delay
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        const next = Math.max(min, Math.min(max, valueRef.current + delta));
        if (next !== valueRef.current) {
          onChange(next);
          valueRef.current = next;
        }
      }, 75);
    }, 300);
  };

  const stopHold = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (intervalRef.current) clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => stopHold();
  }, []);

  return (
    <div className="inline-flex items-center border border-[var(--border)] rounded-md bg-[var(--bg-secondary)]">
      <button
        onMouseDown={(e) => {
          e.stopPropagation();
          startHold(-1);
        }}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        className="px-1.5 py-0.5 text-[var(--text-dim)] hover:bg-[var(--bg-tertiary)] rounded-l-md select-none"
      >▼</button>
      <input
        type="number"
        value={value}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v) && v >= min && v <= max) onChange(v);
        }}
        className="w-12 text-center text-sm font-medium bg-transparent border-x border-[var(--border)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        min={min}
        max={max}
      />
      <button
        onMouseDown={(e) => {
          e.stopPropagation();
          startHold(1);
        }}
        onMouseUp={stopHold}
        onMouseLeave={stopHold}
        className="px-1.5 py-0.5 text-[var(--text-dim)] hover:bg-[var(--bg-tertiary)] rounded-r-md select-none"
      >▲</button>
    </div>
  );
}

/** Inline age requirement configuration panel */
// QA-FLAG: Confirmed unused, candidate for removal
// eslint-disable-next-line no-unused-vars
function AgeRequirementConfig({ element, onUpdate }) {
  const thresholds = element.thresholds || {};
  const [noMin, setNoMin] = useState(thresholds.ageMin === undefined);
  const [noMax, setNoMax] = useState(thresholds.ageMax === undefined);

  const updateThreshold = (updates) => {
    onUpdate(element.id, {
      ...element,
      thresholds: { ...thresholds, ...updates }
    });
  };

  const handleNoMinChange = (checked) => {
    setNoMin(checked);
    if (checked) {
      const { ageMin: _ageMin, ...rest } = thresholds;
      onUpdate(element.id, { ...element, thresholds: rest });
    } else {
      updateThreshold({ ageMin: 18 });
    }
  };

  const handleNoMaxChange = (checked) => {
    setNoMax(checked);
    if (checked) {
      const { ageMax: _ageMax, ...rest } = thresholds;
      onUpdate(element.id, { ...element, thresholds: rest });
    } else {
      updateThreshold({ ageMax: 65 });
    }
  };

  return (
    <div
      className="mt-3 p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] space-y-3"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Age range sentence builder */}
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span className="text-[var(--text-dim)]">Patient is</span>

        {!noMin && (
          <NumberStepper
            value={thresholds.ageMin ?? 18}
            min={0}
            max={120}
            onChange={(v) => updateThreshold({ ageMin: v })}
          />
        )}

        {!noMin && !noMax && (
          <span className="text-[var(--text-dim)]">to</span>
        )}

        {!noMax && (
          <NumberStepper
            value={thresholds.ageMax ?? 65}
            min={0}
            max={120}
            onChange={(v) => updateThreshold({ ageMax: v })}
          />
        )}

        <span className="text-[var(--text-dim)]">
          {noMax && !noMin ? 'years or older' : noMin && !noMax ? 'years or younger' : 'years old'}
        </span>
      </div>

      {/* Checkboxes for no min/max */}
      <div className="flex items-center gap-4 text-xs">
        <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={noMin}
            onChange={(e) => handleNoMinChange(e.target.checked)}
            className="rounded border-[var(--border)]"
          />
          No minimum
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={noMax}
            onChange={(e) => handleNoMaxChange(e.target.checked)}
            className="rounded border-[var(--border)]"
          />
          No maximum
        </label>
      </div>

      {/* Reference point selection */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-[var(--text-dim)]">Calculated at:</span>
        <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-muted)]">
          <input
            type="radio"
            name={`age-ref-${element.id}`}
            checked={thresholds.referencePoint !== 'start_of_measurement_period'}
            onChange={() => updateThreshold({ referencePoint: 'end_of_measurement_period' })}
            className="text-[var(--accent)]"
          />
          End of MP
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer text-[var(--text-muted)]">
          <input
            type="radio"
            name={`age-ref-${element.id}`}
            checked={thresholds.referencePoint === 'start_of_measurement_period'}
            onChange={() => updateThreshold({ referencePoint: 'start_of_measurement_period' })}
            className="text-[var(--accent)]"
          />
          Start of MP
        </label>
      </div>
    </div>
  );
}

export function UMSEditor() {
  const navigate = useNavigate();
  const { getActiveMeasure, updateReviewStatus, approveAllLowComplexity, measures, exportCorrections, getCorrections, addComponentToPopulation, addValueSet, toggleLogicalOperator, reorderComponent, moveComponentToIndex, setOperatorBetweenSiblings, deleteComponent, replaceComponent, updateTimingOverride, updateTimingWindow, updateMeasurementPeriod, updateDataElement } = useMeasureStore();
  const measure = getActiveMeasure();
  const {
    components: libraryComponents,
    linkMeasureComponents,
    initializeWithSampleData,
    getComponent,
    addComponent,
    updateComponent,
    rebuildUsageIndex,
    syncComponentToMeasures,
    mergeComponents,
    updateMeasureReferencesAfterMerge,
  } = useComponentLibraryStore();
  const { updateMeasure, batchUpdateMeasures } = useMeasureStore();
  const [expandedSections, setExpandedSections] = useState             (new Set(['ip', 'den', 'ex', 'num']));
  const [selectedNode, setSelectedNode] = useState               (null);
  const [activeValueSet, setActiveValueSet] = useState                          (null);
  const [activeValueSetElementId, setActiveValueSetElementId] = useState               (null);
  const [builderTarget, setBuilderTarget] = useState                                                         (null);
  const [addComponentTarget, setAddComponentTarget] = useState                                                         (null);
  // Swap/replace mode: tracks the component being replaced
  const [swapTarget, setSwapTarget] = useState(null); // { populationId, populationType, parentClauseId, componentId, componentName, index }
  const [deepMode, setDeepMode] = useState(false);
  const [showValueSetBrowser, setShowValueSetBrowser] = useState(false);
  const [_componentLinkMap, setComponentLinkMap] = useState                        ({});
  const [detailPanelMode, setDetailPanelMode] = useState                 ('edit');
  const [dragState, setDragState] = useState                                                                                                                ({ draggedId: null, dragOverId: null, dragOverPosition: null });
  const [editingTimingId, setEditingTimingId] = useState               (null);

  // Component merge state (checkbox selection in deep mode)
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeName, setMergeName] = useState('');
  const [selectedForMerge, setSelectedForMerge] = useState             (new Set());

  // Error and success state for inline banners
  const [error, setError] = useState               (null);
  const [success, setSuccess] = useState               (null);

  // Metadata editing state
  const [isEditingMetadata, setIsEditingMetadata] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedMeasureId, setEditedMeasureId] = useState('');
  const [editedProgram, setEditedProgram] = useState        ('');
  const [editedDescription, setEditedDescription] = useState('');
  const [showFullDescription, setShowFullDescription] = useState(false);

  // Shared edit warning state
  const [showSharedEditWarning, setShowSharedEditWarning] = useState(false);
  const [pendingEdit, setPendingEdit] = useState(null);

  // Listen for inspectingComponentId from CodeGeneration's "View in UMS Editor" button
  const inspectingComponentId = useComponentCodeStore((state) => state.inspectingComponentId);
  const setInspectingComponent = useComponentCodeStore((state) => state.setInspectingComponent);

  // When inspectingComponentId changes, select that node and clear the inspection state
  useEffect(() => {
    if (inspectingComponentId) {
      setSelectedNode(inspectingComponentId);
      // Clear the inspecting state so it doesn't persist
      setInspectingComponent(null);
    }
  }, [inspectingComponentId, setInspectingComponent]);

  // Toggle merge selection for a component
  const toggleMergeSelection = (componentId        ) => {
    setSelectedForMerge(prev => {
      const next = new Set(prev);
      if (next.has(componentId)) {
        next.delete(componentId);
      } else {
        next.add(componentId);
      }
      return next;
    });
  };

  // Clear merge selection when exiting deep mode
  const handleDeepModeToggle = () => {
    if (deepMode) {
      setSelectedForMerge(new Set());
    }
    setDeepMode(!deepMode);
  };

  // Helper to find a DataElement by ID in the measure
  const findElementById = (elementId        )                     => {
    if (!measure) return null;
    const searchInClause = (clause                                    )                     => {
      if (!clause) return null;
      if ('type' in clause && clause.id === elementId) return clause               ;
      if ('children' in clause) {
        for (const child of clause.children) {
          const found = searchInClause(child                               );
          if (found) return found;
        }
      }
      return null;
    };
    for (const pop of measure.populations) {
      const found = searchInClause(pop.criteria);
      if (found) return found;
    }
    return null;
  };

  // TODO: Wire SharedEditWarning for value set changes, not just timing edits.
  // Currently SharedEditWarning is only shown for timing edits. Value set code
  // changes (addCodeToValueSet, removeCodeFromValueSet) should also check if the
  // affected DataElements link to shared library components and prompt the user.

  // Feedback capture: store snapshots before edits to enable before/after comparison
  const elementSnapshotsRef = useRef                                (new Map());

  /**
   * Capture a snapshot of an element before editing.
   * Call this BEFORE any edit operation to record the "before" state.
   */
  const captureBeforeSnapshot = (elementId        ) => {
    const element = findElementById(elementId);
    if (element) {
      const snapshot = snapshotFromDataElement(element);
      elementSnapshotsRef.current.set(elementId, snapshot);
    }
  };

  /**
   * Record feedback after an edit is complete.
   * Call this AFTER the edit to compare before/after and store feedback.
   */
  const recordEditFeedback = (elementId        ) => {
    if (!measure) return;

    const beforeSnapshot = elementSnapshotsRef.current.get(elementId);
    if (!beforeSnapshot) return; // No before snapshot captured

    const element = findElementById(elementId);
    if (!element) return;

    const afterSnapshot = snapshotFromDataElement(element);

    // Only record if there are actual changes
    const hasChanges =
      beforeSnapshot.description !== afterSnapshot.description ||
      beforeSnapshot.oid !== afterSnapshot.oid ||
      beforeSnapshot.valueSetName !== afterSnapshot.valueSetName ||
      beforeSnapshot.negation !== afterSnapshot.negation ||
      beforeSnapshot.dataType !== afterSnapshot.dataType ||
      JSON.stringify(beforeSnapshot.timing) !== JSON.stringify(afterSnapshot.timing) ||
      JSON.stringify(beforeSnapshot.thresholds) !== JSON.stringify(afterSnapshot.thresholds);

    if (hasChanges) {
      recordComponentFeedback(
        elementId,
        measure.id,
        beforeSnapshot,
        afterSnapshot
      );
    }

    // Clear the before snapshot
    elementSnapshotsRef.current.delete(elementId);
  };

  // Wrapped timing save that checks for shared components
  const handleTimingSaveWithWarning = (componentId        , modified                  ) => {
    // Capture before state for feedback
    captureBeforeSnapshot(componentId);

    const element = findElementById(componentId);
    if (!element?.libraryComponentId) {
      // Not library-linked, proceed directly
      updateTimingOverride(measure .id, componentId, modified);
      // Record feedback after edit
      setTimeout(() => recordEditFeedback(componentId), 100);
      return;
    }

    const libraryComponent = getComponent(element.libraryComponentId);
    if (!libraryComponent || libraryComponent.usage.usageCount <= 1) {
      // Only used in this measure, proceed directly
      updateTimingOverride(measure .id, componentId, modified);
      // Record feedback after edit
      setTimeout(() => recordEditFeedback(componentId), 100);
      return;
    }

    // Shared component - show warning
    setPendingEdit({
      componentId: libraryComponent.id,
      elementId: componentId,
      type: 'timing',
      value: modified,
      libraryComponent,
    });
    setShowSharedEditWarning(true);
  };

  // Wrapped timing window save that checks for shared components
  const handleTimingWindowSaveWithWarning = (componentId        , modified              ) => {
    // Capture before state for feedback
    captureBeforeSnapshot(componentId);

    const element = findElementById(componentId);
    if (!element?.libraryComponentId) {
      updateTimingWindow(measure .id, componentId, modified);
      // Record feedback after edit
      setTimeout(() => recordEditFeedback(componentId), 100);
      return;
    }

    const libraryComponent = getComponent(element.libraryComponentId);
    if (!libraryComponent || libraryComponent.usage.usageCount <= 1) {
      updateTimingWindow(measure .id, componentId, modified);
      // Record feedback after edit
      setTimeout(() => recordEditFeedback(componentId), 100);
      return;
    }

    // Shared component - show warning
    setPendingEdit({
      componentId: libraryComponent.id,
      elementId: componentId,
      type: 'timingWindow',
      value: modified,
      libraryComponent,
    });
    setShowSharedEditWarning(true);
  };

  // Handle "Update All" from SharedEditWarning
  const handleSharedEditUpdateAll = () => {
    if (!pendingEdit || !measure) return;

    // Apply the edit to this measure's element based on type
    switch (pendingEdit.type) {
      case 'timing':
        updateTimingOverride(measure.id, pendingEdit.elementId, pendingEdit.value                           );
        break;
      case 'timingWindow':
        updateTimingWindow(measure.id, pendingEdit.elementId, pendingEdit.value                       );
        break;
      case 'description':
      case 'dataType':
      case 'negation':
      case 'valueSet':
      case 'other':
        // Generic update for other property changes
        if (pendingEdit.value && typeof pendingEdit.value === 'object') {
          updateDataElement(measure.id, pendingEdit.elementId, pendingEdit.value                        , 'description_changed', 'Shared component edit');
        }
        break;
    }

    // Also update the library component itself so it stays in sync
    if (pendingEdit.type === 'timing' || pendingEdit.type === 'timingWindow') {
      // Read the updated timing from the element we just modified
      const updatedElement = findElementById(pendingEdit.elementId);
      if (updatedElement) {
        const libTimingUpdate = {};
        if (updatedElement.timingRequirements?.[0]) {
          const req = updatedElement.timingRequirements[0];
          libTimingUpdate.timing = {
            operator: req.window?.direction?.includes('before') ? 'before' : 'during',
            quantity: req.window?.value || null,
            unit: req.window?.unit || null,
            reference: 'Measurement Period',
            displayExpression: req.description,
          };
        }
        if (updatedElement.timingWindow) {
          // TimingWindow format — convert effective window to library timing
          const effective = updatedElement.timingWindow.modified || updatedElement.timingWindow.original;
          if (effective) {
            libTimingUpdate.timing = {
              operator: effective.operator || 'during',
              quantity: effective.value || null,
              unit: effective.unit || null,
              reference: effective.anchor || 'Measurement Period',
              displayExpression: updatedElement.timingWindow.modified
                ? `${effective.operator || 'during'} ${effective.value || ''} ${effective.unit || ''} ${effective.anchor || 'Measurement Period'}`
                : updatedElement.timingWindow.sourceText,
            };
          }
        }
        if (libTimingUpdate.timing) {
          updateComponent(pendingEdit.componentId, libTimingUpdate);
        }
      }
    }

    // Sync the change to all measures using this library component
    // Build the ACTUAL changes to propagate (not just a description)
    const libComp = getComponent(pendingEdit.componentId);
    const changes = {
      changeDescription: `${pendingEdit.type} updated across all measures`,
    };

    // Populate actual field values so syncComponentToMeasures can propagate them
    if (libComp?.type === 'atomic') {
      if (pendingEdit.type === 'timing' || pendingEdit.type === 'timingWindow') {
        changes.timing = libComp.timing;
      }
      if (pendingEdit.type === 'description') {
        changes.name = libComp.name;
      }
      if (pendingEdit.type === 'negation') {
        changes.negation = libComp.negation;
      }
      if (pendingEdit.type === 'valueSet') {
        changes.codes = libComp.valueSet?.codes;
      }
      // Always include codes to keep elements in sync
      if (libComp.valueSet?.codes) {
        changes.codes = libComp.valueSet.codes;
      }
    }

    const syncResult = syncComponentToMeasures(pendingEdit.componentId, changes, measures, batchUpdateMeasures);
    if (!syncResult.success) {
      setError(`Failed to sync changes: ${syncResult.error}`);
    }
    rebuildUsageIndex(measures);

    setShowSharedEditWarning(false);
    setPendingEdit(null);
    setSuccess(`Updated "${pendingEdit.libraryComponent.name}" across ${pendingEdit.libraryComponent.usage.usageCount} measures`);
    setTimeout(() => setSuccess(null), 3000);
  };

  // Handle "Create New Version" from SharedEditWarning
  const handleSharedEditCreateVersion = () => {
    if (!pendingEdit || !measure) return;

    const originalComponent = pendingEdit.libraryComponent;

    // 1. Create a NEW library component (forked from original)
    const newComponentId = `${originalComponent.id}-fork-${Date.now()}`;
    const forkedComponent                   = {
      ...originalComponent,
      id: newComponentId,
      name: `${originalComponent.name} (${measure.metadata.measureId})`,
      usage: {
        measureIds: [measure.metadata.measureId],
        usageCount: 1,
        lastUsedAt: new Date().toISOString(),
      },
      versionInfo: {
        ...originalComponent.versionInfo,
        versionId: `${originalComponent.versionInfo.versionId}-fork`,
        status: 'draft',
        versionHistory: [
          ...originalComponent.versionInfo.versionHistory,
          {
            versionId: `${originalComponent.versionInfo.versionId}-fork`,
            status: 'draft',
            createdAt: new Date().toISOString(),
            createdBy: 'user',
            changeDescription: `Forked from "${originalComponent.name}" for ${measure.metadata.measureId}`,
          },
        ],
      },
      metadata: {
        ...originalComponent.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };

    // 2. Add the forked component to the library
    addComponent(forkedComponent);

    // 3. Apply the edit to this measure's element based on type
    switch (pendingEdit.type) {
      case 'timing':
        updateTimingOverride(measure.id, pendingEdit.elementId, pendingEdit.value                           );
        break;
      case 'timingWindow':
        updateTimingWindow(measure.id, pendingEdit.elementId, pendingEdit.value                       );
        break;
      case 'description':
      case 'dataType':
      case 'negation':
      case 'valueSet':
      case 'other':
        // Generic update for other property changes
        if (pendingEdit.value && typeof pendingEdit.value === 'object') {
          updateDataElement(measure.id, pendingEdit.elementId, pendingEdit.value                        , 'description_changed', 'Forked for measure-specific edit');
        }
        break;
    }

    // Also update the forked library component with the new timing
    if (pendingEdit.type === 'timing' || pendingEdit.type === 'timingWindow') {
      const updatedElement = findElementById(pendingEdit.elementId);
      if (updatedElement) {
        const libTimingUpdate = {};
        if (updatedElement.timingRequirements?.[0]) {
          const req = updatedElement.timingRequirements[0];
          libTimingUpdate.timing = {
            operator: req.window?.direction?.includes('before') ? 'before' : 'during',
            quantity: req.window?.value || null,
            unit: req.window?.unit || null,
            reference: 'Measurement Period',
            displayExpression: req.description,
          };
        }
        if (updatedElement.timingWindow) {
          const effective = updatedElement.timingWindow.modified || updatedElement.timingWindow.original;
          if (effective) {
            libTimingUpdate.timing = {
              operator: effective.operator || 'during',
              quantity: effective.value || null,
              unit: effective.unit || null,
              reference: effective.anchor || 'Measurement Period',
              displayExpression: updatedElement.timingWindow.modified
                ? `${effective.operator || 'during'} ${effective.value || ''} ${effective.unit || ''} ${effective.anchor || 'Measurement Period'}`
                : updatedElement.timingWindow.sourceText,
            };
          }
        }
        if (libTimingUpdate.timing) {
          updateComponent(newComponentId, libTimingUpdate);
        }
      }
    }

    // 4. Update the DataElement to link to the NEW component
    const updateLibraryLink = (node     )      => {
      if (!node) return node;
      if (node.id === pendingEdit.elementId) {
        return { ...node, libraryComponentId: newComponentId };
      }
      if (node.children) {
        return { ...node, children: node.children.map(updateLibraryLink) };
      }
      if (node.criteria) {
        return { ...node, criteria: updateLibraryLink(node.criteria) };
      }
      return node;
    };

    const updatedPopulations = measure.populations.map(updateLibraryLink);
    updateMeasure(measure.id, { populations: updatedPopulations });

    // 5. Rebuild usage index to reflect the change
    rebuildUsageIndex(measures);

    setShowSharedEditWarning(false);
    setPendingEdit(null);
    setSuccess(`Created new library component "${forkedComponent.name}" for this measure`);
    setTimeout(() => setSuccess(null), 3000);
  };

  // Metadata editing handlers
  const handleStartEditingMetadata = () => {
    if (!measure) return;
    setEditedTitle(measure.metadata.title);
    setEditedMeasureId(measure.metadata.measureId);
    setEditedProgram(measure.metadata.program || '');
    setEditedDescription(measure.metadata.description || '');
    setIsEditingMetadata(true);
  };

  const handleSaveMetadata = () => {
    if (!measure) return;
    updateMeasure(measure.id, {
      metadata: {
        ...measure.metadata,
        title: editedTitle.trim() || measure.metadata.title,
        measureId: editedMeasureId.trim() || measure.metadata.measureId,
        program: (editedProgram                                   ) || measure.metadata.program,
        description: editedDescription.trim(),
      },
    });
    setIsEditingMetadata(false);
    setSuccess('Measure metadata updated');
    setTimeout(() => setSuccess(null), 2000);
  };

  const handleCancelEditingMetadata = () => {
    setIsEditingMetadata(false);
    setEditedTitle('');
    setEditedMeasureId('');
    setEditedProgram('');
    setEditedDescription('');
  };

  const handleDragStart = (id        ) => {
    setDragState({ draggedId: id, dragOverId: null, dragOverPosition: null });
  };
  const handleDragEnd = () => {
    setDragState({ draggedId: null, dragOverId: null, dragOverPosition: null });
  };
  const handleDragOver = (e                 , id        , canMerge          = false) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (id === dragState.draggedId) return;
    const rect = (e.currentTarget               ).getBoundingClientRect();
    const height = rect.height;
    const relativeY = e.clientY - rect.top;

    // In deep mode with mergeable components: top 25% = before, middle 50% = merge, bottom 25% = after
    // Otherwise: top 50% = before, bottom 50% = after
    let position                              ;
    if (deepMode && canMerge) {
      if (relativeY < height * 0.25) {
        position = 'before';
      } else if (relativeY > height * 0.75) {
        position = 'after';
      } else {
        position = 'merge';
      }
    } else {
      position = relativeY < height * 0.5 ? 'before' : 'after';
    }
    setDragState(prev => ({ ...prev, dragOverId: id, dragOverPosition: position }));
  };
  const handleDrop = (e                 , targetId        , targetIndex        , targetParentId               , canMerge          = false) => {
    e.preventDefault();
    const draggedId = dragState.draggedId;
    const position = dragState.dragOverPosition;

    if (!draggedId || !measure || draggedId === targetId) {
      handleDragEnd();
      return;
    }

    // Handle merge in deep mode - add both to selection and show dialog
    if (deepMode && position === 'merge' && canMerge) {
      // Get the library component IDs for both elements
      const findElement = (node     , id        )      => {
        if (!node) return null;
        if (node.id === id) return node;
        if ('children' in node) {
          for (const child of node.children) {
            const found = findElement(child, id);
            if (found) return found;
          }
        }
        return null;
      };

      let draggedElement      = null;
      let targetElement      = null;
      for (const pop of measure.populations) {
        if (pop.criteria) {
          if (!draggedElement) draggedElement = findElement(pop.criteria, draggedId);
          if (!targetElement) targetElement = findElement(pop.criteria, targetId);
        }
      }

      const sourceCompId = draggedElement?.libraryComponentId;
      const targetCompId = targetElement?.libraryComponentId;

      if (sourceCompId && targetCompId && sourceCompId !== targetCompId) {
        // Both have library components - select them for merge and show dialog
        const sourceComp = getComponent(sourceCompId);
        const targetComp = getComponent(targetCompId);
        if (sourceComp && targetComp) {
          setSelectedForMerge(new Set([sourceCompId, targetCompId]));
          setMergeName(`${targetComp.name} (Combined)`);
          setShowMergeDialog(true);
        }
      }
      handleDragEnd();
      return;
    }

    // Normal reorder
    if (!targetParentId) {
      handleDragEnd();
      return;
    }
    const adjustedIndex = position === 'after' ? targetIndex + 1 : targetIndex;
    moveComponentToIndex(measure.id, targetParentId, draggedId, adjustedIndex);
    handleDragEnd();
  };

  // Initialize component library and link measure components
  useEffect(() => {
    initializeWithSampleData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentional: only run on mount, initializeWithSampleData is stable

  useEffect(() => {
    if (measure && measure.populations.length > 0) {
      const linkMap = linkMeasureComponents(
        measure.metadata.measureId,
        measure.populations,
      );
      setComponentLinkMap(linkMap);
      // Rebuild usage index from all actual measures
      rebuildUsageIndex(measures);
    }
    // Only re-run when the SPECIFIC measure changes, not when measures array length changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure?.id]);

  // Force re-render when measures change (for progress bar)
  const [, forceUpdate] = useState({});
  useEffect(() => {
    forceUpdate({});
  }, [measures]);

  // Recalculate review progress from current measure state
  // Calculate directly from measure.populations to ensure it reflects current state after deletions
  // Must be before early return to satisfy React hooks rules
  const reviewProgress = useMemo(() => {
    if (!measure) return { total: 0, approved: 0, pending: 0, flagged: 0 };

    let total = 0, approved = 0, pending = 0, flagged = 0;

    const countStatus = (obj) => {
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
  }, [measure]);

  // Resizable panel state (must be before early return to satisfy React hooks rules)
  const [detailPanelWidth, setDetailPanelWidth] = useState(450);
  const isResizing = useRef(false);
  const containerRef = useRef(null);

  const handleResizeStart = useCallback((e) => {
    isResizing.current = true;
    e.preventDefault();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = containerRect.right - e.clientX;
      setDetailPanelWidth(Math.min(Math.max(newWidth, 300), 700));
    };

    const handleMouseUp = () => {
      isResizing.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  if (!measure) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border)] flex items-center justify-center">
            <FileText className="w-8 h-8 text-[var(--text-dim)]" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text)] mb-2">No Measure Selected</h2>
          <p className="text-[var(--text-muted)] mb-6">
            Select a measure from the library to view and edit its Universal Measure Specification.
          </p>
          <button
            onClick={() => navigate('/library')}
            className="px-6 py-3 bg-[var(--primary)] text-white rounded-lg font-medium hover:bg-[var(--primary-hover)] transition-colors inline-flex items-center gap-2"
          >
            <LibraryIcon className="w-4 h-4" />
            Go to Measure Library
          </button>
        </div>
      </div>
    );
  }

  const toggleSection = (id        ) => {
    const next = new Set(expandedSections);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedSections(next);
  };

  // Returns empty string - icons removed for cleaner professional appearance
  const getPopulationIcon = (_type        ) => '';

  const getPopulationLabel = (type        ) => {
    switch (type) {
      case 'initial-population':
      case 'initial_population': return 'Initial Population';
      case 'denominator': return 'Denominator';
      case 'denominator-exclusion':
      case 'denominator_exclusion': return 'Denominator Exclusions';
      case 'denominator-exception':
      case 'denominator_exception': return 'Denominator Exceptions';
      case 'numerator': return 'Numerator';
      case 'numerator-exclusion':
      case 'numerator_exclusion': return 'Numerator Exclusions';
      default: return type.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  };

  // progressPercent calculated from reviewProgress (computed via useMemo before early return)
  const progressPercent = reviewProgress.total > 0 ? Math.round((reviewProgress.approved / reviewProgress.total) * 100) : 0;

  // Get corrections count
  const corrections = getCorrections(measure.id);

  // Export corrections as JSON file
  const handleExportCorrections = () => {
    const exportData = exportCorrections(measure.id);
    if (!exportData) {
      alert('No corrections to export yet.');
      return;
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${measure.metadata.measureId}-corrections-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden">
      {/* Main editor panel - split into sticky header and scrollable content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* ═══ STICKY HEADER - stays fixed while scrolling ═══ */}
        <div className="flex-shrink-0 bg-[var(--bg)] border-b border-[var(--border)] px-6 pt-4 pb-3 z-10">
          {/* Success/Error Banners */}
          {success && (
            <InlineSuccessBanner message={success} onDismiss={() => setSuccess(null)} />
          )}
          {error && (
            <InlineErrorBanner message={error} onDismiss={() => setError(null)} />
          )}

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-sm mb-3">
            <button
              onClick={() => navigate('/library')}
              className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors"
            >
              Measure Library
            </button>
            <ChevronRight className="w-4 h-4 text-[var(--text-dim)]" />
            <span className="text-[var(--text)]">{measure.metadata.measureId}</span>
          </nav>

          {/* Header */}
          <div className="mb-6">
            {isEditingMetadata ? (
              <div className="w-full space-y-4">
                {/* Row 1: Programme + Measure ID + Action Buttons */}
                <div className="flex items-end gap-4">
                  {/* Programme */}
                  <div className="w-48">
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Program / Catalogue</label>
                    <select
                      value={editedProgram}
                      onChange={(e) => setEditedProgram(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                    >
                      <option value="">Select...</option>
                      {MEASURE_PROGRAMS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Measure ID */}
                  <div className="w-48">
                    <label className="block text-xs text-[var(--text-muted)] mb-1">Measure ID</label>
                    <input
                      type="text"
                      value={editedMeasureId}
                      onChange={(e) => setEditedMeasureId(e.target.value)}
                      placeholder="CMS128v13"
                      className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                    />
                  </div>

                  {/* Spacer pushes buttons right */}
                  <div className="flex-1" />

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate('/components')}
                      className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-light)]"
                      title="Browse the Component Library"
                    >
                      <LibraryIcon className="w-4 h-4" />
                      Browse Library
                    </button>
                    <button
                      onClick={handleDeepModeToggle}
                      className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                        deepMode ? 'bg-purple-500/15 text-purple-400' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                      title="Enable advanced logic editing: reorder, delete, merge components"
                    >
                      <Settings2 className="w-4 h-4" />
                      Deep Edit Mode
                    </button>
                    <button
                      onClick={() => approveAllLowComplexity(measure.id)}
                      className="px-3 py-2 bg-[var(--success-light)] text-[var(--success)] rounded-lg text-sm font-medium flex items-center gap-2 hover:opacity-80 transition-all"
                    >
                      <Sparkles className="w-4 h-4" />
                      Auto-approve
                    </button>
                    {corrections.length > 0 && (
                      <button
                        onClick={handleExportCorrections}
                        className="px-3 py-2 bg-purple-500/15 text-purple-400 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-purple-500/25 transition-colors"
                        title="Export corrections for AI training"
                      >
                        <Download className="w-4 h-4" />
                        Export ({corrections.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: Measure Name — full width */}
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Measure Name</label>
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => setEditedTitle(e.target.value)}
                    placeholder="e.g., Cervical Cancer Screening"
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text)] text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  />
                </div>

                {/* Row 3: Description — full width textarea */}
                <div>
                  <label className="block text-xs text-[var(--text-muted)] mb-1">Description</label>
                  <textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    rows={3}
                    placeholder="Measure description..."
                    className="w-full px-3 py-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border)] text-[var(--text)] text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  />
                </div>

                {/* Row 4: Save / Cancel */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveMetadata}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
                  >
                    <Save className="w-4 h-4" />
                    Save
                  </button>
                  <button
                    onClick={handleCancelEditingMetadata}
                    className="px-4 py-2 rounded-lg text-[var(--text-muted)] text-sm hover:text-[var(--text)] hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full">
                {/* Row 1: Badges + Title on left, Action buttons on right */}
                <div className="flex items-start justify-between gap-4">
                  {/* Left side: Badges and Title (clickable to edit) */}
                  <div className="flex-1 group cursor-pointer" onClick={handleStartEditingMetadata}>
                    {/* Badges */}
                    <div className="flex items-center gap-3 mb-2">
                      {measure.metadata.program && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-purple-500/15 text-purple-400 rounded">
                          {MEASURE_PROGRAMS.find(p => p.value === measure.metadata.program)?.label || measure.metadata.program}
                        </span>
                      )}
                      <span className="px-2 py-1 text-sm font-medium bg-[var(--accent-light)] text-[var(--accent)] rounded">
                        {measure.metadata.measureId}
                      </span>
                      <ComplexityBadge level={calculateMeasureComplexity(measure.populations)} />
                      <span className="opacity-0 group-hover:opacity-100 text-xs text-[var(--text-muted)] flex items-center gap-1 transition-opacity">
                        <Edit3 className="w-3 h-3" />
                        Click to edit
                      </span>
                    </div>

                    {/* Measure Name */}
                    <h1 className="text-xl font-bold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                      {measure.metadata.title}
                    </h1>
                  </div>

                  {/* Right side: Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => navigate('/components')}
                      className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--accent-light)]"
                      title="Browse the Component Library"
                    >
                      <LibraryIcon className="w-4 h-4" />
                      Browse Library
                    </button>
                    <button
                      onClick={handleDeepModeToggle}
                      className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                        deepMode ? 'bg-purple-500/15 text-purple-400' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text)]'
                      }`}
                      title="Enable advanced logic editing: reorder, delete, merge components"
                    >
                      <Settings2 className="w-4 h-4" />
                      Deep Edit Mode
                    </button>
                    <button
                      onClick={() => approveAllLowComplexity(measure.id)}
                      className="px-3 py-2 bg-[var(--success-light)] text-[var(--success)] rounded-lg text-sm font-medium flex items-center gap-2 hover:opacity-80 transition-all"
                    >
                      <Sparkles className="w-4 h-4" />
                      Auto-approve Low Complexity
                    </button>
                    {corrections.length > 0 && (
                      <button
                        onClick={handleExportCorrections}
                        className="px-3 py-2 bg-purple-500/15 text-purple-400 rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-purple-500/25 transition-colors"
                        title="Export corrections for AI training"
                      >
                        <Download className="w-4 h-4" />
                        Export ({corrections.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* Row 2: Description — full width, below the header row */}
                {measure.metadata.description && (
                  <div
                    className="mt-3 cursor-pointer group/desc"
                    onClick={handleStartEditingMetadata}
                  >
                    <p className="text-sm text-[var(--text-muted)] leading-relaxed group-hover/desc:text-[var(--text)] transition-colors">
                      {showFullDescription || measure.metadata.description.length <= 200
                        ? measure.metadata.description
                        : `${measure.metadata.description.slice(0, 200)}...`
                      }
                    </p>
                    {measure.metadata.description.length > 200 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowFullDescription(prev => !prev);
                        }}
                        className="text-xs text-[var(--accent)] mt-1 hover:underline"
                      >
                        {showFullDescription ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Progress bar */}
            <div className="mt-2 p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)]">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-[var(--text-muted)]">Review Progress</span>
                <span className="text-sm font-medium text-[var(--text)]">
                  {reviewProgress.approved} / {reviewProgress.total} approved ({progressPercent}%)
                </span>
              </div>
              <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-[var(--success)] transition-all duration-300"
                  style={{ width: `${(reviewProgress.approved / Math.max(reviewProgress.total, 1)) * 100}%` }}
                />
                <div
                  className="h-full bg-[var(--warning)] transition-all duration-300"
                  style={{ width: `${(reviewProgress.flagged / Math.max(reviewProgress.total, 1)) * 100}%` }}
                />
              </div>
              {reviewProgress.flagged > 0 && (
                <p className="text-xs text-[var(--warning)] mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  {reviewProgress.flagged} component{reviewProgress.flagged !== 1 ? 's' : ''} need revision
                </p>
              )}
              {progressPercent === 100 && (
                <p className="text-xs text-[var(--success)] mt-1.5 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  All components approved — ready for code generation
                </p>
              )}
            </div>
          </div>
        </div>
        {/* ═══ END STICKY HEADER ═══ */}

        {/* ═══ SCROLLABLE CONTENT - measurement period, populations and value sets ═══ */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {/* Measurement Period Bar */}
          <MeasurePeriodBar
            mpStart={measure.metadata.measurementPeriod?.start || '2024-01-01'}
            mpEnd={measure.metadata.measurementPeriod?.end || '2024-12-31'}
            onStartChange={(date) => updateMeasurementPeriod(measure.id, date, measure.metadata.measurementPeriod?.end || '2024-12-31')}
            onEndChange={(date) => updateMeasurementPeriod(measure.id, measure.metadata.measurementPeriod?.start || '2024-01-01', date)}
          />

          {/* Population sections - IP is merged into Denominator for cleaner display */}
          <div className="space-y-4">
            {measure.populations
              .filter((population) => {
                // Hide denominator if it only references IP (shown under Denominator label via IP)
                if (population.type === 'denominator') {
                  const desc = population.description?.toLowerCase() || '';
                  const narrative = population.narrative?.toLowerCase() || '';
                  if ((desc.includes('equals initial') || desc.includes('= initial') || narrative.includes('equals initial')) &&
                      (!population.criteria?.children || population.criteria.children.length === 0)) {
                    return false;
                  }
                }
                return true;
              })
              .map((population) => (
              <PopulationSection
                key={population.id}
                population={population}
                measureId={measure.id}
                isExpanded={expandedSections.has(population.type === 'initial_population' ? 'denominator' : population.type.split('_')[0])}
                onToggle={() => toggleSection(population.type === 'initial_population' ? 'denominator' : population.type.split('_')[0])}
                selectedNode={selectedNode}
                onSelectNode={setSelectedNode}
                onSelectValueSet={(vs, elemId) => {
                  setActiveValueSet(vs);
                  setActiveValueSetElementId(elemId || null);
                }}
                onAddComponent={() => setAddComponentTarget({ populationId: population.id, populationType: population.type })}
                icon={getPopulationIcon(population.type)}
                label={getPopulationLabel(population.type)}
                updateReviewStatus={updateReviewStatus}
                allValueSets={measure.valueSets}
                deepMode={deepMode}
                onToggleOperator={(clauseId) => toggleLogicalOperator(measure.id, clauseId)}
                onReorder={(parentId, childId, dir) => reorderComponent(measure.id, parentId, childId, dir)}
                onDeleteComponent={(componentId) => deleteComponent(measure.id, componentId)}
                onReplaceComponent={(parentClauseId, componentId, componentName, index) => {
                  setSwapTarget({
                    populationId: population.id,
                    populationType: population.type,
                    parentClauseId,
                    componentId,
                    componentName,
                    index,
                  });
                }}
                onSetOperatorBetween={(clauseId, i1, i2, op) => setOperatorBetweenSiblings(measure.id, clauseId, i1, i2, op)}
                dragState={dragState}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                mpStart={measure.metadata.measurementPeriod?.start || '2024-01-01'}
                mpEnd={measure.metadata.measurementPeriod?.end || '2024-12-31'}
                editingTimingId={editingTimingId}
                onEditTiming={setEditingTimingId}
                onSaveTiming={(componentId, modified) => {
                  handleTimingSaveWithWarning(componentId, modified);
                  setEditingTimingId(null);
                }}
                onResetTiming={(componentId) => {
                  // Reset doesn't trigger shared edit warning - it reverts to default
                  updateTimingOverride(measure.id, componentId, null);
                  setEditingTimingId(null);
                }}
                selectedForMerge={selectedForMerge}
                onToggleMergeSelection={toggleMergeSelection}
                onUpdateElement={(elementId, updates) => updateDataElement(measure.id, elementId, updates)}
              />
            ))}
          </div>

          {/* Value Sets Section */}
          <div className="mt-6">
            <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border)] overflow-hidden">
              <button
                onClick={() => toggleSection('valueSets')}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                {expandedSections.has('valueSets') ? (
                  <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
                )}
                <span className="text-lg">📚</span>
                <span className="font-medium text-[var(--text)]">Value Sets</span>
                <span className="text-sm text-[var(--text-muted)]">({measure.valueSets.length})</span>
              </button>

              {expandedSections.has('valueSets') && (
                <div className="px-4 pb-4 space-y-2">
                  {/* Browse Standard Value Sets button */}
                  <button
                    onClick={() => setShowValueSetBrowser(true)}
                    className="w-full p-3 border-2 border-dashed border-[var(--border)] rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 transition-colors flex items-center justify-center gap-2"
                  >
                    <LibraryIcon className="w-4 h-4" />
                    Browse Standard Value Sets (VSAC)
                  </button>
                  {measure.valueSets.map((vs) => (
                    <button
                      key={vs.id}
                      onClick={() => {
                        setActiveValueSet(vs);
                        setActiveValueSetElementId(null); // Measure-level VS, not element-specific
                      }}
                      className="w-full p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)] hover:border-[var(--accent)]/50 transition-colors text-left"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-[var(--text)] flex items-center gap-2">
                            {vs.name}
                            <ExternalLink className="w-3 h-3 text-[var(--text-dim)]" />
                          </div>
                          {vs.oid && (
                            <code className="text-xs text-[var(--text-dim)] mt-1 block">{vs.oid}</code>
                          )}
                          <div className="text-xs text-[var(--accent)] mt-1">
                            {vs.codes?.length || 0} codes {vs.totalCodeCount && vs.totalCodeCount > (vs.codes?.length || 0) ? `(${vs.totalCodeCount} total)` : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {vs.verified && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-[var(--success-light)] text-[var(--success)] rounded">VSAC Verified</span>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detail panel for selected node */}
      {selectedNode && (
        <>
          {/* Resize handle */}
          <div
            onMouseDown={handleResizeStart}
            className="w-1.5 bg-[var(--border)] hover:bg-[var(--accent)] active:bg-[var(--accent)] cursor-col-resize transition-colors flex-shrink-0"
          />
          <div style={{ width: detailPanelWidth }} className="flex-shrink-0 flex flex-col border-l border-[var(--border)]">
          {/* Panel mode toggle */}
          <div className="flex border-b border-[var(--border)] bg-[var(--bg-secondary)]">
            <button
              onClick={() => setDetailPanelMode('edit')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                detailPanelMode === 'edit'
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)] bg-[var(--bg)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Edit
            </button>
            <button
              onClick={() => setDetailPanelMode('code')}
              className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
                detailPanelMode === 'code'
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)] bg-[var(--bg)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              Code & Details
            </button>
          </div>

          {detailPanelMode === 'edit' ? (
            <NodeDetailPanel
              measureId={measure.id}
              nodeId={selectedNode}
              allValueSets={measure.valueSets}
              onClose={() => setSelectedNode(null)}
              onSelectValueSet={setActiveValueSet}
              updateReviewStatus={updateReviewStatus}
              mpStart={measure.metadata.measurementPeriod?.start || '2024-01-01'}
              mpEnd={measure.metadata.measurementPeriod?.end || '2024-12-31'}
              onSaveTimingWindow={(componentId, modified) => {
                updateTimingWindow(measure.id, componentId, modified);
              }}
              onResetTimingWindow={(componentId) => {
                updateTimingWindow(measure.id, componentId, null);
              }}
            />
          ) : (
            <SelectedComponentDetailPanel
              measureId={measure.id}
              nodeId={selectedNode}
              onClose={() => setSelectedNode(null)}
              onNavigateToLibrary={(_id) => {
                navigate('/components');
              }}
              onSaveTiming={(componentId, modified) => {
                handleTimingSaveWithWarning(componentId, modified);
              }}
              onResetTiming={(componentId) => {
                updateTimingOverride(measure.id, componentId, null);
              }}
              onSaveTimingWindow={(componentId, modified) => {
                handleTimingWindowSaveWithWarning(componentId, modified);
              }}
              onResetTimingWindow={(componentId) => {
                updateTimingWindow(measure.id, componentId, null);
              }}
            />
          )}
          </div>
        </>
      )}

      {/* Value Set detail modal */}
      {activeValueSet && measure && (
        <ValueSetModal
          valueSet={activeValueSet}
          measureId={measure.id}
          elementId={activeValueSetElementId}
          onClose={() => {
            setActiveValueSet(null);
            setActiveValueSetElementId(null);
          }}
        />
      )}

      {/* Add Component Modal - Library browser first */}
      {addComponentTarget && measure && (
        <AddComponentModal
          targetMeasure={measure.metadata?.title || measure.id}
          targetSection={addComponentTarget.populationType || 'Population'}
          onClose={() => setAddComponentTarget(null)}
          onAdd={(libraryComponent) => {
            // Check if this is an Age Requirement component using robust detection
            const isAgeReq = isAgeRequirementComponent(libraryComponent);

            // Derive element type from category, but force 'demographic' for Age Requirement
            const category = libraryComponent.metadata?.category || libraryComponent.category || 'observation';
            const elementType = isAgeReq ? 'demographic' : categoryToElementType(category);

            // Create a component reference from the library component
            const component = {
              id: `comp-${Date.now()}`,
              type: elementType,
              subtype: isAgeReq ? 'age' : libraryComponent.subtype,
              name: libraryComponent.name,
              description: libraryComponent.description,
              valueSet: libraryComponent.valueSet,
              valueSetRef: libraryComponent.valueSet?.id,
              libraryRef: libraryComponent.id,
              libraryComponentId: libraryComponent.id,
              timing: libraryComponent.timing || {},
              negation: libraryComponent.negation || false,
              category: category,
              // Copy demographic fields
              genderValue: libraryComponent.genderValue,
              resourceType: libraryComponent.resourceType,
              // Force default thresholds for Age Requirement (user can configure)
              thresholds: isAgeReq ? { ageMin: 18, ageMax: 65 } : libraryComponent.thresholds,
              confidence: 'high',
              reviewStatus: 'pending',
            };
            // Add component to population with AND logic by default
            addComponentToPopulation(measure.id, addComponentTarget.populationId, component, 'and');
          }}
          onCreateNew={() => {
            // Switch to ComponentBuilder for creating new
            setBuilderTarget({
              populationId: addComponentTarget.populationId,
              populationType: addComponentTarget.populationType,
            });
            setAddComponentTarget(null);
          }}
        />
      )}

      {/* Swap/Replace Component Modal - reuses AddComponentModal in replace mode */}
      {swapTarget && measure && (
        <AddComponentModal
          targetMeasure={measure.metadata?.title || measure.id}
          targetSection={swapTarget.populationType || 'Population'}
          mode="replace"
          replaceTarget={{
            index: swapTarget.index,
            componentId: swapTarget.componentId,
            componentName: swapTarget.componentName,
            parentClauseId: swapTarget.parentClauseId,
          }}
          onClose={() => setSwapTarget(null)}
          onAdd={(libraryComponent) => {
            // Check if this is an Age Requirement component using robust detection
            const isAgeReq = isAgeRequirementComponent(libraryComponent);

            // Derive element type from category, but force 'demographic' for Age Requirement
            const category = libraryComponent.metadata?.category || libraryComponent.category || 'observation';
            const elementType = isAgeReq ? 'demographic' : categoryToElementType(category);

            // Create a component reference from the library component
            const newComponent = {
              id: `comp-${Date.now()}`,
              type: elementType,
              subtype: isAgeReq ? 'age' : libraryComponent.subtype,
              name: libraryComponent.name,
              description: libraryComponent.description,
              valueSet: libraryComponent.valueSet,
              valueSetRef: libraryComponent.valueSet?.id,
              libraryRef: libraryComponent.id,
              libraryComponentId: libraryComponent.id,
              timing: libraryComponent.timing || {},
              negation: libraryComponent.negation || false,
              category: category,
              // Copy demographic fields
              genderValue: libraryComponent.genderValue,
              resourceType: libraryComponent.resourceType,
              // Force default thresholds for Age Requirement (user can configure)
              thresholds: isAgeReq ? { ageMin: 18, ageMax: 65 } : libraryComponent.thresholds,
              confidence: 'high',
              reviewStatus: 'pending',
            };

            // Perform the atomic replace operation
            replaceComponent(
              measure.id,
              swapTarget.parentClauseId,
              swapTarget.componentId,
              newComponent
            );
          }}
        />
      )}

      {/* Component Builder modal - for creating new components */}
      {builderTarget && measure && (
        <ComponentBuilder
          measureId={measure.id}
          populationId={builderTarget.populationId}
          populationType={builderTarget.populationType}
          existingValueSets={measure.valueSets}
          onSave={(component, newValueSet, logicOperator) => {
            // Add new value set if created
            if (newValueSet) {
              addValueSet(measure.id, newValueSet);
            }
            // Add component to population with specified logic
            addComponentToPopulation(measure.id, builderTarget.populationId, component, logicOperator);
            setBuilderTarget(null);
          }}
          onClose={() => setBuilderTarget(null)}
        />
      )}

      {/* Standard Value Set Browser modal */}
      {showValueSetBrowser && measure && (
        <StandardValueSetBrowser
          measureId={measure.id}
          existingOids={new Set(measure.valueSets.map(vs => vs.oid).filter(Boolean)            )}
          onImport={(standardVS) => {
            // Convert StandardValueSet to ValueSetReference and add to measure
            const vsRef                    = {
              id: `vs-${Date.now()}`,
              name: standardVS.name,
              oid: standardVS.oid,
              version: standardVS.version,
              confidence: 'high',
              source: 'VSAC Standard Library',
              verified: true,
              codes: standardVS.codes.map(c => ({
                code: c.code,
                display: c.display,
                system: mapCodeSystemFromUri(c.system),
              })),
              totalCodeCount: standardVS.codes.length,
            };
            addValueSet(measure.id, vsRef);
          }}
          onClose={() => setShowValueSetBrowser(false)}
        />
      )}

      {/* Component Merge Dialog - checkbox selection in deep mode */}
      {showMergeDialog && selectedForMerge.size >= 2 && measure && (() => {
        // Find selected elements from the measure
        const findElements = (node     )        => {
          if (!node) return [];
          if ('operator' in node && 'children' in node) {
            return node.children.flatMap(findElements);
          }
          return [node];
        };
        const allElements = measure.populations.flatMap(pop => pop.criteria ? findElements(pop.criteria) : []);
        const selectedElements = allElements.filter((el     ) => selectedForMerge.has(el.id));

        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border)] w-[500px] max-h-[80vh] overflow-hidden shadow-xl">
              <div className="p-4 border-b border-[var(--border)] flex items-center justify-between">
                <h3 className="font-semibold text-[var(--text)] flex items-center gap-2">
                  <Combine className="w-5 h-5 text-purple-400" />
                  Merge {selectedForMerge.size} Components
                </h3>
                <button
                  onClick={() => {
                    setShowMergeDialog(false);
                    setMergeName('');
                  }}
                  className="p-1 hover:bg-[var(--bg-tertiary)] rounded"
                >
                  <X className="w-4 h-4 text-[var(--text-muted)]" />
                </button>
              </div>

              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Merged Component Name</label>
                  <input
                    type="text"
                    value={mergeName}
                    onChange={(e) => setMergeName(e.target.value)}
                    placeholder="e.g., Hospice or Palliative Care Services"
                    className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[var(--text-muted)] mb-2">Components to Merge ({selectedElements.length})</label>
                  <div className="space-y-2 max-h-[200px] overflow-auto">
                    {selectedElements.map((el     ) => {
                      // Look up code count from measure.valueSets for accurate count
                      const elementVsRefs = el.valueSets || (el.valueSet ? [el.valueSet] : []);
                      let codeCount = 0;
                      for (const vsRef of elementVsRefs) {
                        const fullVs = measure.valueSets.find(
                          mvs => mvs.id === vsRef.id || mvs.oid === vsRef.oid
                        );
                        codeCount += fullVs?.codes?.length || vsRef.codes?.length || 0;
                      }
                      if (codeCount === 0) {
                        codeCount = el.directCodes?.length || 0;
                      }
                      return (
                        <div key={el.id} className="p-3 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border)] flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
                            <Combine className="w-4 h-4 text-purple-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-[var(--text)] truncate">{el.description}</p>
                            <p className="text-xs text-[var(--text-dim)]">
                              {codeCount} codes • {el.type}
                            </p>
                          </div>
                          <button
                            onClick={() => toggleMergeSelection(el.id)}
                            className="p-1 hover:bg-[var(--bg-tertiary)] rounded text-[var(--text-dim)] hover:text-[var(--danger)]"
                            title="Remove from merge"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                  <p className="text-xs text-purple-400">
                    Components will be combined using OR logic. Each value set remains separate with its codes preserved. Duplicate codes across value sets are removed.
                  </p>
                </div>
              </div>

              <div className="p-4 border-t border-[var(--border)] flex justify-end gap-2">
                <button
                  onClick={() => {
                    setShowMergeDialog(false);
                    setMergeName('');
                  }}
                  className="px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!mergeName.trim() || selectedElements.length < 2) return;

                    // Clear any previous messages
                    setError(null);
                    setSuccess(null);

                    // Validate all selected elements have library component IDs
                    const elementsWithoutLibrary = selectedElements.filter((el) => !el.libraryComponentId);
                    if (elementsWithoutLibrary.length > 0) {
                      const names = elementsWithoutLibrary.map((el) => `"${el.description}"`).join(', ');
                      setError(`Cannot merge: ${names} ${elementsWithoutLibrary.length === 1 ? 'is' : 'are'} not linked to the component library. Link all components to the library first.`);
                      return;
                    }

                    try {
                      // Collect all value sets from selected elements (keep them separate)
                      // Look up full value set data including codes from measure.valueSets
                      const allValueSets        = [];
                      const seenOids = new Set        ();
                      const allCodeKeys = new Set        (); // Track all codes for deduplication

                      for (const el of selectedElements) {
                        // Get value set references from element
                        const elementVsRefs = el.valueSets || (el.valueSet ? [el.valueSet] : []);

                        for (const vsRef of elementVsRefs) {
                          const key = vsRef.oid || vsRef.id || vsRef.name;
                          if (key && !seenOids.has(key)) {
                            seenOids.add(key);

                            // Look up the full value set with codes from measure.valueSets
                            const fullVs = measure.valueSets.find(
                              mvs => mvs.id === vsRef.id || mvs.oid === vsRef.oid
                            );

                            if (fullVs) {
                              // Deduplicate codes across value sets
                              const dedupedCodes = (fullVs.codes || []).filter(code => {
                                const codeKey = `${code.system}|${code.code}`;
                                if (allCodeKeys.has(codeKey)) {
                                  return false; // Skip duplicate
                                }
                                allCodeKeys.add(codeKey);
                                return true;
                              });

                              allValueSets.push({
                                ...fullVs,
                                codes: dedupedCodes,
                              });
                            } else if (vsRef.codes && vsRef.codes.length > 0) {
                              // Use element's value set if it has codes directly
                              const dedupedCodes = vsRef.codes.filter((code     ) => {
                                const codeKey = `${code.system}|${code.code}`;
                                if (allCodeKeys.has(codeKey)) {
                                  return false;
                                }
                                allCodeKeys.add(codeKey);
                                return true;
                              });

                              allValueSets.push({
                                ...vsRef,
                                codes: dedupedCodes,
                              });
                            } else {
                              // Fallback: use the reference as-is
                              allValueSets.push(vsRef);
                            }
                          }
                        }
                      }

                      // Create merged library component - pass the value sets with codes
                      const componentIds = selectedElements.map((el     ) => el.libraryComponentId).filter(Boolean);
                      const mergeResult = mergeComponents(
                        componentIds,
                        mergeName.trim(),
                        undefined, // description
                        allValueSets // Pass value sets with codes for accurate data
                      );

                      // Check for merge failure - don't proceed if failed
                      if (!mergeResult.success || !mergeResult.component) {
                        console.error('[UMSEditor] Merge failed:', mergeResult.error);
                        setError(`Merge failed: ${mergeResult.error || 'Unknown error'}`);
                        // Don't clear selection on error - let user retry
                        return;
                      }

                      const mergedComp = mergeResult.component;

                      // Keep the first element, remove the rest, update the first to point to merged component
                      const firstElementId = selectedElements[0].id;
                      const otherElementIds = new Set(selectedElements.slice(1).map((el     ) => el.id));

                      const updateNode = (node     )      => {
                        if (!node) return node;
                        if ('operator' in node && 'children' in node) {
                          // Filter out the other merged elements and recurse
                          const filteredChildren = node.children
                            .filter((child     ) => !otherElementIds.has(child.id))
                            .map(updateNode);
                          return { ...node, children: filteredChildren };
                        }
                        // Update the first element to have merged description and all value sets
                        if (node.id === firstElementId) {
                          return {
                            ...node,
                            description: mergeName.trim(),
                            libraryComponentId: mergedComp.id,
                            // Keep first value set for backward compatibility
                            valueSet: allValueSets.length > 0 ? allValueSets[0] : node.valueSet,
                            // Always store all value sets for consistency (even if just 1)
                            valueSets: allValueSets.length > 0 ? allValueSets : undefined,
                          };
                        }
                        return node;
                      };

                      const updatedPopulations = measure.populations.map(pop => ({
                        ...pop,
                        criteria: pop.criteria ? updateNode(pop.criteria) : pop.criteria,
                      }));
                      updateMeasure(measure.id, { populations: updatedPopulations });

                      // Update references in OTHER measures that still point to archived components
                      const archivedIds = componentIds;
                      const otherMeasures = measures.filter(m => m.id !== measure.id);
                      const refResult = updateMeasureReferencesAfterMerge(archivedIds, mergedComp.id, otherMeasures, batchUpdateMeasures);
                      if (!refResult.success) {
                        console.error('[UMSEditor] Failed to update measure references after merge:', refResult.error);
                        // This is a partial success - component merged but references not fully updated
                        setError(`Merge succeeded but failed to update some references: ${refResult.error}`);
                      }

                      // Rebuild usage index after merge to ensure consistency
                      rebuildUsageIndex(measures);

                      // Validate referential integrity and log any issues
                      const mismatches = validateReferentialIntegrity(measures, libraryComponents);
                      if (mismatches.length > 0) {
                        console.warn('[UMSEditor] Referential integrity issues after merge:');
                        console.warn(formatMismatches(mismatches));
                      }

                      // Success! Clear dialog and selection, show success message
                      setShowMergeDialog(false);
                      setSelectedForMerge(new Set());
                      setMergeName('');
                      setSuccess(`Successfully merged ${selectedElements.length} components into "${mergedComp.name}"`);
                    } catch (err) {
                      console.error('[UMSEditor] Merge failed:', err);
                      setError(`Merge failed: ${err instanceof Error ? err.message : String(err)}`);
                      // Don't clear selection on error - let user retry
                    }
                  }}
                  disabled={!mergeName.trim() || selectedElements.length < 2}
                  className="px-4 py-2 text-sm bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Merge Components
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Floating Merge Button - always visible when items selected in deep mode */}
      {deepMode && selectedForMerge.size >= 2 && !showMergeDialog && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-40">
          <button
            onClick={() => {
              setMergeName('Combined Component');
              setShowMergeDialog(true);
            }}
            className="px-6 py-3 bg-purple-500 text-white rounded-full text-sm font-medium flex items-center gap-2 hover:bg-purple-600 transition-all shadow-lg shadow-purple-500/25 animate-pulse"
          >
            <Combine className="w-5 h-5" />
            Merge {selectedForMerge.size} Selected Components
          </button>
        </div>
      )}

      {/* Shared Edit Warning Modal */}
      {showSharedEditWarning && pendingEdit && (
        <SharedEditWarning
          componentName={pendingEdit.libraryComponent.name}
          usageCount={pendingEdit.libraryComponent.usage.usageCount}
          measureIds={pendingEdit.libraryComponent.usage.measureIds}
          onUpdateAll={handleSharedEditUpdateAll}
          onCreateCopy={handleSharedEditCreateVersion}
          onCancel={() => {
            setShowSharedEditWarning(false);
            setPendingEdit(null);
          }}
        />
      )}

      {/* Component Swap Modal — TODO: wire up swapTarget state and handleSwapConfirm */}
    </div>
  );
}

// Helper to convert URI to short code system name
function mapCodeSystemFromUri(uri        )             {
  const uriMap                             = {
    'http://hl7.org/fhir/sid/icd-10-cm': 'ICD10',
    'http://snomed.info/sct': 'SNOMED',
    'http://www.ama-assn.org/go/cpt': 'CPT',
    'https://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets': 'HCPCS',
    'http://loinc.org': 'LOINC',
    'http://www.nlm.nih.gov/research/umls/rxnorm': 'RxNorm',
    'http://hl7.org/fhir/sid/cvx': 'CVX',
  };
  return uriMap[uri] || 'CPT';
}

function PopulationSection({
  population,
  measureId,
  isExpanded,
  onToggle,
  selectedNode,
  onSelectNode,
  onSelectValueSet,
  onAddComponent,
  icon,
  label,
  updateReviewStatus,
  allValueSets,
  deepMode,
  onToggleOperator,
  onReorder,
  onDeleteComponent,
  onReplaceComponent,
  onSetOperatorBetween,
  dragState,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  mpStart,
  mpEnd,
  editingTimingId,
  onEditTiming,
  onSaveTiming,
  onResetTiming,
  selectedForMerge,
  onToggleMergeSelection,
  onUpdateElement,
}































 ) {
  // Compute effective status based on children's status
  const computeEffectiveStatus = (pop                      )               => {
    const statuses                 = [pop.reviewStatus];

    const collectStatuses = (node                             ) => {
      statuses.push(node.reviewStatus);
      if ('children' in node && node.children) {
        node.children.forEach(collectStatuses);
      }
    };

    if (pop.criteria) {
      collectStatuses(pop.criteria);
    }

    // If any are flagged, show flagged
    if (statuses.some(s => s === 'flagged')) return 'flagged';
    // If any are needs_revision, show needs_revision
    if (statuses.some(s => s === 'needs_revision')) return 'needs_revision';
    // If all are approved, show approved
    if (statuses.every(s => s === 'approved')) return 'approved';
    // Otherwise pending
    return 'pending';
  };

  const effectiveStatus = computeEffectiveStatus(population);

  return (
    <div className={`rounded-xl overflow-hidden transition-colors bg-[var(--bg-secondary)] ${
      effectiveStatus === 'approved'
        ? 'border-2 border-[var(--success-border)]'
        : effectiveStatus === 'needs_revision' || effectiveStatus === 'flagged'
          ? 'border-2 border-amber-400/60'
          : 'border border-[var(--border)]'
    }`}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-[var(--bg-tertiary)]/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
        )}
        <span className="text-lg">{icon}</span>
        <span className="font-medium text-[var(--text)]">{label}</span>
        <ComplexityBadge level={calculatePopulationComplexity(population)} size="sm" />
        {/* Status indicator - visual only */}
        {effectiveStatus === 'approved' && (
          <CheckCircle className="w-4 h-4 text-green-500 fill-green-500/20" />
        )}
        {(effectiveStatus === 'needs_revision' || effectiveStatus === 'flagged') && (
          <AlertTriangle className="w-4 h-4 text-amber-500 fill-amber-500/20" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-sm text-[var(--text-muted)] ml-7">{population.narrative}</p>

          {/* Criteria tree */}
          {console.log(`[PopulationSection] ${population.type} criteria has ${population.criteria?.children?.length || 0} children`)}
          {population.criteria && (
            <CriteriaNode
              node={population.criteria}
              parentId={null}
              measureId={measureId}
              depth={0}
              index={0}
              totalSiblings={1}
              selectedNode={selectedNode}
              onSelectNode={onSelectNode}
              onSelectValueSet={onSelectValueSet}
              updateReviewStatus={updateReviewStatus}
              allValueSets={allValueSets}
              deepMode={deepMode}
              onToggleOperator={onToggleOperator}
              onReorder={onReorder}
              onDeleteComponent={onDeleteComponent}
              onReplaceComponent={onReplaceComponent}
              onSetOperatorBetween={onSetOperatorBetween}
              dragState={dragState}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOver={onDragOver}
              onDrop={onDrop}
              mpStart={mpStart}
              mpEnd={mpEnd}
              editingTimingId={editingTimingId}
              onEditTiming={onEditTiming}
              onSaveTiming={onSaveTiming}
              onResetTiming={onResetTiming}
              selectedForMerge={selectedForMerge}
              onToggleMergeSelection={onToggleMergeSelection}
              onUpdateElement={onUpdateElement}
            />
          )}

          {/* ═══ Completeness Warnings ═══ */}

          {/* Warning 1: Missing demographic component in IP */}
          {(population.type === 'initial_population' || population.type === 'initial-population') && (() => {
            // Check if any child in the criteria tree is a demographic component
            const hasDemographic = (node) => {
              if (!node) return false;
              if (node.type === 'demographic') return true;
              if (node.children) return node.children.some(child => hasDemographic(child));
              return false;
            };

            if (hasDemographic(population.criteria)) return null;

            return (
              <div className="ml-7 mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-medium text-amber-400">No demographic component found</span>
                  <p className="text-xs text-amber-400/70 mt-0.5">
                    Age and gender requirements won't be checked during validation. Add a demographic component if this measure has age or gender criteria.
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Warning 2: Empty criteria (non-denominator populations) */}
          {population.type !== 'denominator' && (!population.criteria ||
            (population.criteria.children && population.criteria.children.length === 0) ||
            (!population.criteria.children && !population.criteria.type)) && (
            <div className="ml-7 mt-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-medium text-amber-400">No criteria defined</span>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  This population has no components. All patients will automatically qualify.
                </p>
              </div>
            </div>
          )}

          {/* Info: Denominator passthrough detection */}
          {population.type === 'denominator' && population.criteria && (() => {
            // Same structural check as measureEvaluator.js criteriaLacksEvaluatableContent
            const lacksContent = (node) => {
              if (!node) return true;
              if (node.type === 'demographic') return false;
              if (!node.children) {
                return !node.valueSet && (!node.valueSets || node.valueSets.length === 0) && (!node.codes || node.codes.length === 0);
              }
              if (node.children.length === 0) return true;
              return node.children.every(child => 'operator' in child ? lacksContent(child) : lacksContent(child));
            };

            if (!lacksContent(population.criteria)) return null;

            return (
              <div className="ml-7 mt-2 p-2 rounded-lg bg-[var(--accent)]/5 border border-[var(--accent)]/20 flex items-center gap-2">
                <span className="text-xs text-[var(--accent)]">ℹ Treated as "equals Initial Population" — no distinct clinical criteria defined</span>
              </div>
            );
          })()}

          {/* Add Component Button - only visible in Deep Edit Mode */}
          {deepMode && (
            <button
              onClick={onAddComponent}
              className="ml-7 mt-3 px-4 py-2 border-2 border-dashed border-[var(--border)] rounded-lg text-sm text-[var(--text-muted)] hover:text-[var(--accent)] hover:border-[var(--accent)]/50 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Component
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function CriteriaNode({
  node,
  parentId,
  measureId,
  depth,
  index,
  totalSiblings,
  selectedNode,
  onSelectNode,
  onSelectValueSet,
  updateReviewStatus,
  allValueSets,
  deepMode,
  onToggleOperator,
  onReorder,
  onDeleteComponent,
  onReplaceComponent,
  onSetOperatorBetween,
  dragState,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  mpStart,
  mpEnd,
  editingTimingId,
  onEditTiming,
  onSaveTiming,
  onResetTiming,
  selectedForMerge,
  onToggleMergeSelection,
  onUpdateElement,
}   
                                    
                          
                    
                
                
                        
                              
                                            
                                                    
                                                                                                             
                                    
                    
                                               
                                                                                   
                                                   
                                                                                                              
                                                                                                                            
                                    
                        
                                                                           
                                                                                                                                 
                  
                
                                 
                                            
                                                                          
                                               
                                
                                                        
 ) {
  // ═══ ALL HOOKS MUST BE CALLED FIRST (React rules of hooks) ═══
  const { vsacApiKey } = useSettingsStore();
  const { getComponent } = useComponentLibraryStore();

  const isClause = 'operator' in node;
  const isSelected = selectedNode === node.id;
  const canMoveUp = index > 0;
  const canMoveDown = index < totalSiblings - 1;

  if (isClause) {
    const clause = node                 ;
    return (
      <div className="ml-7 space-y-2">
        {/* Clause header - description only, no operator badge (operators only appear between siblings) */}
        <div className="flex items-center gap-2 text-sm group">
          <span className="text-[var(--text-muted)] flex-1">{cleanDescription(clause.description)}</span>

          {/* Deep mode controls for clause */}
          {deepMode && parentId && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onReorder(parentId, clause.id, 'up')}
                disabled={!canMoveUp}
                className={`p-1 rounded ${canMoveUp ? 'hover:bg-[var(--bg-tertiary)] text-[var(--text-dim)] hover:text-[var(--text)]' : 'text-[var(--bg-tertiary)] cursor-not-allowed'}`}
                title="Move up"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onReorder(parentId, clause.id, 'down')}
                disabled={!canMoveDown}
                className={`p-1 rounded ${canMoveDown ? 'hover:bg-[var(--bg-tertiary)] text-[var(--text-dim)] hover:text-[var(--text)]' : 'text-[var(--bg-tertiary)] cursor-not-allowed'}`}
                title="Move down"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (confirm('Delete this logic group and all its children?')) {
                    onDeleteComponent(clause.id);
                  }
                }}
                className="p-1 rounded hover:bg-[var(--danger-light)] text-[var(--text-dim)] hover:text-[var(--danger)]"
                title="Delete group"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        {/* DEBUG: Log children count */}
        {console.log(`[CriteriaNode] Rendering clause "${clause.description?.substring(0, 30)}" with ${clause.children?.length || 0} children`, clause.children?.map(c => c.id))}
        {clause.children.map((child, idx) => {
          const siblingOp = idx > 0 ? getOperatorBetween(clause, idx - 1, idx) : clause.operator;
          const isOverride = idx > 0 && siblingOp !== clause.operator;

          return (
            <Fragment key={child.id}>
              {idx > 0 && (
                <div className={`flex items-center gap-2 ${isOverride ? 'ml-8' : 'ml-4'}`}>
                  <div className="w-px h-3 bg-[var(--border)]" />
                  <button
                    onClick={() => {
                      const newOp = siblingOp === 'AND' ? 'OR' : 'AND';
                      onSetOperatorBetween(clause.id, idx - 1, idx, newOp);
                    }}
                    className={`px-2 py-0.5 rounded font-mono text-[10px] cursor-pointer hover:ring-2 hover:ring-white/20 hover:opacity-80 transition-all ${
                      siblingOp === 'AND' ? 'bg-[var(--success-light)] text-[var(--success)]' :
                      siblingOp === 'OR' ? 'bg-[var(--warning-light)] text-[var(--warning)]' :
                      'bg-[var(--danger-light)] text-[var(--danger)]'
                    } ${isOverride ? 'ring-1 ring-[var(--accent)]/30' : ''}`}
                    title={`Click to toggle between AND / OR (currently ${siblingOp})`}
                  >
                    {siblingOp}
                  </button>
                  <div className="w-px h-3 bg-[var(--border)]" />
                  {isOverride && (
                    <span className="text-[9px] text-[var(--text-dim)] italic">override</span>
                  )}
                </div>
              )}
              <div className={isOverride ? 'ml-4 pl-3 border-l-2 border-[var(--accent)]/20' : ''}>
                <CriteriaNode
                  node={child}
                  parentId={clause.id}
                  measureId={measureId}
                  depth={depth + 1}
                  index={idx}
                  totalSiblings={clause.children.length}
                  selectedNode={selectedNode}
                  onSelectNode={onSelectNode}
                  onSelectValueSet={onSelectValueSet}
                  updateReviewStatus={updateReviewStatus}
                  allValueSets={allValueSets}
                  deepMode={deepMode}
                  onToggleOperator={onToggleOperator}
                  onReorder={onReorder}
                  onDeleteComponent={onDeleteComponent}
                  onReplaceComponent={onReplaceComponent}
                  onSetOperatorBetween={onSetOperatorBetween}
                  dragState={dragState}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDragOver={onDragOver}
                  onDrop={onDrop}
                  mpStart={mpStart}
                  mpEnd={mpEnd}
                  editingTimingId={editingTimingId}
                  onEditTiming={onEditTiming}
                  onSaveTiming={onSaveTiming}
                  onResetTiming={onResetTiming}
                  selectedForMerge={selectedForMerge}
                  onToggleMergeSelection={onToggleMergeSelection}
                  onUpdateElement={onUpdateElement}
                />
              </div>
            </Fragment>
          );
        })}
      </div>
    );
  }

  const element = node               ;

  // Look up linked library component for status badge (hooks already called at top)
  const linkedComponent = element.libraryComponentId ? getComponent(element.libraryComponentId) ?? undefined : undefined;

  // Find all value sets - support multiple value sets for merged components
  // Prioritize element's own value sets (with codes) over looked-up versions
  // Note: Check for non-empty array, not just truthy (empty array is truthy but useless)
  const elementValueSets = (element.valueSets && element.valueSets.length > 0)
    ? element.valueSets
    : (element.valueSet ? [element.valueSet] : []);
  let fullValueSets = elementValueSets.map(vs => {
    // If the value set already has codes embedded, use it directly
    if (vs.codes && vs.codes.length > 0) {
      return vs;
    }
    // Try measure-level value sets
    const fromMeasure = allValueSets.find(avs => avs.id === vs.id || avs.oid === vs.oid);
    if (fromMeasure?.codes?.length > 0) return fromMeasure;
    return vs;
  }).filter(Boolean);

  // FALLBACK: use linked library component's valueSet if element has none or no codes
  if (linkedComponent?.type === 'atomic' && linkedComponent.valueSet) {
    const libVs = linkedComponent.valueSet;

    // If element has no valueSet at all, use library's valueSet
    if (fullValueSets.length === 0) {
      fullValueSets = [{ ...libVs }];
    }
    // If element has valueSet but no codes, and library has codes, merge them
    else if (fullValueSets.every(vs => !vs.codes || vs.codes.length === 0) && libVs?.codes?.length > 0) {
      fullValueSets = fullValueSets.map(vs => ({
        ...vs,
        codes: libVs.codes,
        oid: vs.oid || libVs.oid,
      }));
    }
  }

  // Keep legacy single value set for backwards compatibility
  const _fullValueSet = fullValueSets.length > 0 ? fullValueSets[0] : undefined;

  const isDraggedOver = dragState.dragOverId === element.id && dragState.draggedId !== element.id;
  const isDragging = dragState.draggedId === element.id;
  const isMergeTarget = isDraggedOver && dragState.dragOverPosition === 'merge';
  // Use element.id for merge selection (all components can be merged)
  const isSelectedForMerge = selectedForMerge.has(element.id);

  return (
    <div
      className={`relative ml-7 ${isDraggedOver && dragState.dragOverPosition === 'before' ? 'pt-1' : ''} ${isDraggedOver && dragState.dragOverPosition === 'after' ? 'pb-1' : ''}`}
      onDragOver={(e) => onDragOver(e, element.id, true)}
      onDrop={(e) => onDrop(e, element.id, index, parentId, true)}
      onDragLeave={() => {}}
    >
      {/* Drop indicator - before */}
      {isDraggedOver && dragState.dragOverPosition === 'before' && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-[var(--accent)] rounded-full z-10" />
      )}
      {/* Merge indicator - center */}
      {isMergeTarget && (
        <div className="absolute inset-0 border-2 border-dashed border-purple-500 rounded-lg bg-purple-500/10 z-10 flex items-center justify-center pointer-events-none">
          <span className="px-3 py-1.5 bg-purple-500 text-white text-xs font-medium rounded-full shadow-lg">
            Drop to Merge (OR logic)
          </span>
        </div>
      )}

      <div
        onClick={() => onSelectNode(isSelected ? null : element.id)}
        className={`group p-3 rounded-lg cursor-pointer transition-all ${
          isDragging ? 'opacity-40' :
          isSelectedForMerge
            ? 'border-2 bg-purple-500/5 border-purple-500/50 ring-2 ring-purple-500/20'
            : isSelected
              ? 'border bg-[var(--accent-light)] border-[var(--accent)]/50'
              : element.reviewStatus === 'approved'
                ? 'border-2 bg-[var(--bg-tertiary)] border-[var(--success-border)] hover:border-[var(--success)]'
                : element.reviewStatus === 'needs_revision'
                  ? 'border-2 bg-[var(--bg-tertiary)] border-amber-400/60 hover:border-amber-400/80'
                  : 'border bg-[var(--bg-tertiary)] border-[var(--border)] hover:border-[var(--text-dim)]'
        }`}
      >
      <div className="flex items-start justify-between gap-3">
        {/* Merge checkbox - visible in deep mode for all components */}
        {deepMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleMergeSelection(element.id);
            }}
            className={`flex-shrink-0 p-1.5 mt-0.5 rounded transition-colors ${
              isSelectedForMerge
                ? 'bg-purple-500/20 text-purple-400'
                : 'text-[var(--text-dim)] hover:text-purple-400 hover:bg-purple-500/10'
            }`}
            title={isSelectedForMerge ? 'Deselect for merge' : 'Select for merge'}
          >
            {isSelectedForMerge ? (
              <CheckSquare className="w-4 h-4" />
            ) : (
              <Square className="w-4 h-4" />
            )}
          </button>
        )}
        {/* Drag handle */}
        {parentId && (
          <div
            draggable
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', element.id);
              onDragStart(element.id);
            }}
            onDragEnd={onDragEnd}
            className="flex-shrink-0 p-1 mt-0.5 rounded cursor-grab text-[var(--text-dim)] hover:text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="w-4 h-4" />
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-dim)] uppercase">
              {element.type}
            </span>
            <ComplexityBadge level={calculateDataElementComplexity(element)} size="sm" />
          </div>
          {/* For age requirement, show formatted range instead of template description */}
          {(isAgeRequirementComponent(element) && !element.genderValue) ? (
            <p className="text-sm text-[var(--text)]">Age Requirement: {formatAgeRange(element.thresholds)}</p>
          ) : (
            <p className="text-sm text-[var(--text)]">{cleanDescription(element.description)}</p>
          )}

          {/* Library Connection Indicator */}
          {linkedComponent && (
            <ComponentLibraryIndicator component={linkedComponent} />
          )}

          {/* Missing codes warning */}
          {(() => {
            // Skip demographics
            if (element.genderValue) return null;
            if (isAgeRequirementComponent(element)) return null;
            if (element.type === 'demographic') return null;
            if (element.category === 'demographics') return null;

            // ANY non-demographic with no codes gets flagged
            const codes = element.valueSet?.codes || [];
            if (codes.length > 0) return null;

            const hasOid = element.valueSet?.oid && /^\d+\.\d+/.test(element.valueSet.oid);

            return (
              <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 flex-wrap">
                <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="text-xs font-medium text-amber-400">
                  Missing codes{!hasOid ? ' — no OID available' : ''}
                </span>
                {hasOid && vsacApiKey && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Open the value set modal, which has the "Fetch from VSAC" button
                      onSelectValueSet(element.valueSet, element.id);
                    }}
                    className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition-colors font-medium"
                  >
                    Fetch codes from VSAC →
                  </button>
                )}
                {!vsacApiKey && hasOid && (
                  <span className="text-xs text-amber-400/60">
                    Add VSAC API key in Settings to auto-fetch
                  </span>
                )}
              </div>
            );
          })()}

          {/* Age Requirement - show formatted range label only (editing happens in right panel) */}
          {isAgeRequirementComponent(element) && !element.genderValue && (
            <div className="mt-2">
              <span className="text-xs px-2 py-1 bg-[var(--success-light)] text-[var(--success)] rounded-lg inline-flex items-center gap-1">
                <span className="font-medium">Age:</span>
                <span className="font-bold">{formatAgeRange(element.thresholds)}</span>
              </span>
            </div>
          )}

          {/* Thresholds for observations (non-age) */}
          {element.thresholds && element.thresholds.valueMin !== undefined && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs px-2 py-1 bg-[var(--warning-light)] text-[var(--warning)] rounded-lg">
                {element.thresholds.comparator || '>='} {element.thresholds.valueMin}
                {element.thresholds.valueMax !== undefined && ` - ${element.thresholds.valueMax}`}
                {element.thresholds.unit && ` ${element.thresholds.unit}`}
              </span>
            </div>
          )}

          {/* Value Sets - clickable, support multiple */}
          {fullValueSets.length > 0 && (
            <div className="mt-2 space-y-1">
              {fullValueSets.length > 1 && (
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-dim)]">
                  Combined Value Sets ({fullValueSets.length})
                </span>
              )}
              <div className={fullValueSets.length > 1 ? "flex flex-wrap gap-2" : ""}>
                {fullValueSets.map((vs, vsIdx) => (
                  <button
                    key={vs.id || vsIdx}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectValueSet(vs, element.id);
                    }}
                    className={`text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 group ${
                      fullValueSets.length > 1
                        ? 'px-2 py-1 rounded-lg bg-[var(--accent)]/5 border border-[var(--accent)]/20 hover:bg-[var(--accent)]/10'
                        : ''
                    }`}
                  >
                    {fullValueSets.length === 1 && <span>Value Set: </span>}
                    <span>{vs.name}</span>
                    <span className="text-[var(--text-dim)]">({vs.codes?.length || 0})</span>
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Timing Override - structured timing editor */}
          {element.timingOverride && (
            <div className="mt-2">
              <TimingBadge
                timing={element.timingOverride}
                mpStart={mpStart}
                mpEnd={mpEnd}
                onClick={() => onEditTiming(editingTimingId === element.id ? null : element.id)}
              />
            </div>
          )}

          {/* Timing Requirements - legacy display for backwards compatibility */}
          {!element.timingOverride && element.timingRequirements && element.timingRequirements.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {element.timingRequirements.map((tr, i) => (
                <span key={i} className="text-xs px-2 py-0.5 bg-[var(--accent-light)] text-[var(--accent)] rounded">
                  {tr.description}
                </span>
              ))}
            </div>
          )}

          {/* Due Date Badge */}
          {element.dueDateDays != null && (
            <span className="mt-2 inline-block text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-dim)] font-mono">
              ⏱ T-{element.dueDateDays}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Deep mode arrow controls - hidden by default, visible on hover */}
          {deepMode && parentId && (
            <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReorder(parentId, element.id, 'up');
                }}
                disabled={!canMoveUp}
                className={`p-1.5 rounded ${canMoveUp ? 'hover:bg-[var(--bg-secondary)] text-[var(--text-dim)] hover:text-[var(--text)]' : 'text-[var(--bg-tertiary)] cursor-not-allowed'}`}
                title="Move up"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReorder(parentId, element.id, 'down');
                }}
                disabled={!canMoveDown}
                className={`p-1.5 rounded ${canMoveDown ? 'hover:bg-[var(--bg-secondary)] text-[var(--text-dim)] hover:text-[var(--text)]' : 'text-[var(--bg-tertiary)] cursor-not-allowed'}`}
                title="Move down"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
              <div className="w-px h-4 bg-[var(--border)] mx-1" />
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateReviewStatus(measureId, element.id, element.reviewStatus === 'approved' ? 'pending' : 'approved');
            }}
            className={`p-1.5 rounded transition-colors ${
              element.reviewStatus === 'approved'
                ? 'bg-[var(--success-light)] text-[var(--success)] hover:bg-[var(--success-light)]'
                : 'hover:bg-[var(--success-light)] text-[var(--text-dim)] hover:text-[var(--success)]'
            }`}
            title={element.reviewStatus === 'approved' ? 'Approved (click to unapprove)' : 'Approve'}
          >
            <CheckCircle className={`w-4 h-4 ${element.reviewStatus === 'approved' ? 'fill-[var(--success-light)]' : ''}`} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              updateReviewStatus(measureId, element.id, element.reviewStatus === 'needs_revision' ? 'pending' : 'needs_revision');
            }}
            className={`p-1.5 rounded transition-colors ${
              element.reviewStatus === 'needs_revision'
                ? 'bg-amber-500/20 text-amber-500 hover:bg-amber-500/30'
                : 'hover:bg-[var(--warning-light)] text-[var(--text-dim)] hover:text-[var(--warning)]'
            }`}
            title={element.reviewStatus === 'needs_revision' ? 'Flagged (click to clear)' : 'Flag for revision'}
          >
            <AlertTriangle className={`w-4 h-4 ${element.reviewStatus === 'needs_revision' ? 'fill-amber-500/30' : ''}`} />
          </button>
          {/* Swap/Replace button in deep mode */}
          {deepMode && parentId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReplaceComponent(parentId, element.id, element.description || element.name || 'Component', index);
              }}
              className="p-1.5 rounded hover:bg-[var(--accent-light)] text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
              title="Replace with another component"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          )}
          {/* Delete button in deep mode */}
          {deepMode && parentId && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (confirm('Delete this component?')) {
                  onDeleteComponent(element.id);
                }
              }}
              className="p-1.5 rounded hover:bg-[var(--danger-light)] text-[var(--text-dim)] hover:text-[var(--danger)] transition-colors"
              title="Delete component"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
      </div>

      {/* Timing Editor Panel - appears when editing timing */}
      {editingTimingId === element.id && element.timingOverride && (
        <TimingEditorPanel
          timing={element.timingOverride}
          mpStart={mpStart}
          mpEnd={mpEnd}
          onSave={(modified) => onSaveTiming(element.id, modified)}
          onCancel={() => onEditTiming(null)}
          onReset={() => onResetTiming(element.id)}
        />
      )}

      {/* Drop indicator - after */}
      {isDraggedOver && dragState.dragOverPosition === 'after' && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--accent)] rounded-full z-10" />
      )}
    </div>
  );
}

function SelectedComponentDetailPanel({
  measureId,
  nodeId,
  onClose,
  onNavigateToLibrary,
  onSaveTiming,
  onResetTiming,
  onSaveTimingWindow,
  onResetTimingWindow,
}








 ) {
  const { measures, updateElementField } = useMeasureStore();

  // Feedback capture: store snapshot before edit for comparison
  const _beforeSnapshotRef = useRef                          (null);
  const currentMeasure = measures.find(m => m.id === measureId);

  // Find the DataElement in the criteria tree
  const findElement = (obj     )                     => {
    if (obj?.id === nodeId && obj?.type && !obj?.children) return obj;
    if (obj?.criteria) {
      const found = findElement(obj.criteria);
      if (found) return found;
    }
    if (obj?.children) {
      for (const child of obj.children) {
        const found = findElement(child);
        if (found) return found;
      }
    }
    return null;
  };

  let element                     = null;
  if (currentMeasure) {
    for (const pop of currentMeasure.populations) {
      element = findElement(pop);
      if (element) break;
    }
  }

  if (!element) {
    return (
      <div className="w-full flex items-center justify-center p-8 text-[var(--text-muted)] text-sm">
        Component not found. Select a data element to view code details.
      </div>
    );
  }

  // Get measurement period from measure
  const mpStart = currentMeasure?.metadata.measurementPeriod?.start || '2024-01-01';
  const mpEnd = currentMeasure?.metadata.measurementPeriod?.end || '2024-12-31';

  return (
    <ComponentDetailPanel
      element={element}
      measureId={measureId}
      onClose={onClose}
      onNavigateToLibrary={onNavigateToLibrary}
      className="w-full"
      mpStart={mpStart}
      mpEnd={mpEnd}
      onSaveTiming={onSaveTiming}
      onResetTiming={onResetTiming}
      onSaveTimingWindow={onSaveTimingWindow}
      onResetTimingWindow={onResetTimingWindow}
      onSaveElementField={(elementId, field, value) => {
        updateElementField(measureId, elementId, field, value);
      }}
    />
  );
}

// VSAC Fetch Button sub-component for inline value set fetching
function VsacFetchButton({ oid, apiKey, onCodesReceived }) {
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState(null); // { type: 'success'|'error', message }

  const handleFetch = async () => {
    if (!apiKey) {
      setFetchStatus({ type: 'error', message: 'Configure VSAC API key in Settings' });
      return;
    }
    setFetching(true);
    setFetchStatus(null);
    try {
      const result = await fetchValueSetExpansion(oid, apiKey);
      if (result.codes?.length > 0) {
        onCodesReceived(result.codes, result.valueSetName);
        setFetchStatus({ type: 'success', message: `Fetched ${result.codes.length} codes` });
      } else {
        setFetchStatus({ type: 'error', message: 'No codes found for this OID' });
      }
    } catch (err) {
      setFetchStatus({ type: 'error', message: err.message || 'VSAC fetch failed' });
    }
    setFetching(false);
  };

  return (
    <div className="space-y-1">
      <button
        onClick={handleFetch}
        disabled={fetching}
        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/30 text-[var(--accent)] bg-[var(--accent-light)] hover:bg-[var(--accent)]/20 transition-colors disabled:opacity-50"
      >
        {fetching ? (
          <><Loader2 className="w-3 h-3 animate-spin" /> Fetching...</>
        ) : (
          <><Download className="w-3 h-3" /> Fetch from VSAC</>
        )}
      </button>
      {fetchStatus && (
        <div className={`text-[10px] ${fetchStatus.type === 'success' ? 'text-[var(--success)]' : 'text-amber-400'}`}>
          {fetchStatus.message}
        </div>
      )}
    </div>
  );
}

function NodeDetailPanel({
  measureId,
  nodeId,
  allValueSets,
  onClose,
  onSelectValueSet,
  updateReviewStatus,
  mpStart,
  mpEnd,
  onSaveTimingWindow,
  onResetTimingWindow,
}   
                    
                 
                                    
                      
                                                    
                                                                                                             
                  
                
                                                                            
                                                     
 ) {
  const { updateDataElement, measures, batchUpdateMeasures } = useMeasureStore();
  const { getComponent, updateComponent, syncComponentToMeasures } = useComponentLibraryStore();
  const vsacApiKey = useSettingsStore(s => s.vsacApiKey);

  // Editing states
  const [editingField, setEditingField] = useState               (null);
  const [editValue, setEditValue] = useState        ('');
  const [_editTimingIdx, setEditTimingIdx] = useState               (null);
  const [editReqIdx, setEditReqIdx] = useState               (null);
  const [_editingTimingWindow, _setEditingTimingWindow] = useState(false);

  // Value set editing states
  const [editingValueSet, setEditingValueSet] = useState(false);
  const [vsOid, setVsOid] = useState('');
  const [vsName, setVsName] = useState('');
  const [localCodes, setLocalCodes] = useState([]);
  const [showAddCodeForm, setShowAddCodeForm] = useState(false);
  const [newCode, setNewCode] = useState({ code: '', display: '', system: 'CPT' });

  // Shared edit warning states
  const [showSharedCodeWarning, setShowSharedCodeWarning] = useState(false);
  const [pendingCodeEdit, setPendingCodeEdit] = useState(null);

  // Find the node in the tree (re-fetch from measures to get live updates)
  const findNode = (obj     )                     => {
    if (obj?.id === nodeId) return obj;
    if (obj?.criteria) {
      const found = findNode(obj.criteria);
      if (found) return found;
    }
    if (obj?.children) {
      for (const child of obj.children) {
        const found = findNode(child);
        if (found) return found;
      }
    }
    return null;
  };

  // Get fresh data from store
  const currentMeasure = measures.find(m => m.id === measureId);
  let node                     = null;
  let _nodePopulation                              = null;
  if (currentMeasure) {
    for (const pop of currentMeasure.populations) {
      node = findNode(pop);
      if (node) {
        _nodePopulation = pop;
        break;
      }
    }
  }

  // ═══ COMPUTE VALUES NEEDED FOR useEffect BEFORE EARLY RETURN (React hooks rules) ═══
  // Must compute these before early return so useEffect can reference them
  const linkedCompForEffect = node?.libraryComponentId ? getComponent(node.libraryComponentId) : null;
  let fullValueSetsForEffect = [];
  if (node) {
    if (linkedCompForEffect?.type === 'atomic' && linkedCompForEffect.valueSet) {
      fullValueSetsForEffect = [{
        id: linkedCompForEffect.valueSet.oid || linkedCompForEffect.id,
        oid: linkedCompForEffect.valueSet.oid || node.valueSet?.oid || '',
        name: linkedCompForEffect.valueSet.name || linkedCompForEffect.name,
        codes: linkedCompForEffect.valueSet.codes || [],
      }];
    } else {
      const nodeValueSetRefs = (node.valueSets && node.valueSets.length > 0)
        ? node.valueSets
        : (node.valueSet ? [node.valueSet] : []);
      fullValueSetsForEffect = nodeValueSetRefs.map(vsRef => {
        if (vsRef.codes && vsRef.codes.length > 0) return vsRef;
        const lookedUp = currentMeasure?.valueSets?.find(vs => vs.id === vsRef.id || vs.oid === vsRef.oid)
          || allValueSets.find(vs => vs.id === vsRef.id || vs.oid === vsRef.oid);
        if (lookedUp?.codes?.length > 0) return lookedUp;
        return vsRef;
      }).filter(Boolean);
    }
  }
  const codesFingerprint = (fullValueSetsForEffect[0]?.codes || []).map(c => c.code).sort().join(',');

  // ═══ useEffect MUST BE CALLED BEFORE EARLY RETURN (React hooks rules) ═══
  // Sync value set editing state when node changes OR when authoritative codes change
  useEffect(() => {
    if (node) {
      const vs = fullValueSetsForEffect[0]; // Primary value set
      setVsOid(vs?.oid || '');
      setVsName(vs?.name || node.description || '');
      setLocalCodes(vs?.codes ? [...vs.codes] : []);
      setEditingValueSet(false);
      setShowAddCodeForm(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId, codesFingerprint]); // Intentional: fullValueSetsForEffect and node are derived from nodeId

  if (!node) return null;

  // ========================================================================
  // Timing Adapter Functions for TimingSection integration
  // ========================================================================

  /**
   * Convert a UMS DataElement's timing data to the library timing format
   * that TimingSection expects.
   */
  const nodeTimingAsLibraryFormat = (n) => {
    // Try structured timing window first
    const window = n.timingWindow;
    if (window) {
      const effective = getEffectiveWindow(window);
      if (effective) {
        // Convert window format to library format
        return {
          operator: 'within',
          quantity: effective.start?.offsetValue || null,
          unit: effective.start?.offsetUnit?.replace('(s)', 's') || null,
          position: 'before end of',
          reference: 'Measurement Period',
        };
      }
    }

    // Try timing requirements (legacy format)
    const timingReq = n.timingRequirements?.[0];
    if (timingReq) {
      return {
        operator: timingReq.window ? 'within' : 'during',
        quantity: timingReq.window?.value || null,
        unit: timingReq.window?.unit || null,
        position: timingReq.window?.direction === 'before' ? 'before end of' : null,
        reference: 'Measurement Period',
        displayExpression: timingReq.description,
      };
    }

    // Try timingOverride (structured constraint)
    if (n.timingOverride) {
      const effective = getEffectiveTiming(n.timingOverride);
      if (effective) {
        return {
          operator: effective.operator,
          quantity: effective.value || null,
          unit: effective.unit?.replace('(s)', 's') || null,
          position: null,
          reference: effective.anchor || 'Measurement Period',
        };
      }
    }

    return { operator: 'during', reference: 'Measurement Period' };
  };

  /**
   * Convert library timing format back to a TimingConstraint override
   * for saving via the UMS store.
   */
  // QA-FLAG: Confirmed unused, candidate for removal
  const _convertToTimingOverride = (libraryTiming, n) => {
    return {
      operator: libraryTiming.operator,
      value: libraryTiming.quantity || null,
      unit: libraryTiming.unit ? libraryTiming.unit.replace('s', '(s)') : null,
      anchor: libraryTiming.reference || 'Measurement Period End',
      concept: n.description || n.valueSet?.name || 'Component',
    };
  };

  // ═══ SINGLE SOURCE OF TRUTH: Library component owns codes for linked elements ═══
  const linkedComp = node.libraryComponentId ? getComponent(node.libraryComponentId) : null;

  let fullValueSets;
  if (linkedComp?.type === 'atomic' && linkedComp.valueSet) {
    // LINKED: Library component is THE authority for codes
    fullValueSets = [{
      id: linkedComp.valueSet.oid || linkedComp.id,
      oid: linkedComp.valueSet.oid || node.valueSet?.oid || '',
      name: linkedComp.valueSet.name || linkedComp.name,
      version: linkedComp.valueSet.version || '',
      codes: linkedComp.valueSet.codes || [],
      source: linkedComp.valueSet.source || 'Library Component',
      totalCodeCount: linkedComp.valueSet.codes?.length || 0,
    }];
  } else {
    // UNLINKED: Fall back to element's own data
    const nodeValueSetRefs = (node.valueSets && node.valueSets.length > 0)
      ? node.valueSets
      : (node.valueSet ? [node.valueSet] : []);
    fullValueSets = nodeValueSetRefs.map(vsRef => {
      if (vsRef.codes && vsRef.codes.length > 0) return vsRef;
      const lookedUp = currentMeasure?.valueSets.find(vs => vs.id === vsRef.id || vs.oid === vsRef.oid)
        || allValueSets.find(vs => vs.id === vsRef.id || vs.oid === vsRef.oid);
      if (lookedUp?.codes?.length > 0) return lookedUp;
      return vsRef;
    }).filter(Boolean);
  }

  // Keep single value set for backward compatibility
  const _fullValueSetLegacy = fullValueSets.length > 0 ? fullValueSets[0] : undefined;

  // Save value set changes - routes through library for linked elements
  const saveValueSetChanges = (updates) => {
    if (node.libraryComponentId) {
      // ═══ LINKED: Write to library component + sync to ALL measures ═══
      const libComp = getComponent(node.libraryComponentId);
      if (libComp?.type === 'atomic') {
        const mergedVs = { ...libComp.valueSet, ...updates };

        // Check if shared and codes are being changed
        if (updates.codes && libComp.usage?.usageCount > 1) {
          // Trigger shared edit warning
          setPendingCodeEdit({
            componentId: node.libraryComponentId,
            elementId: node.id,
            libraryComponent: libComp,
            updates: mergedVs,
          });
          setShowSharedCodeWarning(true);
          return; // Don't apply yet — wait for user confirmation
        }

        // Single-use or non-code change: apply immediately
        updateComponent(node.libraryComponentId, { valueSet: mergedVs });

        // Sync codes to ALL measures that use this component
        if (updates.codes) {
          syncComponentToMeasures(
            node.libraryComponentId,
            { changeDescription: 'Codes updated via UMS Editor', codes: updates.codes },
            measures,
            batchUpdateMeasures,
          );
        }
      }
    } else {
      // ═══ UNLINKED: Write to data element only ═══
      const currentVs = node.valueSet || {};
      const updatedVs = { ...currentVs, ...updates };
      updateDataElement(measureId, node.id, { valueSet: updatedVs });
    }
  };

  // Helper to detect "X or older" pattern in text — returns true if open-ended upper bound
  const isOpenEndedAge = (text        )          => {
    return /(\d+)\s*(?:or|and)\s*older/i.test(text) || /(\d+)\s*\+/.test(text) || /(\d+)\s*years\s*of\s*age\s*(?:or|and)\s*older/i.test(text);
  };

  // Helper to extract age range from description or additionalRequirements
  const parseAgeRange = ()                                                                                                                       => {
    // Check if description indicates open-ended age (e.g., "18 or older")
    const descIsOpenEnded = isOpenEndedAge(node.description);

    // First check thresholds (most authoritative)
    if (node.thresholds?.ageMin !== undefined || node.thresholds?.ageMax !== undefined) {
      let max = node.thresholds.ageMax ?? 150;
      // If thresholds has ageMin == ageMax AND description says "or older", fix to 150
      if (descIsOpenEnded && (max === node.thresholds.ageMin || max === undefined)) {
        max = 150;
      }
      return {
        min: node.thresholds.ageMin ?? 0,
        max,
        source: 'thresholds'
      };
    }

    // Then check description for range (e.g., "age 45-75")
    const descMatch = node.description.match(/(?:age[d]?\s*)?(\d+)\s*[-–to]+\s*(\d+)/i);
    if (descMatch) {
      return { min: parseInt(descMatch[1]), max: parseInt(descMatch[2]), source: 'description' };
    }

    // Check for "X or older" / "X and older" / "X+" patterns (upper bound = 150)
    const olderMatch = node.description.match(/(?:age[d]?\s*)?(\d+)\s*(?:or|and)\s*older/i) ||
                       node.description.match(/(\d+)\s*\+/) ||
                       node.description.match(/(\d+)\s*years\s*of\s*age\s*(?:or|and)\s*older/i);
    if (olderMatch) {
      return { min: parseInt(olderMatch[1]), max: 150, source: 'description' };
    }

    // Check for "X or younger" / "under X" patterns (no lower bound)
    const youngerMatch = node.description.match(/(?:age[d]?\s*)?(\d+)\s*(?:or|and)\s*younger/i) ||
                         node.description.match(/under\s*(\d+)/i);
    if (youngerMatch) {
      return { min: 0, max: parseInt(youngerMatch[1]), source: 'description' };
    }

    // Fallback: "age X at end" or "turns X" patterns
    const turnsMatch = node.description.match(/(?:turns?|age)\s*(\d+)/i);
    if (turnsMatch) {
      const age = parseInt(turnsMatch[1]);
      return { min: age, max: age, source: 'description' };
    }

    // Finally check additionalRequirements
    if (node.additionalRequirements) {
      for (let i = 0; i < node.additionalRequirements.length; i++) {
        const req = node.additionalRequirements[i];
        const reqMatch = req.match(/(?:age[d]?\s*)?(\d+)\s*[-–to]+\s*(\d+)/i);
        if (reqMatch) {
          return { min: parseInt(reqMatch[1]), max: parseInt(reqMatch[2]), source: 'additionalRequirements', index: i };
        }
        // Check "X or older" in requirements
        if (isOpenEndedAge(req)) {
          const reqOlderMatch = req.match(/(\d+)/);
          if (reqOlderMatch) {
            return { min: parseInt(reqOlderMatch[1]), max: 150, source: 'additionalRequirements', index: i };
          }
        }
        // Fallback single age in requirements
        const singleAgeMatch = req.match(/(?:turns?|age)\s*(\d+)/i);
        if (singleAgeMatch) {
          const age = parseInt(singleAgeMatch[1]);
          return { min: age, max: age, source: 'additionalRequirements', index: i };
        }
      }
    }

    // If this is an Age Requirement component, return defaults even without thresholds
    // This ensures the AGE RANGE fieldset is always shown for Age Requirement
    if (isAgeRequirementComponent(node)) {
      return { min: 18, max: 65, source: 'default' };
    }

    return null;
  };

  const ageRange = parseAgeRange();

  // Save handlers
  const saveDescription = () => {
    if (editValue.trim() && editValue !== node?.description && node) {
      // Capture before state
      const beforeSnapshot = snapshotFromDataElement(node);

      updateDataElement(measureId, nodeId, { description: editValue.trim() }, 'description_changed', 'Edited via inline edit');

      // Record feedback after edit (use setTimeout to allow state update)
      setTimeout(() => {
        if (node) {
          const afterSnapshot = snapshotFromDataElement(node);
          recordComponentFeedback(nodeId, measureId, beforeSnapshot, afterSnapshot);
        }
      }, 100);
    }
    setEditingField(null);
    setEditValue('');
  };

  // QA-FLAG: Confirmed unused, candidate for removal
  const _saveAgeRange = (_min        , _max        ) => {
    if (!ageRange) return;

    // Use global sync to update ALL age references throughout the measure
    // This ensures the measure description, population descriptions, thresholds,
    // and all other age references are kept in sync
    // Note: syncAgeRange was removed from store destructuring as it's unused
    setEditingField(null);
  };

  const saveGenderValue = (newGender                           ) => {
    if (!node) return;

    // Capture before state
    const beforeSnapshot = snapshotFromDataElement(node);

    // Update the genderValue and description
    const genderLabel = newGender ? newGender.charAt(0).toUpperCase() + newGender.slice(1) : 'Any';
    const newDescription = newGender ? `Patient sex: ${genderLabel}` : 'Patient sex: Any';

    updateDataElement(measureId, nodeId, {
      genderValue: newGender,
      description: newDescription,
    }, 'gender_changed', `Changed patient sex to ${genderLabel}`);

    // Record feedback after edit
    setTimeout(() => {
      if (node) {
        const afterSnapshot = snapshotFromDataElement(node);
        recordComponentFeedback(nodeId, measureId, beforeSnapshot, afterSnapshot);
      }
    }, 100);

    setEditingField(null);
  };

  // QA-FLAG: Confirmed unused, candidate for removal
  const _saveTiming = (idx        , newValue        ) => {
    if (!node?.timingRequirements) return;

    // Capture before state
    const beforeSnapshot = snapshotFromDataElement(node);

    const updatedTimings = [...node.timingRequirements];
    updatedTimings[idx] = { ...updatedTimings[idx], description: newValue };
    updateDataElement(measureId, nodeId, { timingRequirements: updatedTimings }, 'timing_changed', 'Edited timing via inline edit');

    // Record feedback after edit
    setTimeout(() => {
      if (node) {
        const afterSnapshot = snapshotFromDataElement(node);
        recordComponentFeedback(nodeId, measureId, beforeSnapshot, afterSnapshot);
      }
    }, 100);

    setEditTimingIdx(null);
    setEditValue('');
  };

  const saveRequirement = (idx        , newValue        ) => {
    if (!node?.additionalRequirements) return;

    // Capture before state
    const beforeSnapshot = snapshotFromDataElement(node);

    const updated = [...node.additionalRequirements];
    updated[idx] = newValue;
    updateDataElement(measureId, nodeId, { additionalRequirements: updated }, 'description_changed', 'Edited requirement via inline edit');

    // Record feedback after edit
    setTimeout(() => {
      if (node) {
        const afterSnapshot = snapshotFromDataElement(node);
        recordComponentFeedback(nodeId, measureId, beforeSnapshot, afterSnapshot);
      }
    }, 100);

    setEditReqIdx(null);
    setEditValue('');
  };

  const removeRequirement = (idx        ) => {
    if (!node?.additionalRequirements) return;
    const updated = node.additionalRequirements.filter((_, i) => i !== idx);
    updateDataElement(measureId, nodeId, { additionalRequirements: updated }, 'element_removed', 'Removed requirement');
  };

  const addRequirement = () => {
    const updated = [...(node?.additionalRequirements || []), 'New requirement'];
    updateDataElement(measureId, nodeId, { additionalRequirements: updated }, 'element_added', 'Added new requirement');
  };

  return (
    <div className="w-full border-l border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col overflow-hidden">
      <div className="sticky top-0 bg-[var(--bg-secondary)] border-b border-[var(--border)] p-4 flex items-center justify-between">
        <h3 className="font-semibold text-[var(--text)]">Edit Component</h3>
        <button onClick={onClose} className="p-1 hover:bg-[var(--bg-tertiary)] rounded">
          <X className="w-4 h-4 text-[var(--text-muted)]" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Type & Status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)] uppercase">
            {node.type}
          </span>
          <ComplexityBadge level={calculateDataElementComplexity(node)} />
          {node.libraryComponentId && (
            <>
              <LibraryStatusBadge component={getComponent(node.libraryComponentId) ?? undefined} size="md" />
              <OIDValidationBadge component={getComponent(node.libraryComponentId) ?? undefined} size="md" />
            </>
          )}
        </div>

        {/* Editable Description - hide for age requirement components */}
        {!(isAgeRequirementComponent(node) && !node.genderValue) && (
          <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Description</h4>
              {editingField !== 'description' && (
                <button
                  onClick={() => { setEditingField('description'); setEditValue(node?.description || ''); }}
                  className="p-1 hover:bg-[var(--bg-secondary)] rounded text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {editingField === 'description' ? (
              <div className="space-y-2">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--accent)]/50 rounded-lg text-sm text-[var(--text)] focus:outline-none resize-none"
                  rows={3}
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditingField(null)} className="px-3 py-1.5 text-xs bg-[var(--bg-secondary)] text-[var(--text-muted)] rounded hover:text-[var(--text)]">
                    Cancel
                  </button>
                  <button onClick={saveDescription} className="px-3 py-1.5 text-xs bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)]">
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--text)]">{node.description}</p>
            )}
          </div>
        )}

        {/* Age Range - inline editing with NumberSteppers */}
        {ageRange && (
          <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
            <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">Age Range</h4>

            {/* Live preview sentence */}
            <div className="mb-4 p-2 bg-[var(--bg-secondary)] rounded-lg text-center">
              <span className="text-sm text-[var(--text)]">
                Patient is <span className="font-bold text-[var(--accent)]">{node.thresholds?.ageMin ?? ageRange.min}</span> to <span className="font-bold text-[var(--accent)]">{node.thresholds?.ageMax ?? ageRange.max}</span> years old
              </span>
            </div>

            {/* Inline NumberStepper inputs */}
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-xs text-[var(--text-dim)] block mb-1.5">Minimum Age</label>
                <NumberStepper
                  value={node.thresholds?.ageMin ?? ageRange.min}
                  min={0}
                  max={120}
                  onChange={(v) => {
                    const newThresholds = { ...(node.thresholds || {}), ageMin: v };
                    updateDataElement(measureId, node.id, { thresholds: newThresholds });
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-[var(--text-dim)] block mb-1.5">Maximum Age</label>
                <NumberStepper
                  value={node.thresholds?.ageMax ?? ageRange.max}
                  min={0}
                  max={120}
                  onChange={(v) => {
                    const newThresholds = { ...(node.thresholds || {}), ageMax: v };
                    updateDataElement(measureId, node.id, { thresholds: newThresholds });
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Editable Patient Sex (if demographic type with genderValue or sex-related description) */}
        {(node.genderValue || node.type === 'demographic' && /sex|gender|male|female/i.test(node.description || '')) && (
          <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Patient Sex</h4>
              {editingField !== 'genderValue' && (
                <button
                  onClick={() => setEditingField('genderValue')}
                  className="p-1 hover:bg-[var(--bg-secondary)] rounded text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {editingField === 'genderValue' ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => saveGenderValue('male')}
                    className={`flex-1 px-3 py-2 rounded-lg font-medium transition-colors border ${
                      node.genderValue === 'male'
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border-[var(--border)] hover:border-blue-500/50'
                    }`}
                  >
                    Male
                  </button>
                  <button
                    type="button"
                    onClick={() => saveGenderValue('female')}
                    className={`flex-1 px-3 py-2 rounded-lg font-medium transition-colors border ${
                      node.genderValue === 'female'
                        ? 'bg-pink-500 text-white border-pink-500'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] border-[var(--border)] hover:border-pink-500/50'
                    }`}
                  >
                    Female
                  </button>
                </div>
                <button
                  onClick={() => setEditingField(null)}
                  className="w-full px-3 py-1.5 text-xs bg-[var(--bg-secondary)] text-[var(--text-muted)] rounded hover:text-[var(--text)]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className={`text-lg font-bold ${node.genderValue === 'male' ? 'text-blue-400' : node.genderValue === 'female' ? 'text-pink-400' : 'text-[var(--text-muted)]'}`}>
                  {node.genderValue ? node.genderValue.charAt(0).toUpperCase() + node.genderValue.slice(1) : 'Not specified'}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ═══ VALUE SET & CLINICAL CODES ═══ */}
        {(() => {
          // Skip demographics — they don't have value sets
          const isDemographic = node.genderValue != null || isAgeRequirementComponent(node)
            || node.type === 'demographic' || node.metadata?.category === 'demographics';
          if (isDemographic) return null;

          const hasValueSet = node.valueSet || fullValueSets.length > 0;

          return (
            <div className="space-y-3">
              {/* If no value set exists, show Create button */}
              {!hasValueSet ? (
                <div className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-amber-400">No value set defined</span>
                  </div>
                  <button
                    onClick={() => {
                      // Create an empty value set on this element
                      const newVs = { oid: '', name: node.description || '', codes: [] };
                      updateDataElement(measureId, node.id, { valueSet: newVs });
                      setVsOid('');
                      setVsName(node.description || '');
                      setLocalCodes([]);
                      setEditingValueSet(true);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity flex items-center gap-1.5"
                  >
                    <Plus className="w-3 h-3" /> Add Value Set
                  </button>
                </div>
              ) : (
                /* Value Set Editor */
                <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)] space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5" />
                      Value Set
                    </h4>
                    <button
                      onClick={() => setEditingValueSet(!editingValueSet)}
                      className="text-xs text-[var(--accent)] hover:underline"
                    >
                      {editingValueSet ? 'Done' : 'Edit'}
                    </button>
                  </div>

                  {/* OID + Name — always visible, editable when editing */}
                  {editingValueSet ? (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-[10px] font-medium text-[var(--text-dim)] uppercase mb-1">OID</label>
                        <input
                          type="text"
                          value={vsOid}
                          onChange={(e) => setVsOid(e.target.value)}
                          onBlur={() => saveValueSetChanges({ oid: vsOid })}
                          placeholder="2.16.840.1.113883.3.464.1003.101.12.1001"
                          className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs font-mono text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]/50"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-[var(--text-dim)] uppercase mb-1">Name</label>
                        <input
                          type="text"
                          value={vsName}
                          onChange={(e) => setVsName(e.target.value)}
                          onBlur={() => saveValueSetChanges({ name: vsName })}
                          placeholder="Value set name"
                          className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]/50"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-[var(--text)]">{vsName || 'Unnamed value set'}</div>
                      {vsOid && <code className="text-xs text-[var(--text-dim)] block font-mono">{vsOid}</code>}
                    </div>
                  )}

                  {/* VSAC Fetch Button — show when OID exists */}
                  {vsOid && /^\d+\.\d+/.test(vsOid) && (
                    <VsacFetchButton
                      oid={vsOid}
                      apiKey={vsacApiKey}
                      onCodesReceived={(fetchedCodes, fetchedName) => {
                        // Merge fetched codes with existing, avoiding duplicates
                        const existingCodeSet = new Set(localCodes.map(c => `${c.system}|${c.code}`));
                        const newCodes = fetchedCodes.filter(c => !existingCodeSet.has(`${c.system}|${c.code}`));
                        const merged = [...localCodes, ...newCodes];
                        setLocalCodes(merged);
                        // Update name if we got one and current is empty
                        if (fetchedName && !vsName) setVsName(fetchedName);
                        // Persist
                        saveValueSetChanges({
                          codes: merged,
                          ...(fetchedName && !vsName ? { name: fetchedName } : {}),
                        });
                      }}
                    />
                  )}

                  {/* Codes Table */}
                  {localCodes.length > 0 ? (
                    <div className="border border-[var(--border)] rounded overflow-hidden">
                      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-px bg-[var(--border)] text-xs">
                        <div className="bg-[var(--bg-secondary)] px-2 py-1.5 font-semibold text-[var(--text-muted)]">Code</div>
                        <div className="bg-[var(--bg-secondary)] px-2 py-1.5 font-semibold text-[var(--text-muted)]">Display</div>
                        <div className="bg-[var(--bg-secondary)] px-2 py-1.5 font-semibold text-[var(--text-muted)]">System</div>
                        <div className="bg-[var(--bg-secondary)] px-2 py-1.5"></div>
                        {(localCodes.length <= 15 ? localCodes : localCodes.slice(0, 15)).map((code, cIdx) => (
                          <Fragment key={`${code.code}-${cIdx}`}>
                            <div className="bg-[var(--bg)] px-2 py-1.5 font-mono text-[var(--text)] text-[11px]">{code.code}</div>
                            <div className="bg-[var(--bg)] px-2 py-1.5 text-[var(--text)] truncate text-[11px]">{code.display}</div>
                            <div className="bg-[var(--bg)] px-2 py-1.5 text-[var(--text-dim)] text-[11px]">{code.system}</div>
                            <div className="bg-[var(--bg)] px-1 py-1 flex items-center">
                              {editingValueSet && (
                                <button
                                  onClick={() => {
                                    const updated = localCodes.filter((_, i) => i !== cIdx);
                                    setLocalCodes(updated);
                                    saveValueSetChanges({ codes: updated });
                                  }}
                                  className="p-0.5 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </Fragment>
                        ))}
                      </div>
                      {localCodes.length > 15 && (
                        <button
                          onClick={() => onSelectValueSet(fullValueSets[0], nodeId)}
                          className="w-full px-2 py-1.5 text-xs text-[var(--accent)] bg-[var(--bg)] hover:bg-[var(--bg-secondary)] transition-colors text-center"
                        >
                          +{localCodes.length - 15} more — open full editor
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs text-amber-400">No codes defined</span>
                    </div>
                  )}

                  {/* Codes count summary */}
                  {localCodes.length > 0 && (
                    <div className="text-xs text-[var(--text-dim)] flex items-center justify-between">
                      <span>{localCodes.length} codes • {[...new Set(localCodes.map(c => c.system))].join(', ')}</span>
                      <button
                        onClick={() => onSelectValueSet(fullValueSets[0], nodeId)}
                        className="text-[var(--accent)] hover:underline"
                      >
                        Open full editor
                      </button>
                    </div>
                  )}

                  {/* Add Code Form */}
                  {editingValueSet && (
                    <div className="pt-2 border-t border-[var(--border)]/50 space-y-2">
                      {showAddCodeForm ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newCode.code}
                              onChange={(e) => setNewCode({ ...newCode, code: e.target.value })}
                              placeholder="Code"
                              className="w-24 px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)]/50"
                            />
                            <input
                              type="text"
                              value={newCode.display}
                              onChange={(e) => setNewCode({ ...newCode, display: e.target.value })}
                              placeholder="Display name"
                              className="flex-1 px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]/50"
                            />
                            <select
                              value={newCode.system}
                              onChange={(e) => setNewCode({ ...newCode, system: e.target.value })}
                              className="w-20 px-1 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-[var(--text)] focus:outline-none"
                            >
                              <option value="CPT">CPT</option>
                              <option value="ICD10">ICD10</option>
                              <option value="SNOMED">SNOMED</option>
                              <option value="HCPCS">HCPCS</option>
                              <option value="LOINC">LOINC</option>
                              <option value="RxNorm">RxNorm</option>
                              <option value="CVX">CVX</option>
                            </select>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                if (newCode.code.trim()) {
                                  const updated = [...localCodes, { ...newCode }];
                                  setLocalCodes(updated);
                                  saveValueSetChanges({ codes: updated });
                                  setNewCode({ code: '', display: '', system: newCode.system });
                                }
                              }}
                              className="px-3 py-1 text-xs font-medium bg-[var(--accent)] text-white rounded hover:opacity-90"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => { setShowAddCodeForm(false); setNewCode({ code: '', display: '', system: 'CPT' }); }}
                              className="px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowAddCodeForm(true)}
                          className="flex items-center gap-1.5 text-xs font-medium text-[var(--accent)] hover:underline"
                        >
                          <Plus className="w-3 h-3" /> Add Code
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Timing — shared component */}
        <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
          <TimingSection
            timing={nodeTimingAsLibraryFormat(node)}
            onChange={(newTiming) => {
              // Convert library timing format to UMS TimingWindow based on the pattern
              let timingWindow = null;

              // Detect pattern from the timing object
              const isDuringMP = newTiming.operator === 'during' && newTiming.reference !== 'Any';
              const isAnytime = newTiming.reference === 'Any';
              const isLookbackEnd = newTiming.position === 'before end of' && newTiming.quantity;
              const isLookbackStart = newTiming.position === 'before start of' && newTiming.quantity;

              if (isAnytime) {
                // Anytime: clear timing window (null removes constraint)
                timingWindow = null;
              } else if (isDuringMP && !newTiming.quantity) {
                // During MP: start=MP Start, end=MP End, no offsets
                timingWindow = {
                  start: {
                    anchor: 'Measurement Period Start',
                    offsetValue: 0,
                    offsetUnit: 'day(s)',
                    offsetDirection: 'after',
                  },
                  end: {
                    anchor: 'Measurement Period End',
                    offsetValue: 0,
                    offsetUnit: 'day(s)',
                    offsetDirection: 'before',
                  },
                };
              } else if (isLookbackEnd) {
                // Lookback from MP End: start = offset before MP End, end = MP End
                timingWindow = {
                  start: {
                    anchor: 'Measurement Period End',
                    offsetValue: newTiming.quantity,
                    offsetUnit: newTiming.unit ? newTiming.unit.replace(/s$/, '(s)') : 'year(s)',
                    offsetDirection: 'before',
                  },
                  end: {
                    anchor: 'Measurement Period End',
                    offsetValue: 0,
                    offsetUnit: 'day(s)',
                    offsetDirection: 'before',
                  },
                };
              } else if (isLookbackStart) {
                // Lookback from MP Start: start = offset before MP Start, end = MP Start
                timingWindow = {
                  start: {
                    anchor: 'Measurement Period Start',
                    offsetValue: newTiming.quantity,
                    offsetUnit: newTiming.unit ? newTiming.unit.replace(/s$/, '(s)') : 'year(s)',
                    offsetDirection: 'before',
                  },
                  end: {
                    anchor: 'Measurement Period Start',
                    offsetValue: 0,
                    offsetUnit: 'day(s)',
                    offsetDirection: 'before',
                  },
                };
              } else {
                // Advanced/other: use operator-based approach
                timingWindow = {
                  start: {
                    anchor: newTiming.reference === 'Measurement Period Start' ? 'Measurement Period Start' : 'Measurement Period End',
                    offsetValue: newTiming.quantity || 0,
                    offsetUnit: newTiming.unit ? newTiming.unit.replace(/s$/, '(s)') : 'day(s)',
                    offsetDirection: newTiming.position?.includes('before') ? 'before' : 'after',
                  },
                  end: {
                    anchor: 'Measurement Period End',
                    offsetValue: 0,
                    offsetUnit: 'day(s)',
                    offsetDirection: 'before',
                  },
                };
              }

              // Save via the timing window handler (handles shared component warnings)
              if (timingWindow) {
                onSaveTimingWindow(node.id, timingWindow);
              } else {
                // For "Anytime", reset/clear the timing window
                onResetTimingWindow(node.id);
              }
            }}
            dueDateDays={node.dueDateDays ?? deriveDueDateDays(nodeTimingAsLibraryFormat(node), node.type)}
            onDueDateChange={(days) => {
              updateDataElement(measureId, node.id, {
                dueDateDays: days,
                dueDateDaysOverridden: true,
              });
            }}
            dueDateOverridden={node.dueDateDaysOverridden ?? false}
            mpStart={mpStart}
            mpEnd={mpEnd}
            compact={true}
            componentCategory={node.type}
            componentData={{
              name: node.description,
              description: node.description,
              genderValue: node.genderValue,
              resourceType: node.resourceType,
              type: node.type, // 'demographic', 'encounter', etc.
              thresholds: node.thresholds,
            }}
            ageEvaluatedAt={node.ageEvaluatedAt}
            onAgeEvaluatedAtChange={(refValue) => {
              updateDataElement(measureId, node.id, { ageEvaluatedAt: refValue });
            }}
          />
        </div>

        {/* HEDIS-specific fields (only show for HEDIS measures on applicable element types) */}
        {(() => {
          const isHedisMeasure = currentMeasure?.metadata?.program === 'HEDIS';
          const hedisApplicableTypes = ['encounter', 'procedure', 'laboratory', 'medication', 'diagnosis', 'condition'];
          const isApplicableType = hedisApplicableTypes.includes(node.type?.toLowerCase());

          if (!isHedisMeasure || !isApplicableType) return null;

          return (
            <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
              <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5" />
                HEDIS Collection
              </h4>

              {/* Collection Type */}
              <div className="mb-3">
                <label className="block text-[10px] font-medium text-[var(--text-dim)] uppercase mb-1.5">
                  Collection Type
                </label>
                <select
                  value={node.hedis?.collectionType || ''}
                  onChange={(e) => {
                    const newHedis = {
                      ...(node.hedis || {}),
                      collectionType: e.target.value || null,
                    };
                    updateDataElement(measureId, node.id, { hedis: newHedis });
                  }}
                  className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border)] rounded text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]/50"
                >
                  <option value="">Not specified</option>
                  <option value="administrative">Administrative (claims only)</option>
                  <option value="hybrid">Hybrid (claims + medical record)</option>
                  <option value="ecd">ECD (Electronic Clinical Data)</option>
                  <option value="ecds">ECDS (Electronic Clinical Data Systems)</option>
                </select>
              </div>

              {/* Hybrid Source Flag */}
              <label className="flex items-center gap-2 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={node.hedis?.hybridSourceFlag || false}
                  onChange={(e) => {
                    const newHedis = {
                      ...(node.hedis || {}),
                      hybridSourceFlag: e.target.checked,
                    };
                    updateDataElement(measureId, node.id, { hedis: newHedis });
                  }}
                  className="w-4 h-4 rounded border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--accent)] focus:ring-[var(--accent)]/50 focus:ring-offset-0"
                />
                <span className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text)]">
                  Medical Record Review Element
                </span>
              </label>

              {/* Info text */}
              {!node.hedis?.collectionType && (
                <p className="mt-2 text-[10px] text-[var(--text-dim)] italic">
                  Set collection type to specify how this data element is sourced for HEDIS reporting.
                </p>
              )}
            </div>
          );
        })()}

        {/* Editable Additional Requirements */}
        {(node.additionalRequirements && node.additionalRequirements.length > 0) && (
          <div className="p-3 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border)]">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider">Additional Requirements</h4>
              <button
                onClick={addRequirement}
                className="p-1 hover:bg-[var(--bg-secondary)] rounded text-[var(--text-dim)] hover:text-[var(--accent)] transition-colors"
                title="Add requirement"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            <ul className="space-y-2">
              {node.additionalRequirements.map((req, i) => (
                <li key={i} className="group">
                  {editReqIdx === i ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--accent)]/50 rounded-lg text-sm text-[var(--text)] focus:outline-none"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && saveRequirement(i, editValue)}
                      />
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setEditReqIdx(null)} className="px-3 py-1.5 text-xs bg-[var(--bg-secondary)] text-[var(--text-muted)] rounded">Cancel</button>
                        <button onClick={() => saveRequirement(i, editValue)} className="px-3 py-1.5 text-xs bg-[var(--primary)] text-white rounded">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 p-2 bg-[var(--bg-secondary)] rounded group">
                      <span className="text-[var(--accent)] mt-0.5">•</span>
                      <span className="flex-1 text-sm text-[var(--text-muted)]">{req}</span>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditReqIdx(i); setEditValue(req); }}
                          className="p-1 hover:bg-[var(--bg-tertiary)] rounded text-[var(--text-dim)] hover:text-[var(--accent)]"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => removeRequirement(i)}
                          className="p-1 hover:bg-[var(--danger-light)] rounded text-[var(--text-dim)] hover:text-[var(--danger)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={() => updateReviewStatus(measureId, node .id, node.reviewStatus === 'approved' ? 'pending' : 'approved')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              node.reviewStatus === 'approved'
                ? 'bg-[var(--success)] text-white hover:opacity-90'
                : 'bg-[var(--success-light)] text-[var(--success)] hover:opacity-80'
            }`}
          >
            <CheckCircle className={`w-4 h-4 ${node.reviewStatus === 'approved' ? 'fill-white/30' : ''}`} />
            {node.reviewStatus === 'approved' ? 'Approved' : 'Approve'}
          </button>
          <button
            onClick={() => updateReviewStatus(measureId, node .id, node.reviewStatus === 'needs_revision' ? 'pending' : 'needs_revision')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              node.reviewStatus === 'needs_revision'
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-[var(--warning-light)] text-[var(--warning)] hover:opacity-80'
            }`}
          >
            <AlertTriangle className={`w-4 h-4 ${node.reviewStatus === 'needs_revision' ? 'fill-white/30' : ''}`} />
            {node.reviewStatus === 'needs_revision' ? 'Flagged' : 'Flag'}
          </button>
        </div>
      </div>

      {/* Shared code edit confirmation */}
      {showSharedCodeWarning && pendingCodeEdit && (() => {
        const comp = pendingCodeEdit.libraryComponent;
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[var(--bg-secondary)] border border-amber-500/30 rounded-lg p-5 max-w-md mx-4 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-medium text-[var(--text)]">Shared Component</h3>
              </div>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                <strong>"{comp.name}"</strong> is used in <strong>{comp.usage?.usageCount || 1} measures</strong>.
                Changes will update all linked measures.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowSharedCodeWarning(false); setPendingCodeEdit(null); }}
                  className="px-3 py-1.5 text-xs bg-[var(--bg-tertiary)] text-[var(--text-muted)] rounded hover:text-[var(--text)] border border-[var(--border)]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // Apply the pending code edit
                    updateComponent(pendingCodeEdit.componentId, { valueSet: pendingCodeEdit.updates });
                    syncComponentToMeasures(
                      pendingCodeEdit.componentId,
                      { changeDescription: 'Codes updated via UMS Editor', codes: pendingCodeEdit.updates.codes },
                      measures,
                      batchUpdateMeasures,
                    );
                    setShowSharedCodeWarning(false);
                    setPendingCodeEdit(null);
                  }}
                  className="px-4 py-1.5 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 font-medium"
                >
                  Update All {comp.usage?.usageCount || 1} Measures
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ValueSetModal({ valueSet, measureId, elementId, onClose }                                                                                       ) {
  const { addCodeToValueSet, removeCodeFromValueSet, getCorrections, updateMeasure, measures, batchUpdateMeasures } = useMeasureStore();
  const { getComponent, updateComponent, syncComponentToMeasures } = useComponentLibraryStore();
  const { vsacApiKey } = useSettingsStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCode, setNewCode] = useState({ code: '', display: '', system: 'ICD10'               });
  const [showHistory, setShowHistory] = useState(false);
  const [editingCodeIdx, setEditingCodeIdx] = useState               (null);
  const [editCode, setEditCode] = useState({ code: '', display: '', system: 'ICD10'               });

  // VSAC fetch state
  const [vsacLoading, setVsacLoading] = useState(false);
  const [vsacStatus, setVsacStatus] = useState                                                    (null);

  // Shared edit warning state
  const [showSharedWarning, setShowSharedWarning] = useState(false);
  const [pendingCodeAction, setPendingCodeAction] = useState(null);

  // Get corrections related to this value set
  const corrections = getCorrections(measureId).filter(c => c.componentId === valueSet.id);

  const measure = measures.find(m => m.id === measureId);

  // Helper to find element in population tree
  const findElementInTree = useCallback((node, targetId) => {
    if (!node) return null;
    if (node.id === targetId) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findElementInTree(child, targetId);
        if (found) return found;
      }
    }
    if (node.criteria) return findElementInTree(node.criteria, targetId);
    return null;
  }, []);

  // Detect if this element is linked to a library component
  const linkedElement = useMemo(() => {
    if (!elementId || !measure) return null;
    for (const pop of measure.populations) {
      const el = findElementInTree(pop.criteria, elementId);
      if (el) return el;
    }
    return null;
  }, [elementId, measure, findElementInTree]);

  const libraryComponentId = linkedElement?.libraryComponentId;
  const libraryComponent = libraryComponentId ? getComponent(libraryComponentId) : null;
  const isLinkedToLibrary = !!libraryComponent;
  const usageCount = libraryComponent?.usage?.usageCount || 0;

  // Read current value set - LINKED: from library (single source of truth), UNLINKED: from element
  const currentValueSet = useMemo(() => {
    // LINKED: Read from library component (single source of truth)
    if (libraryComponent?.type === 'atomic' && libraryComponent.valueSet) {
      return {
        ...libraryComponent.valueSet,
        id: libraryComponent.valueSet.oid || libraryComponent.id,
        source: 'Library Component',
      };
    }

    // UNLINKED: Read from element in population tree
    if (elementId && measure) {
      for (const pop of measure.populations) {
        const element = findElementInTree(pop.criteria, elementId);
        if (element?.valueSet) return element.valueSet;
      }
    }
    return measure?.valueSets?.find(vs => vs.id === valueSet.id) || valueSet;
  }, [libraryComponent, elementId, measure, valueSet, findElementInTree]);

  // Helper to update element's valueSet in the population tree
  const updateElementValueSet = useCallback((updatedCodes) => {
    if (!elementId || !measure) return null;

    let targetElement = null;
    const findAndUpdateElement = (node) => {
      if (!node) return node;
      if (node.id === elementId) {
        targetElement = node;
        return {
          ...node,
          valueSet: {
            ...node.valueSet,
            codes: updatedCodes,
            totalCodeCount: updatedCodes.length,
          },
        };
      }
      if (node.children) {
        const updatedChildren = node.children.map(findAndUpdateElement);
        const changed = updatedChildren.some((c, i) => c !== node.children[i]);
        return changed ? { ...node, children: updatedChildren } : node;
      }
      if (node.criteria) {
        const updatedCriteria = findAndUpdateElement(node.criteria);
        return updatedCriteria !== node.criteria ? { ...node, criteria: updatedCriteria } : node;
      }
      return node;
    };

    const updatedPopulations = measure.populations.map(pop => ({
      ...pop,
      criteria: pop.criteria ? findAndUpdateElement(pop.criteria) : pop.criteria,
    }));

    updateMeasure(measureId, { populations: updatedPopulations });

    // Note: Library sync is handled by the apply* functions for linked elements.
    // This function is only called for unlinked elements (else branches).

    return targetElement;
  }, [elementId, measure, measureId, updateMeasure]);

  // ═══ APPLY FUNCTIONS: Actually execute code changes ═══
  const applyAddCode = (codeToAdd) => {
    if (isLinkedToLibrary && libraryComponent?.type === 'atomic') {
      // LINKED: Update library → sync ALL measures
      const existingCodes = libraryComponent.valueSet?.codes || [];
      const newCodes = [...existingCodes, codeToAdd];
      updateComponent(libraryComponentId, {
        valueSet: { ...libraryComponent.valueSet, codes: newCodes },
      });
      syncComponentToMeasures(
        libraryComponentId,
        { changeDescription: 'Code added via UMS Editor', codes: newCodes },
        measures,
        batchUpdateMeasures,
      );
    } else {
      // UNLINKED: Update this element only
      addCodeToValueSet(measureId, valueSet.id, codeToAdd, 'User added code manually');
      if (elementId) {
        const existingCodes = currentValueSet.codes || [];
        updateElementValueSet([...existingCodes, codeToAdd]);
      }
    }
    setNewCode({ code: '', display: '', system: 'ICD10' });
    setShowAddForm(false);
  };

  const applyRemoveCode = (codeValue) => {
    if (isLinkedToLibrary && libraryComponent?.type === 'atomic') {
      const updatedCodes = (libraryComponent.valueSet?.codes || []).filter(c => c.code !== codeValue);
      updateComponent(libraryComponentId, {
        valueSet: { ...libraryComponent.valueSet, codes: updatedCodes },
      });
      syncComponentToMeasures(
        libraryComponentId,
        { changeDescription: 'Code removed via UMS Editor', codes: updatedCodes },
        measures,
        batchUpdateMeasures,
      );
    } else {
      removeCodeFromValueSet(measureId, valueSet.id, codeValue, 'User removed code manually');
      if (elementId) {
        const updatedCodes = (currentValueSet.codes || []).filter(c => c.code !== codeValue);
        updateElementValueSet(updatedCodes);
      }
    }
  };

  const applyEditCode = (updatedCodes) => {
    if (isLinkedToLibrary && libraryComponent?.type === 'atomic') {
      updateComponent(libraryComponentId, {
        valueSet: { ...libraryComponent.valueSet, codes: updatedCodes },
      });
      syncComponentToMeasures(
        libraryComponentId,
        { changeDescription: 'Code edited via UMS Editor', codes: updatedCodes },
        measures,
        batchUpdateMeasures,
      );
    } else {
      const updatedValueSets = (measure?.valueSets || []).map(vs =>
        vs.id === valueSet.id ? { ...vs, codes: updatedCodes } : vs
      );
      updateMeasure(measureId, { valueSets: updatedValueSets });
      if (elementId) updateElementValueSet(updatedCodes);
    }
    setEditingCodeIdx(null);
    setEditCode({ code: '', display: '', system: 'ICD10' });
  };

  const applyVsacCodes = (mergedCodes) => {
    if (isLinkedToLibrary && libraryComponent?.type === 'atomic') {
      updateComponent(libraryComponentId, {
        valueSet: { ...libraryComponent.valueSet, codes: mergedCodes },
      });
      syncComponentToMeasures(
        libraryComponentId,
        { changeDescription: 'Codes fetched from VSAC', codes: mergedCodes },
        measures,
        batchUpdateMeasures,
      );
    } else {
      const updatedValueSets = (measure?.valueSets || []).map(vs =>
        vs.id === valueSet.id ? { ...vs, codes: mergedCodes } : vs
      );
      updateMeasure(measureId, { valueSets: updatedValueSets });
      if (elementId) updateElementValueSet(mergedCodes);
    }
  };

  // ═══ HANDLER FUNCTIONS: Check for shared warning, then apply ═══
  const handleAddCode = () => {
    if (!newCode.code.trim() || !newCode.display.trim()) return;
    const codeToAdd = { code: newCode.code.trim(), display: newCode.display.trim(), system: newCode.system };

    if (isLinkedToLibrary && usageCount > 1) {
      setPendingCodeAction({ type: 'add', payload: codeToAdd });
      setShowSharedWarning(true);
      return;
    }
    applyAddCode(codeToAdd);
  };

  const handleRemoveCode = (codeValue        ) => {
    if (!confirm(`Remove code "${codeValue}" from this value set?`)) return;
    if (isLinkedToLibrary && usageCount > 1) {
      setPendingCodeAction({ type: 'remove', payload: codeValue });
      setShowSharedWarning(true);
      return;
    }
    applyRemoveCode(codeValue);
  };

  const handleEditCode = (idx        ) => {
    const code = currentValueSet.codes?.[idx];
    if (code) {
      setEditingCodeIdx(idx);
      setEditCode({ code: code.code, display: code.display, system: code.system });
    }
  };

  const handleSaveEditCode = () => {
    if (editingCodeIdx === null) return;
    const updatedCodes = [...(currentValueSet.codes || [])];
    updatedCodes[editingCodeIdx] = {
      code: editCode.code.trim(), display: editCode.display.trim(), system: editCode.system,
    };
    if (isLinkedToLibrary && usageCount > 1) {
      setPendingCodeAction({ type: 'edit', payload: updatedCodes });
      setShowSharedWarning(true);
      return;
    }
    applyEditCode(updatedCodes);
  };

  const handleFetchFromVSAC = async () => {
    const oid = currentValueSet.oid;
    if (!oid) {
      setVsacStatus({ type: 'error', message: 'This value set has no OID' });
      return;
    }
    if (!vsacApiKey) {
      setVsacStatus({ type: 'error', message: 'Set your VSAC API key in Settings first' });
      return;
    }

    setVsacLoading(true);
    setVsacStatus(null);

    try {
      const result = await fetchValueSetExpansion(oid, vsacApiKey);
      const existingCodes = new Set((currentValueSet.codes || []).map(c => c.code));
      const newCodes = result.codes.filter(c => !existingCodes.has(c.code));

      if (newCodes.length > 0) {
        const mergedCodes = [...(currentValueSet.codes || []), ...newCodes];

        if (isLinkedToLibrary && usageCount > 1) {
          setPendingCodeAction({ type: 'vsac', payload: mergedCodes });
          setShowSharedWarning(true);
        } else {
          applyVsacCodes(mergedCodes);
        }
      }

      setVsacStatus({
        type: 'success',
        message: `Added ${newCodes.length} codes from VSAC (${result.total} total, ${result.codes.length - newCodes.length} already existed)`,
      });
    } catch (err) {
      setVsacStatus({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setVsacLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[min(900px,90vw)] max-h-[85vh] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-[var(--text)]">{currentValueSet.name}</h2>
              {currentValueSet.verified && (
                <span className="px-2 py-0.5 text-xs bg-[var(--success-light)] text-[var(--success)] rounded">VSAC Verified</span>
              )}
              {corrections.length > 0 && (
                <span className="px-2 py-0.5 text-xs bg-purple-500/15 text-purple-400 rounded flex items-center gap-1">
                  <History className="w-3 h-3" />
                  {corrections.length} edit{corrections.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            {currentValueSet.oid && (
              <code className="text-sm text-[var(--text-muted)]">{currentValueSet.oid}</code>
            )}
            <div className="text-xs text-[var(--text-dim)] mt-1">
              {currentValueSet.source} {currentValueSet.version && `• Version ${currentValueSet.version}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Fetch from VSAC button */}
            {currentValueSet.oid && (
              <button
                onClick={handleFetchFromVSAC}
                disabled={vsacLoading || !vsacApiKey}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  vsacLoading
                    ? 'border-[var(--accent)]/30 text-[var(--accent)]/60'
                    : 'border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent-light)]'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
                title={!vsacApiKey ? 'Set VSAC API key in Settings' : `Fetch codes for ${currentValueSet.oid}`}
              >
                {vsacLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {vsacLoading ? 'Fetching...' : 'Fetch from VSAC'}
              </button>
            )}
            {corrections.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2 rounded-lg transition-colors ${showHistory ? 'bg-purple-500/15 text-purple-400' : 'hover:bg-[var(--bg-tertiary)] text-[var(--text-muted)]'}`}
                title="View edit history"
              >
                <History className="w-5 h-5" />
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg">
              <X className="w-5 h-5 text-[var(--text-muted)]" />
            </button>
          </div>
        </div>

        {/* Shared component banner */}
        {isLinkedToLibrary && usageCount > 1 && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span className="text-xs text-amber-400">
              Shared component — code changes will update <strong>{usageCount} measures</strong>
            </span>
          </div>
        )}

        {/* VSAC Status */}
        {vsacStatus && (
          <div className={`px-4 py-2 text-xs border-b ${
            vsacStatus.type === 'success'
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            {vsacStatus.message}
          </div>
        )}

        {/* Edit history panel */}
        {showHistory && corrections.length > 0 && (
          <div className="p-4 bg-purple-500/5 border-b border-purple-500/20">
            <h3 className="text-sm font-medium text-purple-400 mb-2 flex items-center gap-2">
              <History className="w-4 h-4" />
              Edit History (for AI training)
            </h3>
            <div className="space-y-2 max-h-32 overflow-auto">
              {corrections.map((c) => (
                <div key={c.id} className="text-xs p-2 bg-[var(--bg-tertiary)] rounded flex items-start justify-between">
                  <div>
                    <span className={`font-medium ${c.correctionType === 'code_added' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                      {c.correctionType === 'code_added' ? '+ Added' : '- Removed'}
                    </span>
                    <span className="text-[var(--text-muted)] ml-2">
                      {c.correctionType === 'code_added'
                        ? `${(c.correctedValue                   )?.slice(-1)[0]?.code || 'code'}`
                        : `${(c.originalValue                 )?.code || 'code'}`
                      }
                    </span>
                  </div>
                  <span className="text-[var(--text-dim)]">{new Date(c.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add code form */}
        {showAddForm && (
          <div className="p-4 bg-[var(--accent-light)] border-b border-[var(--accent)]/20">
            <h3 className="text-sm font-medium text-[var(--accent)] mb-3">Add New Code</h3>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="text-xs text-[var(--text-muted)] block mb-1">Code</label>
                <input
                  type="text"
                  value={newCode.code}
                  onChange={(e) => setNewCode({ ...newCode, code: e.target.value })}
                  placeholder="e.g., I10.1"
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]/50"
                />
              </div>
              <div className="flex-[2]">
                <label className="text-xs text-[var(--text-muted)] block mb-1">Display Name</label>
                <input
                  type="text"
                  value={newCode.display}
                  onChange={(e) => setNewCode({ ...newCode, display: e.target.value })}
                  placeholder="e.g., Benign essential hypertension"
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]/50"
                />
              </div>
              <div className="w-32">
                <label className="text-xs text-[var(--text-muted)] block mb-1">System</label>
                <select
                  value={newCode.system}
                  onChange={(e) => setNewCode({ ...newCode, system: e.target.value               })}
                  className="w-full px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)]/50"
                >
                  <option value="ICD10">ICD-10</option>
                  <option value="SNOMED">SNOMED</option>
                  <option value="CPT">CPT</option>
                  <option value="HCPCS">HCPCS</option>
                  <option value="LOINC">LOINC</option>
                  <option value="RxNorm">RxNorm</option>
                  <option value="CVX">CVX</option>
                </select>
              </div>
              <button
                onClick={handleAddCode}
                disabled={!newCode.code.trim() || !newCode.display.trim()}
                className="px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-muted)] rounded-lg text-sm hover:text-[var(--text)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="px-4 py-2 border-b border-[var(--border)] flex items-center justify-between bg-[var(--bg-tertiary)]">
          <div className="text-sm text-[var(--text-muted)]">
            {currentValueSet.codes?.length || 0} codes
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-3 py-1.5 bg-[var(--accent-light)] text-[var(--accent)] rounded-lg text-sm font-medium hover:bg-[var(--accent)]/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Code
          </button>
        </div>

        {/* Codes table */}
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--bg-secondary)]">
              <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border)]">
                <th className="pb-2 pr-4 font-medium">Code</th>
                <th className="pb-2 pr-4 font-medium">Display Name</th>
                <th className="pb-2 pr-4 font-medium">System</th>
                <th className="pb-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {currentValueSet.codes && currentValueSet.codes.length > 0 ? (
                currentValueSet.codes.map((code, i) => (
                  editingCodeIdx === i ? (
                    <tr key={`edit-${i}`} className="border-b border-[var(--accent)]/30 bg-[var(--accent-light)]">
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={editCode.code}
                          onChange={(e) => setEditCode({ ...editCode, code: e.target.value })}
                          className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--accent)]/50 rounded text-sm text-[var(--accent)] font-mono focus:outline-none"
                          autoFocus
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="text"
                          value={editCode.display}
                          onChange={(e) => setEditCode({ ...editCode, display: e.target.value })}
                          className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--accent)]/50 rounded text-sm text-[var(--text)] focus:outline-none"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <select
                          value={editCode.system}
                          onChange={(e) => setEditCode({ ...editCode, system: e.target.value               })}
                          className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--accent)]/50 rounded text-sm text-[var(--text)] focus:outline-none"
                        >
                          <option value="ICD10">ICD-10</option>
                          <option value="SNOMED">SNOMED</option>
                          <option value="CPT">CPT</option>
                          <option value="HCPCS">HCPCS</option>
                          <option value="LOINC">LOINC</option>
                          <option value="RxNorm">RxNorm</option>
                          <option value="CVX">CVX</option>
                        </select>
                      </td>
                      <td className="py-2">
                        <div className="flex gap-1">
                          <button
                            onClick={handleSaveEditCode}
                            className="p-1.5 text-[var(--success)] hover:bg-[var(--success-light)] rounded"
                            title="Save"
                          >
                            <Save className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingCodeIdx(null)}
                            className="p-1.5 text-[var(--text-dim)] hover:text-[var(--text)] hover:bg-[var(--bg-tertiary)] rounded"
                            title="Cancel"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={`${code.code}-${i}`} className="border-b border-[var(--border-light)] group hover:bg-[var(--bg-tertiary)]">
                      <td className="py-2 pr-4">
                        <code className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--accent)]">
                          {code.code}
                        </code>
                      </td>
                      <td className="py-2 pr-4 text-[var(--text)]">{code.display}</td>
                      <td className="py-2 pr-4 text-[var(--text-muted)]">{code.system}</td>
                      <td className="py-2">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button
                            onClick={() => handleEditCode(i)}
                            className="p-1.5 text-[var(--text-dim)] hover:text-[var(--accent)] hover:bg-[var(--accent-light)] rounded"
                            title="Edit code"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveCode(code.code)}
                            className="p-1.5 text-[var(--text-dim)] hover:text-[var(--danger)] hover:bg-[var(--danger-light)] rounded"
                            title="Remove code"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[var(--text-muted)]">
                    No codes in this value set. Click "Add Code" to add one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {currentValueSet.totalCodeCount && currentValueSet.codes && currentValueSet.totalCodeCount > currentValueSet.codes.length && (
            <p className="mt-4 text-sm text-[var(--text-muted)] text-center">
              Showing {currentValueSet.codes.length} of {currentValueSet.totalCodeCount} codes.
              <button className="text-[var(--accent)] hover:underline ml-1">Load all codes</button>
            </p>
          )}
        </div>

        {/* Footer with training info */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--bg-tertiary)] text-xs text-[var(--text-dim)] flex items-center justify-between">
          <span>All edits are tracked for AI training feedback</span>
          {corrections.length > 0 && (
            <button className="flex items-center gap-1 text-purple-400 hover:text-purple-300">
              <Download className="w-3 h-3" />
              Export corrections
            </button>
          )}
        </div>

        {/* Shared edit confirmation dialog */}
        {showSharedWarning && pendingCodeAction && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 rounded-xl">
            <div className="bg-[var(--bg-secondary)] border border-amber-500/30 rounded-lg p-5 max-w-md mx-4 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-medium text-[var(--text)]">Shared Component</h3>
              </div>
              <p className="text-sm text-[var(--text-muted)] mb-1">
                <strong>"{currentValueSet.name}"</strong> is used in <strong>{usageCount} measures</strong>.
              </p>
              <p className="text-sm text-[var(--text-muted)] mb-4">
                {pendingCodeAction.type === 'add' && 'Adding this code will update all linked measures.'}
                {pendingCodeAction.type === 'remove' && 'Removing this code will update all linked measures.'}
                {pendingCodeAction.type === 'edit' && 'Editing this code will update all linked measures.'}
                {pendingCodeAction.type === 'vsac' && 'Fetched codes will be applied to all linked measures.'}
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowSharedWarning(false); setPendingCodeAction(null); }}
                  className="px-3 py-1.5 text-xs bg-[var(--bg-tertiary)] text-[var(--text-muted)] rounded hover:text-[var(--text)] border border-[var(--border)]"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowSharedWarning(false);
                    const action = pendingCodeAction;
                    setPendingCodeAction(null);
                    if (action.type === 'add') applyAddCode(action.payload);
                    else if (action.type === 'remove') applyRemoveCode(action.payload);
                    else if (action.type === 'edit') applyEditCode(action.payload);
                    else if (action.type === 'vsac') applyVsacCodes(action.payload);
                  }}
                  className="px-4 py-1.5 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 font-medium"
                >
                  Update All {usageCount} Measures
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Standard Value Set Browser modal
function StandardValueSetBrowser({
  measureId: _measureId,
  existingOids,
  onImport,
  onClose,
}   
                    
                            
                                           
                      
 ) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVS, setSelectedVS] = useState                         (null);
  const [categoryFilter, setCategoryFilter] = useState                                   ('all');

  const allValueSets = getAllStandardValueSets();

  // Filter value sets
  const filteredValueSets = searchQuery
    ? searchStandardValueSets(searchQuery)
    : allValueSets.filter(vs => {
        if (categoryFilter === 'all') return true;
        if (categoryFilter === 'screening') {
          return ['colonoscopy', 'fobt', 'fit-dna', 'flexible-sigmoidoscopy', 'ct-colonography'].includes(vs.id);
        }
        if (categoryFilter === 'exclusion') {
          return ['colorectal-cancer', 'total-colectomy', 'hospice-care', 'frailty', 'dementia'].includes(vs.id);
        }
        return true;
      });

  const handleImport = (vs                  ) => {
    onImport(vs);
    // Keep modal open for more imports
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-[min(1100px,95vw)] h-[85vh] bg-[var(--bg-secondary)] border border-[var(--border)] rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-[var(--border)] flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-[var(--text)] flex items-center gap-2">
              <LibraryIcon className="w-5 h-5 text-[var(--accent)]" />
              Standard Value Set Library
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              Browse and import VSAC-published value sets with complete code lists
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg">
            <X className="w-5 h-5 text-[var(--text-muted)]" />
          </button>
        </div>

        {/* Search and filters */}
        <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-tertiary)]">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-dim)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, OID, or code..."
                className="w-full pl-10 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg text-sm text-[var(--text)] placeholder:text-[var(--text-dim)] focus:outline-none focus:border-[var(--accent)]/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCategoryFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  categoryFilter === 'all'
                    ? 'bg-[var(--accent-light)] text-[var(--accent)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setCategoryFilter('screening')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  categoryFilter === 'screening'
                    ? 'bg-[var(--success-light)] text-[var(--success)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                Screening
              </button>
              <button
                onClick={() => setCategoryFilter('exclusion')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  categoryFilter === 'exclusion'
                    ? 'bg-[var(--danger-light)] text-[var(--danger)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                Exclusions
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Value set list */}
          <div className="w-1/2 border-r border-[var(--border)] overflow-auto p-4 space-y-2">
            {filteredValueSets.map((vs) => {
              const isImported = existingOids.has(vs.oid);
              return (
                <button
                  key={vs.id}
                  onClick={() => setSelectedVS(vs)}
                  className={`w-full p-3 rounded-lg border text-left transition-colors ${
                    selectedVS?.id === vs.id
                      ? 'bg-[var(--accent-light)] border-[var(--accent)]/50'
                      : 'bg-[var(--bg-tertiary)] border-[var(--border)] hover:border-[var(--text-dim)]'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-[var(--text)] flex items-center gap-2">
                        {vs.name}
                        {isImported && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-[var(--success-light)] text-[var(--success)] rounded">
                            Imported
                          </span>
                        )}
                      </div>
                      <code className="text-xs text-[var(--text-dim)] mt-1 block">{vs.oid}</code>
                      <div className="text-xs text-[var(--accent)] mt-1">
                        {vs.codes.length} codes
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredValueSets.length === 0 && (
              <div className="text-center py-8 text-[var(--text-muted)]">
                No value sets found matching your search.
              </div>
            )}
          </div>

          {/* Value set detail */}
          <div className="w-1/2 overflow-auto">
            {selectedVS ? (
              <div className="p-4">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-[var(--text)]">{selectedVS.name}</h3>
                    <code className="text-sm text-[var(--text-muted)]">{selectedVS.oid}</code>
                  </div>
                  <button
                    onClick={() => handleImport(selectedVS)}
                    disabled={existingOids.has(selectedVS.oid)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                      existingOids.has(selectedVS.oid)
                        ? 'bg-[var(--success-light)] text-[var(--success)] cursor-not-allowed'
                        : 'bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]'
                    }`}
                  >
                    {existingOids.has(selectedVS.oid) ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Already Imported
                      </>
                    ) : (
                      <>
                        <Import className="w-4 h-4" />
                        Import to Measure
                      </>
                    )}
                  </button>
                </div>

                <div className="mb-4 p-3 bg-[var(--bg-tertiary)] rounded-lg">
                  <div className="text-xs text-[var(--text-muted)] mb-1">Codes by System</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(
                      selectedVS.codes.reduce((acc, c) => {
                        const system = c.system.split('/').pop() || c.system;
                        acc[system] = (acc[system] || 0) + 1;
                        return acc;
                      }, {}                          )
                    ).map(([system, count]) => (
                      <span key={system} className="px-2 py-1 text-xs bg-[var(--bg-secondary)] text-[var(--text-muted)] rounded">
                        {system}: {count}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Code list */}
                <div className="border border-[var(--border)] rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--bg-tertiary)]">
                      <tr className="text-left text-[var(--text-muted)]">
                        <th className="px-3 py-2 font-medium">Code</th>
                        <th className="px-3 py-2 font-medium">Display</th>
                        <th className="px-3 py-2 font-medium">System</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedVS.codes.map((code, i) => (
                        <tr key={i} className="border-t border-[var(--border-light)]">
                          <td className="px-3 py-2">
                            <code className="px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--accent)] text-xs">
                              {code.code}
                            </code>
                          </td>
                          <td className="px-3 py-2 text-[var(--text)]">{code.display}</td>
                          <td className="px-3 py-2 text-[var(--text-muted)] text-xs">
                            {code.system.split('/').pop()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--text-muted)]">
                <div className="text-center">
                  <LibraryIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Select a value set to view its codes</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-[var(--border)] bg-[var(--bg-tertiary)] text-xs text-[var(--text-dim)]">
          Standard value sets sourced from VSAC (Value Set Authority Center). OIDs reference authoritative published definitions.
        </div>
      </div>
    </div>
  );
}

// Age range editor with number inputs
// QA-FLAG: Confirmed unused, candidate for removal
// eslint-disable-next-line no-unused-vars
function AgeRangeEditor({ min, max, onSave, onCancel }                                                                                                ) {
  const [minAge, setMinAge] = useState(min);
  const [maxAge, setMaxAge] = useState(max);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="text-xs text-[var(--text-muted)] block mb-1">Min Age</label>
          <input
            type="number"
            value={minAge}
            onChange={(e) => setMinAge(parseInt(e.target.value) || 0)}
            min={0}
            max={120}
            className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--accent)]/50 rounded-lg text-lg font-bold text-[var(--accent)] focus:outline-none text-center"
          />
        </div>
        <span className="text-[var(--text-muted)] mt-5">to</span>
        <div className="flex-1">
          <label className="text-xs text-[var(--text-muted)] block mb-1">Max Age</label>
          <input
            type="number"
            value={maxAge}
            onChange={(e) => setMaxAge(parseInt(e.target.value) || 0)}
            min={0}
            max={120}
            className="w-full px-3 py-2 bg-[var(--bg-secondary)] border border-[var(--accent)]/50 rounded-lg text-lg font-bold text-[var(--accent)] focus:outline-none text-center"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 text-xs bg-[var(--bg-secondary)] text-[var(--text-muted)] rounded hover:text-[var(--text)]">
          Cancel
        </button>
        <button onClick={() => onSave(minAge, maxAge)} className="px-3 py-1.5 text-xs bg-[var(--primary)] text-white rounded hover:bg-[var(--primary-hover)]">
          Save
        </button>
      </div>
    </div>
  );
}

function ComplexityBadge({ level, size = 'md' }                                                ) {
  const colors                                  = {
    low: 'bg-[var(--success-light)] text-[var(--success)] border-[var(--success)]/30',
    medium: 'bg-[var(--warning-light)] text-[var(--warning)] border-[var(--warning)]/30',
    high: 'bg-[var(--danger-light)] text-[var(--danger)] border-[var(--danger)]/30',
  };

  const dots                                  = {
    low: '\u25CB',
    medium: '\u25CF\u25CF',
    high: '\u25CF\u25CF\u25CF',
  };

  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${colors[level]} ${size === 'sm' ? 'text-[10px]' : 'text-xs'}`}>
      <span>{dots[level]}</span>
      {level}
    </span>
  );
}

function LibraryStatusBadge({ component, size = 'sm' }                                                                 ) {
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  if (!component) {
    // Fallback: linked but component not found in library
    return (
      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${textSize} bg-[var(--accent-light)] text-[var(--accent)] border-[var(--accent)]/30`} title="Linked to component library">
        <Link className={iconSize} />
        Library
      </span>
    );
  }

  const isApproved = component.versionInfo.status === 'approved';
  const usageCount = component.usage?.usageCount ?? component.usage?.measureIds?.length ?? 0;
  const isWidelyUsed = usageCount >= 3;

  if (isApproved && isWidelyUsed) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${textSize} bg-[var(--success-light)] text-[var(--success)] border-[var(--success)]/30`}
        title={`${component.name} — Approved and used in ${usageCount} measures`}
      >
        <ShieldCheck className={iconSize} />
        Verified · Used in {usageCount} measures
      </span>
    );
  }

  if (isApproved) {
    const usageLabel = usageCount === 1 ? '1 measure' : `${usageCount} measures`;
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${textSize} bg-[var(--accent-light)] text-[var(--accent)] border-[var(--accent)]/30`}
        title={`${component.name} — Approved, used in ${usageLabel}`}
      >
        <CheckCircle className={iconSize} />
        Approved · Used in {usageLabel}
      </span>
    );
  }

  // Draft or pending
  const statusLabel = component.versionInfo.status === 'pending_review' ? 'Pending' : 'Draft';
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${textSize} bg-[var(--bg-tertiary)] text-[var(--text-dim)] border-[var(--border)]`}
      title={`${component.name} — ${statusLabel}`}
    >
      <Link className={iconSize} />
      Library · {statusLabel}
    </span>
  );
}

/**
 * OID Validation Badge - shows warning for components with invalid or unknown OIDs
 */
function OIDValidationBadge({ component, size = 'sm' }                                                                 ) {
  const textSize = size === 'sm' ? 'text-[10px]' : 'text-xs';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  // Only show for atomic components with oidValidation issues
  if (!component || component.type !== 'atomic') return null;

  const validation = component.oidValidation;
  if (!validation) return null;

  // Don't show for valid OIDs in catalog
  if (validation.status === 'valid' && validation.inCatalog) return null;

  const isInvalid = validation.status === 'invalid';
  const isUnknown = validation.status === 'unknown';
  const hasWarnings = validation.warnings && validation.warnings.length > 0;

  // Show nothing if status is valid with no warnings
  if (validation.status === 'valid' && !hasWarnings) return null;

  // Build tooltip message
  const messages           = [];
  if (validation.errors) messages.push(...validation.errors);
  if (validation.warnings) messages.push(...validation.warnings);
  const tooltipText = messages.join(' • ') || 'OID validation issue';

  if (isInvalid) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${textSize} bg-red-500/10 text-red-600 border-red-500/30`}
        title={tooltipText}
      >
        <AlertTriangle className={iconSize} />
        Invalid OID
      </span>
    );
  }

  if (isUnknown || hasWarnings) {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${textSize} bg-amber-500/10 text-amber-600 border-amber-500/30`}
        title={tooltipText}
      >
        <AlertTriangle className={iconSize} />
        {isUnknown ? 'Unknown OID' : 'OID Warning'}
      </span>
    );
  }

  return null;
}

/**
 * OID Validation Warning - inline warning box for components with OID issues (used in card view)
 */
function OIDValidationWarning({ component }                                 ) {
  if (component.type !== 'atomic') return null;

  const validation = component.oidValidation;
  if (!validation) return null;

  // Check if there are any issues to display
  const hasIssues = validation.status === 'invalid' ||
    validation.status === 'unknown' ||
    (validation.warnings && validation.warnings.length > 0);

  if (!hasIssues) return null;

  const isInvalid = validation.status === 'invalid';
  const messages = [...(validation.errors || []), ...(validation.warnings || [])];

  return (
    <div className={`mt-2 px-2 py-1.5 rounded-lg flex items-center gap-2 ${
      isInvalid
        ? 'bg-red-500/10 border border-red-500/30'
        : 'bg-amber-500/10 border border-amber-500/30'
    }`}>
      <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${
        isInvalid ? 'text-red-500' : 'text-amber-500'
      }`} />
      <div className="flex-1 min-w-0">
        <span className={`text-xs font-medium ${
          isInvalid ? 'text-red-400' : 'text-amber-400'
        }`}>
          {isInvalid ? 'Invalid OID' : 'OID Not Recognized'}
        </span>
        {messages.length > 0 && (
          <p className="text-[10px] text-[var(--text-dim)] truncate">
            {messages[0]}
          </p>
        )}
      </div>
    </div>
  );
}

function ComponentLibraryIndicator({ component }                                 ) {
  const isApproved = component.versionInfo.status === 'approved';
  const usageCount = component.usage?.usageCount ?? component.usage?.measureIds?.length ?? 0;
  const isShared = usageCount > 1;

  // Get value sets info for atomic components
  const valueSets = component.type === 'atomic'
    ? (component.valueSets || [component.valueSet])
    : [];
  const hasMultipleValueSets = valueSets.length > 1;
  const totalCodes = valueSets.reduce((sum, vs) => sum + (vs.codes?.length || 0), 0);

  // Don't show if not linked to library
  if (!component) return null;

  return (
    <div
      className={`mt-2 px-2.5 py-2 rounded-lg border transition-all ${
        isApproved
          ? 'bg-[var(--success)]/5 border-[var(--success)]/20'
          : 'bg-[var(--bg-secondary)] border-[var(--border)]'
      }`}
    >
      <div className="flex items-center gap-3">
        {/* Library link icon */}
        <div className={`flex-shrink-0 p-1.5 rounded-full ${
          isApproved ? 'bg-[var(--success)]/10' : 'bg-[var(--bg-tertiary)]'
        }`}>
          {isApproved ? (
            <ShieldCheck className={`w-4 h-4 ${isApproved ? 'text-[var(--success)]' : 'text-[var(--text-dim)]'}`} />
          ) : (
            <Link className="w-4 h-4 text-[var(--text-dim)]" />
          )}
        </div>

        {/* Component info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${isApproved ? 'text-[var(--success)]' : 'text-[var(--text-muted)]'}`}>
              {isApproved ? 'Approved Component' : 'Draft Component'}
            </span>
            {isShared && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] font-medium">
                Shared
              </span>
            )}
            {hasMultipleValueSets && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">
                {valueSets.length} Value Sets
              </span>
            )}
          </div>
          <p className="text-[11px] text-[var(--text-dim)] truncate" title={component.name}>
            {component.name}
          </p>
        </div>

        {/* Usage count */}
        {usageCount > 0 && (
          <div className="flex-shrink-0 text-right">
            <div className={`text-sm font-semibold ${isShared ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
              {usageCount}
            </div>
            <div className="text-[10px] text-[var(--text-dim)]">
              {usageCount === 1 ? 'measure' : 'measures'}
            </div>
          </div>
        )}
      </div>

      {/* OID Validation Warning */}
      <OIDValidationWarning component={component} />

      {/* Multiple value sets detail */}
      {hasMultipleValueSets && (
        <div className="mt-2 pt-2 border-t border-[var(--border)]/50">
          <div className="text-[10px] text-[var(--text-dim)] uppercase tracking-wider mb-1">Combined Value Sets</div>
          <div className="flex flex-wrap gap-1">
            {valueSets.map((vs, i) => (
              <span
                key={vs.oid || i}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-muted)]"
                title={vs.oid}
              >
                {vs.name} ({vs.codes?.length || 0})
              </span>
            ))}
          </div>
          <div className="mt-1 text-[10px] text-[var(--text-dim)]">
            Total: {totalCodes} codes
          </div>
        </div>
      )}
    </div>
  );
}
