"""Application settings, loaded from the environment.

Secrets and environment-specific values (Clerk issuer/JWKS URL, database and
Redis URLs) are never hardcoded — they come from env vars / a .env file."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Per-provider default models (ADR-0006). The active provider's default is used
# unless ``AI_MODEL`` overrides it; the values are starting points, overridable
# without a code change as provider catalogs evolve.
DEFAULT_MODELS = {
    "anthropic": "claude-opus-4-8",
    "openai": "gpt-5.5",
    "google": "gemini-3.1-pro",
    "openrouter": "openai/gpt-oss-120b:free",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Clerk / auth
    clerk_issuer: str = ""
    clerk_jwks_url: str = ""

    # Infrastructure
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/workout"
    redis_url: str = "redis://localhost:6379/0"

    # AI generation (ADR-0006). ``ai_provider`` selects the generation provider
    # per deployment; only the selected provider's key is required at startup.
    # Keys are never hardcoded — they come from env vars / a .env file.
    ai_provider: str = "anthropic"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    google_api_key: str = ""
    openrouter_api_key: str = ""

    # Optional override of the selected provider's default model (DEFAULT_MODELS).
    ai_model: str = ""

    def resolved_model(self) -> str:
        """The model to generate with: ``AI_MODEL`` if set, else the provider default.

        Raises ``ValueError`` for an unknown ``ai_provider`` so a typo'd selector
        surfaces clearly instead of silently falling back.
        """

        if self.ai_model:
            return self.ai_model
        try:
            return DEFAULT_MODELS[self.ai_provider]
        except KeyError as exc:
            raise ValueError(
                f"unknown AI_PROVIDER '{self.ai_provider}'; "
                f"expected one of {sorted(DEFAULT_MODELS)}"
            ) from exc

    # Profile & Level folding (ADR-0004): how many strong logged sessions of a
    # training type fold into one Fitness Level notch. Tunable so the adaptation
    # cadence can change without a code edit.
    strong_sessions_per_level: int = 3


@lru_cache
def get_settings() -> Settings:
    return Settings()
