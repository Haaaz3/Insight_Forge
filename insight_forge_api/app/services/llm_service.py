"""
LLM proxy service for making API calls to various LLM providers.
Keeps API keys server-side for security.
"""
import logging
from dataclasses import dataclass
from typing import Dict, List, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


@dataclass
class LlmResponse:
    """Response from an LLM API call."""
    content: str
    tokens_used: int
    provider: str
    model: str


@dataclass
class ProviderInfo:
    """Information about an LLM provider."""
    id: str
    configured: bool
    default_model: str


class LlmService:
    """Service for making LLM API calls."""

    # Default models for each provider
    DEFAULT_MODELS = {
        "anthropic": "claude-sonnet-4-20250514",
        "openai": "gpt-4o",
        "google": "gemini-2.0-flash",
    }

    def __init__(self):
        self.client = httpx.AsyncClient(timeout=120.0)

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

    def get_providers(self) -> Dict:
        """Get available LLM providers and their configuration status."""
        providers = []

        for provider_id in ["anthropic", "openai", "google"]:
            providers.append({
                "id": provider_id,
                "configured": self._is_provider_configured(provider_id),
                "defaultModel": self.DEFAULT_MODELS.get(provider_id),
            })

        return {
            "providers": providers,
            "defaultProvider": self._get_default_provider(),
        }

    def _is_provider_configured(self, provider: str) -> bool:
        """Check if a provider is configured with API keys."""
        if provider == "anthropic":
            return bool(settings.anthropic_api_key)
        if provider == "openai":
            return bool(settings.openai_api_key)
        if provider == "google":
            return bool(settings.google_api_key)
        return False

    def _get_default_provider(self) -> str:
        """Get the default provider (first configured one)."""
        for provider in ["anthropic", "openai", "google"]:
            if self._is_provider_configured(provider):
                return provider
        return "anthropic"

    async def call_llm(
        self,
        provider: Optional[str],
        model: Optional[str],
        system_prompt: Optional[str],
        user_prompt: Optional[str],
        images: Optional[List[str]] = None,
        max_tokens: int = 4000,
    ) -> LlmResponse:
        """Call an LLM API."""
        provider = provider or self._get_default_provider()
        model = model or self.DEFAULT_MODELS.get(provider)

        if not self._is_provider_configured(provider):
            return LlmResponse(
                content=f"Error: Provider {provider} is not configured",
                tokens_used=0,
                provider=provider,
                model=model or "unknown",
            )

        try:
            if provider == "anthropic":
                return await self._call_anthropic(model, system_prompt, user_prompt, images, max_tokens)
            elif provider == "openai":
                return await self._call_openai(model, system_prompt, user_prompt, images, max_tokens)
            elif provider == "google":
                return await self._call_google(model, system_prompt, user_prompt, images, max_tokens)
            else:
                return LlmResponse(
                    content=f"Error: Unknown provider {provider}",
                    tokens_used=0,
                    provider=provider,
                    model=model or "unknown",
                )
        except Exception as e:
            logger.error(f"LLM API call failed: {e}", exc_info=True)
            return LlmResponse(
                content=f"Error: {str(e)}",
                tokens_used=0,
                provider=provider,
                model=model or "unknown",
            )

    async def _call_anthropic(
        self,
        model: Optional[str],
        system_prompt: Optional[str],
        user_prompt: Optional[str],
        images: Optional[List[str]],
        max_tokens: int,
    ) -> LlmResponse:
        """Call Anthropic Claude API."""
        model = model or "claude-sonnet-4-20250514"

        messages = []

        # Build user message content
        content = []
        if images:
            for image in images:
                # Determine media type
                media_type = "image/png"
                if image.startswith("data:"):
                    # Extract media type from data URL
                    parts = image.split(";")
                    if parts:
                        media_type = parts[0].replace("data:", "")
                    # Extract base64 data
                    if "base64," in image:
                        image = image.split("base64,")[1]

                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image,
                    },
                })

        if user_prompt:
            content.append({"type": "text", "text": user_prompt})

        messages.append({"role": "user", "content": content if content else user_prompt or ""})

        request_body = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
        }

        if system_prompt:
            request_body["system"] = system_prompt

        response = await self.client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": settings.anthropic_api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json=request_body,
        )
        response.raise_for_status()
        data = response.json()

        content_text = ""
        for block in data.get("content", []):
            if block.get("type") == "text":
                content_text += block.get("text", "")

        usage = data.get("usage", {})
        tokens_used = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

        return LlmResponse(
            content=content_text,
            tokens_used=tokens_used,
            provider="anthropic",
            model=model,
        )

    async def _call_openai(
        self,
        model: Optional[str],
        system_prompt: Optional[str],
        user_prompt: Optional[str],
        images: Optional[List[str]],
        max_tokens: int,
    ) -> LlmResponse:
        """Call OpenAI API."""
        model = model or "gpt-4o"

        messages = []

        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})

        # Build user message content
        content = []
        if images:
            for image in images:
                image_url = image if image.startswith("data:") else f"data:image/png;base64,{image}"
                content.append({
                    "type": "image_url",
                    "image_url": {"url": image_url},
                })

        if user_prompt:
            content.append({"type": "text", "text": user_prompt})

        if content:
            messages.append({"role": "user", "content": content})
        elif user_prompt:
            messages.append({"role": "user", "content": user_prompt})

        response = await self.client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
            },
        )
        response.raise_for_status()
        data = response.json()

        content_text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        usage = data.get("usage", {})
        tokens_used = usage.get("total_tokens", 0)

        return LlmResponse(
            content=content_text,
            tokens_used=tokens_used,
            provider="openai",
            model=model,
        )

    async def _call_google(
        self,
        model: Optional[str],
        system_prompt: Optional[str],
        user_prompt: Optional[str],
        images: Optional[List[str]],
        max_tokens: int,
    ) -> LlmResponse:
        """Call Google Gemini API."""
        model = model or "gemini-2.0-flash"

        # Build parts
        parts = []

        if images:
            for image in images:
                # Extract base64 data
                if "base64," in image:
                    image = image.split("base64,")[1]

                parts.append({
                    "inline_data": {
                        "mime_type": "image/png",
                        "data": image,
                    }
                })

        combined_prompt = ""
        if system_prompt:
            combined_prompt += f"{system_prompt}\n\n"
        if user_prompt:
            combined_prompt += user_prompt

        if combined_prompt:
            parts.append({"text": combined_prompt})

        response = await self.client.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
            headers={"Content-Type": "application/json"},
            params={"key": settings.google_api_key},
            json={
                "contents": [{"parts": parts}],
                "generationConfig": {"maxOutputTokens": max_tokens},
            },
        )
        response.raise_for_status()
        data = response.json()

        content_text = ""
        candidates = data.get("candidates", [])
        if candidates:
            content = candidates[0].get("content", {})
            for part in content.get("parts", []):
                content_text += part.get("text", "")

        # Google doesn't return token counts in the same way
        tokens_used = 0

        return LlmResponse(
            content=content_text,
            tokens_used=tokens_used,
            provider="google",
            model=model,
        )
