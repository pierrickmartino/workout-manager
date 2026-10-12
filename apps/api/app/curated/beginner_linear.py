"""The beginner linear progression Curated Protocol (ADR-0130).

Three full-body barbell Sessions a week. The four main lifts run on Greyskull-style Linear: the
weight goes up after every Session in which every set reaches its rep floor, and drops back
after a miss. Accessories use qualitative Loads under Double Progression.

Ships **unreleased** (no coach sign-off yet): it is neither listed nor adoptable until a coach
has reviewed it and the sign-off is recorded here (issue #682, ticket 12)."""

from __future__ import annotations

from app.curated.model import (
    CuratedProtocol,
    MainLift,
    PrescriptionTemplate,
    SessionTemplate,
)
from app.domain.progression import ProgressionScheme

_MAIN_REST_SECONDS = 180
_ACCESSORY_REST_SECONDS = 90
# Two sets of five, then a last set of as many good reps as you can (at least five).
_MAIN_REPS = "5+"

SQUAT = MainLift("squat", "Barbell Back Squat", default_start_kg=20)
BENCH = MainLift("bench", "Barbell Bench Press", default_start_kg=20)
PRESS = MainLift("press", "Barbell Overhead Press", default_start_kg=20)
DEADLIFT = MainLift("deadlift", "Barbell Deadlift", default_start_kg=40)


def _main(lift: MainLift, sets: int) -> PrescriptionTemplate:
    return PrescriptionTemplate(
        exercise=lift.exercise,
        sets=sets,
        reps=_MAIN_REPS,
        scheme=ProgressionScheme.GREYSKULL,
        main_lift=lift.key,
        rest_seconds=_MAIN_REST_SECONDS,
    )


def _accessory(exercise: str, sets: int, reps: str, load: str) -> PrescriptionTemplate:
    return PrescriptionTemplate(
        exercise=exercise,
        sets=sets,
        reps=reps,
        scheme=ProgressionScheme.DOUBLE_PROGRESSION,
        load=load,
        rest_seconds=_ACCESSORY_REST_SECONDS,
    )


BEGINNER_LINEAR = CuratedProtocol(
    identifier="beginner-linear-progression",
    version=1,
    name="Beginner linear progression",
    description=(
        "Three full-body barbell sessions a week built on the squat, bench press, overhead "
        "press and deadlift. Every set is at least five reps, and the last set is as many "
        "good reps as you can. Each main lift goes up 2.5 kg after a session in which every "
        "set reaches five, and drops back 10% after a session where one doesn’t. It suits someone new to barbell training who wants to add "
        "weight quickly. It does not alternate A/B weeks, programme conditioning, or plan "
        "for the point where you stop adding weight every session: when that happens, "
        "Calibrate the plan or move to an intermediate Protocol."
    ),
    training_type="strength",
    objective="build strength",
    duration_minutes=60,
    min_weeks=4,
    max_weeks=12,
    required_equipment=("barbell", "rack", "bench", "dumbbell"),
    main_lifts=(SQUAT, BENCH, PRESS, DEADLIFT),
    weekly_pattern=(
        SessionTemplate(
            "Squat and bench",
            (
                _main(SQUAT, 3),
                _main(BENCH, 3),
                _accessory("Dumbbell Row", 3, "8-12", "moderate"),
            ),
        ),
        SessionTemplate(
            "Deadlift and press",
            (
                _main(DEADLIFT, 1),
                _main(PRESS, 3),
                _accessory("Dumbbell Curl", 2, "10-15", "light"),
            ),
        ),
        SessionTemplate(
            "Squat and bench",
            (
                _main(SQUAT, 3),
                _main(BENCH, 3),
                _accessory("Dumbbell Lateral Raise", 2, "12-15", "light"),
            ),
        ),
    ),
)


__all__ = ["BEGINNER_LINEAR"]
