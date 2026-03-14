"""
Code generation REST endpoints.
Generates CQL and HDI SQL from measure specifications.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import get_db
from app.schemas.code_generation import (
    CombinedCodeResponse,
    CqlMetadataResponse,
    CqlResponse,
    SqlMetadataResponse,
    SqlPreviewRequest,
    SqlResponse,
)
from app.services.cql_generator_service import CqlGeneratorService
from app.services.hdi_sql_generator_service import HdiSqlGeneratorService

router = APIRouter(tags=["code-generation"])


# ============================================================================
# CQL Generation Endpoints
# ============================================================================


@router.get("/measures/{measure_id}/cql", response_model=CqlResponse)
async def generate_cql(
    measure_id: str,
    db: AsyncSession = Depends(get_db),
) -> CqlResponse:
    """
    Generate CQL for a measure.

    Args:
        measure_id: The measure ID (primary key)

    Returns:
        Generated CQL library code
    """
    service = CqlGeneratorService(db)
    result = await service.generate_cql(measure_id)

    if not result.success:
        # Return 422 for validation/generation errors
        return CqlResponse(
            success=False,
            cql=None,
            errors=result.errors,
            warnings=result.warnings,
            metadata=None,
        )

    return CqlResponse(
        success=True,
        cql=result.cql,
        errors=None,
        warnings=result.warnings,
        metadata=CqlMetadataResponse(
            libraryName=result.metadata.library_name,
            version=result.metadata.version,
            populationCount=result.metadata.population_count,
            valueSetCount=result.metadata.value_set_count,
            definitionCount=result.metadata.definition_count,
        ),
    )


@router.post("/measures/{measure_id}/cql/preview", response_model=CqlResponse)
async def preview_cql(
    measure_id: str,
    db: AsyncSession = Depends(get_db),
) -> CqlResponse:
    """
    Preview CQL generation without persisting.
    Same as generate but marked as preview.
    """
    return await generate_cql(measure_id, db)


# ============================================================================
# HDI SQL Generation Endpoints
# ============================================================================


@router.get("/measures/{measure_id}/sql", response_model=SqlResponse)
async def generate_sql(
    measure_id: str,
    population_id: Optional[str] = Query(default="${POPULATION_ID}"),
    db: AsyncSession = Depends(get_db),
) -> SqlResponse:
    """
    Generate HDI SQL for a measure.

    Args:
        measure_id: The measure ID (primary key)
        population_id: HDI population_id parameter (optional, defaults to placeholder)

    Returns:
        Generated SQL query
    """
    service = HdiSqlGeneratorService(db)
    result = await service.generate_hdi_sql(measure_id, population_id)

    if not result.success:
        return SqlResponse(
            success=False,
            sql=None,
            errors=result.errors,
            warnings=result.warnings,
            metadata=None,
        )

    return SqlResponse(
        success=True,
        sql=result.sql,
        errors=None,
        warnings=result.warnings,
        metadata=SqlMetadataResponse(
            predicateCount=result.metadata.predicate_count,
            dataModelsUsed=result.metadata.data_models_used,
            estimatedComplexity=result.metadata.estimated_complexity,
            generatedAt=result.metadata.generated_at,
        ),
    )


@router.post("/measures/{measure_id}/sql/preview", response_model=SqlResponse)
async def preview_sql(
    measure_id: str,
    request: Optional[SqlPreviewRequest] = None,
    db: AsyncSession = Depends(get_db),
) -> SqlResponse:
    """
    Preview HDI SQL generation without persisting.
    """
    population_id = "${POPULATION_ID}"
    if request and request.populationId:
        population_id = request.populationId

    return await generate_sql(measure_id, population_id, db)


# ============================================================================
# Combined Generation Endpoint
# ============================================================================


@router.get("/measures/{measure_id}/code", response_model=CombinedCodeResponse)
async def generate_all_code(
    measure_id: str,
    population_id: Optional[str] = Query(default="${POPULATION_ID}"),
    db: AsyncSession = Depends(get_db),
) -> CombinedCodeResponse:
    """
    Generate both CQL and SQL for a measure in one request.
    """
    cql_service = CqlGeneratorService(db)
    sql_service = HdiSqlGeneratorService(db)

    cql_result = await cql_service.generate_cql(measure_id)
    sql_result = await sql_service.generate_hdi_sql(measure_id, population_id)

    cql_response = CqlResponse(
        success=cql_result.success,
        cql=cql_result.cql if cql_result.success else None,
        errors=cql_result.errors,
        warnings=cql_result.warnings,
        metadata=CqlMetadataResponse(
            libraryName=cql_result.metadata.library_name,
            version=cql_result.metadata.version,
            populationCount=cql_result.metadata.population_count,
            valueSetCount=cql_result.metadata.value_set_count,
            definitionCount=cql_result.metadata.definition_count,
        ) if cql_result.success else None,
    )

    sql_response = SqlResponse(
        success=sql_result.success,
        sql=sql_result.sql if sql_result.success else None,
        errors=sql_result.errors,
        warnings=sql_result.warnings,
        metadata=SqlMetadataResponse(
            predicateCount=sql_result.metadata.predicate_count,
            dataModelsUsed=sql_result.metadata.data_models_used,
            estimatedComplexity=sql_result.metadata.estimated_complexity,
            generatedAt=sql_result.metadata.generated_at,
        ) if sql_result.success else None,
    )

    return CombinedCodeResponse(cql=cql_response, sql=sql_response)
