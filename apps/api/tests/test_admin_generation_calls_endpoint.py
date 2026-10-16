"""The admin AI audit log, driven by real generations (issue #730, ADR-0135).

Every metered ``Generation Call`` reaches the Postgres recorder through the real
``RecordingStructuredLLM`` decorator, and ``GET /api/admin/generation-calls`` lists the
recorded calls newest first for the operator. These tests trigger generations through the
real Session generator over a fake provider (no network), wired into the recorder over a
file-backed SQLite database, then assert on what the admin endpoint returns: the call's
kind, user, provider, model, tokens, latency and outcome; failures recorded too; and the
3-day retention honoured on read and on the next write, using an injected clock."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.exercise_enrichment_generator import (
    EnrichmentRequest,
    LlmExerciseEnrichmentGenerator,
)
from app.generation.llm.port import GenerationError
from app.generation.llm.usage import CompletionResult, TokenUsage
from app.generation.monitoring.call import (
    ERROR_MESSAGE_CAP,
    GenerationCall,
    GenerationOutcome,
    GeneratorKind,
)
from app.generation.monitoring.postgres_recorder import PostgresGenerationCallRecorder
from app.generation.monitoring.recording_llm import RecordingStructuredLLM
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_generation_call_repository,
    get_llm_client,
    get_profile_repository,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.generation_call_repository import SqlGenerationCallRepository
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context

_SESSION_JSON = (
    '{"prescriptions": [{"exercise_name": "Back Squat", "sets": 5, "reps": "5"}]}'
)
_ENRICHMENT_JSON = (
    '{"description": "A squat.", "targeted_muscles": ["quads"], '
    '"instructions": ["Squat down."], "difficulty": 4}'
)

T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)


class _Clock:
    """An injectable "now" the test moves by hand, so retention is deterministic."""

    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


class _FakeProvider:
    """A ``CompletionProvider`` returning canned text with usage, or raising."""

    def __init__(
        self, *, text: str = _SESSION_JSON, error: Exception | None = None
    ) -> None:
        self._text = text
        self._error = error
        self.seen: dict = {}

    def complete(self, **kwargs) -> CompletionResult:
        # What the model was actually sent: the detail view must show exactly this.
        self.seen = kwargs
        if self._error is not None:
            raise self._error
        return CompletionResult(
            text=self._text,
            usage=TokenUsage(input_tokens=321, output_tokens=54),
            model="claude-served",
        )


@pytest.fixture()
def engine(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'generation_calls.db'}")
    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


class _Harness:
    def __init__(self, engine, *, provider: _FakeProvider | None = None) -> None:
        self.ctx = make_signing_context()
        self.clock = _Clock(T0)
        self.provider = provider or _FakeProvider()
        exercises = InMemoryExerciseRepository()
        profiles = InMemoryProfileRepository()
        sessions = InMemorySessionRepository(exercises, profiles)
        recorder = PostgresGenerationCallRecorder(
            session_factory=lambda: Session(engine), now=self.clock
        )
        app = create_app()
        app.dependency_overrides[get_jwks] = lambda: self.ctx.jwks
        app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
        app.dependency_overrides[get_exercise_repository] = lambda: exercises
        app.dependency_overrides[get_profile_repository] = lambda: profiles
        app.dependency_overrides[get_session_repository] = lambda: sessions
        self.llm = RecordingStructuredLLM(
            self.provider,
            recorder=recorder,
            provider_name="anthropic",
            model="claude-configured",
        )
        app.dependency_overrides[get_llm_client] = lambda: self.llm

        def _repository():
            with Session(engine) as session:
                yield SqlGenerationCallRepository(session, now=self.clock)

        app.dependency_overrides[get_generation_call_repository] = _repository
        self.engine = engine
        self.client = TestClient(app)

    def seed(
        self,
        *,
        kind: GeneratorKind = GeneratorKind.SESSION,
        outcome: GenerationOutcome = GenerationOutcome.SUCCESS,
        user: str | None = "user_seed",
    ) -> None:
        """Record one call directly through the repository, at the harness clock."""

        failed = outcome is GenerationOutcome.ERROR
        with Session(self.engine) as session:
            SqlGenerationCallRepository(session, now=self.clock).add(
                GenerationCall(
                    generator_kind=kind,
                    clerk_user_id=user,
                    provider="anthropic",
                    model="claude-seeded",
                    input_tokens=None if failed else 10,
                    output_tokens=None if failed else 5,
                    latency_ms=12.0,
                    outcome=outcome,
                    system_prompt="system",
                    user_prompt="user",
                    output_text=None if failed else "{}",
                    schema_name="Seeded",
                    max_tokens=100,
                    error_message="boom" if failed else None,
                )
            )

    def generate_session(self, sub: str = "user_gen"):
        return self.client.post(
            "/api/sessions/generate",
            headers={"Authorization": f"Bearer {self.ctx.mint(sub=sub)}"},
            json={"training_type": "strength", "duration_minutes": 45, "equipment": []},
        )

    def admin_list(self, **params):
        token = self.ctx.mint(sub="user_admin", extra_claims={"role": "admin"})
        return self.client.get(
            "/api/admin/generation-calls",
            params=params,
            headers={"Authorization": f"Bearer {token}"},
        )

    def admin_detail(self, call_id: int):
        return self.admin_get(f"/api/admin/generation-calls/{call_id}")

    def admin_get(self, path: str):
        token = self.ctx.mint(sub="user_admin", extra_claims={"role": "admin"})
        return self.client.get(path, headers={"Authorization": f"Bearer {token}"})

    def only_call_id(self) -> int:
        [call] = self.admin_list().json()["data"]
        return call["id"]


def test_a_generation_appears_in_the_admin_list_with_its_metadata(engine):
    # Arrange
    harness = _Harness(engine)

    # Act — a real Session generation, then the operator reads the log
    assert harness.generate_session(sub="user_alice").status_code == 200
    response = harness.admin_list()

    # Assert — one call, carrying exactly what the provider reported
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    [call] = body["data"]
    assert call["generator_kind"] == "session"
    assert call["clerk_user_id"] == "user_alice"
    assert call["provider"] == "anthropic"
    assert call["model"] == "claude-served"
    assert call["input_tokens"] == 321
    assert call["output_tokens"] == 54
    assert call["outcome"] == "success"
    assert call["latency_ms"] >= 0
    assert call["created_at"].startswith("2026-10-01T12:00:00")


def test_the_list_carries_no_prompt_or_output_text(engine):
    harness = _Harness(engine)
    harness.generate_session()

    [call] = harness.admin_list().json()["data"]

    assert not {"system_prompt", "user_prompt", "output_text"} & set(call)


def test_the_list_is_newest_first(engine):
    # Arrange — two calls a minute apart, by different users
    harness = _Harness(engine)
    harness.generate_session(sub="user_first")
    harness.clock.now = T0 + timedelta(minutes=1)
    harness.generate_session(sub="user_second")

    # Act
    rows = harness.admin_list().json()["data"]

    # Assert
    assert [row["clerk_user_id"] for row in rows] == ["user_second", "user_first"]


def test_a_failed_generation_appears_with_outcome_error(engine):
    # Arrange — the provider raises, so the generation surfaces a 502
    harness = _Harness(engine, provider=_FakeProvider(error=GenerationError("boom")))

    # Act
    assert harness.generate_session(sub="user_fail").status_code == 502
    [call] = harness.admin_list().json()["data"]

    # Assert — the failure is in the log, tokens unknown rather than zero
    assert call["outcome"] == "error"
    assert call["clerk_user_id"] == "user_fail"
    assert call["model"] == "claude-configured"
    assert call["input_tokens"] is None
    assert call["output_tokens"] is None


def test_an_unattributed_enrichment_call_appears_with_a_null_user(engine):
    # Arrange — catalog enrichment runs on no user's behalf
    harness = _Harness(engine, provider=_FakeProvider(text=_ENRICHMENT_JSON))
    generator = LlmExerciseEnrichmentGenerator(harness.llm)

    # Act
    generator.generate(EnrichmentRequest(exercise_name="Back Squat"))
    [call] = harness.admin_list().json()["data"]

    # Assert — a system call
    assert call["generator_kind"] == "exercise-enrichment"
    assert call["clerk_user_id"] is None


def test_calls_older_than_three_days_are_never_listed(engine):
    # Arrange — one call at T0, then the clock moves past the 3-day window
    harness = _Harness(engine)
    harness.generate_session()
    harness.clock.now = T0 + timedelta(days=3, seconds=1)

    # Act
    rows = harness.admin_list().json()["data"]

    # Assert — expired on read, even before any purge ran
    assert rows == []


def test_the_next_record_purges_expired_calls(engine):
    # Arrange — an old call, then a new one recorded after the window has passed
    harness = _Harness(engine)
    harness.generate_session(sub="user_old")
    harness.clock.now = T0 + timedelta(days=3, seconds=1)
    harness.generate_session(sub="user_new")

    # Act — wind the clock back to T0: an unpurged old row would be visible again
    harness.clock.now = T0 + timedelta(seconds=1)
    rows = harness.admin_list().json()["data"]

    # Assert — the old row is gone for good, not merely hidden
    assert [row["clerk_user_id"] for row in rows] == ["user_new"]


def test_the_list_rejects_an_unauthenticated_caller(engine):
    harness = _Harness(engine)

    assert harness.client.get("/api/admin/generation-calls").status_code == 401


def test_the_list_rejects_a_verified_non_admin(engine):
    harness = _Harness(engine)
    token = harness.ctx.mint(sub="user_normal")

    response = harness.client.get(
        "/api/admin/generation-calls", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 403


# --- Filters and pagination (issue #732) -----------------------------------------------


def test_the_list_filters_by_generator_kind(engine):
    # Arrange
    harness = _Harness(engine)
    harness.seed(kind=GeneratorKind.SESSION)
    harness.seed(kind=GeneratorKind.PROTOCOL)

    # Act
    rows = harness.admin_list(generator_kind="protocol").json()["data"]

    # Assert
    assert [row["generator_kind"] for row in rows] == ["protocol"]


def test_the_list_filters_by_outcome(engine):
    harness = _Harness(engine)
    harness.seed(outcome=GenerationOutcome.SUCCESS)
    harness.seed(outcome=GenerationOutcome.ERROR)

    rows = harness.admin_list(outcome="error").json()["data"]

    assert [row["outcome"] for row in rows] == ["error"]


def test_the_list_filters_by_user_id(engine):
    harness = _Harness(engine)
    harness.seed(user="user_alice")
    harness.seed(user="user_bob")
    harness.seed(user=None)

    rows = harness.admin_list(clerk_user_id="user_bob").json()["data"]

    assert [row["clerk_user_id"] for row in rows] == ["user_bob"]


def test_the_filters_combine(engine):
    # Arrange — only one call is a failed protocol generation for Alice
    harness = _Harness(engine)
    harness.seed(kind=GeneratorKind.PROTOCOL, outcome=GenerationOutcome.ERROR, user="user_alice")
    harness.seed(kind=GeneratorKind.PROTOCOL, outcome=GenerationOutcome.SUCCESS, user="user_alice")
    harness.seed(kind=GeneratorKind.SESSION, outcome=GenerationOutcome.ERROR, user="user_alice")
    harness.seed(kind=GeneratorKind.PROTOCOL, outcome=GenerationOutcome.ERROR, user="user_bob")

    # Act
    rows = harness.admin_list(
        generator_kind="protocol", outcome="error", clerk_user_id="user_alice"
    ).json()["data"]

    # Assert
    assert [
        (row["generator_kind"], row["outcome"], row["clerk_user_id"]) for row in rows
    ] == [("protocol", "error", "user_alice")]


def test_the_list_pages_newest_first_with_meta(engine):
    # Arrange — five calls a minute apart, user_0 oldest
    harness = _Harness(engine)
    for minute in range(5):
        harness.clock.now = T0 + timedelta(minutes=minute)
        harness.seed(user=f"user_{minute}")

    # Act — walk the pages two at a time
    pages = [harness.admin_list(limit=2, offset=offset).json() for offset in (0, 2, 4)]

    # Assert — each page is a newest-first window; total counts every match
    assert [[row["clerk_user_id"] for row in page["data"]] for page in pages] == [
        ["user_4", "user_3"],
        ["user_2", "user_1"],
        ["user_0"],
    ]
    assert [page["meta"] for page in pages] == [
        {"total": 5, "limit": 2, "offset": 0},
        {"total": 5, "limit": 2, "offset": 2},
        {"total": 5, "limit": 2, "offset": 4},
    ]


def test_the_total_counts_only_the_filtered_matches(engine):
    harness = _Harness(engine)
    harness.seed(outcome=GenerationOutcome.ERROR)
    harness.seed(outcome=GenerationOutcome.ERROR)
    harness.seed(outcome=GenerationOutcome.SUCCESS)

    body = harness.admin_list(outcome="error", limit=1).json()

    assert len(body["data"]) == 1
    assert body["meta"] == {"total": 2, "limit": 1, "offset": 0}


def test_expired_calls_are_excluded_whatever_the_filters(engine):
    # Arrange — a matching call at T0, another a day later, then read 3 days past T0
    harness = _Harness(engine)
    harness.seed(kind=GeneratorKind.PROTOCOL, outcome=GenerationOutcome.ERROR, user="user_alice")
    harness.clock.now = T0 + timedelta(days=1)
    harness.seed(kind=GeneratorKind.PROTOCOL, outcome=GenerationOutcome.ERROR, user="user_alice")
    harness.clock.now = T0 + timedelta(days=3, seconds=1)

    # Act
    body = harness.admin_list(
        generator_kind="protocol", outcome="error", clerk_user_id="user_alice"
    ).json()

    # Assert — only the call still inside the window, and the total agrees
    assert len(body["data"]) == 1
    assert body["data"][0]["created_at"].startswith("2026-10-02T12:00:00")
    assert body["meta"]["total"] == 1


@pytest.mark.parametrize(
    "params", [{"limit": 0}, {"limit": 1000}, {"offset": -1}]
)
def test_an_out_of_range_page_is_rejected(engine, params):
    harness = _Harness(engine)

    assert harness.admin_list(**params).status_code == 422


@pytest.mark.parametrize(
    "params", [{"generator_kind": "workout"}, {"outcome": "timeout"}]
)
def test_an_unknown_kind_or_outcome_is_rejected(engine, params):
    harness = _Harness(engine)

    response = harness.admin_list(**params)

    assert response.status_code == 422
    assert response.json()["success"] is False


# --- The call detail view (issue #731) -------------------------------------------------


def test_the_detail_shows_both_prompts_the_output_the_schema_and_the_budget(engine):
    # Arrange — a real Session generation
    harness = _Harness(engine)
    harness.generate_session(sub="user_alice")
    sent = harness.provider.seen

    # Act
    response = harness.admin_detail(harness.only_call_id())

    # Assert — exactly what the model was sent and what it answered
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    call = body["data"]
    assert call["system_prompt"] == sent["system"]
    assert call["user_prompt"] == sent["user"]
    assert call["output_text"] == _SESSION_JSON
    assert call["schema_name"] == "GeneratedSession"
    assert call["max_tokens"] == sent["max_tokens"]
    assert call["error_message"] is None
    assert call["clerk_user_id"] == "user_alice"
    assert call["output_tokens"] == 54
    assert call["outcome"] == "success"


def test_a_failed_calls_detail_has_no_output_and_its_error_message(engine):
    # Arrange
    harness = _Harness(engine, provider=_FakeProvider(error=GenerationError("rate limited")))
    harness.generate_session()

    # Act
    call = harness.admin_detail(harness.only_call_id()).json()["data"]

    # Assert — the failure explains itself; the prompts the model was sent are still there
    assert call["outcome"] == "error"
    assert call["output_text"] is None
    assert call["error_message"] == "rate limited"
    assert call["user_prompt"] == harness.provider.seen["user"]
    assert call["schema_name"] == "GeneratedSession"


def test_a_long_error_message_is_cut_at_the_cap(engine):
    # Arrange — a provider error echoing a huge body
    huge = "x" * ERROR_MESSAGE_CAP + "TAIL"
    harness = _Harness(engine, provider=_FakeProvider(error=GenerationError(huge)))
    harness.generate_session()

    # Act
    call = harness.admin_detail(harness.only_call_id()).json()["data"]

    # Assert
    assert call["error_message"] == "x" * ERROR_MESSAGE_CAP


def test_the_detail_of_an_unknown_call_is_not_found(engine):
    harness = _Harness(engine)

    response = harness.admin_detail(999)

    assert response.status_code == 404
    assert response.json()["success"] is False


def test_the_detail_of_a_call_past_the_three_day_window_is_not_found(engine):
    # Arrange — a call at T0, then the clock moves past the window (no purge has run)
    harness = _Harness(engine)
    harness.generate_session()
    call_id = harness.only_call_id()
    harness.clock.now = T0 + timedelta(days=3, seconds=1)

    # Act
    response = harness.admin_detail(call_id)

    # Assert — expired reads exactly like unknown
    assert response.status_code == 404


def test_the_detail_rejects_a_verified_non_admin(engine):
    harness = _Harness(engine)
    harness.generate_session()
    call_id = harness.only_call_id()
    token = harness.ctx.mint(sub="user_normal")

    response = harness.client.get(
        f"/api/admin/generation-calls/{call_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


def test_the_detail_rejects_an_unauthenticated_caller(engine):
    harness = _Harness(engine)

    assert harness.client.get("/api/admin/generation-calls/1").status_code == 401
