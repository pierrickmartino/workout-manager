"""The Curated Protocol data format (ADR-0130).

A **Curated Protocol** is a human-authored, coach-reviewed plan shipped as versioned data in the
repo, never a runtime-editable row. These frozen dataclasses *are* the format: a program file
(``beginner_linear.py``) builds one ``CuratedProtocol`` value, the content-integrity check
(``integrity.py``) gates it, and adoption (``adoption/curated.py``) enumerates it into a
user-owned Protocol.

The weekly pattern names Exercises by **name**, not catalog id: every name must be a seeded
``curated`` Catalog entry (``exercises.py``), and adopting only ever *resolves* it. A
Prescription either belongs to a **main lift** (its Load is the user's starting weight, written
as an absolute Load at adopt time) or carries its own authored Load text. Every Prescription
names its Progression Scheme explicitly — the deliberate exception to "generation is
scheme-agnostic" (ADR-0064) that ADR-0130 records.

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
    conservative starting weight offered to a user with no history."""

    key: str
    exercise: str
    default_start_kg: float


@dataclass(frozen=True)
class PrescriptionTemplate:
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
class SessionTemplate:
    """One Session of the repeating weekly pattern."""

    title: str
    prescriptions: tuple[PrescriptionTemplate, ...]


@dataclass(frozen=True)
class CoachSignOff:
    """The recorded review by a qualified coach a released program needs (ADR-0130)."""

    reviewer: str
    credential: str
    signed_on: date


@dataclass(frozen=True)
class CuratedProtocol:
    """One Curated Protocol: identity, honest description, shape, and its weekly pattern.

    Only a ``released`` program is listed or adoptable; content ships unreleased until a
    coach has signed it off. ``weekly_pattern`` holds one ``SessionTemplate`` per Session of
    a week, so its length is the program's sessions per week."""

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
    weekly_pattern: tuple[SessionTemplate, ...]
    coach_sign_off: CoachSignOff | None = None
    released: bool = False

    @property
    def sessions_per_week(self) -> int:
        return len(self.weekly_pattern)


__all__ = [
    "MainLift",
    "PrescriptionTemplate",
    "SessionTemplate",
    "CoachSignOff",
    "CuratedProtocol",
]
