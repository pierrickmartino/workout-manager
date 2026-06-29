"""Application settings, loaded from the environment.

Secrets and environment-specific values (Clerk issuer/JWKS URL, database and
Redis URLs) are never hardcoded — they come from env vars / a .env file."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Clerk / auth
    clerk_issuer: str = ""
    clerk_jwks_url: str = ""

    # Infrastructure
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/workout"
    redis_url: str = "redis://localhost:6379/0"

    # AI generation (ADR-0006). Required for live generation; never hardcoded.
    anthropic_api_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
