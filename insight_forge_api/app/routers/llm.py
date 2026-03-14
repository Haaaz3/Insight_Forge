"""
LLM proxy REST API router.
Routes LLM calls through the backend to keep API keys secure.
"""
from typing import Dict

from fastapi import APIRouter

from app.schemas.llm import LlmRequest, LlmResponseDto
from app.services.llm_service import LlmService

router = APIRouter(prefix="/llm", tags=["LLM"])

# Singleton LLM service instance
_llm_service: LlmService = None


def get_llm_service() -> LlmService:
    """Get or create the LLM service singleton."""
    global _llm_service
    if _llm_service is None:
        _llm_service = LlmService()
    return _llm_service


# ============================================================================
# Provider Information
# ============================================================================


@router.get("/providers")
async def get_providers() -> Dict:
    """
    Get available LLM providers and their configuration status.

    Returns:
        List of providers with configuration status and default models.
    """
    service = get_llm_service()
    return service.get_providers()


# ============================================================================
# LLM Endpoints
# ============================================================================


@router.post("/complete", response_model=LlmResponseDto)
async def complete(request: LlmRequest) -> LlmResponseDto:
    """
    Call an LLM for general text completion.

    This is a generic endpoint that can be used for various LLM tasks.
    """
    service = get_llm_service()
    result = await service.call_llm(
        provider=request.provider,
        model=request.model,
        system_prompt=request.systemPrompt,
        user_prompt=request.userPrompt,
        images=request.images,
        max_tokens=request.maxTokens or 4000,
    )

    return LlmResponseDto(
        content=result.content,
        tokensUsed=result.tokens_used,
        provider=result.provider,
        model=result.model,
    )


@router.post("/extract", response_model=LlmResponseDto)
async def extract_measure(request: LlmRequest) -> LlmResponseDto:
    """
    Extract measure data from document content using AI.

    Specialized endpoint for measure PDF/document extraction.
    Uses higher token limit for extraction tasks.
    """
    service = get_llm_service()
    result = await service.call_llm(
        provider=request.provider,
        model=request.model,
        system_prompt=request.systemPrompt,
        user_prompt=request.userPrompt,
        images=request.images,
        max_tokens=request.maxTokens or 16000,
    )

    return LlmResponseDto(
        content=result.content,
        tokensUsed=result.tokens_used,
        provider=result.provider,
        model=result.model,
    )


@router.post("/assist", response_model=LlmResponseDto)
async def assist(request: LlmRequest) -> LlmResponseDto:
    """
    AI assistant for measure editing.

    Specialized endpoint for the AI chat assistant in the UMS editor.
    """
    service = get_llm_service()
    result = await service.call_llm(
        provider=request.provider,
        model=request.model,
        system_prompt=request.systemPrompt,
        user_prompt=request.userPrompt,
        images=None,  # No images for assistant
        max_tokens=request.maxTokens or 4000,
    )

    return LlmResponseDto(
        content=result.content,
        tokensUsed=result.tokens_used,
        provider=result.provider,
        model=result.model,
    )
