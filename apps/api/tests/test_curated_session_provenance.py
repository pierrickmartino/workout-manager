"""The AI-only affordance gates fail closed on a ``curated`` Session (ADR-0130, issue #683).

Generation Feedback and Regeneration assume the AI wrote the plan, so they are offered only on
an ``ai_generated`` Session (ADR-0040). A ``curated`` plan (adopted from a human-authored,
coach-reviewed Curated Protocol) is not AI output, so both endpoints must reject it with a 409.
No user can create a ``curated`` Session yet, so each test builds one directly through the
repository and drives the real endpoints; the regenerator is a counting fake so a call that
slips past the gate is visible."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.domain.feedback import Verdict
from app.domain.session_provenance import SessionProvenance
from app.generation.regenerator import RegenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_generation_feedback_repository,
    get_logged_session_repository,
    get_session_regenerator,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.generation_feedback_repository import (
    InMemoryGenerationFeedbackRepository,
)
from app.repositories.logged_session_repository import InMemoryLoggedSessionRepository
from app.repositories.prescription_mapping import PrescriptionDraft
from app.repositories.session_repository import InMemorySessionRepository, SessionDraft
from tests.conftest import ISSUER, make_signing_context

USER = "user_curated"


class CountingRegenerator:
    """A fake LLM-backed regenerator that records every call it receives."""

    def __init__(self) -> None:
        self.calls = 0

    def regenerate(self, request: RegenerationRequest) -> GeneratedSession:
        self.calls += 1
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Goblet Squat", sets=3, reps="10"
                )
            ]
        )


@dataclass(frozen=True)
class Harness:
    """The wired app plus the in-memory collaborators a test arranges or inspects."""

    client: TestClient
    headers: dict[str, str]
    sessions: InMemorySessionRepository
    exercises: InMemoryExerciseRepository
    feedback: InMemoryGenerationFeedbackRepository
    regenerator: CountingRegenerator

    def seed_session(self, provenance: SessionProvenance) -> int:
        """Create a Session straight through the repository — no endpoint can mint a
        ``curated`` one yet."""
        squat = self.exercises.find_or_create(
            "Back Squat", provenance=Provenance.CURATED
        )
        view = self.sessions.create(
            USER,
            SessionDraft(
                training_type="strength",
                duration_minutes=45,
                prescriptions=[
                    PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5")
                ],
                provenance=provenance.value,
            ),
        )
        return view.id

    def record_negative_feedback(self, session_id: int) -> None:
        self.feedback.record(
            USER, session_id=session_id, verdict=Verdict.NEGATIVE, reason="too hard"
        )


def _harness() -> Harness:
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    feedback = InMemoryGenerationFeedbackRepository()
    regenerator = CountingRegenerator()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = (
        lambda: InMemoryLoggedSessionRepository(sessions, exercises)
    )
    app.dependency_overrides[get_session_regenerator] = lambda: regenerator
    app.dependency_overrides[get_generation_feedback_repository] = lambda: feedback
    return Harness(
        client=TestClient(app),
        headers={"Authorization": f"Bearer {ctx.mint(sub=USER)}"},
        sessions=sessions,
        exercises=exercises,
        feedback=feedback,
        regenerator=regenerator,
    )


def test_a_curated_session_round_trips_its_provenance_on_the_read_path():
    # Arrange
    h = _harness()
    session_id = h.seed_session(SessionProvenance.CURATED)

    # Act
    response = h.client.get(f"/api/sessions/{session_id}", headers=h.headers)

    # Assert
    assert response.status_code == 200
    assert response.json()["data"]["provenance"] == "curated"


def test_generation_feedback_is_rejected_on_a_curated_session_and_nothing_is_recorded():
    # Arrange
    h = _harness()
    session_id = h.seed_session(SessionProvenance.CURATED)

    # Act — "did the AI give me a good plan?" on a plan no AI wrote.
    response = h.client.post(
        f"/api/sessions/{session_id}/feedback",
        headers=h.headers,
        json={"verdict": "negative", "reason": "too hard"},
    )

    # Assert — rejected with a message that doesn't call the plan hand-authored.
    assert response.status_code == 409
    assert "hand-authored" not in response.json()["error"].lower()
    assert h.feedback.latest(session_id, USER) is None


def test_regeneration_is_rejected_on_a_curated_session_before_the_llm_runs():
    # Arrange — negative feedback is already on file, so provenance is the only blocker.
    h = _harness()
    session_id = h.seed_session(SessionProvenance.CURATED)
    h.record_negative_feedback(session_id)

    # Act
    response = h.client.post(
        f"/api/sessions/{session_id}/regenerate",
        headers=h.headers,
        json={"keep": []},
    )

    # Assert
    assert response.status_code == 409
    assert "hand-authored" not in response.json()["error"].lower()
    assert h.regenerator.calls == 0


def test_generation_feedback_is_still_recorded_on_an_ai_generated_session():
    # Arrange
    h = _harness()
    session_id = h.seed_session(SessionProvenance.AI_GENERATED)

    # Act
    response = h.client.post(
        f"/api/sessions/{session_id}/feedback",
        headers=h.headers,
        json={"verdict": "negative", "reason": "too hard"},
    )

    # Assert
    assert response.status_code == 200
    assert h.feedback.latest(session_id, USER) is not None


def test_regeneration_still_runs_on_an_ai_generated_session():
    # Arrange
    h = _harness()
    session_id = h.seed_session(SessionProvenance.AI_GENERATED)
    h.record_negative_feedback(session_id)

    # Act
    response = h.client.post(
        f"/api/sessions/{session_id}/regenerate",
        headers=h.headers,
        json={"keep": []},
    )

    # Assert
    assert response.status_code == 200
    assert h.regenerator.calls == 1
