package com.algoaccel.dto.request;

import java.util.List;

/**
 * Request DTO for updating a component.
 * All fields are optional - only provided fields will be updated.
 */
public record UpdateComponentRequest(
    String name,
    String description,

    // Atomic-specific fields
    String valueSetOid,
    String valueSetName,
    String valueSetVersion,
    List<CodeRequest> codes,
    List<ValueSetRequest> additionalValueSets,
    TimingRequest timing,
    Boolean negation,
    String resourceType,
    String genderValue,

    // Composite-specific fields
    String operator,
    List<ComponentReferenceRequest> children,

    // Metadata
    String category,
    List<String> tags,

    // Catalogue tags
    List<String> catalogs
) {

    public record CodeRequest(
        String code,
        String system,
        String display,
        String version
    ) {}

    public record ValueSetRequest(
        String oid,
        String name,
        String version,
        List<CodeRequest> codes
    ) {}

    public record TimingRequest(
        String operator,
        Integer quantity,
        String unit,
        String position,
        String reference,
        String displayExpression
    ) {}

    public record ComponentReferenceRequest(
        String componentId,
        String versionId,
        String displayName
    ) {}
}
