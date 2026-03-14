"""
Application configuration using Pydantic settings.
Loads from environment variables with .env file support.
"""
from functools import lru_cache
from typing import List, Literal, Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Environment
    environment: Literal["dev", "oracle"] = "dev"

    # Database
    database_url: str = "sqlite+aiosqlite:///./data/insightforge.db"
    database_url_oracle: Optional[str] = None

    # CORS
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        """Parse CORS origins from JSON string or list."""
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except json.JSONDecodeError:
                # Fallback: split by comma
                return [origin.strip() for origin in v.split(",")]
        return v

    # LLM API Keys (server-side only)
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    google_api_key: Optional[str] = None

    # Auth
    auth_enabled: bool = False  # Set to True in production
    jwt_secret: str = "dev-secret-change-in-prod"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 24 hours

    @property
    def effective_database_url(self) -> str:
        """Return the database URL based on environment."""
        if self.environment == "oracle" and self.database_url_oracle:
            return self.database_url_oracle
        return self.database_url

    @property
    def is_oracle(self) -> bool:
        """Check if running in Oracle mode."""
        return self.environment == "oracle"


@lru_cache
def get_settings() -> Settings:
    """
    Get cached settings instance.
    Uses lru_cache to ensure settings are only loaded once.
    """
    return Settings()
