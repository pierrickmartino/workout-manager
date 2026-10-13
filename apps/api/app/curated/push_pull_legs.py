"""The push/pull/legs Curated Protocol (ADR-0130, issue #691).

Three Sessions run in order: a push day (chest, shoulders, triceps), a pull day (back, biceps,
rear shoulders) and a leg day. Every Prescription is on Double Progression: work inside the rep
range, and the weight goes up once every set reaches the top of it at a comfortable effort.
The five barbell main lifts start from the user's own weights; accessories carry qualitative
Loads the user raises themselves.

Released with the sign-off from its review (issue #694), recorded below."""

from __future__ import annotations

from datetime import date

from app.curated.model import (
    CoachSignOff,
    CuratedProtocol,
    MainLift,
    PatternPrescription,
    PatternSession,
)
from app.domain.progression import ProgressionScheme

_HEAVY_REST_SECONDS = 180
_MAIN_REST_SECONDS = 150
_ACCESSORY_REST_SECONDS = 90

BENCH = MainLift("bench", "Barbell Bench Press", default_start_kg=20)
PRESS = MainLift("press", "Barbell Overhead Press", default_start_kg=20)
ROW = MainLift("row", "Barbell Row", default_start_kg=20)
DEADLIFT = MainLift("deadlift", "Barbell Deadlift", default_start_kg=40)
SQUAT = MainLift("squat", "Barbell Back Squat", default_start_kg=20)


def _main(lift: MainLift, sets: int, reps: str, rest_seconds: int) -> PatternPrescription:
    return PatternPrescription(
        exercise=lift.exercise,
        sets=sets,
        reps=reps,
        scheme=ProgressionScheme.DOUBLE_PROGRESSION,
        main_lift=lift.key,
        rest_seconds=rest_seconds,
    )


def _accessory(exercise: str, sets: int, reps: str, load: str) -> PatternPrescription:
    return PatternPrescription(
        exercise=exercise,
        sets=sets,
        reps=reps,
        scheme=ProgressionScheme.DOUBLE_PROGRESSION,
        load=load,
        rest_seconds=_ACCESSORY_REST_SECONDS,
    )


PUSH_PULL_LEGS = CuratedProtocol(
    identifier="push-pull-legs",
    version=1,
    name="Push, pull, legs",
    description=(
        "Three gym sessions a week, done in order: push (bench press, overhead press, chest, "
        "shoulders and triceps), pull (deadlift, barbell row, back and biceps) and legs (back "
        "squat, hamstrings and calves). Every exercise has a rep range. Each main lift goes "
        "up 2.5 kg after a session in which every set reaches the top of its range and you "
        "log an effort of 7 out of 10 or less for each one; with no effort logged it holds. "
        "It goes down 5 kg after a session where a set falls short of the bottom of the "
        "range. Accessories are prescribed as light or moderate and never change on their "
        "own: pick a weight that fits, and add to it yourself once every set reaches the "
        "top of the range. It suits someone with a few months of lifting who wants more "
        "work per session for each muscle group than a full-body plan gives. It needs a "
        "cable station, and it does not include conditioning or planned deload weeks."
    ),
    training_type="strength",
    objective="build muscle and strength",
    duration_minutes=60,
    min_weeks=6,
    max_weeks=16,
    required_equipment=("barbell", "rack", "bench", "dumbbell", "cable"),
    main_lifts=(BENCH, PRESS, ROW, DEADLIFT, SQUAT),
    weekly_pattern=(
        PatternSession(
            "Push",
            (
                _main(BENCH, 3, "6-10", _HEAVY_REST_SECONDS),
                _main(PRESS, 3, "6-10", _MAIN_REST_SECONDS),
                _accessory("Incline Dumbbell Press", 3, "8-12", "moderate"),
                _accessory("Dumbbell Lateral Raise", 3, "12-15", "light"),
                _accessory("Cable Triceps Pushdown", 3, "10-15", "moderate"),
            ),
        ),
        PatternSession(
            "Pull",
            (
                _main(DEADLIFT, 2, "5-8", _HEAVY_REST_SECONDS),
                _main(ROW, 3, "6-10", _MAIN_REST_SECONDS),
                _accessory("Lat Pulldown", 3, "8-12", "moderate"),
                _accessory("Face Pull", 3, "12-15", "light"),
                _accessory("Dumbbell Curl", 3, "10-15", "light"),
            ),
        ),
        PatternSession(
            "Legs",
            (
                _main(SQUAT, 3, "6-10", _HEAVY_REST_SECONDS),
                _accessory("Dumbbell Romanian Deadlift", 3, "8-12", "moderate"),
                _accessory("Dumbbell Split Squat", 3, "8-12", "moderate"),
                _accessory("Dumbbell Calf Raise", 3, "12-20", "moderate"),
            ),
        ),
    ),
    coach_sign_off=CoachSignOff(reviewer="Pierrick Martino", signed_on=date(2026, 10, 13)),
    released=True,
)


__all__ = ["PUSH_PULL_LEGS"]
