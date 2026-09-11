"""Guards the real Langfuse SDK against the ``LangfuseClient`` Protocol the recorder uses.

The recorder's unit tests (``test_langfuse_recorder.py``) inject a *fake* client, so they
pass regardless of what the installed SDK actually exposes. That masked a real regression:
Langfuse v3 rewrote the SDK on OpenTelemetry and **removed** the low-level ``client.trace()``
method the recorder calls, so a ``langfuse>=3`` install blew up at runtime with
``AttributeError: 'Langfuse' object has no attribute 'trace'`` while every unit test stayed
green.

This test closes that seam: it imports the *real* ``langfuse.Langfuse`` and asserts it still
carries the surface the recorder depends on. It goes red the moment an incompatible major
(v3+) is installed — turning a production-only failure into a CI failure. It skips (never
fails) when the optional SDK isn't installed, preserving the offline suite's no-Langfuse
guarantee."""

from __future__ import annotations

import pytest

# The low-level client *methods* ``LangfuseGenerationCallRecorder`` calls, checked at the
# class level (see langfuse_recorder.py): ``trace(...)`` (removed in v3 — the exact break)
# and ``flush()`` at worker end-of-job. ``api`` is deliberately not listed: v2 exposes it as
# an *instance* attribute (set in ``__init__``), so ``hasattr(Langfuse, "api")`` is False on
# a healthy v2 install — it can't distinguish the versions. ``trace`` alone catches v3+.
_REQUIRED_CLIENT_SURFACE = ("trace", "flush")


def test_installed_langfuse_client_conforms_to_the_recorder_protocol():
    # Arrange — use the real SDK if present; skip (don't fail) when it isn't, so the
    # offline suite still runs with no Langfuse installed.
    langfuse = pytest.importorskip("langfuse")

    # Act / Assert — the recorder speaks the v2 low-level client API; a v3+ install
    # (no ``trace`` method) must fail here rather than at runtime in production.
    for attribute in _REQUIRED_CLIENT_SURFACE:
        assert hasattr(langfuse.Langfuse, attribute), (
            f"langfuse.Langfuse is missing '{attribute}' — the installed SDK is "
            "incompatible with LangfuseGenerationCallRecorder (v2 API expected; "
            "pin 'langfuse>=2.0,<3')"
        )
