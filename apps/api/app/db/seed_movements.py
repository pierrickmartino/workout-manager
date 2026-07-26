"""The curated seed set of common self-directed movements (ADR-0033).

Plan-less logging (ADR-0031) lets a user record an ad-hoc run, walk, or stretch
that no AI ever prescribed. Such movements otherwise never enter the shared catalog
— AI generation only mints Exercises for *prescribed* work — so they would forever
be bare ``user_entered`` rows with empty Exercise Detail. This module seeds a small,
fixed set of the most common cardio and mobility movements as **curated** entries,
so they resolve in the plan-less log picker as trusted, roll-up-ready movements.

The set is deliberately tight: strength movements are well-served by generation and
by search-and-create-by-name, so only self-directed cardio/mobility is seeded. Each
entry carries a coarse ``targeted_muscles`` list drawn from the Muscle Group
vocabulary (``domain/muscle_groups.py``) so its logged sets roll up honestly; a
movement with no single honest muscle home (mobility work) is left unmapped and
falls into Unclassified rather than being assigned a fabricated group.

Seeding reuses ``ExerciseRepository.find_or_create``, so it is idempotent by
normalized-name dedup (ADR-0002): re-running it never duplicates a movement and
never clobbers an existing entry."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field

from app.domain.exercise import Provenance
from app.repositories.exercise_repository import ExerciseRepository


@dataclass(frozen=True)
class SeedMovement:
    """One curated movement to seed: a name, a coarse muscle roll-up, and a single
    honest guidance step. ``targeted_muscles`` may be empty for movements with no
    single honest Muscle Group home (they surface as Unclassified, never guessed)."""

    name: str
    guidance: str
    targeted_muscles: Sequence[str] = field(default_factory=tuple)


# The fixed seed set. Muscle strings are chosen to match the curated
# ``_MUSCLE_TO_GROUP`` vocabulary so each rolls up to a real Muscle Group; mobility
# work is left unmapped on purpose.
COMMON_MOVEMENTS: tuple[SeedMovement, ...] = (
    SeedMovement(
        "Running",
        "Run at a steady, sustainable pace.",
        ("quadriceps", "hamstrings", "glutes", "calves"),
    ),
    SeedMovement(
        "Walking",
        "Walk at a brisk, steady pace.",
        ("quadriceps", "hamstrings", "glutes", "calves"),
    ),
    SeedMovement(
        "Cycling",
        "Ride at a steady cadence you can hold.",
        ("quadriceps", "hamstrings", "glutes", "calves"),
    ),
    SeedMovement(
        "Rowing",
        "Drive with the legs, then pull through the back and arms.",
        ("back", "lats", "quadriceps", "biceps", "core"),
    ),
    SeedMovement(
        "Swimming",
        "Swim continuous laps at a steady effort.",
        ("back", "shoulders", "chest", "core"),
    ),
    SeedMovement(
        "Elliptical",
        "Stride at a steady resistance and cadence.",
        ("quadriceps", "hamstrings", "glutes", "calves"),
    ),
    SeedMovement(
        "Jump Rope",
        "Skip at a steady rhythm, staying light on the feet.",
        ("calves", "shoulders", "core"),
    ),
    SeedMovement(
        "Plank",
        "Hold a straight line from head to heels, bracing the core.",
        ("core", "shoulders"),
    ),
    SeedMovement(
        "Stretching",
        "Move gently into each stretch and hold without bouncing.",
    ),
    SeedMovement(
        "Yoga",
        "Flow through the poses at your own breath-led pace.",
    ),
)


def seed_common_movements(exercises: ExerciseRepository) -> None:
    """Seed the curated common movements into the catalog, idempotently.

    Each movement is written through ``find_or_create`` as ``curated`` with a single
    Execution Step of guidance, so re-running is safe (normalized-name dedup) and an
    already-present entry is never overwritten (ADR-0002)."""

    for movement in COMMON_MOVEMENTS:
        exercises.find_or_create(
            movement.name,
            provenance=Provenance.CURATED,
            targeted_muscles=tuple(movement.targeted_muscles),
            instructions=(movement.guidance,),
        )


__all__ = ["SeedMovement", "COMMON_MOVEMENTS", "seed_common_movements"]
