"""The ``PostgresGenerationCallRecorder``, for what the admin API cannot show (ADR-0135).

Three properties of the recorder port: recording is best-effort (a recorder whose DB write
raises changes nothing about what ``complete`` returns and never raises into the
generator); it commits on its own session, so a call survives the caller's rollback; and
``delete_user_traces`` erases exactly one user's calls, raising when it cannot."""

from __future__ import annotations

import pytest
from pydantic import BaseModel
from sqlmodel import Session, SQLModel, create_engine

from app.db.models import Profile
from app.generation.llm.port import GenerationError
from app.generation.llm.usage import CompletionResult, TokenUsage
from app.generation.monitoring.call import (
    GenerationCall,
    GenerationCallContext,
    GenerationOutcome,
    GeneratorKind,
)
from app.generation.monitoring.postgres_recorder import PostgresGenerationCallRecorder
from app.generation.monitoring.recording_llm import RecordingStructuredLLM
from app.repositories.generation_call_repository import (
    GenerationCallFilters,
    SqlGenerationCallRepository,
)


class _Schema(BaseModel):
    value: str


class _Provider:
    def __init__(self, *, error: Exception | None = None) -> None:
        self._error = error

    def complete(self, **kwargs) -> CompletionResult:
        if self._error is not None:
            raise self._error
        return CompletionResult(
            text='{"value": "ok"}', usage=TokenUsage.empty(), model="m"
        )


@pytest.fixture()
def engine(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'recorder.db'}")
    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


def _recorder(engine) -> PostgresGenerationCallRecorder:
    return PostgresGenerationCallRecorder(session_factory=lambda: Session(engine))


def _llm(recorder, *, error: Exception | None = None) -> RecordingStructuredLLM:
    return RecordingStructuredLLM(
        _Provider(error=error), recorder=recorder, provider_name="anthropic", model="m"
    )


def _complete(llm: RecordingStructuredLLM, clerk_user_id: str | None = None) -> str:
    return llm.complete(
        system="s",
        user="u",
        schema=_Schema,
        max_tokens=100,
        context=GenerationCallContext(
            generator_kind=GeneratorKind.SESSION, clerk_user_id=clerk_user_id
        ),
    )


def _call(clerk_user_id: str | None) -> GenerationCall:
    return GenerationCall(
        generator_kind=GeneratorKind.SESSION,
        clerk_user_id=clerk_user_id,
        provider="anthropic",
        model="m",
        input_tokens=None,
        output_tokens=None,
        latency_ms=1.0,
        outcome=GenerationOutcome.SUCCESS,
        system_prompt="s",
        user_prompt="u",
        output_text="{}",
        schema_name="GeneratedSession",
        max_tokens=8000,
        error_message=None,
    )


def _recorded_users(engine) -> list[str | None]:
    with Session(engine) as session:
        rows = SqlGenerationCallRepository(session).list_recent(
            filters=GenerationCallFilters(), limit=100, offset=0
        ).items
    return sorted(row.clerk_user_id or "" for row in rows)


def _broken_session() -> Session:
    raise RuntimeError("database unavailable")


def test_a_failing_db_write_does_not_change_what_complete_returns():
    # Arrange — every session the recorder opens fails
    recorder = PostgresGenerationCallRecorder(session_factory=_broken_session)

    # Act
    text = _complete(_llm(recorder))

    # Assert — the generation is untouched by the monitoring failure
    assert text == '{"value": "ok"}'


def test_a_failing_db_write_never_masks_the_generation_error():
    recorder = PostgresGenerationCallRecorder(session_factory=_broken_session)

    with pytest.raises(GenerationError, match="provider down"):
        _complete(_llm(recorder, error=GenerationError("provider down")))


def test_record_returns_no_lineage_handle_and_flush_is_a_no_op(engine):
    recorder = _recorder(engine)

    assert recorder.record(_call("user_a")) is None
    assert recorder.flush() is None


def test_a_failed_call_survives_the_callers_rollback(engine):
    # Arrange — the caller holds pending work in its own transaction
    caller = Session(engine)
    caller.add(Profile(clerk_user_id="user_rollback"))
    llm = _llm(_recorder(engine), error=GenerationError("boom"))

    # Act — the generation fails and the caller rolls its transaction back
    with pytest.raises(GenerationError):
        _complete(llm, clerk_user_id="user_rollback")
    caller.rollback()
    caller.close()

    # Assert — the failed call was committed independently
    assert _recorded_users(engine) == ["user_rollback"]


def test_delete_user_traces_removes_only_that_users_calls(engine):
    # Arrange
    recorder = _recorder(engine)
    recorder.record(_call("user_target"))
    recorder.record(_call("user_target"))
    recorder.record(_call("user_other"))
    recorder.record(_call(None))

    # Act
    recorder.delete_user_traces("user_target")

    # Assert — the other user's call and the system call remain
    assert _recorded_users(engine) == ["", "user_other"]


def test_delete_user_traces_raises_when_erasure_fails():
    recorder = PostgresGenerationCallRecorder(session_factory=_broken_session)

    with pytest.raises(RuntimeError, match="database unavailable"):
        recorder.delete_user_traces("user_target")
