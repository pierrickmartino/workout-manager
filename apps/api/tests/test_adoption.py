"""Adoption: deep-copying an immutable Generated Program into a user-owned,
mutable Program (ADR-0003). The behaviors that matter: every enumerated week is
copied across, each prescribed Exercise is resolved through the shared catalog,
and — the headline guarantee — the user's adopted copy is fully independent of the
source Generated artifact. Exercised with a fake generator output and in-memory
repositories."""

from __future__ import annotations

import copy

from app.adoption.service import adopt
from app.domain.exercise import Provenance
from app.generation.program_generator import ProgramGenerationRequest
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProgram,
    GeneratedProgramSession,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.program_repository import InMemoryProgramRepository


PARAMS = ProgramGenerationRequest(
    training_type="strength",
    objective="gain muscle mass",
    sessions_per_week=1,
    duration_minutes=45,
    weeks=2,
    equipment=["barbell"],
)


def _generated_program() -> GeneratedProgram:
    # Week-1 and Week-5-style progression: distinct loads per week (ADR-0001).
    return GeneratedProgram(
        sessions=[
            GeneratedProgramSession(
                week=1,
                day=1,
                title="Week 1 Push",
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Back Squat",
                        targeted_muscles=["quads"],
                        required_equipment=["barbell"],
                        sets=5,
                        reps="5",
                        recommended_load="60% 1RM",
                    )
                ],
            ),
            GeneratedProgramSession(
                week=2,
                day=1,
                title="Week 2 Push",
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Back Squat",
                        targeted_muscles=["quads"],
                        required_equipment=["barbell"],
                        sets=5,
                        reps="5",
                        recommended_load="65% 1RM",
                    )
                ],
            ),
        ]
    )


def _build_repos():
    exercises = InMemoryExerciseRepository()
    programs = InMemoryProgramRepository(exercises)
    return exercises, programs


def test_adopts_every_week_into_a_user_owned_program():
    # Arrange
    exercises, programs = _build_repos()

    # Act
    view = adopt(
        _generated_program(), "user_adopt", PARAMS,
        exercises=exercises, programs=programs,
    )

    # Assert — user-owned, fully enumerated, weeks distinct
    assert view.clerk_user_id == "user_adopt"
    assert view.weeks == 2
    assert [s.week for s in view.sessions] == [1, 2]
    assert view.sessions[0].prescriptions[0].recommended_load == "60% 1RM"
    assert view.sessions[1].prescriptions[0].recommended_load == "65% 1RM"


def test_adopted_prescriptions_reuse_the_shared_catalog():
    # Arrange — the same movement appears in both weeks; the catalog dedups it
    exercises, programs = _build_repos()

    # Act
    view = adopt(
        _generated_program(), "user_cat", PARAMS,
        exercises=exercises, programs=programs,
    )

    # Assert — one catalog Exercise reused across both weeks, ai-generated
    week1 = view.sessions[0].prescriptions[0]
    week2 = view.sessions[1].prescriptions[0]
    assert week1.exercise_id == week2.exercise_id
    assert week1.provenance == "ai_generated"
    assert exercises.get(week1.exercise_id) is not None


def test_a_curated_catalog_exercise_is_reused_not_clobbered():
    # Arrange — a curated "Back Squat" already exists
    exercises, programs = _build_repos()
    existing = exercises.find_or_create("back squat", provenance=Provenance.CURATED)

    # Act
    view = adopt(
        _generated_program(), "user_curated", PARAMS,
        exercises=exercises, programs=programs,
    )

    # Assert — reuses it; curated provenance survives adoption
    prescribed = view.sessions[0].prescriptions[0]
    assert prescribed.exercise_id == existing.id
    assert prescribed.provenance == "curated"


def test_adoption_does_not_mutate_the_source_generated_program():
    # Arrange — the Generated artifact is the (future) cache entry; it is immutable
    exercises, programs = _build_repos()
    generated = _generated_program()
    snapshot = copy.deepcopy(generated)

    # Act
    adopt(generated, "user_iso1", PARAMS, exercises=exercises, programs=programs)

    # Assert — adoption left the source byte-for-byte unchanged
    assert generated == snapshot


def test_mutating_the_source_after_adoption_does_not_change_the_users_copy():
    # Arrange — adopt, then tamper with the Generated source as if a later user
    # request mutated the shared artifact
    exercises, programs = _build_repos()
    generated = _generated_program()
    view = adopt(generated, "user_iso2", PARAMS, exercises=exercises, programs=programs)

    # Act — mutate the source Generated Program's nested prescription
    generated.sessions[0].prescriptions[0].recommended_load = "TAMPERED"
    generated.sessions[0].title = "TAMPERED"

    # Assert — the user's adopted, deep-copied Program is untouched
    refetched = programs.get(view.id, "user_iso2")
    assert refetched.sessions[0].prescriptions[0].recommended_load == "60% 1RM"
    assert refetched.sessions[0].title == "Week 1 Push"


def test_two_users_adopt_independent_copies_from_one_generated_program():
    # Arrange — adopt-by-copy means one user's Program never aliases another's
    exercises, programs = _build_repos()
    generated = _generated_program()

    # Act
    view_a = adopt(generated, "user_a", PARAMS, exercises=exercises, programs=programs)
    view_b = adopt(generated, "user_b", PARAMS, exercises=exercises, programs=programs)

    # Assert — distinct Programs and distinct underlying Sessions per user
    assert view_a.id != view_b.id
    a_ids = {s.session_id for s in view_a.sessions}
    b_ids = {s.session_id for s in view_b.sessions}
    assert a_ids.isdisjoint(b_ids)
