"""The admin dashboard's AI summary over the 3-day window (issue #769, ADR-0142).

``GET /api/admin/generation-calls/summary`` aggregates the recorded Generation Calls at read
time: counts by outcome and by Generator Kind, token sums over calls that reported usage,
the number that did not, and the median latency over every call. These tests seed calls
through the real repository over a file-backed SQLite database with an injected clock, then
assert only on the HTTP envelope."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, SQLModel, create_engine

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.monitoring.call import (
    GenerationCall,
    GenerationOutcome,
    GeneratorKind,
)
from app.main import create_app
from app.repositories.deps import get_generation_call_repository
from app.repositories.generation_call_repository import SqlGenerationCallRepository
from tests.conftest import ISSUER, make_signing_context

T0 = datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)
SUMMARY_PATH = "/api/admin/generation-calls/summary"


class _Clock:
    def __init__(self, now: datetime) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now


@pytest.fixture()
def engine(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'generation_call_summary.db'}")
    SQLModel.metadata.create_all(engine)
    yield engine
    engine.dispose()


class _Harness:
    def __init__(self, engine) -> None:
        self.ctx = make_signing_context()
        self.clock = _Clock(T0)
        self.engine = engine
        app = create_app()
        app.dependency_overrides[get_jwks] = lambda: self.ctx.jwks
        app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)

        def _repository():
            with Session(engine) as session:
                yield SqlGenerationCallRepository(session, now=self.clock)

        app.dependency_overrides[get_generation_call_repository] = _repository
        self.client = TestClient(app)

    def seed(
        self,
        *,
        kind: GeneratorKind = GeneratorKind.SESSION,
        outcome: GenerationOutcome = GenerationOutcome.SUCCESS,
        tokens: tuple[int, int] | None = (10, 5),
        latency_ms: float = 100.0,
    ) -> None:
        """Record one call through the repository, at the harness clock."""

        failed = outcome is GenerationOutcome.ERROR
        with Session(self.engine) as session:
            SqlGenerationCallRepository(session, now=self.clock).add(
                GenerationCall(
                    generator_kind=kind,
                    clerk_user_id="user_seed",
                    provider="anthropic",
                    model="claude-seeded",
                    input_tokens=None if tokens is None else tokens[0],
                    output_tokens=None if tokens is None else tokens[1],
                    latency_ms=latency_ms,
                    outcome=outcome,
                    system_prompt="system",
                    user_prompt="user",
                    output_text=None if failed else "{}",
                    schema_name="Seeded",
                    max_tokens=100,
                    error_message="boom" if failed else None,
                )
            )

    def summary(self, *, role: str | None = "admin"):
        claims = {"role": role} if role else {}
        token = self.ctx.mint(sub="user_admin", extra_claims=claims)
        return self.client.get(
            SUMMARY_PATH, headers={"Authorization": f"Bearer {token}"}
        )

    def summary_data(self) -> dict:
        response = self.summary()
        assert response.status_code == 200
        return response.json()["data"]


def test_the_summary_is_an_envelope_with_every_figure(engine):
    # Arrange
    harness = _Harness(engine)
    harness.seed()

    # Act
    response = harness.summary()

    # Assert — the standard envelope, no pagination meta
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert "meta" not in body
    assert set(body["data"]) == {
        "total_calls",
        "by_outcome",
        "by_generator_kind",
        "input_tokens",
        "output_tokens",
        "unreported_usage_calls",
        "median_latency_ms",
        "window_days",
    }
    assert body["data"]["window_days"] == 3


def test_the_summary_rejects_an_unauthenticated_caller(engine):
    harness = _Harness(engine)

    assert harness.client.get(SUMMARY_PATH).status_code == 401


def test_the_summary_rejects_a_verified_non_admin(engine):
    # Arrange
    harness = _Harness(engine)
    harness.seed()

    # Act
    response = harness.summary(role=None)

    # Assert — fails closed, and leaks no figure
    assert response.status_code == 403
    assert response.json().get("data") is None


def test_summary_is_not_read_as_a_call_id(engine):
    # Arrange — a call exists, so a swallowed route would answer 404 or 422, not 200
    harness = _Harness(engine)
    harness.seed()

    # Act
    response = harness.summary()

    # Assert — the summary answered, not the detail route
    assert response.status_code == 200
    assert response.json()["data"]["total_calls"] == 1
    assert "system_prompt" not in response.json()["data"]


def test_an_empty_window_reads_zeros_and_a_null_median(engine):
    harness = _Harness(engine)

    data = harness.summary_data()

    assert data == {
        "total_calls": 0,
        "by_outcome": {"success": 0, "error": 0},
        "by_generator_kind": {
            "session": 0,
            "protocol": 0,
            "regeneration": 0,
            "substitute": 0,
            "muscle-emphasis": 0,
            "exercise-enrichment": 0,
            "warm-up": 0,
        },
        "input_tokens": 0,
        "output_tokens": 0,
        "unreported_usage_calls": 0,
        "median_latency_ms": None,
        "window_days": 3,
    }


def test_calls_outside_the_three_day_window_are_excluded(engine):
    # Arrange — one call at T0, one a day later; then the clock passes T0's window
    harness = _Harness(engine)
    harness.seed(kind=GeneratorKind.PROTOCOL, tokens=(1000, 1000), latency_ms=9000.0)
    harness.clock.now = T0 + timedelta(days=1)
    harness.seed(kind=GeneratorKind.SESSION, tokens=(10, 5), latency_ms=100.0)
    harness.clock.now = T0 + timedelta(days=3, seconds=1)

    # Act
    data = harness.summary_data()

    # Assert — only the second call is summarized
    assert data["total_calls"] == 1
    assert data["by_generator_kind"]["protocol"] == 0
    assert data["by_generator_kind"]["session"] == 1
    assert (data["input_tokens"], data["output_tokens"]) == (10, 5)
    assert data["median_latency_ms"] == 100.0


def test_outcomes_and_kinds_are_counted_with_every_key_present(engine):
    # Arrange — two session successes, one substitute error
    harness = _Harness(engine)
    harness.seed(kind=GeneratorKind.SESSION)
    harness.seed(kind=GeneratorKind.SESSION)
    harness.seed(kind=GeneratorKind.SUBSTITUTE, outcome=GenerationOutcome.ERROR)

    # Act
    data = harness.summary_data()

    # Assert — zeros included, kinds in the enum's order
    assert data["total_calls"] == 3
    assert data["by_outcome"] == {"success": 2, "error": 1}
    assert list(data["by_generator_kind"].items()) == [
        ("session", 2),
        ("protocol", 0),
        ("regeneration", 0),
        ("substitute", 1),
        ("muscle-emphasis", 0),
        ("exercise-enrichment", 0),
        ("warm-up", 0),
    ]


def test_token_sums_skip_unreported_usage_and_count_it(engine):
    # Arrange — two calls reported usage, two did not (one success, one error)
    harness = _Harness(engine)
    harness.seed(tokens=(300, 40))
    harness.seed(tokens=(200, 60))
    harness.seed(tokens=None)
    harness.seed(tokens=None, outcome=GenerationOutcome.ERROR)

    # Act
    data = harness.summary_data()

    # Assert — the sums are a floor, and the summary says how many calls are missing
    assert data["input_tokens"] == 500
    assert data["output_tokens"] == 100
    assert data["unreported_usage_calls"] == 2


@pytest.mark.parametrize(
    ("latencies", "expected"),
    [
        ((300.0, 100.0, 200.0), 200.0),
        ((400.0, 100.0, 300.0, 200.0), 250.0),
    ],
    ids=["odd count", "even count"],
)
def test_the_median_latency_covers_successes_and_errors(engine, latencies, expected):
    # Arrange — alternate outcomes, so dropping errors would move the median
    harness = _Harness(engine)
    for index, latency in enumerate(latencies):
        outcome = GenerationOutcome.ERROR if index % 2 else GenerationOutcome.SUCCESS
        harness.seed(outcome=outcome, latency_ms=latency)

    # Act
    data = harness.summary_data()

    # Assert
    assert data["median_latency_ms"] == expected


def test_the_summary_carries_no_prompt_output_error_or_user(engine):
    harness = _Harness(engine)
    harness.seed(outcome=GenerationOutcome.ERROR)

    body = harness.summary().text

    assert "boom" not in body
    assert "user_seed" not in body
    assert "claude-seeded" not in body
