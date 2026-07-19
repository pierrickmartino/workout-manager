"""Adoption: deep-copying an immutable Generated Protocol into a user-owned,
mutable Protocol (ADR-0003). The behaviors that matter: every enumerated week is
copied across, each prescribed Exercise is resolved through the shared catalog,
and — the headline guarantee — the user's adopted copy is fully independent of the
source Generated artifact. Exercised with a fake generator output and in-memory
repositories."""

from __future__ import annotations

import copy

from app.adoption.service import adopt
from app.domain.exercise import Provenance
from app.domain.load import parse_load
from app.generation.protocol_generator import ProtocolGenerationRequest
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProtocol,
    GeneratedProtocolSession,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.protocol_repository import InMemoryProtocolRepository


PARAMS = ProtocolGenerationRequest(
    training_type="strength",
    objective="gain muscle mass",
    sessions_per_week=1,
    duration_minutes=45,
    weeks=2,
    equipment=["barbell"],
)


def _generated_protocol() -> GeneratedProtocol:
    # Week-1 and Week-5-style progression: distinct loads per week (ADR-0001).
    return GeneratedProtocol(
        sessions=[
            GeneratedProtocolSession(
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
            GeneratedProtocolSession(
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
    protocols = InMemoryProtocolRepository(exercises)
    return exercises, protocols


def test_adopts_every_week_into_a_user_owned_protocol():
    # Arrange
    exercises, protocols = _build_repos()

    # Act
    view = adopt(
        _generated_protocol(), "user_adopt", PARAMS,
        exercises=exercises, protocols=protocols,
    )

    # Assert — user-owned, fully enumerated, weeks distinct
    assert view.clerk_user_id == "user_adopt"
    assert view.weeks == 2
    assert [s.week for s in view.sessions] == [1, 2]
    assert view.sessions[0].prescriptions[0].recommended_load == parse_load("60% 1RM").to_dict()
    assert view.sessions[1].prescriptions[0].recommended_load == parse_load("65% 1RM").to_dict()


def test_adopted_prescriptions_reuse_the_shared_catalog():
    # Arrange — the same movement appears in both weeks; the catalog dedups it
    exercises, protocols = _build_repos()

    # Act
    view = adopt(
        _generated_protocol(), "user_cat", PARAMS,
        exercises=exercises, protocols=protocols,
    )

    # Assert — one catalog Exercise reused across both weeks, ai-generated
    week1 = view.sessions[0].prescriptions[0]
    week2 = view.sessions[1].prescriptions[0]
    assert week1.exercise_id == week2.exercise_id
    assert week1.provenance == "ai_generated"
    assert exercises.get(week1.exercise_id) is not None


def test_a_curated_catalog_exercise_is_reused_not_clobbered():
    # Arrange — a curated "Back Squat" already exists
    exercises, protocols = _build_repos()
    existing = exercises.find_or_create("back squat", provenance=Provenance.CURATED)

    # Act
    view = adopt(
        _generated_protocol(), "user_curated", PARAMS,
        exercises=exercises, protocols=protocols,
    )

    # Assert — reuses it; curated provenance survives adoption
    prescribed = view.sessions[0].prescriptions[0]
    assert prescribed.exercise_id == existing.id
    assert prescribed.provenance == "curated"


def test_adoption_does_not_mutate_the_source_generated_protocol():
    # Arrange — the Generated artifact is the (future) cache entry; it is immutable
    exercises, protocols = _build_repos()
    generated = _generated_protocol()
    snapshot = copy.deepcopy(generated)

    # Act
    adopt(generated, "user_iso1", PARAMS, exercises=exercises, protocols=protocols)

    # Assert — adoption left the source byte-for-byte unchanged
    assert generated == snapshot


def test_mutating_the_source_after_adoption_does_not_change_the_users_copy():
    # Arrange — adopt, then tamper with the Generated source as if a later user
    # request mutated the shared artifact
    exercises, protocols = _build_repos()
    generated = _generated_protocol()
    view = adopt(generated, "user_iso2", PARAMS, exercises=exercises, protocols=protocols)

    # Act — mutate the source Generated Protocol's nested prescription
    generated.sessions[0].prescriptions[0].recommended_load = "TAMPERED"
    generated.sessions[0].title = "TAMPERED"

    # Assert — the user's adopted, deep-copied Protocol is untouched
    refetched = protocols.get(view.id, "user_iso2")
    assert refetched.sessions[0].prescriptions[0].recommended_load == parse_load("60% 1RM").to_dict()
    assert refetched.sessions[0].title == "Week 1 Push"


def _superset_protocol() -> GeneratedProtocol:
    # One week, one Session pairing two movements as a valid Superset (ADR-0023).
    return GeneratedProtocol(
        sessions=[
            GeneratedProtocolSession(
                week=1,
                day=1,
                title="Arms",
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Dumbbell Curl",
                        sets=3,
                        reps="10",
                        superset_group="ss1",
                        round_rest_seconds=90,
                    ),
                    GeneratedExercisePrescription(
                        exercise_name="Triceps Pushdown",
                        sets=3,
                        reps="10",
                        superset_group="ss1",
                        round_rest_seconds=90,
                    ),
                ],
            )
        ]
    )


_SUPERSET_PARAMS = ProtocolGenerationRequest(
    training_type="hypertrophy",
    objective="gain muscle mass",
    sessions_per_week=1,
    duration_minutes=45,
    weeks=1,
    equipment=["dumbbell"],
)


def test_a_generated_superset_persists_through_adopt():
    # Arrange — a cached artifact carrying a valid Superset
    exercises, protocols = _build_repos()

    # Act
    view = adopt(
        _superset_protocol(), "user_ss_adopt", _SUPERSET_PARAMS,
        exercises=exercises, protocols=protocols,
    )

    # Assert — the grouping and group-owned round-rest deep-copy onto both members
    prescriptions = view.sessions[0].prescriptions
    assert [p.superset_group for p in prescriptions] == ["ss1", "ss1"]
    assert all(p.round_rest_seconds == 90 for p in prescriptions)


def test_adopted_superset_is_independent_of_the_source_artifact():
    # Arrange — adopt, then tamper with the shared Generated artifact's grouping
    exercises, protocols = _build_repos()
    generated = _superset_protocol()
    view = adopt(
        generated, "user_ss_iso", _SUPERSET_PARAMS,
        exercises=exercises, protocols=protocols,
    )

    # Act — mutate the source group tag as if a later request touched the cache entry
    generated.sessions[0].prescriptions[0].superset_group = "TAMPERED"

    # Assert — the user's adopted copy still reads the original grouping
    refetched = protocols.get(view.id, "user_ss_iso")
    assert refetched.sessions[0].prescriptions[0].superset_group == "ss1"


def test_two_users_adopt_independent_copies_from_one_generated_protocol():
    # Arrange — adopt-by-copy means one user's Protocol never aliases another's
    exercises, protocols = _build_repos()
    generated = _generated_protocol()

    # Act
    view_a = adopt(generated, "user_a", PARAMS, exercises=exercises, protocols=protocols)
    view_b = adopt(generated, "user_b", PARAMS, exercises=exercises, protocols=protocols)

    # Assert — distinct Protocols and distinct underlying Sessions per user
    assert view_a.id != view_b.id
    a_ids = {s.session_id for s in view_a.sessions}
    b_ids = {s.session_id for s in view_b.sessions}
    assert a_ids.isdisjoint(b_ids)
