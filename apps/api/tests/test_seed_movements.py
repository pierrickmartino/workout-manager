"""The curated common-movement seed set (ADR-0033).

Plan-less logging needs common cardio/mobility movements to exist as trusted
catalog entries. These tests pin the seed helper's contract: it writes each
movement as ``curated`` with a single guidance step, it is idempotent (safe to run
on every ``alembic upgrade``), and its muscle roll-ups are honest — cardio maps to a
real Muscle Group, mobility work falls into Unclassified rather than a fabricated
one."""

from __future__ import annotations

from app.db.seed_movements import COMMON_MOVEMENTS, seed_common_movements
from app.domain.exercise import Provenance
from app.domain.muscle_groups import MuscleGroup, classify
from app.repositories.exercise_repository import InMemoryExerciseRepository


def test_seeds_every_common_movement_as_curated_with_one_guidance_step():
    # Arrange
    exercises = InMemoryExerciseRepository()

    # Act
    seed_common_movements(exercises)

    # Assert — one curated entry per seed movement, each with a single Execution Step
    for movement in COMMON_MOVEMENTS:
        seeded = exercises.find_or_create(
            movement.name, provenance=Provenance.CURATED
        )
        assert seeded.provenance == Provenance.CURATED.value
        assert seeded.instructions == [movement.guidance]


def test_seeding_is_idempotent():
    # Arrange — a repo seeded once already
    exercises = InMemoryExerciseRepository()
    seed_common_movements(exercises)

    # Act — running the seed again (as every startup migration would)
    seed_common_movements(exercises)

    # Assert — no duplicates: exactly one catalog entry per movement
    total = exercises.search("", limit=100, offset=0).total
    # a blank query matches nothing, so count via provenance instead
    curated = exercises.list_by_provenance(Provenance.CURATED)
    assert len(curated) == len(COMMON_MOVEMENTS)
    assert total == 0  # blank query is pick-nothing (ADR-0021)


def test_cardio_movements_roll_up_to_a_real_muscle_group():
    # Assert — a mapped movement's muscles classify into real groups, never
    # Unclassified, so its logged sets show up in the Analytics distribution
    running = next(m for m in COMMON_MOVEMENTS if m.name == "Running")
    groups = {classify(muscle) for muscle in running.targeted_muscles}
    assert groups == {MuscleGroup.LEGS}
    assert MuscleGroup.UNCLASSIFIED not in groups


def test_mobility_movements_are_left_unmapped_not_fabricated():
    # Assert — Stretching/Yoga have no single honest Muscle Group, so they carry no
    # targeted muscles and fall into Unclassified rather than a guessed group
    for name in ("Stretching", "Yoga"):
        movement = next(m for m in COMMON_MOVEMENTS if m.name == name)
        assert tuple(movement.targeted_muscles) == ()


def test_seeding_never_overwrites_an_existing_entry():
    # Arrange — a user already created a bare "Running" before the seed ran
    exercises = InMemoryExerciseRepository()
    pre = exercises.find_or_create("Running", provenance=Provenance.USER_ENTERED)

    # Act
    seed_common_movements(exercises)

    # Assert — dedup returns the pre-existing row untouched (ADR-0002): same id,
    # and its user_entered provenance is not clobbered to curated
    post = exercises.find_or_create("Running", provenance=Provenance.CURATED)
    assert post.id == pre.id
    assert post.provenance == Provenance.USER_ENTERED.value
