package com.algoaccel.dto.mapper;

import com.algoaccel.dto.request.*;
import com.algoaccel.dto.response.*;
import com.algoaccel.dto.response.ComponentDto.*;
import com.algoaccel.model.component.*;
import com.algoaccel.model.enums.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.stream.Collectors;

/**
 * Mapper for converting between component entities and DTOs.
 */
@Component
public class ComponentMapper {

    private final ObjectMapper objectMapper;

    public ComponentMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    // ========================================================================
    // Entity -> DTO Conversions
    // ========================================================================

    /**
     * Convert a library component to a full DTO.
     */
    public ComponentDto toDto(LibraryComponent entity) {
        if (entity == null) {
            return null;
        }

        boolean isAtomic = entity instanceof AtomicComponent;
        AtomicComponent atomic = isAtomic ? (AtomicComponent) entity : null;
        CompositeComponent composite = !isAtomic ? (CompositeComponent) entity : null;

        return new ComponentDto(
            entity.getId(),
            entity.getType(),
            entity.getName(),
            entity.getDescription(),

            // Atomic-specific
            isAtomic ? toValueSetDto(atomic.getValueSet()) : null,
            isAtomic ? parseAdditionalValueSets(atomic.getAdditionalValueSets()) : null,
            isAtomic ? toTimingDto(atomic.getTiming()) : null,
            isAtomic && atomic.isNegation(),
            isAtomic ? atomic.getResourceType() : null,
            isAtomic && atomic.getGenderValue() != null ? atomic.getGenderValue().getValue() : null,

            // Composite-specific
            !isAtomic && composite.getOperator() != null ? composite.getOperator().getValue() : null,
            !isAtomic ? parseComponentReferences(composite.getChildren()) : null,

            // Complexity
            toComplexityDto(entity.getComplexity()),

            // Version info
            toVersionInfoDto(entity.getVersionInfo()),

            // Usage
            toUsageDto(entity.getUsage()),

            // Metadata
            toMetadataDto(entity.getMetadata()),

            // Catalogs
            parseStringList(entity.getCatalogs()),

            // Audit
            entity.getCreatedAt(),
            entity.getCreatedBy(),
            entity.getUpdatedAt(),
            entity.getUpdatedBy()
        );
    }

    /**
     * Convert a library component to a summary DTO.
     */
    public ComponentSummaryDto toSummaryDto(LibraryComponent entity) {
        if (entity == null) {
            return null;
        }

        return new ComponentSummaryDto(
            entity.getId(),
            entity.getType(),
            entity.getName(),
            entity.getDescription(),
            entity.getMetadata() != null && entity.getMetadata().getCategory() != null ?
                entity.getMetadata().getCategory().getValue() : null,
            entity.getVersionInfo() != null && entity.getVersionInfo().getStatus() != null ?
                entity.getVersionInfo().getStatus().getValue() : null,
            entity.getComplexity() != null && entity.getComplexity().getLevel() != null ?
                entity.getComplexity().getLevel().getValue() : null,
            entity.getUsage() != null && entity.getUsage().getUsageCount() != null ?
                entity.getUsage().getUsageCount() : 0,
            entity.getUpdatedAt()
        );
    }

    /**
     * Convert a list of components to summary DTOs.
     */
    public List<ComponentSummaryDto> toSummaryDtoList(List<LibraryComponent> entities) {
        if (entities == null) {
            return Collections.emptyList();
        }
        return entities.stream()
            .map(this::toSummaryDto)
            .collect(Collectors.toList());
    }

    // ========================================================================
    // DTO -> Entity Conversions
    // ========================================================================

    /**
     * Convert a create atomic component request to an entity.
     */
    public AtomicComponent toEntity(CreateAtomicComponentRequest request) {
        AtomicComponent entity = new AtomicComponent();

        // Use client-provided ID if present, otherwise let service generate one
        if (request.id() != null && !request.id().isEmpty()) {
            entity.setId(request.id());
        }

        entity.setName(request.name());
        entity.setDescription(request.description());

        // Value set
        entity.setValueSet(ComponentValueSet.builder()
            .oid(request.valueSetOid())
            .name(request.valueSetName())
            .version(request.valueSetVersion())
            .codes(serializeCodes(request.codes()))
            .build());

        // Additional value sets
        if (request.additionalValueSets() != null && !request.additionalValueSets().isEmpty()) {
            entity.setAdditionalValueSets(serializeValueSets(request.additionalValueSets()));
        }

        // Timing
        if (request.timing() != null) {
            entity.setTiming(toTimingExpression(request.timing()));
        }

        // Negation
        entity.setNegation(request.negation());

        // Resource type
        entity.setResourceType(request.resourceType());

        // Gender
        if (request.genderValue() != null) {
            entity.setGenderValue(Gender.fromValue(request.genderValue()));
        }

        // Metadata
        ComponentMetadata metadata = ComponentMetadata.builder()
            .tags(serializeTags(request.tags()))
            .build();
        if (request.category() != null) {
            metadata.setCategory(ComponentCategory.fromValue(request.category()));
            metadata.setCategoryAutoAssigned(false);
        }
        entity.setMetadata(metadata);

        // Catalogs
        entity.setCatalogs(serializeTags(request.catalogs()));

        return entity;
    }

    /**
     * Convert a create composite component request to an entity.
     */
    public CompositeComponent toEntity(CreateCompositeComponentRequest request) {
        CompositeComponent entity = new CompositeComponent();
        entity.setName(request.name());
        entity.setDescription(request.description());

        // Operator
        entity.setOperator(LogicalOperator.fromValue(request.operator()));

        // Children
        entity.setChildren(serializeChildReferences(request.children()));

        // Metadata
        ComponentMetadata metadata = ComponentMetadata.builder()
            .tags(serializeTags(request.tags()))
            .build();
        if (request.category() != null) {
            metadata.setCategory(ComponentCategory.fromValue(request.category()));
            metadata.setCategoryAutoAssigned(false);
        }
        entity.setMetadata(metadata);

        // Catalogs
        entity.setCatalogs(serializeTags(request.catalogs()));

        return entity;
    }

    /**
     * Apply updates from request to an existing entity.
     */
    public void applyUpdates(LibraryComponent entity, UpdateComponentRequest request) {
        if (request.name() != null) {
            entity.setName(request.name());
        }
        if (request.description() != null) {
            entity.setDescription(request.description());
        }

        // Atomic-specific updates
        if (entity instanceof AtomicComponent atomic) {
            if (request.valueSetOid() != null || request.valueSetName() != null) {
                ComponentValueSet vs = atomic.getValueSet() != null ?
                    atomic.getValueSet() : new ComponentValueSet();
                if (request.valueSetOid() != null) {
                    vs.setOid(request.valueSetOid());
                }
                if (request.valueSetName() != null) {
                    vs.setName(request.valueSetName());
                }
                if (request.valueSetVersion() != null) {
                    vs.setVersion(request.valueSetVersion());
                }
                if (request.codes() != null) {
                    vs.setCodes(serializeUpdateCodes(request.codes()));
                }
                atomic.setValueSet(vs);
            }

            if (request.additionalValueSets() != null) {
                atomic.setAdditionalValueSets(serializeUpdateValueSets(request.additionalValueSets()));
            }

            if (request.timing() != null) {
                atomic.setTiming(toTimingExpressionFromUpdate(request.timing()));
            }

            if (request.negation() != null) {
                atomic.setNegation(request.negation());
            }

            if (request.resourceType() != null) {
                atomic.setResourceType(request.resourceType());
            }

            if (request.genderValue() != null) {
                atomic.setGenderValue(Gender.fromValue(request.genderValue()));
            }
        }

        // Composite-specific updates
        if (entity instanceof CompositeComponent composite) {
            if (request.operator() != null) {
                composite.setOperator(LogicalOperator.fromValue(request.operator()));
            }

            if (request.children() != null) {
                composite.setChildren(serializeUpdateChildReferences(request.children()));
            }
        }

        // Metadata updates
        if (request.tags() != null) {
            if (entity.getMetadata() == null) {
                entity.setMetadata(new ComponentMetadata());
            }
            entity.getMetadata().setTags(serializeTags(request.tags()));
        }

        // Catalogs updates
        if (request.catalogs() != null) {
            entity.setCatalogs(serializeTags(request.catalogs()));
        }

        // Note: category updates are handled by the service layer for re-inference logic
    }

    // ========================================================================
    // Private Helpers: DTO Conversion
    // ========================================================================

    private ValueSetDto toValueSetDto(ComponentValueSet vs) {
        if (vs == null) {
            return null;
        }
        return new ValueSetDto(
            vs.getOid(),
            vs.getName(),
            vs.getVersion(),
            parseCodes(vs.getCodes())
        );
    }

    private TimingDto toTimingDto(TimingExpression timing) {
        if (timing == null) {
            return null;
        }
        return new TimingDto(
            timing.getOperator() != null ? timing.getOperator().getValue() : null,
            timing.getQuantity(),
            timing.getUnit(),
            timing.getPosition(),
            timing.getReference(),
            timing.getDisplayExpression()
        );
    }

    private ComplexityDto toComplexityDto(ComponentComplexity complexity) {
        if (complexity == null) {
            return null;
        }

        // Parse factors to get individual values
        Map<String, Object> factors = parseFactors(complexity.getFactors());

        return new ComplexityDto(
            complexity.getLevel() != null ? complexity.getLevel().getValue() : null,
            complexity.getScore() != null ? complexity.getScore() : 0,
            getIntFromFactors(factors, "valueSetCount"),
            getIntFromFactors(factors, "timingClauses"),
            getIntFromFactors(factors, "nestingDepth"),
            complexity.getFactors()
        );
    }

    private VersionInfoDto toVersionInfoDto(ComponentVersionInfo vi) {
        if (vi == null) {
            return null;
        }
        return new VersionInfoDto(
            vi.getVersionId(),
            vi.getStatus() != null ? vi.getStatus().getValue() : null,
            parseVersionHistory(vi.getVersionHistory()),
            vi.getApprovedBy(),
            vi.getApprovedAt(),
            vi.getReviewNotes()
        );
    }

    private UsageDto toUsageDto(ComponentUsage usage) {
        if (usage == null) {
            return null;
        }
        return new UsageDto(
            usage.getUsageCount() != null ? usage.getUsageCount() : 0,
            parseStringList(usage.getMeasureIds()),
            usage.getLastUsedAt()
        );
    }

    private MetadataDto toMetadataDto(ComponentMetadata metadata) {
        if (metadata == null) {
            return null;
        }
        return new MetadataDto(
            metadata.getCategory() != null ? metadata.getCategory().getValue() : null,
            Boolean.TRUE.equals(metadata.getCategoryAutoAssigned()),
            parseStringList(metadata.getTags())
        );
    }

    // ========================================================================
    // Private Helpers: JSON Parsing
    // ========================================================================

    private List<CodeDto> parseCodes(String json) {
        if (json == null || json.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            List<Map<String, String>> codes = objectMapper.readValue(json,
                new TypeReference<List<Map<String, String>>>() {});
            return codes.stream()
                .map(c -> new CodeDto(
                    c.get("code"),
                    c.get("system"),
                    c.get("display"),
                    c.get("version")
                ))
                .collect(Collectors.toList());
        } catch (JsonProcessingException e) {
            return Collections.emptyList();
        }
    }

    private List<ValueSetDto> parseAdditionalValueSets(String json) {
        if (json == null || json.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            List<Map<String, Object>> valueSets = objectMapper.readValue(json,
                new TypeReference<List<Map<String, Object>>>() {});
            return valueSets.stream()
                .map(vs -> new ValueSetDto(
                    (String) vs.get("oid"),
                    (String) vs.get("name"),
                    (String) vs.get("version"),
                    parseCodesFromMap(vs.get("codes"))
                ))
                .collect(Collectors.toList());
        } catch (JsonProcessingException e) {
            return Collections.emptyList();
        }
    }

    @SuppressWarnings("unchecked")
    private List<CodeDto> parseCodesFromMap(Object codesObj) {
        if (codesObj == null) {
            return Collections.emptyList();
        }
        List<Map<String, String>> codes = (List<Map<String, String>>) codesObj;
        return codes.stream()
            .map(c -> new CodeDto(
                c.get("code"),
                c.get("system"),
                c.get("display"),
                c.get("version")
            ))
            .collect(Collectors.toList());
    }

    private List<ComponentReferenceDto> parseComponentReferences(String json) {
        if (json == null || json.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            List<Map<String, String>> refs = objectMapper.readValue(json,
                new TypeReference<List<Map<String, String>>>() {});
            return refs.stream()
                .map(r -> new ComponentReferenceDto(
                    r.get("componentId"),
                    r.get("versionId"),
                    r.get("displayName")
                ))
                .collect(Collectors.toList());
        } catch (JsonProcessingException e) {
            return Collections.emptyList();
        }
    }

    private List<VersionHistoryEntryDto> parseVersionHistory(String json) {
        if (json == null || json.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            List<Map<String, String>> history = objectMapper.readValue(json,
                new TypeReference<List<Map<String, String>>>() {});
            return history.stream()
                .map(h -> new VersionHistoryEntryDto(
                    h.get("versionId"),
                    h.get("status"),
                    h.get("createdAt"),
                    h.get("createdBy"),
                    h.get("changeDescription")
                ))
                .collect(Collectors.toList());
        } catch (JsonProcessingException e) {
            return Collections.emptyList();
        }
    }

    private List<String> parseStringList(String json) {
        if (json == null || json.isEmpty()) {
            return Collections.emptyList();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() {});
        } catch (JsonProcessingException e) {
            return Collections.emptyList();
        }
    }

    private Map<String, Object> parseFactors(String json) {
        if (json == null || json.isEmpty()) {
            return Collections.emptyMap();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (JsonProcessingException e) {
            return Collections.emptyMap();
        }
    }

    private int getIntFromFactors(Map<String, Object> factors, String key) {
        Object value = factors.get(key);
        if (value instanceof Number) {
            return ((Number) value).intValue();
        }
        return 0;
    }

    // ========================================================================
    // Private Helpers: JSON Serialization
    // ========================================================================

    private String serializeCodes(List<CreateAtomicComponentRequest.CodeRequest> codes) {
        if (codes == null || codes.isEmpty()) {
            return "[]";
        }
        try {
            List<Map<String, String>> codesList = codes.stream()
                .map(c -> {
                    Map<String, String> map = new LinkedHashMap<>();
                    map.put("code", c.code());
                    map.put("system", c.system());
                    map.put("display", c.display());
                    map.put("version", c.version());
                    return map;
                })
                .collect(Collectors.toList());
            return objectMapper.writeValueAsString(codesList);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private String serializeUpdateCodes(List<UpdateComponentRequest.CodeRequest> codes) {
        if (codes == null || codes.isEmpty()) {
            return "[]";
        }
        try {
            List<Map<String, String>> codesList = codes.stream()
                .map(c -> {
                    Map<String, String> map = new LinkedHashMap<>();
                    map.put("code", c.code());
                    map.put("system", c.system());
                    map.put("display", c.display());
                    map.put("version", c.version());
                    return map;
                })
                .collect(Collectors.toList());
            return objectMapper.writeValueAsString(codesList);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private String serializeValueSets(List<CreateAtomicComponentRequest.ValueSetRequest> valueSets) {
        if (valueSets == null || valueSets.isEmpty()) {
            return "[]";
        }
        try {
            List<Map<String, Object>> vsList = valueSets.stream()
                .map(vs -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("oid", vs.oid());
                    map.put("name", vs.name());
                    map.put("version", vs.version());
                    if (vs.codes() != null) {
                        map.put("codes", vs.codes().stream()
                            .map(c -> {
                                Map<String, String> codeMap = new LinkedHashMap<>();
                                codeMap.put("code", c.code());
                                codeMap.put("system", c.system());
                                codeMap.put("display", c.display());
                                codeMap.put("version", c.version());
                                return codeMap;
                            })
                            .collect(Collectors.toList()));
                    }
                    return map;
                })
                .collect(Collectors.toList());
            return objectMapper.writeValueAsString(vsList);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private String serializeUpdateValueSets(List<UpdateComponentRequest.ValueSetRequest> valueSets) {
        if (valueSets == null || valueSets.isEmpty()) {
            return "[]";
        }
        try {
            List<Map<String, Object>> vsList = valueSets.stream()
                .map(vs -> {
                    Map<String, Object> map = new LinkedHashMap<>();
                    map.put("oid", vs.oid());
                    map.put("name", vs.name());
                    map.put("version", vs.version());
                    if (vs.codes() != null) {
                        map.put("codes", vs.codes().stream()
                            .map(c -> {
                                Map<String, String> codeMap = new LinkedHashMap<>();
                                codeMap.put("code", c.code());
                                codeMap.put("system", c.system());
                                codeMap.put("display", c.display());
                                codeMap.put("version", c.version());
                                return codeMap;
                            })
                            .collect(Collectors.toList()));
                    }
                    return map;
                })
                .collect(Collectors.toList());
            return objectMapper.writeValueAsString(vsList);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private String serializeChildReferences(List<CreateCompositeComponentRequest.ComponentReferenceRequest> children) {
        if (children == null || children.isEmpty()) {
            return "[]";
        }
        try {
            List<Map<String, String>> refsList = children.stream()
                .map(r -> {
                    Map<String, String> map = new LinkedHashMap<>();
                    map.put("componentId", r.componentId());
                    map.put("versionId", r.versionId());
                    map.put("displayName", r.displayName());
                    return map;
                })
                .collect(Collectors.toList());
            return objectMapper.writeValueAsString(refsList);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private String serializeUpdateChildReferences(List<UpdateComponentRequest.ComponentReferenceRequest> children) {
        if (children == null || children.isEmpty()) {
            return "[]";
        }
        try {
            List<Map<String, String>> refsList = children.stream()
                .map(r -> {
                    Map<String, String> map = new LinkedHashMap<>();
                    map.put("componentId", r.componentId());
                    map.put("versionId", r.versionId());
                    map.put("displayName", r.displayName());
                    return map;
                })
                .collect(Collectors.toList());
            return objectMapper.writeValueAsString(refsList);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private String serializeTags(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return "[]";
        }
        try {
            return objectMapper.writeValueAsString(tags);
        } catch (JsonProcessingException e) {
            return "[]";
        }
    }

    private TimingExpression toTimingExpression(CreateAtomicComponentRequest.TimingRequest timing) {
        if (timing == null) {
            return null;
        }
        return TimingExpression.builder()
            .operator(timing.operator() != null ? TimingOperator.fromValue(timing.operator()) : null)
            .quantity(timing.quantity())
            .unit(timing.unit())
            .position(timing.position())
            .reference(timing.reference())
            .displayExpression(timing.displayExpression())
            .build();
    }

    private TimingExpression toTimingExpressionFromUpdate(UpdateComponentRequest.TimingRequest timing) {
        if (timing == null) {
            return null;
        }
        return TimingExpression.builder()
            .operator(timing.operator() != null ? TimingOperator.fromValue(timing.operator()) : null)
            .quantity(timing.quantity())
            .unit(timing.unit())
            .position(timing.position())
            .reference(timing.reference())
            .displayExpression(timing.displayExpression())
            .build();
    }
}
