import { useState, useCallback, useMemo } from 'react';
import {
  X,
  Edit3,
  CheckCircle,
  Archive,
  Copy,
  Clock,
  Tag,
  Link,
  Layers,
  Atom,
  GitBranch,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Code,
  ExternalLink,
  Code2,
} from 'lucide-react';

// Note: setActiveTab was removed as it was unused - setActiveMeasure handles tab switching internally
import { useComponentLibraryStore } from '../../stores/componentLibraryStore';
import { useMeasureStore } from '../../stores/measureStore';
import { useComponentCodeStore, getStoreKey } from '../../stores/componentCodeStore';
import { getComplexityColor, getComplexityDots } from '../../services/complexityCalculator';
import { ComponentCodeViewer } from '../measure/ComponentCodeViewer';
// QA-FLAG: createDefaultComponentCodeState may be used for future code state initialization
import { createDefaultComponentCodeState as _createDefaultComponentCodeState } from '../../types/componentCode';

// ============================================================================
// Props
// ============================================================================

// ============================================================================
// Status Badge Helper
// ============================================================================

function getStatusConfig(status        )                                              {
  switch (status) {
    case 'draft':
      return { label: 'Draft', bg: 'bg-yellow-500/15', text: 'text-yellow-500' };
    case 'pending_review':
      return { label: 'Pending Review', bg: 'bg-blue-500/15', text: 'text-blue-500' };
    case 'approved':
      return { label: 'Approved', bg: 'bg-green-500/15', text: 'text-green-500' };
    case 'archived':
      return { label: 'Archived', bg: 'bg-gray-500/15', text: 'text-gray-400' };
    default:
      return { label: status, bg: 'bg-gray-500/15', text: 'text-gray-400' };
  }
}

function formatDate(dateStr        )         {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ============================================================================
// Library Component to DataElement Converter
// ============================================================================

/**
 * Converts an AtomicComponent from the library to a DataElement
 * so it can be used with the ComponentCodeViewer
 */
function libraryComponentToDataElement(component                 )              {
  // Map component metadata.category to DataElement type
  const categoryToTypeMap                                      = {
    diagnoses: 'diagnosis',
    procedures: 'procedure',
    encounters: 'encounter',
    observations: 'observation',
    medications: 'medication',
    demographics: 'demographic',
    assessments: 'assessment',
    immunizations: 'immunization',
  };

  const elementType = categoryToTypeMap[component.metadata.category] || 'assessment';

  return {
    id: component.id,
    type: elementType,
    description: component.name,
    valueSet: component.valueSet ? {
      id: component.valueSet.oid || component.id,
      name: component.valueSet.name,
      oid: component.valueSet.oid,
      codes: component.valueSet.codes || [],
      confidence: 'high'                   ,
      totalCodeCount: component.valueSet.codes?.length || 0,
    } : undefined,
    negation: component.negation,
    // Convert library timing to DataElement timing format
    // Timing is primarily used for code generation via the displayExpression
    libraryComponentId: component.id,
    reviewStatus: 'approved',
    confidence: 'high'                   ,
  };
}

// ============================================================================
// Library Code Viewer Sub-Component
// ============================================================================

function LibraryCodeViewer({ component }                        ) {
  // Use "library" as the measureId for library-scoped overrides
  const LIBRARY_MEASURE_ID = 'library';
  const storeKey = getStoreKey(LIBRARY_MEASURE_ID, component.id);

  // Subscribe to code state from store
  const codeState = useComponentCodeStore((state) => state.codeStates[storeKey]);
  const defaultFormat = useComponentCodeStore((state) => state.defaultFormat);
  const setSelectedFormat = useComponentCodeStore((state) => state.setSelectedFormat);

  // Create effective code state - fallback to default if not in store yet
  const effectiveCodeState                     = codeState ?? {
    componentId: storeKey,
    overrides: {},
    selectedFormat: defaultFormat,
    isEditing: false,
    pendingNote: '',
  };

  // Convert library component to DataElement for code generation
  const dataElement = useMemo(() => {
    return libraryComponentToDataElement(component);
  }, [component]);

  // Handle code state changes
  const handleCodeStateChange = useCallback((newState                    ) => {
    // Update the format selection - this creates the state if it doesn't exist
    if (newState.selectedFormat !== effectiveCodeState.selectedFormat) {
      setSelectedFormat(storeKey, newState.selectedFormat);
    }
  }, [storeKey, effectiveCodeState.selectedFormat, setSelectedFormat]);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)]">
        <Code2 size={14} className="text-[var(--primary)]" />
        <span className="text-sm font-medium text-[var(--text)]">Generated Code</span>
      </div>
      <ComponentCodeViewer
        key={component.id}  // Force remount when component changes to reset edit state
        element={dataElement}
        measureId={LIBRARY_MEASURE_ID}
        codeState={effectiveCodeState}
        onCodeStateChange={handleCodeStateChange}
        isLibraryLinked={false}
        className="border-0 rounded-none"
      />
    </div>
  );
}

// ============================================================================
// Component Detail
// ============================================================================

export function ComponentDetail({ componentId, onClose, onEdit }                      ) {
  const { getComponent, approve, archiveComponentVersion, addComponent } =
    useComponentLibraryStore();
  const { measures, setActiveMeasure } = useMeasureStore();

  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  const component = getComponent(componentId);

  // Create a lookup map for measure names (supports both UUID and CMS ID)
  const measureLookup = useMemo(() => {
    const lookup = new Map();
    for (const m of measures) {
      lookup.set(m.id, m); // UUID
      if (m.metadata?.measureId) {
        lookup.set(m.metadata.measureId, m); // CMS ID (e.g., CMS122v12)
      }
    }
    return lookup;
  }, [measures]);

  // Helper to find a DataElement in the criteria tree that links to a library component
  const findElementByLibraryComponentId = (
    node                                    ,
    libraryComponentId        
                 ) => {
    if (!node) return null;

    // Check if this is a DataElement with the matching libraryComponentId
    if ('type' in node && (node               ).libraryComponentId === libraryComponentId) {
      return (node               ).id;
    }

    // If it's a clause, search children
    if ('children' in node && (node                 ).children) {
      for (const child of (node                 ).children) {
        const found = findElementByLibraryComponentId(child                               , libraryComponentId);
        if (found) return found;
      }
    }

    return null;
  };

  // Navigate to a measure in the UMS Editor and select the specific component
  const handleNavigateToMeasure = (measureId        ) => {
    const measure = measureLookup.get(measureId);
    if (!measure) {
      console.warn(`[ComponentDetail] Measure not found for ID: ${measureId}`);
      return;
    }

    // Find the DataElement in this measure that links to the current library component
    let targetElementId                = null;
    for (const population of measure.populations) {
      if (population.criteria) {
        targetElementId = findElementByLibraryComponentId(
          population.criteria                               ,
          componentId
        );
        if (targetElementId) break;
      }
    }

    // Set the inspecting component ID so UMS Editor will select it
    if (targetElementId) {
      useComponentCodeStore.getState().setInspectingComponent(targetElementId);
    }

    // Navigate to the measure using its internal UUID (not CMS ID)
    // setActiveMeasure already switches to editor tab
    setActiveMeasure(measure.id);
  };

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------

  const handleApprove = useCallback(() => {
    approve(componentId, 'current-user');
  }, [approve, componentId]);

  const handleArchive = useCallback(() => {
    if (!component) return;
    archiveComponentVersion(componentId, component.versionInfo.versionId);
    setArchiveConfirmOpen(false);
  }, [archiveComponentVersion, component, componentId]);

  const handleDuplicate = useCallback(() => {
    if (!component) return;
    const duplicated = {
      ...component,
      id: `${component.id}-copy-${Date.now()}`,
      name: `${component.name} (Copy)`,
      versionInfo: {
        ...component.versionInfo,
        versionId: '1.0',
        status: 'draft',
        versionHistory: [
          {
            versionId: '1.0',
            status: 'draft',
            createdAt: new Date().toISOString(),
            createdBy: 'current-user',
            changeDescription: `Duplicated from ${component.name} v${component.versionInfo.versionId}`,
          },
        ],
      },
      usage: {
        measureIds: [],
        usageCount: 0,
      },
      metadata: {
        ...component.metadata,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
    addComponent(duplicated);
  }, [addComponent, component]);

  // ------------------------------------------------------------------
  // Empty State
  // ------------------------------------------------------------------

  if (!component) {
    return (
      <div className="h-full flex items-center justify-center bg-[var(--bg-secondary)] border-l border-[var(--border)]">
        <p className="text-[var(--text-muted)]">Component not found</p>
      </div>
    );
  }

  const status = component.versionInfo.status;
  const statusConfig = getStatusConfig(status);
  const isAtomic = component.type === 'atomic';
  const canApprove = status === 'draft' || status === 'pending_review';
  const canArchive =
    component.usage.usageCount === 0 && status !== 'archived';

  return (
    <div className="h-full flex flex-col bg-[var(--bg-secondary)] border-l border-[var(--border)]">
      {/* ================================================================ */}
      {/* Header                                                          */}
      {/* ================================================================ */}
      <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--border)]">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-[var(--text)] truncate">
            {component.name}
          </h2>
          <p className="text-xs text-[var(--text-dim)] mt-0.5">
            v{component.versionInfo.versionId}
          </p>
        </div>
        <button
          onClick={onClose}
          className="shrink-0 p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-tertiary)] transition-colors"
          aria-label="Close detail panel"
        >
          <X size={18} />
        </button>
      </div>

      {/* ================================================================ */}
      {/* Scrollable Content                                              */}
      {/* ================================================================ */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {/* -------------------------------------------------------------- */}
        {/* Type & Status Badges                                          */}
        {/* -------------------------------------------------------------- */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isAtomic && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-teal-500/15 text-teal-400">
              <Layers size={12} />
              Composite
            </span>
          )}

          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
          >
            {statusConfig.label}
          </span>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Description                                                   */}
        {/* -------------------------------------------------------------- */}
        {component.description && (
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            {component.description}
          </p>
        )}

        {/* -------------------------------------------------------------- */}
        {/* Atomic-Specific Details                                       */}
        {/* -------------------------------------------------------------- */}
        {isAtomic && <AtomicDetails component={component                   } />}

        {/* -------------------------------------------------------------- */}
        {/* Composite-Specific Details                                    */}
        {/* -------------------------------------------------------------- */}
        {!isAtomic && <CompositeDetails component={component                      } />}

        {/* -------------------------------------------------------------- */}
        {/* Complexity Breakdown                                          */}
        {/* -------------------------------------------------------------- */}
        <ComplexitySection component={component} />

        {/* -------------------------------------------------------------- */}
        {/* Version History                                               */}
        {/* -------------------------------------------------------------- */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] overflow-hidden">
          <button
            onClick={() => setVersionHistoryOpen(!versionHistoryOpen)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-[var(--text)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <span className="flex items-center gap-2">
              <GitBranch size={14} className="text-[var(--text-muted)]" />
              Version History
              <span className="text-xs text-[var(--text-dim)]">
                ({component.versionInfo.versionHistory.length})
              </span>
            </span>
            {versionHistoryOpen ? (
              <ChevronUp size={14} className="text-[var(--text-muted)]" />
            ) : (
              <ChevronDown size={14} className="text-[var(--text-muted)]" />
            )}
          </button>

          {versionHistoryOpen && (
            <div className="border-t border-[var(--border)] divide-y divide-[var(--border)]">
              {component.versionInfo.versionHistory.map((entry) => {
                const entryStatusConfig = getStatusConfig(entry.status);
                return (
                  <div key={entry.versionId} className="px-4 py-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--text)]">
                        v{entry.versionId}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${entryStatusConfig.bg} ${entryStatusConfig.text}`}
                      >
                        {entryStatusConfig.label}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {entry.changeDescription}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-[var(--text-dim)]">
                      <span className="flex items-center gap-1">
                        <Clock size={10} />
                        {formatDate(entry.createdAt)}
                      </span>
                      <span>{entry.createdBy}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Usage                                                         */}
        {/* -------------------------------------------------------------- */}
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Link size={14} className="text-[var(--text-muted)]" />
            <span className="text-sm font-medium text-[var(--text)]">Usage</span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Used in{' '}
            <span className="font-semibold text-[var(--text)]">
              {component.usage.usageCount}
            </span>{' '}
            {component.usage.usageCount === 1 ? 'measure' : 'measures'}
          </p>
          {component.usage.measureIds.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {component.usage.measureIds.map((measureId) => {
                const measure = measureLookup.get(measureId);
                const displayName = measure?.metadata?.title || measureId;
                const displayId = measure?.metadata?.measureId || measureId;
                return (
                  <li key={measureId}>
                    <button
                      onClick={() => handleNavigateToMeasure(measureId)}
                      className="flex items-center gap-2 text-left w-full group hover:bg-[var(--bg-tertiary)] rounded px-2 py-1.5 -mx-2 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-[var(--accent)] block truncate group-hover:text-[var(--accent-hover)]">
                          {displayId}
                        </span>
                        <span className="text-xs text-[var(--text-muted)] block truncate group-hover:text-[var(--text)]">
                          {displayName}
                        </span>
                      </div>
                      <ExternalLink size={12} className="text-[var(--text-dim)] group-hover:text-[var(--accent)] flex-shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Tags                                                          */}
        {/* -------------------------------------------------------------- */}
        {component.metadata.tags.length > 0 && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <Tag size={14} className="text-[var(--text-muted)]" />
              <span className="text-sm font-medium text-[var(--text)]">Tags</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {component.metadata.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-block px-2 py-0.5 text-xs rounded-full bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border)]"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------- */}
        {/* Generated Code (Atomic Components Only)                       */}
        {/* -------------------------------------------------------------- */}
        {isAtomic && (
          <LibraryCodeViewer component={component                   } />
        )}
      </div>

      {/* ================================================================ */}
      {/* Action Buttons                                                  */}
      {/* ================================================================ */}
      <div className="border-t border-[var(--border)] px-5 py-4 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {/* Edit */}
          <button
            onClick={() => onEdit(componentId)}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
          >
            <Edit3 size={14} />
            Edit
          </button>

          {/* Duplicate */}
          <button
            onClick={handleDuplicate}
            className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-[var(--border)] text-[var(--text)] bg-[var(--bg)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <Copy size={14} />
            Duplicate
          </button>

          {/* Approve */}
          {canApprove && (
            <button
              onClick={handleApprove}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-green-600/15 text-green-500 hover:bg-green-600/25 transition-colors"
            >
              <CheckCircle size={14} />
              Approve
            </button>
          )}

          {/* Archive */}
          {canArchive && !archiveConfirmOpen && (
            <button
              onClick={() => setArchiveConfirmOpen(true)}
              className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-red-600/10 text-red-400 hover:bg-red-600/20 transition-colors"
            >
              <Archive size={14} />
              Archive
            </button>
          )}
        </div>

        {/* Archive Confirmation */}
        {archiveConfirmOpen && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-400 mb-3">
              Are you sure you want to archive this component? This action marks it
              as inactive.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={handleArchive}
                className="flex-1 px-3 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Confirm Archive
              </button>
              <button
                onClick={() => setArchiveConfirmOpen(false)}
                className="flex-1 px-3 py-1.5 text-sm font-medium rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Atomic Details Sub-Section
// ============================================================================

function AtomicDetails({ component }                                ) {
  const [showAllCodes, setShowAllCodes] = useState                         ({});

  // Support multiple value sets - use valueSets array if available, otherwise fall back to single valueSet
  // IMPORTANT: If valueSets exists but has no codes, check if valueSet (singular) has codes and use those
  let allValueSets = component.valueSets || [component.valueSet];

  // Check if allValueSets has any codes - if not, try falling back to component.valueSet
  const totalCodesInValueSets = allValueSets.reduce((sum, vs) => sum + (vs?.codes?.length || 0), 0);
  if (totalCodesInValueSets === 0 && component.valueSet?.codes?.length) {
    // valueSets has no codes but valueSet does - use valueSet instead
    allValueSets = [component.valueSet];
  }

  const hasMultipleValueSets = allValueSets.length > 1;

  // Calculate total codes across all value sets
  const totalCodes = allValueSets.reduce((sum, vs) => sum + (vs?.codes?.length || 0), 0);

  return (
    <div className="space-y-4">
      {/* Missing codes warning */}
      {component.metadata?.category !== 'demographics' &&
        (!component.valueSet?.codes || component.valueSet.codes.length === 0) && (
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <div>
            <div className="text-sm font-medium text-amber-400">Missing codes</div>
            <div className="text-xs text-amber-400/70 mt-0.5">
              {component.valueSet?.oid
                ? 'Edit this component and use "Fetch from VSAC" to populate codes from the standard value set.'
                : 'This component needs an OID and codes. Edit to add manually or re-import with HTML specification.'}
            </div>
          </div>
        </div>
      )}

      {/* Value Sets Header */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3 space-y-3">
        <h3 className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
          <Atom size={14} className="text-purple-400" />
          {hasMultipleValueSets ? 'Value Sets' : 'Value Set'}
          {hasMultipleValueSets && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
              {allValueSets.length} combined
            </span>
          )}
        </h3>

        {/* Map through all value sets */}
        {allValueSets.map((valueSet, vsIndex) => {
          const codes = valueSet.codes || [];
          const codeCount = codes.length;
          const showAll = showAllCodes[vsIndex] || false;
          const visibleCodes = showAll ? codes : codes.slice(0, 10);

          return (
            <div
              key={valueSet.oid || vsIndex}
              className={`${hasMultipleValueSets ? 'p-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]' : ''}`}
            >
              {/* Value Set Info */}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-[var(--text-dim)]">Name</dt>
                <dd className="text-[var(--text-muted)] truncate">{valueSet.name}</dd>
                <dt className="text-[var(--text-dim)]">OID</dt>
                <dd className="text-[var(--text-muted)] font-mono truncate">
                  {valueSet.oid}
                </dd>
                <dt className="text-[var(--text-dim)]">Version</dt>
                <dd className="text-[var(--text-muted)]">{valueSet.version}</dd>
              </dl>

              {/* Codes for this value set */}
              <div className="mt-3 pt-3 border-t border-[var(--border)]/50">
                <div className="flex items-center gap-2 mb-2">
                  <Code size={12} className="text-emerald-400" />
                  <span className="text-xs text-[var(--text-dim)]">Codes ({codeCount})</span>
                </div>

                {codeCount === 0 ? (
                  <div className="flex items-center gap-2 rounded-md bg-red-500/10 border border-red-500/30 px-3 py-2">
                    <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                    <span className="text-xs text-red-400 font-medium">
                      No codes defined. Edit to add codes.
                    </span>
                  </div>
                ) : (
                  <>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-[var(--border)]">
                          <th className="text-left py-1.5 pr-2 text-[var(--text-dim)] font-medium">Code</th>
                          <th className="text-left py-1.5 pr-2 text-[var(--text-dim)] font-medium">Display</th>
                          <th className="text-left py-1.5 text-[var(--text-dim)] font-medium">System</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleCodes.map((code, i) => (
                          <tr key={`${code.code}-${i}`} className="border-b border-[var(--border)] last:border-0">
                            <td className="py-1.5 pr-2 font-mono text-[var(--accent)]">{code.code}</td>
                            <td className="py-1.5 pr-2 text-[var(--text-muted)] truncate max-w-[200px]">{code.display}</td>
                            <td className="py-1.5 text-[var(--text-dim)]">{code.system}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {codeCount > 10 && (
                      <button
                        onClick={() => setShowAllCodes(prev => ({ ...prev, [vsIndex]: !showAll }))}
                        className="text-xs text-[var(--accent)] hover:underline"
                      >
                        {showAll ? 'Show less' : `Show all ${codeCount} codes`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        {/* Total codes across all value sets */}
        {hasMultipleValueSets && (
          <div className="pt-2 border-t border-[var(--border)] flex items-center justify-between">
            <span className="text-xs text-[var(--text-dim)]">Total across all value sets</span>
            <span className="text-xs font-medium text-[var(--text-muted)]">{totalCodes} codes</span>
          </div>
        )}
      </div>

      {/* Timing */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3 space-y-2">
        <h3 className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
          <Clock size={14} className="text-blue-400" />
          Timing
        </h3>
        <p className="text-xs text-[var(--accent)] font-mono leading-relaxed">
          {component.timing.displayExpression}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs mt-1">
          <dt className="text-[var(--text-dim)]">Operator</dt>
          <dd className="text-[var(--text-muted)]">{component.timing.operator}</dd>
          {component.timing.quantity != null && (
            <>
              <dt className="text-[var(--text-dim)]">Quantity</dt>
              <dd className="text-[var(--text-muted)]">
                {component.timing.quantity} {component.timing.unit}
              </dd>
            </>
          )}
          {component.timing.position && (
            <>
              <dt className="text-[var(--text-dim)]">Position</dt>
              <dd className="text-[var(--text-muted)]">{component.timing.position}</dd>
            </>
          )}
          <dt className="text-[var(--text-dim)]">Reference</dt>
          <dd className="text-[var(--text-muted)]">{component.timing.reference}</dd>
        </dl>
      </div>

      {/* Due Date (T-Days) */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3 space-y-2">
        <h3 className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
          <Clock size={14} className="text-amber-400" />
          Due Date (T-Days)
        </h3>
        {component.dueDateDays != null ? (
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-[var(--text)]">
              T-{component.dueDateDays}
            </span>
            <span className="text-sm text-[var(--text-muted)]">
              {component.dueDateDays === 365
                ? 'Annual'
                : component.dueDateDays % 365 === 0
                  ? `${component.dueDateDays / 365} year${component.dueDateDays / 365 > 1 ? 's' : ''}`
                  : component.dueDateDays % 30 === 0 && component.dueDateDays < 365
                    ? `${component.dueDateDays / 30} month${component.dueDateDays / 30 > 1 ? 's' : ''}`
                    : `${component.dueDateDays} days`}
            </span>
            {component.dueDateDaysOverridden && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                Override
              </span>
            )}
          </div>
        ) : (
          <p className="text-sm text-[var(--text-dim)] italic">
            Not applicable (negation or demographics)
          </p>
        )}
      </div>

      {/* Negation */}
      {component.negation && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-2.5">
          <span className="text-orange-400 text-sm font-medium">Negation</span>
          <span className="text-xs text-orange-300">
            This component represents an absence / exclusion
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Composite Details Sub-Section
// ============================================================================

function CompositeDetails({ component }                                   ) {
  return (
    <div className="space-y-4">
      {/* Operator */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-[var(--text-muted)]">Logical Operator:</span>
        <span
          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${
            component.operator === 'AND'
              ? 'bg-blue-500/15 text-blue-400'
              : 'bg-amber-500/15 text-amber-400'
          }`}
        >
          {component.operator}
        </span>
      </div>

      {/* Children */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3 space-y-2">
        <h3 className="text-sm font-medium text-[var(--text)] flex items-center gap-2">
          <Layers size={14} className="text-teal-400" />
          Children
          <span className="text-xs text-[var(--text-dim)]">
            ({component.children.length})
          </span>
        </h3>
        <ul className="space-y-1.5">
          {component.children.map((child, index) => (
            <li
              key={`${child.componentId}-${index}`}
              className="flex items-center gap-2 pl-3 border-l-2 border-[var(--border)] py-1"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--text)] truncate">
                  {child.displayName}
                </p>
                <p className="text-xs text-[var(--text-dim)] font-mono">
                  v{child.versionId}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ============================================================================
// Complexity Section
// ============================================================================

function ComplexitySection({
  component,
}   
                                                  
 ) {
  const { complexity } = component;
  const colorClass = getComplexityColor(complexity.level);
  const dots = getComplexityDots(complexity.level);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-3 space-y-3">
      <h3 className="text-sm font-medium text-[var(--text)]">Complexity</h3>

      {/* Score & Level */}
      <div className="flex items-center gap-3">
        <span className="text-2xl font-bold text-[var(--text)]">
          {complexity.score}
        </span>
        <span className={`text-sm font-medium capitalize ${colorClass}`}>
          {complexity.level}
        </span>
        <span className={`text-sm tracking-wider ${colorClass}`}>{dots}</span>
      </div>

      {/* Factors Breakdown */}
      <div className="border-t border-[var(--border)] pt-2">
        <p className="text-xs text-[var(--text-dim)] uppercase tracking-wide mb-1.5">
          Factors
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-xs">
          <dt className="text-[var(--text-muted)]">Base</dt>
          <dd className="text-[var(--text)] font-mono text-right">
            {complexity.factors.base}
          </dd>

          <dt className="text-[var(--text-muted)]">Timing Clauses</dt>
          <dd className="text-[var(--text)] font-mono text-right">
            {complexity.factors.timingClauses}
          </dd>

          <dt className="text-[var(--text-muted)]">Negations</dt>
          <dd className="text-[var(--text)] font-mono text-right">
            {complexity.factors.negations}
          </dd>

          {complexity.factors.childrenSum != null && (
            <>
              <dt className="text-[var(--text-muted)]">Children Sum</dt>
              <dd className="text-[var(--text)] font-mono text-right">
                {complexity.factors.childrenSum}
              </dd>
            </>
          )}

          {complexity.factors.andOperators != null && (
            <>
              <dt className="text-[var(--text-muted)]">AND Operators</dt>
              <dd className="text-[var(--text)] font-mono text-right">
                {complexity.factors.andOperators}
              </dd>
            </>
          )}

          {complexity.factors.nestingDepth != null && (
            <>
              <dt className="text-[var(--text-muted)]">Nesting Depth</dt>
              <dd className="text-[var(--text)] font-mono text-right">
                {complexity.factors.nestingDepth}
              </dd>
            </>
          )}
        </dl>
      </div>
    </div>
  );
}
