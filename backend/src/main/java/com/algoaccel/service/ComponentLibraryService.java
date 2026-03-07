package com.algoaccel.service;

import com.algoaccel.model.component.*;
import com.algoaccel.model.enums.ApprovalStatus;
import com.algoaccel.model.enums.ComponentCategory;
import com.algoaccel.repository.ComponentRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

/**
 * Component Library Service
 *
 * Provides CRUD operations for library components with:
 * - Auto-categorization via InferCategoryService
 * - Category re-inference logic on updates
 * - Complexity calculation
 * - Version management
 */
@Service
@Transactional
public class ComponentLibraryService {

    private final ComponentRepository componentRepository;
    private final InferCategoryService inferCategoryService;
    private final ComplexityCalculatorService complexityCalculatorService;
    private final ObjectMapper objectMapper;

    public ComponentLibraryService(
            ComponentRepository componentRepository,
            InferCategoryService inferCategoryService,
            ComplexityCalculatorService complexityCalculatorService,
            ObjectMapper objectMapper) {
        this.componentRepository = componentRepository;
        this.inferCategoryService = inferCategoryService;
        this.complexityCalculatorService = complexityCalculatorService;
        this.objectMapper = objectMapper;
    }

    // ========================================================================
    // CRUD Operations
    // ========================================================================

    /**
     * Find all non-archived components.
     */
    @Transactional(readOnly = true)
    public List<LibraryComponent> findAll() {
        return componentRepository.findAllNonArchived();
    }

    /**
     * Find all components including archived.
     */
    @Transactional(readOnly = true)
    public List<LibraryComponent> findAllIncludingArchived() {
        return componentRepository.findAll();
    }

    /**
     * Find component by ID.
     */
    @Transactional(readOnly = true)
    public Optional<LibraryComponent> findById(String id) {
        return componentRepository.findById(id);
    }

    /**
     * Find components by category.
     */
    @Transactional(readOnly = true)
    public List<LibraryComponent> findByCategory(ComponentCategory category) {
        return componentRepository.findByMetadataCategory(category);
    }

    /**
     * Find components by status.
     */
    @Transactional(readOnly = true)
    public List<LibraryComponent> findByStatus(ApprovalStatus status) {
        return componentRepository.findByVersionInfoStatus(status);
    }

    /**
     * Search components by query.
     */
    @Transactional(readOnly = true)
    public List<LibraryComponent> search(String query) {
        return componentRepository.searchByNameOrDescription(query);
    }

    /**
     * Create a new component.
     * Auto-assigns category via inferCategory() and sets categoryAutoAssigned = true.
     */
    public LibraryComponent create(LibraryComponent component) {
        // Generate ID if not provided
        if (component.getId() == null || component.getId().isEmpty()) {
            component.setId(generateId());
        }

        // Initialize metadata if not present
        if (component.getMetadata() == null) {
            component.setMetadata(ComponentMetadata.builder().build());
        }

        // Auto-infer category on creation
        ComponentCategory inferred = inferCategoryService.infer(component);
        component.getMetadata().setCategory(inferred);
        component.getMetadata().setCategoryAutoAssigned(true);

        // Calculate complexity
        calculateAndSetComplexity(component);

        // Initialize version info
        initializeVersionInfo(component);

        // Initialize usage
        if (component.getUsage() == null) {
            component.setUsage(ComponentUsage.builder()
                .usageCount(0)
                .measureIds("[]")
                .build());
        }

        return componentRepository.save(component);
    }

    /**
     * Update an existing component.
     *
     * Re-inference logic:
     * - If categoryAutoAssigned == true: re-run inferCategory(), update if changed
     * - If categoryAutoAssigned == false: do NOT re-infer (manual override is permanent)
     * - If user explicitly changes category: set categoryAutoAssigned = false
     */
    public LibraryComponent update(String id, LibraryComponent updates) {
        LibraryComponent existing = componentRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("Component not found: " + id));

        // Check if user is manually changing the category
        if (updates.getMetadata() != null &&
            updates.getMetadata().getCategory() != null &&
            existing.getMetadata() != null &&
            !updates.getMetadata().getCategory().equals(existing.getMetadata().getCategory())) {

            // User explicitly set a different category → disable auto-assignment
            existing.getMetadata().setCategoryAutoAssigned(false);
            existing.getMetadata().setCategory(updates.getMetadata().getCategory());
        }
        // Re-infer if auto-assigned and component properties changed
        else if (existing.getMetadata() != null &&
                 Boolean.TRUE.equals(existing.getMetadata().getCategoryAutoAssigned())) {

            // Merge updates first
            mergeUpdates(existing, updates);

            // Re-infer category
            ComponentCategory newCategory = inferCategoryService.infer(existing);
            if (newCategory != existing.getMetadata().getCategory()) {
                existing.getMetadata().setCategory(newCategory);
                // categoryAutoAssigned stays true since we auto-updated it
            }
        } else {
            // categoryAutoAssigned == false: just merge, don't touch category
            mergeUpdates(existing, updates);
        }

        // Recalculate complexity if component properties changed
        calculateAndSetComplexity(existing);

        return componentRepository.save(existing);
    }

    /**
     * Explicitly set category (user action from UI).
     * This disables auto-assignment permanently for this component.
     */
    public LibraryComponent setCategory(String id, ComponentCategory category) {
        LibraryComponent component = componentRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("Component not found: " + id));

        if (component.getMetadata() == null) {
            component.setMetadata(ComponentMetadata.builder().build());
        }

        component.getMetadata().setCategory(category);
        component.getMetadata().setCategoryAutoAssigned(false); // Manual = permanent

        return componentRepository.save(component);
    }

    /**
     * Delete a component by ID.
     */
    public void delete(String id) {
        if (!componentRepository.existsById(id)) {
            throw new EntityNotFoundException("Component not found: " + id);
        }
        componentRepository.deleteById(id);
    }

    // ========================================================================
    // Versioning
    // ========================================================================

    /**
     * Create a new version of a component.
     */
    public LibraryComponent createVersion(String id, String changeDescription, String createdBy) {
        LibraryComponent existing = componentRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("Component not found: " + id));

        if (existing.getVersionInfo() == null) {
            existing.setVersionInfo(ComponentVersionInfo.builder().build());
        }

        // Increment version
        String currentVersion = existing.getVersionInfo().getVersionId();
        String newVersion = incrementVersion(currentVersion);

        // Add to version history
        addToVersionHistory(existing, changeDescription, createdBy);

        // Update version info
        existing.getVersionInfo().setVersionId(newVersion);
        existing.getVersionInfo().setStatus(ApprovalStatus.DRAFT);
        existing.getVersionInfo().setApprovedBy(null);
        existing.getVersionInfo().setApprovedAt(null);

        return componentRepository.save(existing);
    }

    /**
     * Approve a component.
     */
    public LibraryComponent approve(String id, String approvedBy) {
        LibraryComponent component = componentRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("Component not found: " + id));

        if (component.getVersionInfo() == null) {
            component.setVersionInfo(ComponentVersionInfo.builder().build());
        }

        component.getVersionInfo().setStatus(ApprovalStatus.APPROVED);
        component.getVersionInfo().setApprovedBy(approvedBy);
        component.getVersionInfo().setApprovedAt(LocalDateTime.now());

        return componentRepository.save(component);
    }

    /**
     * Archive a component version.
     */
    public LibraryComponent archive(String id, String archivedBy) {
        LibraryComponent component = componentRepository.findById(id)
            .orElseThrow(() -> new EntityNotFoundException("Component not found: " + id));

        if (component.getVersionInfo() == null) {
            component.setVersionInfo(ComponentVersionInfo.builder().build());
        }

        component.getVersionInfo().setStatus(ApprovalStatus.ARCHIVED);

        return componentRepository.save(component);
    }

    // ========================================================================
    // Usage Tracking
    // ========================================================================

    /**
     * Add a measure reference to component usage.
     */
    public void addUsage(String componentId, String measureId) {
        LibraryComponent component = componentRepository.findById(componentId)
            .orElseThrow(() -> new EntityNotFoundException("Component not found: " + componentId));

        if (component.getUsage() == null) {
            component.setUsage(ComponentUsage.builder()
                .measureIds("[]")
                .usageCount(0)
                .build());
        }

        List<String> measureIds = parseMeasureIds(component.getUsage().getMeasureIds());
        if (!measureIds.contains(measureId)) {
            measureIds.add(measureId);
            component.getUsage().setMeasureIds(serializeMeasureIds(measureIds));
            component.getUsage().setUsageCount(measureIds.size());
            component.getUsage().setLastUsedAt(LocalDateTime.now());
            componentRepository.save(component);
        }
    }

    /**
     * Remove a measure reference from component usage.
     */
    public void removeUsage(String componentId, String measureId) {
        LibraryComponent component = componentRepository.findById(componentId)
            .orElseThrow(() -> new EntityNotFoundException("Component not found: " + componentId));

        if (component.getUsage() == null) {
            return;
        }

        List<String> measureIds = parseMeasureIds(component.getUsage().getMeasureIds());
        if (measureIds.remove(measureId)) {
            component.getUsage().setMeasureIds(serializeMeasureIds(measureIds));
            component.getUsage().setUsageCount(measureIds.size());
            componentRepository.save(component);
        }
    }

    // ========================================================================
    // Statistics
    // ========================================================================

    /**
     * Get category counts for non-archived components.
     */
    @Transactional(readOnly = true)
    public Map<ComponentCategory, Long> getCategoryCounts() {
        Map<ComponentCategory, Long> counts = new EnumMap<>(ComponentCategory.class);
        for (ComponentCategory category : ComponentCategory.values()) {
            counts.put(category, componentRepository.countByMetadataCategory(category));
        }
        return counts;
    }

    /**
     * Get status counts.
     */
    @Transactional(readOnly = true)
    public Map<ApprovalStatus, Long> getStatusCounts() {
        Map<ApprovalStatus, Long> counts = new EnumMap<>(ApprovalStatus.class);
        for (ApprovalStatus status : ApprovalStatus.values()) {
            counts.put(status, componentRepository.countByVersionInfoStatus(status));
        }
        return counts;
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private void mergeUpdates(LibraryComponent existing, LibraryComponent updates) {
        if (updates.getName() != null) {
            existing.setName(updates.getName());
        }
        if (updates.getDescription() != null) {
            existing.setDescription(updates.getDescription());
        }

        // Merge atomic-specific fields
        if (existing instanceof AtomicComponent existingAtomic &&
            updates instanceof AtomicComponent updatesAtomic) {

            if (updatesAtomic.getValueSet() != null) {
                existingAtomic.setValueSet(updatesAtomic.getValueSet());
            }
            if (updatesAtomic.getTiming() != null) {
                existingAtomic.setTiming(updatesAtomic.getTiming());
            }
            if (updatesAtomic.getResourceType() != null) {
                existingAtomic.setResourceType(updatesAtomic.getResourceType());
            }
            if (updatesAtomic.getGenderValue() != null) {
                existingAtomic.setGenderValue(updatesAtomic.getGenderValue());
            }
            existingAtomic.setNegation(updatesAtomic.isNegation());
        }

        // Merge composite-specific fields
        if (existing instanceof CompositeComponent existingComposite &&
            updates instanceof CompositeComponent updatesComposite) {

            if (updatesComposite.getOperator() != null) {
                existingComposite.setOperator(updatesComposite.getOperator());
            }
            if (updatesComposite.getChildren() != null) {
                existingComposite.setChildren(updatesComposite.getChildren());
            }
        }

        // Merge metadata (except category which is handled separately)
        if (updates.getMetadata() != null && existing.getMetadata() != null) {
            if (updates.getMetadata().getTags() != null) {
                existing.getMetadata().setTags(updates.getMetadata().getTags());
            }
        }

        // Merge catalogs
        if (updates.getCatalogs() != null) {
            existing.setCatalogs(updates.getCatalogs());
        }
    }

    private void calculateAndSetComplexity(LibraryComponent component) {
        ComponentComplexity complexity;

        if (component instanceof AtomicComponent atomic) {
            complexity = complexityCalculatorService.calculateAtomicComplexity(atomic);
        } else if (component instanceof CompositeComponent composite) {
            complexity = complexityCalculatorService.calculateCompositeComplexity(
                composite,
                this::findByIdDirect
            );
        } else {
            return;
        }

        component.setComplexity(complexity);
    }

    private LibraryComponent findByIdDirect(String id) {
        return componentRepository.findById(id).orElse(null);
    }

    private void initializeVersionInfo(LibraryComponent component) {
        if (component.getVersionInfo() == null) {
            component.setVersionInfo(ComponentVersionInfo.builder()
                .versionId("1.0")
                .status(ApprovalStatus.DRAFT)
                .versionHistory("[]")
                .build());
        }
    }

    private void addToVersionHistory(LibraryComponent component, String changeDescription, String createdBy) {
        List<Map<String, Object>> history = parseVersionHistory(component.getVersionInfo().getVersionHistory());

        Map<String, Object> entry = new HashMap<>();
        entry.put("versionId", component.getVersionInfo().getVersionId());
        entry.put("status", component.getVersionInfo().getStatus().getValue());
        entry.put("createdAt", LocalDateTime.now().toString());
        entry.put("createdBy", createdBy != null ? createdBy : "system");
        entry.put("changeDescription", changeDescription);

        history.add(entry);

        component.getVersionInfo().setVersionHistory(serializeVersionHistory(history));
    }

    private String incrementVersion(String currentVersion) {
        if (currentVersion == null || currentVersion.isEmpty()) {
            return "1.0";
        }
        try {
            String[] parts = currentVersion.split("\\.");
            int major = Integer.parseInt(parts[0]);
            int minor = parts.length > 1 ? Integer.parseInt(parts[1]) : 0;
            return major + "." + (minor + 1);
        } catch (NumberFormatException e) {
            return "1.0";
        }
    }

    private String generateId() {
        return "comp-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 8);
    }

    @SuppressWarnings("unchecked")
    private List<String> parseMeasureIds(String json) {
        if (json == null || json.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            return new ArrayList<>(objectMapper.readValue(json, List.class));
        } catch (JsonProcessingException e) {
            return new ArrayList<>();
        }
    }

    private String serializeMeasureIds(List<String> measureIds) {
        try {
            return objectMapper.writeValueAsString(measureIds);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseVersionHistory(String json) {
        if (json == null || json.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            return new ArrayList<>(objectMapper.readValue(json, List.class));
        } catch (JsonProcessingException e) {
            return new ArrayList<>();
        }
    }

    private String serializeVersionHistory(List<Map<String, Object>> history) {
        try {
            return objectMapper.writeValueAsString(history);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }
}
