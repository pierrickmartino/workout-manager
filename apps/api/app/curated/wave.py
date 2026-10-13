"""The wave Curated Protocol (ADR-0130, issue #693).

Four Sessions run in order, each built around one barbell main lift plus two dumbbell
accessories. The main lifts run in four-week **cycles**: three working weeks of rising
intensity (3×5, 3×3, 3×1, the last set of each as many reps as you can), then a deload week of
3×5. The user enters a recent working set per lift; every week's weight is computed from it
**once** at adopt time (``wave_loads.py``) and written as an absolute Load, and each new cycle adds a
fixed increment: more for the lower-body lifts than the upper-body ones.

The main lifts are on **Static**, so the authored waves and deloads survive: Progression never
steps them (ADR-0064). The increment is therefore blind to whether the user hit their reps, and
the description says so and points to Calibrate (ADR-0111). Accessories use Double Progression
at a qualitative Load, as in the other Curated Protocols, and do not wave.

Ships **unreleased** (no coach sign-off yet): it is neither listed nor adoptable until a coach
has reviewed it and the sign-off is recorded here (issue #682, ticket 12)."""

from __future__ import annotations

from app.curated.model import (
    CuratedProtocol,
    MainLift,
    PatternPrescription,
    PatternSession,
    Wave,
    WavePrescription,
    WaveWeek,
)
from app.domain.loadable import EMPTY_BAR_KG
from app.domain.progression import ProgressionScheme

# What each cycle adds to every weight of a lift, whether or not its reps were hit.
LOWER_BODY_CYCLE_INCREMENT_KG = 5.0
UPPER_BODY_CYCLE_INCREMENT_KG = 2.5

_MAIN_REST_SECONDS = 180
_ACCESSORY_REST_SECONDS = 90

# The reference sits under the working set's Estimated 1RM, so the heaviest week starts below
# a true max and the first cycles leave room.
_REFERENCE_SHARE = 0.9
_WAVE_SETS = 3
WAVE_CYCLE = Wave(
    reference_share=_REFERENCE_SHARE,
    # Every waved lift is a barbell lift, so no weight is written under the empty bar.
    min_kg=EMPTY_BAR_KG,
    weeks=(
        WaveWeek(share=0.85, sets=_WAVE_SETS, reps="5+"),
        WaveWeek(share=0.90, sets=_WAVE_SETS, reps="3+"),
        WaveWeek(share=0.95, sets=_WAVE_SETS, reps="1+"),
        # The deload: lighter, plain fives, no all-out last set.
        WaveWeek(share=0.60, sets=_WAVE_SETS, reps="5"),
    ),
)

SQUAT = MainLift(
    "squat",
    "Barbell Back Squat",
    default_start_kg=20,
    cycle_increment_kg=LOWER_BODY_CYCLE_INCREMENT_KG,
)
BENCH = MainLift(
    "bench",
    "Barbell Bench Press",
    default_start_kg=20,
    cycle_increment_kg=UPPER_BODY_CYCLE_INCREMENT_KG,
)
DEADLIFT = MainLift(
    "deadlift",
    "Barbell Deadlift",
    default_start_kg=40,
    cycle_increment_kg=LOWER_BODY_CYCLE_INCREMENT_KG,
)
PRESS = MainLift(
    "press",
    "Barbell Overhead Press",
    default_start_kg=20,
    cycle_increment_kg=UPPER_BODY_CYCLE_INCREMENT_KG,
)


def _main(lift: MainLift) -> WavePrescription:
    return WavePrescription(
        exercise=lift.exercise, main_lift=lift.key, rest_seconds=_MAIN_REST_SECONDS
    )


def _accessory(exercise: str, reps: str, load: str) -> PatternPrescription:
    return PatternPrescription(
        exercise=exercise,
        sets=3,
        reps=reps,
        scheme=ProgressionScheme.DOUBLE_PROGRESSION,
        load=load,
        rest_seconds=_ACCESSORY_REST_SECONDS,
    )


WAVE = CuratedProtocol(
    identifier="four-week-strength-waves",
    version=1,
    name="Four-week strength waves",
    description=(
        "Four sessions a week, done in order, each built around one barbell main lift "
        "(squat, bench press, deadlift or overhead press) plus two dumbbell accessories. "
        "The main lifts run in four-week cycles. You need a logged set of each lift first, "
        "from 1 to 12 reps. Before you start, you enter a recent working set for each lift, "
        "a weight and the reps you did with it, and every week's weights are worked out from "
        "it once, when you adopt. The first three weeks get "
        "heavier as the reps drop: three sets of five, then of three, then of one, and the "
        "last set each week is as many good reps as you can. The fourth week is a lighter "
        "deload of three sets of five. Each new cycle adds 5 kg to every squat and deadlift "
        "weight and 2.5 kg to every bench and overhead press weight. That increase happens "
        "whether or not you hit your reps: the plan does not adjust to your sessions. If the "
        "weights get ahead of you, use Calibrate to re-pitch the rest of the plan. "
        "Accessories are prescribed as light or moderate and never change on their own: add "
        "weight yourself once every set reaches the top of its range. It suits someone with "
        "some lifting experience who wants planned heavy and light weeks. It does not "
        "include conditioning, and it never retests your maximum."
    ),
    training_type="strength",
    objective="build strength",
    duration_minutes=60,
    min_weeks=4,
    max_weeks=16,
    required_equipment=("barbell", "rack", "bench", "dumbbell"),
    main_lifts=(SQUAT, BENCH, DEADLIFT, PRESS),
    weekly_pattern=(
        PatternSession(
            "Squat",
            (
                _main(SQUAT),
                _accessory("Dumbbell Romanian Deadlift", "8-12", "moderate"),
                _accessory("Dumbbell Row", "8-12", "moderate"),
            ),
        ),
        PatternSession(
            "Bench press",
            (
                _main(BENCH),
                _accessory("Dumbbell Row", "8-12", "moderate"),
                _accessory("Dumbbell Curl", "10-15", "light"),
            ),
        ),
        PatternSession(
            "Deadlift",
            (
                _main(DEADLIFT),
                _accessory("Dumbbell Split Squat", "8-12", "moderate"),
                _accessory("Dumbbell Calf Raise", "12-20", "moderate"),
            ),
        ),
        PatternSession(
            "Overhead press",
            (
                _main(PRESS),
                _accessory("Incline Dumbbell Press", "8-12", "moderate"),
                _accessory("Dumbbell Lateral Raise", "12-15", "light"),
            ),
        ),
    ),
    wave=WAVE_CYCLE,
)


__all__ = [
    "LOWER_BODY_CYCLE_INCREMENT_KG",
    "UPPER_BODY_CYCLE_INCREMENT_KG",
    "WAVE",
    "WAVE_CYCLE",
]
