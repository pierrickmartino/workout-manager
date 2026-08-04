"""Trace-id lineage across the whole seam (ADR-0039, #274).

The unit tests pin each hop with a fake that writes the capture directly; this one closes
the loop through the *real* ``RecordingStructuredLLM`` decorator: a fake provider (no
network) hands back a completion, a recorder returns a trace-id handle, and the real
decorator writes that handle into the capture on the ``context``. Driven by a real
generator and Adoption, the handle must land on the Generated artifact and be carried onto
the user-owned copy — the irreplaceable, can't-backfill lineage the feedback fast-follow
will read. With a recorder that reports no handle (the no-op posture), lineage is simply
absent, without error."""

from __future__ import annotations

from app.adoption.service import adopt
from app.generation.llm.usage import CompletionResult, TokenUsage
from app.generation.monitoring.recording_llm import RecordingStructuredLLM
from app.generation.protocol_generator import (
    LlmProtocolGenerator,
    ProtocolGenerationRequest,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.protocol_repository import InMemoryProtocolRepository

_PROTOCOL_JSON = (
    '{"sessions": [{"week": 1, "day": 1, "title": "Day 1", '
    '"prescriptions": [{"exercise_name": "Back Squat", "sets": 5, "reps": "5"}]}]}'
)

REQUEST = ProtocolGenerationRequest(
    training_type="strength",
    objective="gain muscle mass",
    sessions_per_week=1,
    duration_minutes=45,
    weeks=1,
    equipment=["barbell"],
)


class _FakeProvider:
    """A ``CompletionProvider`` returning a canned protocol completion, no network."""

    def complete(self, **kwargs) -> CompletionResult:
        return CompletionResult(
            text=_PROTOCOL_JSON, usage=TokenUsage.empty(), model="m"
        )


class _HandleRecorder:
    """A recorder that hands back a fixed trace-id handle (like Langfuse would)."""

    def __init__(self, trace_id: str | None) -> None:
        self._trace_id = trace_id

    def record(self, call) -> str | None:
        return self._trace_id

    def flush(self) -> None:
        return None


def _llm(trace_id: str | None) -> RecordingStructuredLLM:
    return RecordingStructuredLLM(
        _FakeProvider(),
        recorder=_HandleRecorder(trace_id),
        provider_name="anthropic",
        model="configured",
    )


def test_trace_id_flows_from_recorder_through_generation_and_adopt():
    # Arrange — the real decorator over a fake provider and a handle-returning recorder
    generator = LlmProtocolGenerator(_llm("trace-e2e"))
    exercises = InMemoryExerciseRepository()
    protocols = InMemoryProtocolRepository(exercises)

    # Act — generate the artifact, then Adopt a user-owned copy
    generated = generator.generate(REQUEST)
    view = adopt(
        generated, "user_e2e", REQUEST, exercises=exercises, protocols=protocols
    )

    # Assert — the handle lands on the artifact and is carried onto the adopted copy
    assert generated.trace_id == "trace-e2e"
    assert protocols.trace_id(view.id, "user_e2e") == "trace-e2e"


def test_lineage_absent_when_recorder_reports_no_handle():
    # Arrange — a no-op-style recorder: no trace id anywhere on the chain
    generator = LlmProtocolGenerator(_llm(None))
    exercises = InMemoryExerciseRepository()
    protocols = InMemoryProtocolRepository(exercises)

    # Act
    generated = generator.generate(REQUEST)
    view = adopt(
        generated, "user_e2e_none", REQUEST, exercises=exercises, protocols=protocols
    )

    # Assert — lineage is simply absent, without error
    assert generated.trace_id is None
    assert protocols.trace_id(view.id, "user_e2e_none") is None
