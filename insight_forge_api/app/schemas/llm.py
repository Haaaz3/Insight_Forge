"""
Pydantic schemas for LLM-related DTOs.
Used for LLM proxy endpoints (extraction, assist, etc.).
"""
from typing import List, Optional

from pydantic import BaseModel


class LlmRequest(BaseModel):
    """Request DTO for LLM API calls."""

    provider: Optional[str] = None  # anthropic, openai, google, custom
    model: Optional[str] = None
    systemPrompt: Optional[str] = None
    userPrompt: Optional[str] = None
    images: Optional[List[str]] = None  # Base64 encoded images
    maxTokens: Optional[int] = None


class LlmResponseDto(BaseModel):
    """Response DTO for LLM API calls."""

    content: Optional[str] = None
    tokensUsed: Optional[int] = None
    provider: Optional[str] = None
    model: Optional[str] = None
