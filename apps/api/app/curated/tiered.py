"""The tiered Curated Protocol (ADR-0130, issue #692).

Four Sessions run in order, each with three tiers:

- **T1**, a heavy main lift at 5×3 whose last set is as many reps as you can (``"3+"``), on
  Greyskull-style Linear: the weight steps up every Session the floor is met and resets down
  after a miss. The sets and reps never change after a miss; only the weight does.
- **T2**, a lighter barbell variation at 3×10 on Double Progression, from its own starting
  weight.
- **T3**, an upper-back accessory at 3×15 whose last set is as many reps as you can, on Double
  Progression with a qualitative Load the user raises themselves.

No tier shares an Exercise with another: Progression steps every upcoming Prescription of an
Exercise from its latest Logged Sets, so a T1 squat at three reps would read as a miss on a T2
squat at ten. T2 is therefore a variation of a T1 lift, not the lift itself.

Ships **unreleased** (no coach sign-off yet): it is neither listed nor adoptable until a coach
has reviewed it and the sign-off is recorded here (issue #682, ticket 12)."""

from __future__ import annotations

from app.curated.model import (
    CuratedProtocol,
    MainLift,
    PatternPrescription,
    PatternSession,
)
from app.domain.progression import ProgressionScheme

_T1_REST_SECONDS = 180
_T2_REST_SECONDS = 120
_T3_REST_SECONDS = 60
# Four sets of three, then a last set of as many good reps as you can (at least three).
_T1_SETS, _T1_REPS = 5, "3+"
_T2_SETS, _T2_REPS = 3, "10"
# Two sets of fifteen, then a last set of as many good reps as you can (at least fifteen).
_T3_SETS, _T3_REPS = 3, "15+"
_T3_LOAD = "light"

SQUAT = MainLift("squat", "Barbell Back Squat", default_start_kg=20)
PRESS = MainLift("press", "Barbell Overhead Press", default_start_kg=20)
BENCH = MainLift("bench", "Barbell Bench Press", default_start_kg=20)
DEADLIFT = MainLift("deadlift", "Barbell Deadlift", default_start_kg=40)
CLOSE_GRIP_BENCH = MainLift(
    "close_grip_bench", "Barbell Close-Grip Bench Press", default_start_kg=20
)
ROMANIAN_DEADLIFT = MainLift("romanian_deadlift", "Barbell Romanian Deadlift", default_start_kg=30)
FRONT_SQUAT = MainLift("front_squat", "Barbell Front Squat", default_start_kg=20)
INCLINE_BENCH = MainLift("incline_bench", "Barbell Incline Bench Press", default_start_kg=20)


def _main(
    lift: MainLift, sets: int, reps: str, scheme: ProgressionScheme, rest_seconds: int
) -> PatternPrescription:
    return PatternPrescription(
        exercise=lift.exercise,
        sets=sets,
        reps=reps,
        scheme=scheme,
        main_lift=lift.key,
        rest_seconds=rest_seconds,
    )


def _accessory(exercise: str) -> PatternPrescription:
    return PatternPrescription(
        exercise=exercise,
        sets=_T3_SETS,
        reps=_T3_REPS,
        scheme=ProgressionScheme.DOUBLE_PROGRESSION,
        load=_T3_LOAD,
        rest_seconds=_T3_REST_SECONDS,
    )


def _session(title: str, tier1: MainLift, tier2: MainLift, tier3: str) -> PatternSession:
    return PatternSession(
        title,
        (
            _main(tier1, _T1_SETS, _T1_REPS, ProgressionScheme.GREYSKULL, _T1_REST_SECONDS),
            _main(
                tier2,
                _T2_SETS,
                _T2_REPS,
                ProgressionScheme.DOUBLE_PROGRESSION,
                _T2_REST_SECONDS,
            ),
            _accessory(tier3),
        ),
    )


TIERED = CuratedProtocol(
    identifier="tiered-linear-progression",
    version=1,
    name="Tiered linear progression",
    description=(
        "Four sessions a week, done in order, each in three tiers. Tier 1 is a heavy barbell "
        "main lift (squat, overhead press, bench press or deadlift): five sets of three, and "
        "the last set is as many good reps as you can. It goes up 2.5 kg after a session in "
        "which every set reaches three. After a session where a set falls short, the weight "
        "resets down 10%; the sets and reps stay the same, and only the weight changes. Tier "
        "2 is a lighter barbell variation of another main lift for three sets of ten, from "
        "its own starting weight. It goes up 2.5 kg after a session in which every set "
        "reaches ten and you log an effort of 7 out of 10 or less for each one; with no "
        "effort logged it holds. It goes down 5 kg after a session where a set falls short "
        "of ten. Tier 3 is a lat pulldown or dumbbell row for three sets of fifteen, the last "
        "as many reps as you can. It is prescribed as light and never changes on its own: "
        "add weight yourself once every set reaches fifteen. It suits someone past their "
        "first months of lifting who wants heavy, low-rep work alongside more volume. It "
        "needs a cable station, and it does not include conditioning or planned deload "
        "weeks."
    ),
    training_type="strength",
    objective="build strength",
    duration_minutes=60,
    min_weeks=6,
    max_weeks=16,
    required_equipment=("barbell", "rack", "bench", "dumbbell", "cable"),
    main_lifts=(
        SQUAT,
        PRESS,
        BENCH,
        DEADLIFT,
        CLOSE_GRIP_BENCH,
        ROMANIAN_DEADLIFT,
        FRONT_SQUAT,
        INCLINE_BENCH,
    ),
    weekly_pattern=(
        _session("Squat", SQUAT, CLOSE_GRIP_BENCH, "Lat Pulldown"),
        _session("Overhead press", PRESS, ROMANIAN_DEADLIFT, "Dumbbell Row"),
        _session("Bench press", BENCH, FRONT_SQUAT, "Lat Pulldown"),
        _session("Deadlift", DEADLIFT, INCLINE_BENCH, "Dumbbell Row"),
    ),
)


__all__ = ["TIERED"]
