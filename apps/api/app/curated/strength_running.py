"""The strength and running Curated Protocol (ADR-0130 amendment).

A concurrent program for an intermediate lifter who can already run 30 minutes easy. Six
Sessions run in order, alternating three lifting Sessions with three runs: Lower, easy run,
Upper A, intervals, Upper B, long easy run. The order is the only lever against interference in a
calendar-free plan (ADR-0001): the heavy leg day is followed by the gentlest run and the
intervals land after an upper day. Lower-body lifting is trained once a week, and there is no
heavy deadlift, because the runs already load the legs.

The lifts are on Double Progression: the four barbell main lifts start from the user's own
weights, and accessories carry qualitative Loads. Each run is the one ``Running`` movement held
flat on **Static**, because no Progression Scheme steps a distance or duration; its effort is a
qualitative Load and its target a typed Quantity. The run Sessions are the first typed and timed
apart from their Curated Protocol: ``cardio``, with their own durations.

Ships unreleased until a sign-off naming its reviewer is recorded."""

from __future__ import annotations

from app.curated.model import (
    CuratedProtocol,
    MainLift,
    PatternPrescription,
    PatternSession,
)
from app.domain.progression import ProgressionScheme

_MAIN_REST_SECONDS = 150
_ACCESSORY_REST_SECONDS = 90
_INTERVAL_REST_SECONDS = 90
_LIFT_MINUTES = 55

_EASY = "easy, conversational pace"
_HARD = "hard, about your 5K race effort"

SQUAT = MainLift("squat", "Barbell Back Squat", default_start_kg=20)
BENCH = MainLift("bench", "Barbell Bench Press", default_start_kg=20)
ROW = MainLift("row", "Barbell Row", default_start_kg=20)
PRESS = MainLift("press", "Barbell Overhead Press", default_start_kg=20)


def _main(lift: MainLift) -> PatternPrescription:
    return PatternPrescription(
        exercise=lift.exercise,
        sets=4,
        reps="5-8",
        scheme=ProgressionScheme.DOUBLE_PROGRESSION,
        main_lift=lift.key,
        rest_seconds=_MAIN_REST_SECONDS,
    )


def _accessory(exercise: str) -> PatternPrescription:
    return PatternPrescription(
        exercise=exercise,
        sets=3,
        reps="8-12",
        scheme=ProgressionScheme.DOUBLE_PROGRESSION,
        load="moderate",
        rest_seconds=_ACCESSORY_REST_SECONDS,
    )


def _run(amount: str, effort: str, sets: int = 1, rest_seconds: int | None = None):
    return PatternPrescription(
        exercise="Running",
        sets=sets,
        reps=amount,
        scheme=ProgressionScheme.STATIC,
        load=effort,
        rest_seconds=rest_seconds,
    )


def _run_session(
    title: str, prescriptions: tuple[PatternPrescription, ...], duration_minutes: int
) -> PatternSession:
    return PatternSession(
        title, prescriptions, training_type="cardio", duration_minutes=duration_minutes
    )


STRENGTH_RUNNING = CuratedProtocol(
    identifier="strength-running",
    version=1,
    name="Strength and running",
    description=(
        "Six sessions a week, done in order, alternating lifting and running: lower body, an "
        "easy 30-minute run, upper body, intervals, upper body again, and a long easy "
        "45-minute run. The heavy leg day is followed by the easiest run, and the intervals "
        "come after an upper-body day. The four barbell lifts (back squat, bench press, "
        "barbell row and overhead press) are four sets of 5 to 8: each goes up 2.5 kg after "
        "a session in which every set reaches 8 reps at an effort of 7 out of 10 or less, "
        "holds with no effort logged, and goes down 5 kg after a session where a set falls "
        "short of 5. Accessories are prescribed as moderate: add weight yourself once every "
        "set reaches 12. The intervals are six hard 400-metre repeats at about your 5K race "
        "effort, with an easy 10-minute warm-up and 5-minute cool-down; the other runs are "
        "at a conversational pace, outdoors or on a treadmill. The run targets stay the "
        "same every week: raise them yourself as running gets easier. It suits someone "
        "with about a year of lifting who can already run 30 minutes without stopping. It "
        "has no heavy deadlift, no race-specific training and no planned deload weeks."
    ),
    training_type="strength",
    objective="build strength and running fitness",
    duration_minutes=_LIFT_MINUTES,
    min_weeks=8,
    max_weeks=16,
    required_equipment=("barbell", "rack", "bench", "dumbbell", "cable"),
    main_lifts=(SQUAT, BENCH, ROW, PRESS),
    weekly_pattern=(
        PatternSession(
            "Lower",
            (
                _main(SQUAT),
                _accessory("Dumbbell Romanian Deadlift"),
                _accessory("Dumbbell Split Squat"),
            ),
        ),
        _run_session("Easy run", (_run("30 min", _EASY),), duration_minutes=35),
        PatternSession(
            "Upper A",
            (
                _main(BENCH),
                _main(ROW),
                _accessory("Dumbbell Lateral Raise"),
                _accessory("Cable Triceps Pushdown"),
            ),
        ),
        _run_session(
            "Intervals",
            (
                _run("10 min", _EASY),
                _run("0.4 km", _HARD, sets=6, rest_seconds=_INTERVAL_REST_SECONDS),
                _run("5 min", _EASY),
            ),
            duration_minutes=40,
        ),
        PatternSession(
            "Upper B",
            (
                _main(PRESS),
                _accessory("Lat Pulldown"),
                _accessory("Incline Dumbbell Press"),
                _accessory("Face Pull"),
                _accessory("Dumbbell Curl"),
            ),
        ),
        _run_session("Long easy run", (_run("45 min", _EASY),), duration_minutes=50),
    ),
)


__all__ = ["STRENGTH_RUNNING"]
