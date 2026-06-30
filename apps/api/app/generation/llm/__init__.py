"""Provider-agnostic transport for AI generation (ADR-0006).

``StructuredLLM`` is the port every generator depends on; ``build_llm_client``
is the single factory that constructs the configured provider's implementation."""

from __future__ import annotations

from app.generation.llm.factory import build_llm_client
from app.generation.llm.port import StructuredLLM

__all__ = ["StructuredLLM", "build_llm_client"]
