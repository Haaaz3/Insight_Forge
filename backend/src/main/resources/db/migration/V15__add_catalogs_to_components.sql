-- Add catalogs column to library_component table
-- Stores JSON array of catalogue tags (e.g., ["ecqm", "hedis", "mips_cqm"])
-- Components with matching catalogues are prioritized when adding to measures

ALTER TABLE library_component ADD COLUMN catalogs TEXT;
