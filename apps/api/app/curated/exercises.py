"""The seeded ``curated`` Catalog Exercises every Curated Protocol names (ADR-0130).

Adopting a Curated Protocol only *resolves* Exercises and never creates a Catalog row, so every
Exercise a program names must already exist. This tuple is the seed manifest: migration
``0046_seed_curated_protocol_exercises`` inserts each entry as a ``curated`` Exercise, and the
content-integrity check fails the build if a program names anything outside it.

Adding an Exercise here is not enough on an existing database, where 0046 has already run: a
later program that names a new movement ships its own migration seeding the delta.

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


CURATED_EXERCISES: tuple[CuratedExercise, ...] = (
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


__all__ = ["CuratedExercise", "CURATED_EXERCISES"]
