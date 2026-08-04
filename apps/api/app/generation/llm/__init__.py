"""Provider-agnostic transport for AI generation (ADR-0006).

``StructuredLLM`` is the port every generator depends on; ``build_llm_client``
is the single factory that constructs the configured provider's implementation.

``build_llm_client`` is exposed lazily (PEP 562) rather than imported eagerly: the
factory wires the monitoring decorator, and the monitoring package imports back into
this one (``llm.usage``/``llm.port``). Eagerly importing the factory here closes that
loop into a circular import whenever the monitoring package is imported first. Deferring
the factory import until the attribute is actually accessed keeps ``from app.generation.llm
import build_llm_client`` working while leaving the import graph acyclic."""

from __future__ import annotations

from typing import TYPE_CHECKING

from app.generation.llm.port import StructuredLLM

if TYPE_CHECKING:
    from app.generation.llm.factory import build_llm_client

__all__ = ["StructuredLLM", "build_llm_client"]


def __getattr__(name: str):
    """Lazily resolve ``build_llm_client`` to keep the llm↔monitoring graph acyclic."""

    if name == "build_llm_client":
        from app.generation.llm.factory import build_llm_client

        return build_llm_client
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
