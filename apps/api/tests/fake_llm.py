"""A fake ``StructuredLLM`` for generator tests (ADR-0006).

Generators depend on the transport *port*, so their tests fake the port — not a
provider SDK — to assert generator behavior: given canned text the generator
parses it at its boundary, and a transport ``GenerationError`` propagates. This
keeps generator tests about generation logic, with per-provider SDK quirks
covered once in ``test_llm_provider.py``."""

from __future__ import annotations


class FakeStructuredLLM:
    """Returns canned text from ``complete`` or raises a canned error.

    Records each call's kwargs so a test can assert what the generator asked the
    transport for (schema, max_tokens, prompts)."""

    def __init__(self, *, text: str | None = None, error: Exception | None = None):
        self._text = text
        self._error = error
        self.calls: list[dict] = []

    def complete(self, **kwargs) -> str:
        self.calls.append(kwargs)
        if self._error is not None:
            raise self._error
        assert self._text is not None, "FakeStructuredLLM needs text or error"
        return self._text
