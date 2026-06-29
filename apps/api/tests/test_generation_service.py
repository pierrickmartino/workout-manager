"""The end-to-end AI assembly path, exercised with a fake generator and in-memory
repositories. The service turns a generation into a persisted, user-owned Session:
each prescribed exercise is resolved through the shared catalog (AI provenance,
normalized-name dedup) and every prescription references a catalog Exercise. A
malformed generation must surface as an error and persist nothing."""

from __future__ import annotations

import pytest

from app.generation.generator import GenerationError, GenerationRequest
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedSession,
)
from app.generation.service import generate_session
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.session_repository import InMemorySessionRepository


class FakeGenerator:
    """Returns a preset GeneratedSession, or raises a preset error."""

    def __init__(self, *, result=None, error=None):
        self._result = result
        self._error = error

    def generate(self, request: GenerationRequest) -> GeneratedSession:
        if self._error is not None:
            raise self._error
        return self._result


def _build_repos():
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    return exercises, sessions


def _two_exercise_generation() -> GeneratedSession:
    return GeneratedSession(
        prescriptions=[
            GeneratedExercisePrescription(
                exercise_name="Back Squat",
                exercise_description="Compound lower-body lift.",
                targeted_muscles=["quads"],
                required_equipment=["barbell"],
                sets=5,
                reps="5",
                rest_seconds=120,
                recommended_load="70% 1RM",
            ),
            GeneratedExercisePrescription(
                exercise_name="Overhead Press", sets=3, reps="8-12"
            ),
        ]
    )


REQUEST = GenerationRequest(
    training_type="strength", duration_minutes=45, equipment=["barbell"]
)


def test_persists_a_session_the_user_can_see_with_its_prescriptions():
    # Arrange
    exercises, sessions = _build_repos()
    generator = FakeGenerator(result=_two_exercise_generation())

    # Act
    view = generate_session(
        REQUEST, "user_gen", generator=generator, exercises=exercises, sessions=sessions
    )

    # Assert — readable back as a standalone session with its prescriptions
    assert view.clerk_user_id == "user_gen"
    assert view.training_type == "strength"
    assert [p.exercise_name for p in view.prescriptions] == [
        "Back Squat",
        "Overhead Press",
    ]
    assert view.prescriptions[0].sets == 5
    assert view.prescriptions[0].recommended_load == "70% 1RM"


def test_ai_invented_exercises_are_stored_with_ai_generated_provenance():
    # Arrange
    exercises, sessions = _build_repos()
    generator = FakeGenerator(result=_two_exercise_generation())

    # Act
    view = generate_session(
        REQUEST, "user_prov", generator=generator, exercises=exercises, sessions=sessions
    )

    # Assert
    assert all(p.provenance == "ai_generated" for p in view.prescriptions)


def test_each_prescription_references_a_catalog_exercise():
    # Arrange
    exercises, sessions = _build_repos()
    generator = FakeGenerator(result=_two_exercise_generation())

    # Act
    view = generate_session(
        REQUEST, "user_ref", generator=generator, exercises=exercises, sessions=sessions
    )

    # Assert — each prescription resolves to a real catalog Exercise
    for prescription in view.prescriptions:
        assert exercises.get(prescription.exercise_id) is not None


def test_equivalent_exercise_name_reuses_the_existing_catalog_entry():
    # Arrange — a curated "Back Squat" already exists in the catalog
    exercises, sessions = _build_repos()
    from app.domain.exercise import Provenance

    existing = exercises.find_or_create("back squat", provenance=Provenance.CURATED)
    generator = FakeGenerator(result=_two_exercise_generation())

    # Act — generation prescribes "Back Squat" (same normalized name)
    view = generate_session(
        REQUEST, "user_dedup", generator=generator, exercises=exercises, sessions=sessions
    )

    # Assert — reuses the existing entry; its curated provenance is untouched
    squat = view.prescriptions[0]
    assert squat.exercise_id == existing.id
    assert squat.provenance == "curated"


def test_malformed_generation_is_not_persisted():
    # Arrange — the generator fails at the boundary
    exercises, sessions = _build_repos()
    generator = FakeGenerator(error=GenerationError("boom"))

    # Act / Assert — the error surfaces
    with pytest.raises(GenerationError):
        generate_session(
            REQUEST, "user_bad", generator=generator, exercises=exercises, sessions=sessions
        )

    # Assert — nothing was persisted for this user
    assert sessions.get(1, "user_bad") is None
