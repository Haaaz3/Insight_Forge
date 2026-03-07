package com.algoaccel.model.component;

import com.algoaccel.model.AuditableEntity;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import lombok.experimental.SuperBuilder;

/**
 * Abstract base class for library components.
 * Uses single-table inheritance with a discriminator column.
 */
@Entity
@Table(name = "library_component", indexes = {
    @Index(name = "idx_component_category", columnList = "category"),
    @Index(name = "idx_component_status", columnList = "version_status"),
    @Index(name = "idx_component_type", columnList = "component_type")
})
@Inheritance(strategy = InheritanceType.SINGLE_TABLE)
@DiscriminatorColumn(name = "component_type", discriminatorType = DiscriminatorType.STRING, length = 31)
@Getter
@Setter
@SuperBuilder
@NoArgsConstructor
public abstract class LibraryComponent extends AuditableEntity {

    @Id
    @Column(length = 255)
    private String id;

    @Column(nullable = false, length = 500)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Embedded
    private ComponentComplexity complexity;

    @Embedded
    private ComponentVersionInfo versionInfo;

    @Embedded
    private ComponentUsage usage;

    @Embedded
    private ComponentMetadata metadata;

    /**
     * JSON array of catalogue tags (e.g., ["ecqm", "hedis"]).
     * Components with matching catalogues are prioritized when adding to measures.
     */
    @Column(name = "catalogs", columnDefinition = "TEXT")
    private String catalogs;

    /**
     * Get the discriminator value for this component type.
     */
    public abstract String getType();
}
