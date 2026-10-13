"""The Curated Protocol data format (ADR-0130).

A **Curated Protocol** is a human-authored, reviewed plan shipped as versioned data in the
repo, never a runtime-editable row. These frozen dataclasses *are* the format: a content file
(``beginner_linear.py``) builds one ``CuratedProtocol`` value, the content-integrity check
(``integrity.py``) gates it, and adoption (``adoption/curated.py``) enumerates it into a
user-owned Protocol.

The weekly pattern names Exercises by **name**, not catalog id: every name must be a seeded
``curated`` Catalog entry (``exercises.py``), and adopting only ever *resolves* it. A
Prescription either belongs to a **main lift** (its Load is the user's starting weight, written
as an absolute Load at adopt time) or carries its own authored Load text. Every Prescription
names its Progression Scheme explicitly — the deliberate exception to "generation is
scheme-agnostic" (ADR-0064) that ADR-0130 records.

A **wave** Curated Protocol (issue #693) carries a ``Wave``: its main lifts are
``WavePrescription``s whose sets, reps and absolute Load are computed per week from a working
set the user enters, and each ``MainLift`` names its fixed per-cycle increment.

Pure: no I/O, no ORM."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.domain.progression import ProgressionScheme


@dataclass(frozen=True)
class MainLift:
    """A lift the user supplies a starting weight for (ADR-0130).

    ``key`` is the stable identifier the adopt request keys its weights by; ``exercise`` is the
    seeded catalog name every Prescription of this lift uses. ``default_start_kg`` is the
    conservative starting weight offered to a user with no history; a wave Curated Protocol
    offers no default working set, so it doesn't read it (issue #694)."""

    key: str
    exercise: str
    default_start_kg: float
    # A wave Curated Protocol only: the absolute kilograms every one of this lift's weights
    # rises by each cycle, whether or not the user hit their reps. ``None`` elsewhere.
    cycle_increment_kg: float | None = None


@dataclass(frozen=True)
class PatternPrescription:
    """One Prescription in the weekly pattern.

    Exactly one of ``main_lift`` (a ``MainLift.key``) and ``load`` is set: a main lift takes
    its Load from the user's starting weight; an accessory carries authored Load text (a
    qualitative cue such as ``"moderate"``). ``scheme`` is always an explicit selection."""

    exercise: str
    sets: int
    reps: str
    scheme: ProgressionScheme
    main_lift: str | None = None
    load: str | None = None
    rest_seconds: int | None = None


@dataclass(frozen=True)
class WavePrescription:
    """A main lift of a wave Curated Protocol: its sets, reps and absolute Load come from the
    Curated Protocol's ``Wave`` for the week it lands in, so the pattern names only the lift.

    Always on the **Static** scheme, so the authored waves and deloads survive (ADR-0064).
    ``load`` is always ``None``: the Load comes from the main lift, never authored text."""

    exercise: str
    main_lift: str
    rest_seconds: int | None = None
    scheme: ProgressionScheme = ProgressionScheme.STATIC
    load: None = None


@dataclass(frozen=True)
class WaveWeek:
    """One week of a wave: ``sets`` × ``reps`` at ``share`` of the lift's reference weight.
    ``reps`` uses the rep grammar, so ``"5+"`` makes the last set as many reps as you can."""

    share: float
    sets: int
    reps: str


@dataclass(frozen=True)
class Wave:
    """How a wave Curated Protocol turns each main lift's working set into weights (ADR-0130).

    The reference is ``reference_share`` of the working set's Estimated 1RM, derived once at
    adopt time. ``weeks`` is one cycle, repeated to fill the chosen length; each later cycle
    adds the lift's ``cycle_increment_kg``. A computed weight below ``min_kg`` is held there."""

    reference_share: float
    weeks: tuple[WaveWeek, ...]
    # No week's weight is written below this, before the cycle increment: for a barbell lift,
    # the empty bar, which no lighter computed weight could be loaded under.
    min_kg: float

    @property
    def cycle_weeks(self) -> int:
        return len(self.weeks)


@dataclass(frozen=True)
class PatternSession:
    """One Session of the repeating weekly pattern."""

    title: str
    prescriptions: tuple[PatternPrescription | WavePrescription, ...]


@dataclass(frozen=True)
class CoachSignOff:
    """The recorded review a released Curated Protocol needs: who signed it off, and when
    (ADR-0130). No proof of qualification is recorded (issue #694)."""

    reviewer: str
    signed_on: date


@dataclass(frozen=True)
class CuratedProtocol:
    """One Curated Protocol: identity, honest description, shape, and its weekly pattern.

    Only a ``released`` Curated Protocol is listed or adoptable; content ships unreleased until a
    coach has signed it off. ``weekly_pattern`` holds one ``PatternSession`` per Session of
    a week, so its length is the Curated Protocol's sessions per week."""

    identifier: str
    version: int
    name: str
    description: str
    training_type: str
    objective: str
    duration_minutes: int
    min_weeks: int
    max_weeks: int
    required_equipment: tuple[str, ...]
    main_lifts: tuple[MainLift, ...]
    weekly_pattern: tuple[PatternSession, ...]
    coach_sign_off: CoachSignOff | None = None
    released: bool = False
    # Set on a wave Curated Protocol only: its main lifts take a recent working set, not a
    # starting weight, and their weights follow this wave.
    wave: Wave | None = None

    @property
    def sessions_per_week(self) -> int:
        return len(self.weekly_pattern)

    @property
    def is_wave(self) -> bool:
        return self.wave is not None

    def main_lift(self, key: str) -> MainLift | None:
        """The declared main lift with ``key``, or ``None``."""

        return next((lift for lift in self.main_lifts if lift.key == key), None)


__all__ = [
    "MainLift",
    "PatternPrescription",
    "WavePrescription",
    "WaveWeek",
    "Wave",
    "PatternSession",
    "CoachSignOff",
    "CuratedProtocol",
]
