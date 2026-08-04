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
    transport for (schema, max_tokens, prompts, and the monitoring ``context``).

    ``trace_id`` stands in for the real recording decorator's behavior: when set, and the
    caller passed a ``TraceCapture`` on the ``context``, ``complete`` writes the handle into
    it — so a generator test can assert the generator carries the trace id onto its produced
    artifact (#274) without a live recorder."""

    def __init__(
        self,
        *,
        text: str | None = None,
        error: Exception | None = None,
        trace_id: str | None = None,
    ):
        self._text = text
        self._error = error
        self._trace_id = trace_id
        self.calls: list[dict] = []

    def complete(self, **kwargs) -> str:
        self.calls.append(kwargs)
        capture = getattr(kwargs.get("context"), "capture", None)
        if capture is not None:
            capture.set(self._trace_id)
        if self._error is not None:
            raise self._error
        assert self._text is not None, "FakeStructuredLLM needs text or error"
        return self._text
