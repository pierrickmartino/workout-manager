"""The seeded ``curated`` Catalog Exercises every Curated Protocol names (ADR-0130).

Adopting a Curated Protocol only *resolves* Exercises and never creates a Catalog row, so every
Exercise a Curated Protocol names must already exist. ``CURATED_EXERCISES`` is the seed manifest:
the content-integrity check fails the build if a Curated Protocol names anything outside it.

The manifest is a sequence of batches, each seeded by exactly one migration as ``curated``
Exercises. A batch is frozen once its migration has shipped, because an existing database never
re-runs it: a Curated Protocol that names a new movement adds a new batch and a migration that
seeds it.

Muscle strings come from the Muscle Group vocabulary (``domain/muscle_groups.py``) and equipment
strings from the canonical Equipment tokens (``domain/equipment.py``), so a seeded movement rolls
up and filters honestly from day one."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class CuratedExercise:
    """One curated movement to seed: its name, a one-line description, coarse muscles,
    required equipment, and a single honest guidance step."""

    name: str
    description: str
    targeted_muscles: tuple[str, ...]
    required_equipment: tuple[str, ...]
    guidance: str


# Seeded by ``0046_seed_curated_exercises``: the beginner linear progression's movements.
CURATED_EXERCISES_0046: tuple[CuratedExercise, ...] = (
    CuratedExercise(
        "Barbell Back Squat",
        "A squat with the barbell across the upper back.",
        ("quadriceps", "glutes", "hamstrings"),
        ("barbell", "rack"),
        "Brace, sit down between your heels until your hips pass your knees, then stand up.",
    ),
    CuratedExercise(
        "Barbell Bench Press",
        "A press from the chest while lying on a flat bench.",
        ("chest", "triceps", "shoulders"),
        ("barbell", "bench", "rack"),
        "Lower the bar to your mid-chest under control, then press it back over your shoulders.",
    ),
    CuratedExercise(
        "Barbell Overhead Press",
        "A standing press from the shoulders to overhead.",
        ("shoulders", "triceps"),
        ("barbell", "rack"),
        "Squeeze your glutes, press the bar straight up and finish with it over your mid-foot.",
    ),
    CuratedExercise(
        "Barbell Deadlift",
        "A pull of the barbell from the floor to standing.",
        ("hamstrings", "glutes", "lower back"),
        ("barbell",),
        "Keep the bar against your legs and your back flat as you stand up with it.",
    ),
    CuratedExercise(
        "Dumbbell Row",
        "A one-arm row with the free hand braced on a bench.",
        ("lats", "upper back", "biceps"),
        ("dumbbell", "bench"),
        "Pull the dumbbell to your hip, pause, and lower it under control.",
    ),
    CuratedExercise(
        "Dumbbell Curl",
        "A standing curl with a dumbbell in each hand.",
        ("biceps",),
        ("dumbbell",),
        "Keep your elbows at your sides and curl without swinging.",
    ),
    CuratedExercise(
        "Dumbbell Lateral Raise",
        "A raise of the dumbbells out to the sides to shoulder height.",
        ("shoulders",),
        ("dumbbell",),
        "Lead with your elbows and stop at shoulder height.",
    ),
)


# Seeded by ``0049_seed_push_pull_legs_exercises``: the push/pull/legs movements not in 0046.
CURATED_EXERCISES_0049: tuple[CuratedExercise, ...] = (
    CuratedExercise(
        "Barbell Row",
        "A bent-over row of the barbell to the lower ribs.",
        ("upper back", "lats", "biceps"),
        ("barbell",),
        "Hinge until your torso is close to horizontal, keep your back flat and pull the bar "
        "to your lower ribs.",
    ),
    CuratedExercise(
        "Incline Dumbbell Press",
        "A press of two dumbbells from the upper chest on a bench set to a low incline.",
        ("chest", "shoulders", "triceps"),
        ("dumbbell", "bench"),
        "Lower the dumbbells to the sides of your upper chest, then press them back up.",
    ),
    CuratedExercise(
        "Cable Triceps Pushdown",
        "A push of a cable handle down from chest height until the arms are straight.",
        ("triceps",),
        ("cable",),
        "Keep your elbows pinned to your sides and move only your forearms.",
    ),
    CuratedExercise(
        "Lat Pulldown",
        "A seated pull of a cable bar down to the upper chest.",
        ("lats", "upper back", "biceps"),
        ("cable",),
        "Keep your chest up, pull the bar to your upper chest, then let it rise under control.",
    ),
    CuratedExercise(
        "Face Pull",
        "A pull of a cable rope toward the face with the elbows high.",
        ("rear delts", "upper back"),
        ("cable",),
        "Pull the rope toward your forehead and pull its ends apart as it arrives.",
    ),
    CuratedExercise(
        "Dumbbell Romanian Deadlift",
        "A hip hinge holding a dumbbell in each hand, knees slightly bent.",
        ("hamstrings", "glutes", "lower back"),
        ("dumbbell",),
        "Push your hips back and slide the dumbbells down your legs until your hamstrings "
        "stretch, keeping your back flat, then stand up.",
    ),
    CuratedExercise(
        "Dumbbell Split Squat",
        "A split-stance squat holding a dumbbell in each hand.",
        ("quadriceps", "glutes"),
        ("dumbbell",),
        "Lower your back knee toward the floor and stand back up; do every rep on one leg, "
        "then switch.",
    ),
    CuratedExercise(
        "Dumbbell Calf Raise",
        "A standing rise onto the balls of the feet holding dumbbells.",
        ("calves",),
        ("dumbbell",),
        "Rise as high as you can, pause, and lower your heels slowly.",
    ),
)

# Seeded by ``0050_seed_tiered_exercises``: the tiered program's T2 variations.
CURATED_EXERCISES_0050: tuple[CuratedExercise, ...] = (
    CuratedExercise(
        "Barbell Close-Grip Bench Press",
        "A bench press with the hands about shoulder-width apart on the bar.",
        ("triceps", "chest", "shoulders"),
        ("barbell", "bench", "rack"),
        "Keep your elbows close to your sides, lower the bar to your lower chest, then press "
        "it back up.",
    ),
    CuratedExercise(
        "Barbell Romanian Deadlift",
        "A hip hinge with the barbell from standing, knees slightly bent.",
        ("hamstrings", "glutes", "lower back"),
        ("barbell",),
        "Push your hips back and slide the bar down your thighs until your hamstrings "
        "stretch, keeping your back flat, then stand up.",
    ),
    CuratedExercise(
        "Barbell Front Squat",
        "A squat with the barbell resting on the front of the shoulders.",
        ("quadriceps", "glutes", "upper back"),
        ("barbell", "rack"),
        "Keep your elbows high and your torso upright, sit down between your heels, then "
        "stand up.",
    ),
    CuratedExercise(
        "Barbell Incline Bench Press",
        "A press from the upper chest on a bench set to a low incline.",
        ("chest", "shoulders", "triceps"),
        ("barbell", "bench", "rack"),
        "Lower the bar to your upper chest under control, then press it back over your "
        "shoulders.",
    ),
)

# Already seeded by ``0019_seed_common_movements`` (``app.db.seed_movements``), which every later
# migration runs after, so no batch migration adds it: listed only so the integrity gate and the
# test catalog see it. Mirrors that row's muscles and guidance; the strength and running Curated
# Protocol names it.
CURATED_EXERCISES_0019: tuple[CuratedExercise, ...] = (
    CuratedExercise(
        "Running",
        "A run, outdoors or on a treadmill.",
        ("quadriceps", "hamstrings", "glutes", "calves"),
        (),
        "Run at a steady, sustainable pace.",
    ),
)

CURATED_EXERCISES: tuple[CuratedExercise, ...] = (
    *CURATED_EXERCISES_0019,
    *CURATED_EXERCISES_0046,
    *CURATED_EXERCISES_0049,
    *CURATED_EXERCISES_0050,
)


__all__ = [
    "CuratedExercise",
    "CURATED_EXERCISES",
    "CURATED_EXERCISES_0019",
    "CURATED_EXERCISES_0046",
    "CURATED_EXERCISES_0049",
    "CURATED_EXERCISES_0050",
]
