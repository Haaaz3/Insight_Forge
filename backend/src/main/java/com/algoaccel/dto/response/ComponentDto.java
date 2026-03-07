package com.algoaccel.dto.response;

import com.algoaccel.model.enums.*;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Response DTO for library components.
 * Flattens the entity structure for safe JSON serialization.
 */
public record ComponentDto(
    String id,
    String type,
    String name,
    String description,

    // Atomic-specific fields
    ValueSetDto valueSet,
    List<ValueSetDto> additionalValueSets,
    TimingDto timing,
    boolean negation,
    String resourceType,
    String genderValue,

    // Composite-specific fields
    String operator,
    List<ComponentReferenceDto> children,

    // Complexity
    ComplexityDto complexity,

    // Version info
    VersionInfoDto versionInfo,

    // Usage
    UsageDto usage,

    // Metadata
    MetadataDto metadata,

    // Catalogue tags
    List<String> catalogs,

    // Audit
    LocalDateTime createdAt,
    String createdBy,
    LocalDateTime updatedAt,
    String updatedBy
) {

    public record ValueSetDto(
        String oid,
        String name,
        String version,
        List<CodeDto> codes
    ) {}

    public record CodeDto(
        String code,
        String system,
        String display,
        String version
    ) {}

    public record TimingDto(
        String operator,
        Integer quantity,
        String unit,
        String position,
        String reference,
        String displayExpression
    ) {}

    public record ComponentReferenceDto(
        String componentId,
        String versionId,
        String displayName
    ) {}

    public record ComplexityDto(
        String level,
        int score,
        int valueSetCount,
        int timingCount,
        int nestedDepth,
        String explanation
    ) {}

    public record VersionInfoDto(
        String versionId,
        String status,
        List<VersionHistoryEntryDto> versionHistory,
        String approvedBy,
        LocalDateTime approvedAt,
        String reviewNotes
    ) {}

    public record VersionHistoryEntryDto(
        String versionId,
        String status,
        String createdAt,
        String createdBy,
        String changeDescription
    ) {}

    public record UsageDto(
        int usageCount,
        List<String> measureIds,
        LocalDateTime lastUsedAt
    ) {}

    public record MetadataDto(
        String category,
        boolean categoryAutoAssigned,
        List<String> tags
    ) {}
}
