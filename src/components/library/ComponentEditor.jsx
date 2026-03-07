import { useState, useMemo, useCallback } from 'react';
import {
  X,
  Save,
  Search,
  Tag,
  Layers,
  Plus,
  CheckSquare,
  Square,
  Zap,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Code,
  Download,
  Loader2,
} from 'lucide-react';
import { useComponentLibraryStore } from '../../stores/componentLibraryStore';
import { useMeasureStore } from '../../stores/measureStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { createAtomicComponent, createCompositeComponent } from '../../services/componentLibraryService';
import { fetchValueSetExpansion } from '../../services/vsacService';
import SharedEditWarning from './SharedEditWarning';
import { InlineErrorBanner } from '../shared/ErrorBoundary';
import { TimingSection, deriveDueDateDays } from '../shared/TimingSection';

// ============================================================================
// Types
// ============================================================================

const CATEGORIES                                                = [
  { value: 'demographics', label: 'Demographics' },
  { value: 'encounters', label: 'Encounters' },
  { value: 'conditions', label: 'Conditions' },
  { value: 'procedures', label: 'Procedures' },
  { value: 'medications', label: 'Medications' },
  { value: 'assessments', label: 'Assessments' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'clinical-observations', label: 'Clinical Observations' },
  { value: 'exclusions', label: 'Exclusions' },
];

const CATALOGUE_OPTIONS = [
  { value: 'ecqm',               label: 'eCQM' },
  { value: 'mips_cqm',           label: 'MIPS CQM' },
  { value: 'hedis',              label: 'HEDIS' },
  { value: 'clinical_standard',  label: 'Clinical Standard' },
  { value: 'qof',                label: 'QOF' },
  { value: 'custom',             label: 'Custom' },
];

// ============================================================================
// Component
// ============================================================================

export default function ComponentEditor({ componentId, onSave, onClose }                      ) {
  const { components, addComponent, updateComponent, getComponent, syncComponentToMeasures, handleSharedEdit: _handleSharedEdit, rebuildUsageIndex } = useComponentLibraryStore();
  const { measures, batchUpdateMeasures } = useMeasureStore();
  const [showSharedWarning, setShowSharedWarning] = useState(false);
  const [pendingChanges, setPendingChanges] = useState                     (null);

  const isEditMode = componentId !== undefined;
  const existingComponent = isEditMode ? getComponent(componentId) : null;

  // --------------------------------------------------------------------------
  // State: Type Toggle
  // --------------------------------------------------------------------------
  const [componentType, setComponentType] = useState               (
    existingComponent?.type ?? 'atomic'
  );

  // --------------------------------------------------------------------------
  // State: Shared
  // --------------------------------------------------------------------------
  const [name, setName] = useState(existingComponent?.name ?? '');
  const [category, setCategory] = useState                   (
    existingComponent?.metadata.category ?? 'encounters'
  );
  const [categoryAutoAssigned, setCategoryAutoAssigned] = useState         (
    existingComponent?.metadata.categoryAutoAssigned ?? false
  );

  // --------------------------------------------------------------------------
  // State: Atomic Fields
  // --------------------------------------------------------------------------
  const [vsOid, setVsOid] = useState(
    existingComponent?.type === 'atomic' ? existingComponent.valueSet.oid : ''
  );
  const [vsVersion, setVsVersion] = useState(
    existingComponent?.type === 'atomic' ? existingComponent.valueSet.version : ''
  );
  const [vsName, setVsName] = useState(
    existingComponent?.type === 'atomic' ? existingComponent.valueSet.name : ''
  );

  // Timing state - unified object for TimingSection
  const [timing, setTiming] = useState(() => {
    if (existingComponent?.type === 'atomic') {
      return existingComponent.timing || { operator: 'during', reference: 'Measurement Period' };
    }
    return { operator: 'during', reference: 'Measurement Period' };
  });

  // Due Date (T-Days) state
  const [dueDateDays, setDueDateDays] = useState(() => {
    if (existingComponent?.dueDateDays != null) return existingComponent.dueDateDays;
    if (existingComponent?.type === 'atomic') {
      return deriveDueDateDays(existingComponent.timing, existingComponent.metadata.category, existingComponent.negation);
    }
    return 365;
  });
  const [dueDateOverridden, setDueDateOverridden] = useState(
    existingComponent?.dueDateDaysOverridden ?? false
  );

  // Age evaluation reference point (for age components only)
  const [ageEvaluatedAt, setAgeEvaluatedAt] = useState(
    existingComponent?.ageEvaluatedAt ?? 'end-of-mp'
  );

  const [negation, setNegation] = useState(
    existingComponent?.type === 'atomic' ? existingComponent.negation : false
  );
  const [codes, setCodes] = useState                 (
    existingComponent?.type === 'atomic' ? (existingComponent.valueSet.codes || []) : []
  );
  const [tagsInput, setTagsInput] = useState(
    existingComponent?.metadata.tags.join(', ') ?? ''
  );
  const [catalogs, setCatalogs] = useState(existingComponent?.catalogs ?? []);

  // --------------------------------------------------------------------------
  // State: Composite Fields
  // --------------------------------------------------------------------------
  const [operator, setOperator] = useState              (
    existingComponent?.type === 'composite' ? existingComponent.operator : 'AND'
  );
  const [selectedChildIds, setSelectedChildIds] = useState             (
    existingComponent?.type === 'composite'
      ? new Set(existingComponent.children.map((c) => c.componentId))
      : new Set()
  );
  const [childSearch, setChildSearch] = useState('');

  // Error state for inline error display
  const [error, setError] = useState               (null);

  // VSAC fetch state
  const { vsacApiKey } = useSettingsStore();
  const [vsacLoading, setVsacLoading] = useState(false);
  const [vsacStatus, setVsacStatus] = useState                                                    (null);

  // --------------------------------------------------------------------------
  // Derived: Available children for composite
  // --------------------------------------------------------------------------
  const availableChildren = useMemo(() => {
    const filtered = components.filter((c) => {
      if (isEditMode && c.id === componentId) return false;
      if (c.versionInfo.status === 'archived') return false;
      if (childSearch) {
        const q = childSearch.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.metadata.category.toLowerCase().includes(q) ||
          c.metadata.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      return true;
    });
    return filtered;
  }, [components, componentId, isEditMode, childSearch]);

  // --------------------------------------------------------------------------
  // Derived: Complexity preview
  // --------------------------------------------------------------------------
  const previewComplexity = useMemo(() => {
    let score = 1;
    if (componentType === 'atomic') {
      if (timing?.quantity) score += 1;
      if (timing?.position) score += 1;
      if (negation) score += 1;
    } else {
      score = selectedChildIds.size;
      if (operator === 'AND') score += selectedChildIds.size > 0 ? 1 : 0;
    }
    if (score <= 2) return { level: 'low', score, color: 'text-green-400' };
    if (score <= 4) return { level: 'medium', score, color: 'text-yellow-400' };
    return { level: 'high', score, color: 'text-red-400' };
  }, [componentType, timing?.quantity, timing?.position, negation, selectedChildIds.size, operator]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------
  const toggleChild = useCallback((id        ) => {
    setSelectedChildIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Build display expression from timing object
  const buildDisplayExpression = useCallback((t) => {
    if (!t) return 'during Measurement Period';
    const parts = [t.operator];
    if (t.quantity) parts.push(String(t.quantity), t.unit);
    if (t.position) parts.push(t.position);
    parts.push(t.reference || 'Measurement Period');
    return parts.join(' ');
  }, []);

  const handleSave = useCallback(() => {
    if (!name.trim()) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (componentType === 'atomic') {
      if (!vsOid.trim() || !vsName.trim()) return;

      const component = createAtomicComponent({
        name: name.trim(),
        valueSet: {
          oid: vsOid.trim(),
          version: vsVersion.trim() || '1.0',
          name: vsName.trim(),
        },
        timing: {
          ...timing,
          displayExpression: timing.displayExpression || buildDisplayExpression(timing),
        },
        negation,
        category,
        tags,
        dueDateDays,
        dueDateDaysOverridden: dueDateOverridden,
        ageEvaluatedAt,
      });

      // Attach codes to the component's valueSet
      (component       ).valueSet.codes = codes;
      // Attach catalogs
      component.catalogs = catalogs;

      if (isEditMode && existingComponent) {
        const updates = {
          name: component.name,
          valueSet: { ...component.valueSet, codes },
          timing: component.timing,
          negation: component.negation,
          complexity: component.complexity,
          dueDateDays,
          dueDateDaysOverridden: dueDateOverridden,
          ageEvaluatedAt,
          catalogs,
          metadata: {
            ...existingComponent.metadata,
            category,
            categoryAutoAssigned,
            tags,
            updatedAt: new Date().toISOString(),
            updatedBy: 'user',
          },
        }                                     ;

        // Check if shared — show warning if used in multiple measures
        if (existingComponent.usage.usageCount > 1) {
          setPendingChanges(updates);
          setShowSharedWarning(true);
          return;
        }

        try {
          updateComponent(existingComponent.id, updates);
          // Sync changes to any linked measures (including codes)
          if (existingComponent.usage.usageCount >= 1) {
            const result = syncComponentToMeasures(
              existingComponent.id,
              { changeDescription: 'Component updated', name: component.name, timing: component.timing, negation: component.negation, codes },
              measures,
              batchUpdateMeasures,
            );
            if (!result.success) {
              console.error('[ComponentEditor] Failed to sync component to measures:', result.error);
              setError(`Failed to sync changes: ${result.error}`);
              return;
            }
          }
        } catch (err) {
          console.error('[ComponentEditor] Save failed:', err);
          setError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
      } else {
        addComponent(component);
      }
    } else {
      // Composite
      if (selectedChildIds.size === 0) return;

      const childRefs = Array.from(selectedChildIds).map((childId) => {
        const child = components.find((c) => c.id === childId);
        return {
          componentId: childId,
          versionId: child?.versionInfo.versionId ?? '1.0',
          displayName: child?.name ?? childId,
        };
      });

      const resolveChild = (id        ) => components.find((c) => c.id === id) ?? null;

      const component = createCompositeComponent({
        name: name.trim(),
        operator,
        children: childRefs,
        category,
        tags,
        resolveChild,
      });
      // Attach catalogs
      component.catalogs = catalogs;

      if (isEditMode && existingComponent) {
        const updates = {
          name: component.name,
          operator: component.operator,
          children: component.children,
          complexity: component.complexity,
          catalogs,
          metadata: {
            ...existingComponent.metadata,
            category,
            categoryAutoAssigned,
            tags,
            updatedAt: new Date().toISOString(),
            updatedBy: 'user',
          },
        }                                     ;

        // Check if shared — show warning if used in multiple measures
        if (existingComponent.usage.usageCount > 1) {
          setPendingChanges(updates);
          setShowSharedWarning(true);
          return;
        }

        updateComponent(existingComponent.id, updates);
      } else {
        addComponent(component);
      }
    }

    onSave();
  }, [
    name, tagsInput, componentType, vsOid, vsName, vsVersion,
    timing, buildDisplayExpression, negation, category, dueDateDays, dueDateOverridden,
    ageEvaluatedAt, isEditMode, existingComponent, updateComponent, addComponent, selectedChildIds,
    components, operator, onSave, codes, categoryAutoAssigned, syncComponentToMeasures,
    measures, batchUpdateMeasures, catalogs,
  ]);

  const canSave = useMemo(() => {
    if (!name.trim()) return false;
    if (componentType === 'atomic') {
      return vsOid.trim().length > 0 && vsName.trim().length > 0;
    }
    return selectedChildIds.size > 0;
  }, [name, componentType, vsOid, vsName, selectedChildIds.size]);

  // --------------------------------------------------------------------------
  // VSAC Fetch Handler
  // --------------------------------------------------------------------------
  const handleFetchFromVSAC = useCallback(async () => {
    if (!vsOid.trim()) {
      setVsacStatus({ type: 'error', message: 'Enter an OID first' });
      return;
    }
    if (!vsacApiKey) {
      setVsacStatus({ type: 'error', message: 'Set your VSAC API key in Settings first' });
      return;
    }

    setVsacLoading(true);
    setVsacStatus(null);

    try {
      const result = await fetchValueSetExpansion(vsOid.trim(), vsacApiKey);

      // Merge with existing codes, avoiding duplicates by code value
      const existingCodeValues = new Set(codes.map(c => c.code));
      const newCodes = result.codes.filter(c => !existingCodeValues.has(c.code));
      const mergedCodes = [...codes, ...newCodes];

      setCodes(mergedCodes);

      // Update VS name if it was empty
      if (!vsName.trim() && result.title) {
        setVsName(result.title);
      }

      setVsacStatus({
        type: 'success',
        message: `Loaded ${newCodes.length} codes from VSAC (${result.total} total in value set${codes.length > 0 ? `, ${codes.length} already existed` : ''})`,
      });
    } catch (err) {
      setVsacStatus({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setVsacLoading(false);
    }
  }, [vsOid, vsacApiKey, codes, vsName]);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className="rounded-xl shadow-2xl border w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
          color: 'var(--text)',
        }}
      >
        {/* ---------------------------------------------------------------- */}
        {/* Header                                                          */}
        {/* ---------------------------------------------------------------- */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
            >
              {componentType === 'atomic' ? <Zap size={18} /> : <Layers size={18} />}
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
                {isEditMode ? 'Edit Component' : 'Create Component'}
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {isEditMode
                  ? `Editing "${existingComponent?.name}"`
                  : 'Define a reusable measure building block'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:opacity-80"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Error Banner                                                     */}
        {/* ---------------------------------------------------------------- */}
        {error && (
          <div className="px-6 pt-4">
            <InlineErrorBanner message={error} onDismiss={() => setError(null)} />
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Scrollable Body                                                  */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

          {/* Type Toggle (create mode only) */}
          {!isEditMode && (
            <div className="flex gap-2">
              {(['atomic', 'composite']                   ).map((type) => (
                <button
                  key={type}
                  onClick={() => setComponentType(type)}
                  className="flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all border"
                  style={{
                    backgroundColor:
                      componentType === type ? 'var(--accent)' : 'transparent',
                    borderColor:
                      componentType === type ? 'var(--accent)' : 'var(--border)',
                    color: componentType === type ? '#fff' : 'var(--text-secondary)',
                  }}
                >
                  {type === 'atomic' ? (
                    <span className="flex items-center justify-center gap-2">
                      <Zap size={14} /> Single
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <Layers size={14} /> Composite
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Component Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Qualifying Encounter During Measurement Period"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors focus:ring-2"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
            />
          </div>

          {/* ============================================================== */}
          {/* ATOMIC FIELDS                                                   */}
          {/* ============================================================== */}
          {componentType === 'atomic' && (
            <>
              {/* Value Set Section */}
              <fieldset
                className="border rounded-lg p-4 space-y-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <legend
                  className="text-xs font-semibold uppercase tracking-wide px-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Value Set
                </legend>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    OID
                  </label>
                  <input
                    type="text"
                    value={vsOid}
                    onChange={(e) => setVsOid(e.target.value)}
                    placeholder="2.16.840.1.113883.3.464.1003.101.12.1001"
                    className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      borderColor: 'var(--border)',
                      color: 'var(--text)',
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Version
                    </label>
                    <input
                      type="text"
                      value={vsVersion}
                      onChange={(e) => setVsVersion(e.target.value)}
                      placeholder="20230301"
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        borderColor: 'var(--border)',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                      Name
                    </label>
                    <input
                      type="text"
                      value={vsName}
                      onChange={(e) => setVsName(e.target.value)}
                      placeholder="Office Visit"
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        borderColor: 'var(--border)',
                        color: 'var(--text)',
                      }}
                    />
                  </div>
                </div>
              </fieldset>

              {/* Codes Section */}
              <fieldset
                className="border rounded-lg p-4 space-y-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <legend
                  className="text-xs font-semibold uppercase tracking-wide px-2"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span className="flex items-center gap-1.5">
                    <Code size={12} /> Codes ({codes.length})
                  </span>
                </legend>

                {codes.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {codes.map((codeEntry, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={codeEntry.code}
                          onChange={(e) => {
                            const updated = [...codes];
                            updated[idx] = { ...updated[idx], code: e.target.value };
                            setCodes(updated);
                          }}
                          placeholder="Code"
                          className="w-24 px-2 py-1.5 rounded border text-xs outline-none font-mono"
                          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text)' }}
                        />
                        <input
                          type="text"
                          value={codeEntry.display}
                          onChange={(e) => {
                            const updated = [...codes];
                            updated[idx] = { ...updated[idx], display: e.target.value };
                            setCodes(updated);
                          }}
                          placeholder="Display name"
                          className="flex-1 px-2 py-1.5 rounded border text-xs outline-none"
                          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text)' }}
                        />
                        <select
                          value={codeEntry.system}
                          onChange={(e) => {
                            const updated = [...codes];
                            updated[idx] = { ...updated[idx], system: e.target.value                            };
                            setCodes(updated);
                          }}
                          className="w-24 px-2 py-1.5 rounded border text-xs outline-none"
                          style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text)' }}
                        >
                          <option value="CPT">CPT</option>
                          <option value="ICD10">ICD10</option>
                          <option value="SNOMED">SNOMED</option>
                          <option value="HCPCS">HCPCS</option>
                          <option value="LOINC">LOINC</option>
                          <option value="RxNorm">RxNorm</option>
                          <option value="CVX">CVX</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setCodes(codes.filter((_, i) => i !== idx))}
                          className="p-1 rounded hover:bg-red-500/20 text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCodes([...codes, { code: '', display: '', system: 'CPT'                            }])}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors hover:bg-[var(--bg-tertiary)]"
                    style={{ borderColor: 'var(--border)', color: 'var(--accent)' }}
                  >
                    <Plus size={12} /> Add Code
                  </button>

                  {/* Fetch from VSAC */}
                  <button
                    type="button"
                    onClick={handleFetchFromVSAC}
                    disabled={vsacLoading || !vsOid.trim()}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                    title={!vsacApiKey ? 'Set VSAC API key in Settings' : !vsOid.trim() ? 'Enter an OID first' : `Fetch codes for OID ${vsOid}`}
                  >
                    {vsacLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Download size={12} />
                    )}
                    {vsacLoading ? 'Fetching...' : 'Fetch from VSAC'}
                  </button>
                </div>

                {/* VSAC Status Message */}
                {vsacStatus && (
                  <div className={`text-xs px-3 py-2 rounded-md ${
                    vsacStatus.type === 'success'
                      ? 'bg-green-500/10 text-green-400'
                      : 'bg-red-500/10 text-red-400'
                  }`}>
                    {vsacStatus.message}
                  </div>
                )}
              </fieldset>

              {/* Timing Section */}
              <TimingSection
                timing={timing}
                onChange={(newTiming) => {
                  setTiming(newTiming);
                  // Auto-update due date if not overridden
                  if (!dueDateOverridden) {
                    setDueDateDays(deriveDueDateDays(newTiming, category, negation));
                  }
                }}
                dueDateDays={dueDateDays}
                onDueDateChange={(days) => {
                  setDueDateDays(days);
                  setDueDateOverridden(true);
                }}
                dueDateOverridden={dueDateOverridden}
                componentCategory={category}
                negation={negation}
                componentData={{
                  name,
                  description: existingComponent?.description || name,
                  genderValue: existingComponent?.genderValue,
                  resourceType: existingComponent?.resourceType,
                  thresholds: existingComponent?.thresholds,
                }}
                ageEvaluatedAt={ageEvaluatedAt}
                onAgeEvaluatedAtChange={setAgeEvaluatedAt}
              />

              {/* Negation */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setNegation(!negation)}
                  className="flex items-center gap-2 text-sm"
                  style={{ color: 'var(--text)' }}
                >
                  {negation ? (
                    <ToggleRight size={22} style={{ color: 'var(--accent)' }} />
                  ) : (
                    <ToggleLeft size={22} style={{ color: 'var(--text-secondary)' }} />
                  )}
                  Negation (absence of / without)
                </button>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                  <span className="flex items-center gap-1.5">
                    <Tag size={14} /> Tags
                  </span>
                </label>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="encounter, office visit, qualifying (comma-separated)"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    borderColor: 'var(--border)',
                    color: 'var(--text)',
                  }}
                />
              </div>
            </>
          )}

          {/* ============================================================== */}
          {/* COMPOSITE FIELDS                                                */}
          {/* ============================================================== */}
          {componentType === 'composite' && (
            <>
              {/* Operator Toggle */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                  Logical Operator
                </label>
                <div className="flex gap-2">
                  {(['AND', 'OR']).map((op) => (
                    <button
                      key={op}
                      onClick={() => setOperator(op)}
                      className="flex-1 py-2 px-4 rounded-lg text-sm font-semibold transition-all border"
                      style={{
                        backgroundColor: operator === op ? 'var(--accent)' : 'transparent',
                        borderColor: operator === op ? 'var(--accent)' : 'var(--border)',
                        color: operator === op ? '#fff' : 'var(--text-secondary)',
                      }}
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>

              {/* Children Selection */}
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
                  Child Components ({selectedChildIds.size} selected)
                </label>
                <div
                  className="relative mb-2"
                >
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-secondary)' }}
                  />
                  <input
                    type="text"
                    value={childSearch}
                    onChange={(e) => setChildSearch(e.target.value)}
                    placeholder="Search components..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      borderColor: 'var(--border)',
                      color: 'var(--text)',
                    }}
                  />
                </div>

                <div
                  className="border rounded-lg overflow-y-auto max-h-48 divide-y"
                  style={{
                    borderColor: 'var(--border)',
                    backgroundColor: 'var(--bg-primary)',
                  }}
                >
                  {availableChildren.length === 0 ? (
                    <div
                      className="px-4 py-6 text-center text-sm"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      No components found. Create atomic components first.
                    </div>
                  ) : (
                    availableChildren.map((child) => {
                      const isSelected = selectedChildIds.has(child.id);
                      return (
                        <button
                          key={child.id}
                          onClick={() => toggleChild(child.id)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:opacity-80"
                          style={{
                            borderColor: 'var(--border)',
                            backgroundColor: isSelected ? 'var(--accent-muted, rgba(99,102,241,0.1))' : 'transparent',
                          }}
                        >
                          {isSelected ? (
                            <CheckSquare size={16} style={{ color: 'var(--accent)' }} />
                          ) : (
                            <Square size={16} style={{ color: 'var(--text-secondary)' }} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                              {child.name}
                            </div>
                            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                              {child.type === 'composite' ? 'Composite · ' : ''}
                              {child.metadata.category} · v{child.versionInfo.versionId}
                            </div>
                          </div>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor:
                                child.complexity.level === 'low'
                                  ? 'var(--complexity-low-bg)'
                                  : child.complexity.level === 'medium'
                                  ? 'var(--complexity-medium-bg)'
                                  : 'var(--complexity-high-bg)',
                              color:
                                child.complexity.level === 'low'
                                  ? 'var(--complexity-low)'
                                  : child.complexity.level === 'medium'
                                  ? 'var(--complexity-medium)'
                                  : 'var(--complexity-high)',
                            }}
                          >
                            {child.complexity.score}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}

          {/* Category (shared) */}
          <div>
            <label className="block text-sm font-medium mb-1.5 flex items-center gap-2" style={{ color: 'var(--text)' }}>
              Category
              {categoryAutoAssigned && (
                <span
                  className="px-1.5 py-0.5 rounded text-xs font-medium"
                  style={{ backgroundColor: 'var(--info-bg)', color: 'var(--info-text)' }}
                  title="Category was auto-assigned based on component properties"
                >
                  Auto
                </span>
              )}
            </label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value                     );
                // Manually changing category clears the auto flag
                setCategoryAutoAssigned(false);
              }}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
              style={{
                backgroundColor: 'var(--bg-primary)',
                borderColor: 'var(--border)',
                color: 'var(--text)',
              }}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Catalogue Tags */}
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text)' }}>
              Catalogue Tags
            </label>
            <div className="flex flex-wrap gap-2">
              {CATALOGUE_OPTIONS.map((opt) => {
                const isActive = catalogs.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setCatalogs((prev) =>
                        isActive
                          ? prev.filter((v) => v !== opt.value)
                          : [...prev, opt.value]
                      );
                    }}
                    className="px-3 py-1.5 rounded-full text-sm font-medium transition-all border"
                    style={{
                      backgroundColor: isActive ? 'var(--accent)' : 'transparent',
                      borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Complexity Preview */}
          <div
            className="flex items-center justify-between px-4 py-3 rounded-lg border"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--bg-primary)',
            }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Estimated Complexity
            </span>
            <span className={`text-sm font-bold ${previewComplexity.color}`}>
              {previewComplexity.level.toUpperCase()} ({previewComplexity.score})
            </span>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Footer                                                           */}
        {/* ---------------------------------------------------------------- */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors border hover:opacity-80"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            style={{
              backgroundColor: canSave ? 'var(--accent)' : 'var(--border)',
              color: canSave ? '#fff' : 'var(--text-secondary)',
              cursor: canSave ? 'pointer' : 'not-allowed',
              opacity: canSave ? 1 : 0.6,
            }}
          >
            <Save size={14} />
            {isEditMode ? 'Save Changes' : 'Create Component'}
          </button>
        </div>
      </div>

      {/* Shared Edit Warning Modal */}
      {showSharedWarning && existingComponent && (
        <SharedEditWarning
          componentName={existingComponent.name}
          usageCount={existingComponent.usage.usageCount}
          measureIds={existingComponent.usage.measureIds}
          onUpdateAll={() => {
            if (pendingChanges) {
              try {
                updateComponent(existingComponent.id, pendingChanges);
                // Propagate changes to all linked measures (including codes)
                const changes = {
                  changeDescription: 'Component updated across all measures',
                  name: pendingChanges.name,
                  timing: pendingChanges.timing,
                  negation: pendingChanges.negation,
                  operator: pendingChanges.operator,
                  children: pendingChanges.children,
                  codes: pendingChanges.valueSet?.codes, // Include codes for atomic components
                };
                const result = syncComponentToMeasures(existingComponent.id, changes, measures, batchUpdateMeasures);
                if (!result.success) {
                  console.error('[ComponentEditor] Failed to sync component to measures:', result.error);
                  setError(`Failed to sync changes: ${result.error}`);
                  setShowSharedWarning(false);
                  setPendingChanges(null);
                  return;
                }
                rebuildUsageIndex(measures);
              } catch (err) {
                console.error('[ComponentEditor] Update all failed:', err);
                setError(`Update failed: ${err instanceof Error ? err.message : String(err)}`);
                setShowSharedWarning(false);
                setPendingChanges(null);
                return;
              }
            }
            setShowSharedWarning(false);
            setPendingChanges(null);
            onSave();
          }}
          onCreateCopy={() => {
            if (pendingChanges) {
              // Create a new version — duplicate the component, don't touch original
              const newId = `${existingComponent.id}-v${Date.now()}`;
              const duplicated = {
                ...existingComponent,
                ...pendingChanges,
                id: newId,
                usage: { measureIds: [], usageCount: 0 },
                versionInfo: {
                  ...existingComponent.versionInfo,
                  versionId: (parseFloat(existingComponent.versionInfo.versionId) + 0.1).toFixed(1),
                  status: 'draft',
                },
              };
              addComponent(duplicated       );
            }
            setShowSharedWarning(false);
            setPendingChanges(null);
            onSave();
          }}
          onCancel={() => {
            setShowSharedWarning(false);
            setPendingChanges(null);
          }}
        />
      )}
    </div>
  );
}
