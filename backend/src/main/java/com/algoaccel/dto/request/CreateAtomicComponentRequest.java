package com.algoaccel.dto.request;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

/**
 * Request DTO for creating an atomic component.
 */
public record CreateAtomicComponentRequest(
    /**
     * Optional client-provided ID. If null, backend will generate one.
     * This allows frontend to create components with stable IDs that match local state.
     */
    String id,

    @NotBlank(message = "Name is required")
    String name,

    String description,

    // Value set info (required for atomic)
    @NotBlank(message = "Value set OID is required")
    String valueSetOid,

    @NotBlank(message = "Value set name is required")
    String valueSetName,

    String valueSetVersion,

    List<CodeRequest> codes,

    List<ValueSetRequest> additionalValueSets,

    // Timing
    TimingRequest timing,

    // Negation
    boolean negation,

    // Resource type
    String resourceType,

    // Gender (for Patient sex components)
    String genderValue,

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
}
