import { useState, useMemo, useCallback } from 'react';
import {
  X,
  Search,
  Check,
  Link,
  Sparkles,
  Plus,
  Building2,
  Stethoscope,
  Scissors,
  Pill,
  FlaskConical,
  ClipboardList,
  User,
  Syringe,
  AlertTriangle,
  GitBranch,
  MessageSquare,
  Target,
  Cpu,
  Activity,
  Heart,
  Code,
  Layers,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useComponentLibraryStore } from '../../stores/componentLibraryStore';
import { useMeasureStore } from '../../stores/measureStore';
import { inferCategory, getCategoryLabel } from '../../utils/inferCategory';

// ============================================================================
// Icons mapping - supports both singular and plural category names
// ============================================================================
const ICONS = {
  // Plural forms (from component library)
  demographics: User,
  encounters: Building2,
  conditions: Stethoscope,
  procedures: Scissors,
  medications: Pill,
  assessments: ClipboardList,
  laboratory: FlaskConical,
  'clinical observations': Activity,
  exclusions: AlertTriangle,
  // Singular forms (legacy)
  encounter: Building2,
  diagnosis: Stethoscope,
  procedure: Scissors,
  medication: Pill,
  lab: FlaskConical,
  assessment: ClipboardList,
  demographic: User,
  immunization: Syringe,
  allergy: AlertTriangle,
  intervention: GitBranch,
  communication: MessageSquare,
  caregoal: Target,
  device: Cpu,
  symptom: Activity,
  familyhistory: Heart,
  custom: Code,
  other: Code,
};

const CAT_COLORS = {
  // Plural forms (from component library)
  demographics: { bg: 'rgba(100, 116, 139, 0.15)', text: '#64748b' },
  encounters: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
  conditions: { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899' },
  procedures: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
  medications: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
  assessments: { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6' },
  laboratory: { bg: 'rgba(99, 102, 241, 0.15)', text: '#6366f1' },
  'clinical observations': { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
  exclusions: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  // Singular forms (legacy)
  encounter: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
  diagnosis: { bg: 'rgba(236, 72, 153, 0.15)', text: '#ec4899' },
  procedure: { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981' },
  medication: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
  lab: { bg: 'rgba(99, 102, 241, 0.15)', text: '#6366f1' },
  assessment: { bg: 'rgba(139, 92, 246, 0.15)', text: '#8b5cf6' },
  demographic: { bg: 'rgba(100, 116, 139, 0.15)', text: '#64748b' },
  immunization: { bg: 'rgba(20, 184, 166, 0.15)', text: '#14b8a6' },
  allergy: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
  intervention: { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6' },
  communication: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
  device: { bg: 'rgba(120, 113, 108, 0.15)', text: '#78716c' },
  custom: { bg: 'rgba(120, 113, 108, 0.1)', text: '#78716c' },
  other: { bg: 'rgba(120, 113, 108, 0.1)', text: '#78716c' },
};

const CONFIDENCE_COLORS = {
  high: { bg: 'rgba(34, 197, 94, 0.15)', text: '#22c55e' },
  medium: { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b' },
  low: { bg: 'rgba(239, 68, 68, 0.15)', text: '#ef4444' },
};

// ============================================================================
// Category Filter List (matches sidebar design)
// ============================================================================
const CATEGORY_ORDER = [
  'demographics',
  'encounters',
  'conditions',
  'procedures',
  'medications',
  'assessments',
  'laboratory',
  'clinical-observations',
  'exclusions',
];

function CategoryFilterList({ categoryCounts, selectedCategories, onToggleCategory, totalCount }) {
  return (
    <div className="space-y-0.5">
      {/* All Components row */}
      <button
        type="button"
        onClick={() => onToggleCategory(null)} // null = clear all filters
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
          selectedCategories.length === 0
            ? 'bg-[var(--accent-light)] text-[var(--accent)] font-semibold'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
        }`}
      >
        <span>All Components</span>
        <span className={`px-2 py-0.5 text-xs rounded-full ${
          selectedCategories.length === 0
            ? 'bg-[var(--accent)] text-white'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
        }`}>
          {totalCount}
        </span>
      </button>

      {/* Category rows */}
      {CATEGORY_ORDER.map(cat => {
        const count = categoryCounts[cat] || 0;
        if (count === 0) return null;
        const isSelected = selectedCategories.includes(cat);
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onToggleCategory(cat)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
              isSelected
                ? 'bg-[var(--accent-light)] text-[var(--accent)] font-semibold'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
            }`}
          >
            <span>{getCategoryLabel(cat)}</span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${
              isSelected
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            }`}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================
export default function AddComponentModal({
  onClose,
  onAdd,
  onCreateNew,
  targetMeasure = 'Unknown Measure',
  targetSection = 'Unknown Section',
  // Replace mode props
  mode = 'add', // 'add' | 'replace'
  replaceTarget = null, // { index, componentId, componentName, parentClauseId }
}) {
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState([]);
  const [sortBy, setSortBy] = useState('name');
  const [added, setAdded] = useState(false);
  const [showCategoryFilter, setShowCategoryFilter] = useState(true);

  const { components } = useComponentLibraryStore();
  const { measures, activeMeasureId } = useMeasureStore();
  const activeMeasure = measures.find(m => m.id === activeMeasureId);
  const measureCatalog = activeMeasure?.metadata?.program?.toLowerCase().replace(' ', '_') || null;

  const isReplaceMode = mode === 'replace';

  // Get category from a component - use stored metadata.category for consistency
  // with LibraryBrowser, falling back to inferCategory only if not set
  const getComponentCategory = useCallback((c) => {
    return c.metadata?.category || inferCategory(c);
  }, []);

  // Get category counts for all active components
  // Use stored metadata.category for consistency with LibraryBrowser
  const { categoryCounts, totalCount } = useMemo(() => {
    const activeComponents = components.filter(c => c.versionInfo?.status !== 'archived');
    const counts = {};
    activeComponents.forEach(c => {
      const cat = c.metadata?.category || inferCategory(c);
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return { categoryCounts: counts, totalCount: activeComponents.length };
  }, [components]);

  // Filter and sort components (only search text + category filters)
  const filtered = useMemo(() => {
    let items = [...components].filter(c => c.versionInfo?.status !== 'archived');

    if (search) {
      const s = search.toLowerCase();
      items = items.filter(c =>
        c.name.toLowerCase().includes(s) ||
        (c.tags || []).some(tag => tag.toLowerCase().includes(s)) ||
        (c.description || '').toLowerCase().includes(s) ||
        (c.category || '').toLowerCase().includes(s)
      );
    }

    // Category filter: OR logic (show components matching ANY selected category)
    if (filterCat.length > 0) {
      items = items.filter(c => filterCat.includes(getComponentCategory(c)));
    }

    // Apply catalogue-aware sorting: matching components sort first
    if (measureCatalog) {
      items.sort((a, b) => {
        const aMatch = !a.catalogs?.length || a.catalogs.includes(measureCatalog);
        const bMatch = !b.catalogs?.length || b.catalogs.includes(measureCatalog);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return 0;
      });
    }

    // Apply secondary sort based on sortBy
    items.sort((a, b) => {
      // First, preserve catalogue match ordering when measureCatalog is set
      if (measureCatalog) {
        const aMatch = !a.catalogs?.length || a.catalogs.includes(measureCatalog);
        const bMatch = !b.catalogs?.length || b.catalogs.includes(measureCatalog);
        if (aMatch !== bMatch) return aMatch ? -1 : 1;
      }
      // Then apply secondary sort
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name);
      if (sortBy === 'codes') return (b.valueSet?.codes?.length || 0) - (a.valueSet?.codes?.length || 0);
      if (sortBy === 'used') return (b.usage?.usageCount || 0) - (a.usage?.usageCount || 0);
      return 0;
    });

    return items;
  }, [components, search, filterCat, sortBy, getComponentCategory, measureCatalog]);

  // Group by category (real categories only, not atomic/composite type)
  const grouped = useMemo(() => {
    if (sortBy !== 'category') return null;
    const map = {};
    filtered.forEach(c => {
      const cat = getComponentCategory(c);
      (map[cat] = map[cat] || []).push(c);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, sortBy, getComponentCategory]);

  const selectedComp = selected ? components.find(c => c.id === selected) : null;

  const handleAdd = useCallback(() => {
    if (selectedComp && onAdd) {
      onAdd(selectedComp);
      setAdded(true);
    }
  }, [selectedComp, onAdd]);

  const handleAddAnother = useCallback(() => {
    setAdded(false);
    setSelected(null);
  }, []);

  // ============================================================================
  // Success State
  // ============================================================================
  if (added && selectedComp) {
    const cat = getComponentCategory(selectedComp);
    const cc = CAT_COLORS[cat] || CAT_COLORS.other;
    const IconComponent = ICONS[cat] || Code;

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div
          className="w-[480px] rounded-xl shadow-2xl border text-center p-10"
          style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3.5"
            style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)' }}
          >
            <Check size={24} className="text-green-600" />
          </div>
          <div className="text-lg font-bold mb-1.5" style={{ color: 'var(--text)' }}>
            {isReplaceMode ? 'Component Replaced' : 'Component Added'}
          </div>
          <div className="text-sm mb-5" style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            {isReplaceMode ? (
              <>
                Replaced <strong>"{replaceTarget?.componentName}"</strong> with<br />
                <strong>{selectedComp.name}</strong>
              </>
            ) : (
              <>
                <strong>{selectedComp.name}</strong> has been linked to<br />
                <span style={{ color: 'var(--accent)' }}>{targetSection}</span> in {targetMeasure}
              </>
            )}
          </div>

          <div
            className="p-3 rounded-lg border text-left mb-5"
            style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: cc.bg }}
              >
                <IconComponent size={14} style={{ color: cc.text }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
                  {selectedComp.name}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {selectedComp.valueSet?.codes?.length || 0} codes · {cat} · Used in {(selectedComp.usage?.usageCount || 0) + 1} measures
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Link size={12} className="text-green-600" />
                <span className="text-[10px] font-semibold text-green-600">Linked</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-center">
            {!isReplaceMode && (
              <button
                type="button"
                onClick={handleAddAnother}
                className="px-5 py-2 rounded-lg border text-sm font-medium transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                Add Another
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // Component Tile
  // ============================================================================
  const Tile = ({ comp }) => {
    const isSel = selected === comp.id;
    const cat = getComponentCategory(comp);
    const cc = CAT_COLORS[cat] || CAT_COLORS.other;
    const IconComponent = ICONS[cat] || Code;
    const cxLevel = comp.complexity?.level || 'medium';
    const cxDots = cxLevel === 'low' ? 1 : cxLevel === 'medium' ? 2 : 3;
    const cxColor = cxLevel === 'low' ? '#059669' : cxLevel === 'medium' ? '#d97706' : '#dc2626';
    const conf = CONFIDENCE_COLORS[cxLevel] || CONFIDENCE_COLORS.medium;
    // Show catalogue match indicator: only for components with tags that match the measure
    const showCatalogMatch = measureCatalog && comp.catalogs?.length > 0 && comp.catalogs.includes(measureCatalog);

    return (
      <div
        onClick={() => setSelected(isSel ? null : comp.id)}
        className="cursor-pointer mb-1.5"
      >
        <div
          className="p-3 rounded-lg transition-all"
          style={{
            border: isSel ? '2px solid var(--accent)' : '1px solid var(--border)',
            backgroundColor: isSel ? 'var(--accent-muted)' : 'var(--bg-primary)',
          }}
        >
          {/* Row 1: Icon + Name + category badge */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: cc.bg }}
              >
                <IconComponent size={12} style={{ color: cc.text }} />
              </div>
              <div className="text-sm font-bold truncate flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                {comp.name}
                {showCatalogMatch && (
                  <span style={{ color: 'var(--accent)', fontSize: '8px', lineHeight: 1 }}>●</span>
                )}
              </div>
            </div>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded capitalize flex-shrink-0"
              style={{ backgroundColor: cc.bg, color: cc.text }}
            >
              {cat}
            </span>
          </div>

          {/* Row 2: Description */}
          <div
            className="text-xs mb-2 ml-8"
            style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}
          >
            {comp.description || 'No description provided'}
          </div>

          {/* Row 3: Meta row */}
          <div className="flex items-center justify-between ml-8">
            <div className="flex items-center gap-2.5">
              <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                {comp.valueSet?.codes?.length || 0} codes
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>·</span>
              <span className="flex items-center gap-1">
                <div className="flex gap-0.5">
                  {[...Array(3)].map((_, i) => (
                    <div
                      key={i}
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: i < cxDots ? cxColor : 'var(--border)' }}
                    />
                  ))}
                </div>
                <span className="text-[10px] font-semibold capitalize" style={{ color: cxColor }}>
                  {cxLevel}
                </span>
              </span>
              <span style={{ color: 'var(--text-secondary)' }}>·</span>
              <span className="flex items-center gap-1">
                <Link size={10} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Used in {comp.usage?.usageCount || 0} measures
                </span>
              </span>
            </div>
            {comp.versionInfo?.status && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded"
                style={{
                  ...(comp.versionInfo.status === 'approved'
                    ? { color: '#166534', backgroundColor: 'rgba(34, 197, 94, 0.15)' }
                    : { color: '#92400e', backgroundColor: 'rgba(245, 158, 11, 0.15)' }
                  )
                }}
              >
                {comp.versionInfo.status === 'approved' ? 'Approved' : 'In Review'}
              </span>
            )}
          </div>

          {/* Detail expansion when selected */}
          {isSel && (
            <div
              className="mt-2.5 ml-8 p-3 rounded-lg border"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--accent)' }}
            >
              <div className="flex gap-3 mb-2">
                <div className="flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Category
                  </div>
                  <div className="text-xs font-medium capitalize" style={{ color: 'var(--text)' }}>
                    {cat}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Complexity
                  </div>
                  <span
                    className="text-[11px] font-semibold px-1.5 py-0.5 rounded capitalize"
                    style={{ backgroundColor: conf.bg, color: conf.text }}
                  >
                    {cxLevel}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-secondary)' }}>
                    Status
                  </div>
                  <div className="text-xs font-medium capitalize" style={{ color: 'var(--text)' }}>
                    {comp.versionInfo?.status || 'draft'}
                  </div>
                </div>
              </div>
              {comp.tags && comp.tags.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Tags
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {comp.tags.map(tag => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ============================================================================
  // Main Render
  // ============================================================================
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div
        className="w-[600px] max-h-[90vh] rounded-xl shadow-2xl border flex flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'var(--accent-muted)', border: '1px solid var(--accent)' }}
              >
                {isReplaceMode ? (
                  <ArrowLeftRight size={14} style={{ color: 'var(--accent)' }} />
                ) : (
                  <Layers size={14} style={{ color: 'var(--accent)' }} />
                )}
              </div>
              <div>
                <h2 className="text-[15px] font-bold" style={{ color: 'var(--text)' }}>
                  {isReplaceMode ? 'Replace Component' : 'Add Component'}
                </h2>
                <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  Browse the library to find {isReplaceMode ? 'a replacement' : 'an existing component'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-6 h-6 rounded-md flex items-center justify-center hover:opacity-80"
              style={{ color: 'var(--text-secondary)' }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Target context banner */}
          <div
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg mt-2 mb-3"
            style={{ backgroundColor: 'var(--info-bg)', border: '1px solid var(--info-border, var(--border))' }}
          >
            {isReplaceMode ? (
              <ArrowLeftRight size={12} style={{ color: 'var(--info-text)' }} />
            ) : (
              <Plus size={12} style={{ color: 'var(--info-text)' }} />
            )}
            <span className="text-[11px]" style={{ color: 'var(--info-text)' }}>
              {isReplaceMode ? (
                <>Replacing <strong>"{replaceTarget?.componentName}"</strong> in <strong>{targetSection}</strong> in <strong>{targetMeasure}</strong></>
              ) : (
                <>Adding to <strong>{targetSection}</strong> in <strong>{targetMeasure}</strong></>
              )}
            </span>
          </div>

          {/* Search */}
          <div className="relative mb-2">
            <div className="absolute left-2.5 top-2.5">
              <Search size={14} style={{ color: 'var(--text-secondary)' }} />
            </div>
            <input
              type="text"
              className="w-full pl-8 pr-3 py-2 rounded-lg border text-sm outline-none"
              style={{ backgroundColor: 'var(--bg-primary)', borderColor: 'var(--border)', color: 'var(--text)' }}
              placeholder="Search components by name, tag, category, or description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Category Filter Section - collapsible */}
          <div className="mb-2">
            <button
              type="button"
              onClick={() => setShowCategoryFilter(!showCategoryFilter)}
              className="flex items-center gap-1.5 text-xs font-semibold mb-1.5"
              style={{ color: 'var(--text-secondary)' }}
            >
              {showCategoryFilter ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span>Category</span>
              {filterCat.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] bg-[var(--accent)] text-white rounded-full">
                  {filterCat.length}
                </span>
              )}
            </button>
            {showCategoryFilter && (
              <div
                className="p-2 rounded-lg border max-h-[200px] overflow-y-auto"
                style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border)' }}
              >
                <CategoryFilterList
                  categoryCounts={categoryCounts}
                  selectedCategories={filterCat}
                  totalCount={totalCount}
                  onToggleCategory={(cat) => {
                    if (cat === null) {
                      // "All Components" clicked - clear filters
                      setFilterCat([]);
                    } else {
                      // Toggle individual category
                      setFilterCat(prev =>
                        prev.includes(cat)
                          ? prev.filter(c => c !== cat)
                          : [...prev, cat]
                      );
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* Sort options */}
          <div className="flex items-center gap-1 mb-1.5">
            <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Sort:</span>
            {['name', 'category', 'codes', 'used'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSortBy(s)}
                className="px-2 py-1 rounded text-[10px] font-semibold capitalize"
                style={{
                  backgroundColor: sortBy === s ? 'var(--accent)' : 'transparent',
                  color: sortBy === s ? 'white' : 'var(--text-secondary)',
                }}
              >
                {s === 'used' ? 'Most Used' : s}
              </button>
            ))}
          </div>

          {/* Count */}
          <div
            className="text-[11px] pb-1.5 mb-1 border-b"
            style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}
          >
            {filtered.length} component{filtered.length !== 1 && 's'} available
            {selected && <span style={{ color: 'var(--accent)', fontWeight: 600 }}> · 1 selected</span>}
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {sortBy === 'category' && grouped ? (
            grouped.map(([cat, items]) => (
              <div key={cat} className="mb-2.5">
                <div
                  className="text-[10px] font-bold uppercase tracking-wider mb-1 px-0.5 capitalize"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {cat} ({items.length})
                </div>
                {items.map(c => <Tile key={c.id} comp={c} />)}
              </div>
            ))
          ) : (
            filtered.map(c => <Tile key={c.id} comp={c} />)
          )}
          {filtered.length === 0 && (
            <div className="py-8 text-center">
              <div className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
                No components match your search.
              </div>
              {onCreateNew && (
                <button
                  type="button"
                  onClick={onCreateNew}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold"
                  style={{
                    border: '1px solid var(--accent)',
                    backgroundColor: 'var(--accent-muted)',
                    color: 'var(--accent)',
                  }}
                >
                  <Plus size={12} />
                  Create a new component
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 border-t flex-shrink-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex items-center justify-between">
            {onCreateNew ? (
              <button
                type="button"
                onClick={onCreateNew}
                className="flex items-center gap-1.5 text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                <div
                  className="w-5 h-5 rounded flex items-center justify-center"
                  style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}
                >
                  <Sparkles size={10} style={{ color: 'var(--text-secondary)' }} />
                </div>
                <span>Don't see what you need?</span>
                <span
                  className="font-semibold underline underline-offset-2"
                  style={{ color: 'var(--accent)' }}
                >
                  Create a new component
                </span>
              </button>
            ) : (
              <div />
            )}
            <div className="flex gap-2 items-center">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border text-sm font-medium"
                style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!selected}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2"
                style={{
                  backgroundColor: selected ? 'var(--accent)' : 'var(--border)',
                  color: selected ? 'white' : 'var(--text-secondary)',
                  cursor: selected ? 'pointer' : 'not-allowed',
                  boxShadow: selected ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
                }}
              >
                {isReplaceMode && <ArrowLeftRight size={14} />}
                {isReplaceMode ? 'Replace Component' : 'Add to Measure'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
