package com.algoaccel.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

/**
 * Request DTO for creating a composite component.
 */
public record CreateCompositeComponentRequest(
    @NotBlank(message = "Name is required")
    String name,

    String description,

    // Logical operator (AND, OR)
    @NotBlank(message = "Operator is required")
    String operator,

    // Child component references
    @NotEmpty(message = "At least one child component is required")
    List<ComponentReferenceRequest> children,

    // Metadata
    String category,
    List<String> tags,

    // Catalogue tags
    List<String> catalogs
) {

    public record ComponentReferenceRequest(
        @NotBlank(message = "Component ID is required")
        String componentId,

        String versionId,
        String displayName
    ) {}
}
