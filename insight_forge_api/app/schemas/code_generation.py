"""
Pydantic schemas for Code Generation DTOs.
Used for CQL and HDI SQL generation endpoints.
"""
from typing import List, Optional

from pydantic import BaseModel


# ============================================================================
# CQL Generation
# ============================================================================

class CqlMetadataResponse(BaseModel):
    """Metadata about generated CQL."""

    libraryName: Optional[str] = None
    version: Optional[str] = None
    populationCount: int = 0
    valueSetCount: int = 0
    definitionCount: int = 0


class CqlResponse(BaseModel):
    """Response DTO for CQL generation."""

    success: bool
    cql: Optional[str] = None
    errors: Optional[List[str]] = None
    warnings: Optional[List[str]] = None
    metadata: Optional[CqlMetadataResponse] = None


# ============================================================================
# SQL Generation
# ============================================================================

class SqlMetadataResponse(BaseModel):
    """Metadata about generated SQL."""

    predicateCount: int = 0
    dataModelsUsed: List[str] = []
    estimatedComplexity: Optional[str] = None
    generatedAt: Optional[str] = None


class SqlResponse(BaseModel):
    """Response DTO for HDI SQL generation."""

    success: bool
    sql: Optional[str] = None
    errors: Optional[List[str]] = None
    warnings: Optional[List[str]] = None
    metadata: Optional[SqlMetadataResponse] = None


class SqlPreviewRequest(BaseModel):
    """Request DTO for SQL preview."""

    populationId: Optional[str] = None
    intakePeriodStart: Optional[str] = None
    intakePeriodEnd: Optional[str] = None


# ============================================================================
# Combined Generation
# ============================================================================

class CombinedCodeResponse(BaseModel):
    """Response DTO for combined CQL and SQL generation."""

    cql: CqlResponse
    sql: SqlResponse
