"""The read-time projection behind the Profile view screen (F5 Slices 1–2).

``profile_progress`` reads the user's Logged Sessions **once** and projects them onto a
single immutable ``ProfileProgress`` DTO: the account's XP and Operator Level, the weekly
Streak, the lifetime Total Sessions / Total Sets, and the **Effective Fitness Level** per
Training Type. Every figure is derived from the *record* side — no ledger, no stored
counters, no write hooks (ADR-0018) — so a corrected or deleted log simply recomputes,
mirroring ``logbook/analytics.py`` and ``domain/personal_records.py``.

The Fitness Level standing is the one projection here that is **not** a function of the
record alone: the rule is the Declared level *plus* net recent evidence, so the Declared
levels arrive as a second input (ADR-0112). That is why it is served from *this* read
model and deliberately never from the Profile endpoint, whose ``fitness_levels`` field is
a validated **request** field as well as a response field and is written back by the
Profile form — a derived value placed there round-trips, and the first careless save
persists a projection into the declared baseline. ADR-0018 forbids *storing* a
projection, not reading a stored input into one.

This is the shared spine the F5 slices extend: Slice 3 adds the Achievement wall. Pure
orchestration over the Logged-Session repository: no ORM, no HTTP, user-scoped because the
repository is.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Mapping, Sequence

from app.config import get_settings
from app.domain.achievements import Achievement, evaluate_achievements
from app.domain.experience import OperatorLevel
from app.domain.fitness_profile import effective_fitness_levels
from app.logbook.gamification import project_gamification
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
)


@dataclass(frozen=True)
class FitnessLevelStanding:
    """One Training Type's Fitness Level read both ways (GLOSSARY: Fitness Level).

    ``declared`` is the stored **Declared Fitness Level** the user states about
    themselves; ``effective`` is the **Effective Fitness Level** the generation cache key
    and the Calibration band actually run with — Declared plus net recent evidence, never
    below Declared (ADR-0112). The two are equal far more often than not, and that case
    is a standing like any other: a user must be able to tell that the app read their
    record and found no change, which is not the same message as a blank.
    """

    training_type: str
    declared: int
    effective: int


@dataclass(frozen=True)
class ProfileProgress:
    """The Profile view's honest read model (F5 Slices 1–2).

    ``xp`` is the account's total XP — the sessions-plus-attempted-sets projection over
    the whole record — and ``level`` is the Operator Level it maps into (ADR-0018).
    ``streak`` is the number of consecutive weeks ending at the current week in which at
    least one Logged Session exists (ADR-0019). ``total_sessions`` and ``total_sets`` are
    all-time counts over the user's whole record. ``achievements`` is the whole curated
    catalog evaluated read-time — each unlocked iff its predicate currently holds, with
    live progress while locked (ADR-0018). ``fitness_levels`` is one standing per
    **declared** Training Type, the Declared level read against the Effective one
    (ADR-0112). Every figure is read-time and non-monotonic: a user who has logged
    nothing projects to all zeros, Level 1, an all-locked wall, and every standing at
    exactly its Declared level.
    """

    xp: int
    level: OperatorLevel
    streak: int
    total_sessions: int
    total_sets: int
    achievements: list[Achievement]
    fitness_levels: list[FitnessLevelStanding]


def profile_progress(
    clerk_user_id: str,
    *,
    logged: LoggedSessionRepository,
    declared_levels: Mapping[str, int],
    today: date,
) -> ProfileProgress:
    """Project the user's Logged Sessions onto the ``ProfileProgress`` DTO.

    The history is read once; the Streak is computed over the session dates and the
    lifetime totals are simple counts over the whole record. Scoped to the owning user
    because ``list_for_user`` already is.

    ``declared_levels`` is the Fitness Profile's stored per-Training-Type **Declared
    Fitness Level** — the second input the Fitness Level standing needs and the only
    thing here that does not come from the record (ADR-0112). It is read, never written:
    nothing in this module or its route writes a level back. Required rather than
    defaulted, because an empty mapping is a real state (a user who has declared nothing)
    and must not double as a forgotten wiring.
    """

    history = logged.list_for_user(clerk_user_id)
    gamification = project_gamification(history, today=today)
    return ProfileProgress(
        xp=gamification.xp,
        level=gamification.level,
        streak=gamification.streak,
        total_sessions=len(history),
        total_sets=sum(len(session.logged_sets) for session in history),
        achievements=evaluate_achievements(history),
        fitness_levels=_standings(declared_levels, history),
    )


def _standings(
    declared_levels: Mapping[str, int], history: Sequence[LoggedSessionView]
) -> list[FitnessLevelStanding]:
    """One standing per **declared** Training Type, ordered by Training Type.

    ``history`` is newest-performed first — the order ``list_for_user`` documents and the
    precondition the fold's window depends on; it is passed straight through rather than
    re-sorted here.

    The fold also reads a level for a type the user has *logged* but never declared,
    taking its floor as zero. Such a type earns no standing: the Declared level is what
    the Effective one is read *against*, so there is nothing to display it beside, and
    declaring a level is the Profile form's business. The order is the Training Type's
    own, so the served shape never depends on how the profile happened to be saved; the
    curated display order belongs to the web view-model, which is where the Training
    Type vocabulary lives.
    """

    settings = get_settings()
    effective = effective_fitness_levels(
        declared_levels,
        history,
        sessions_per_notch=settings.strong_sessions_per_level,
        window=settings.effective_level_window,
    )
    return [
        FitnessLevelStanding(
            training_type=training_type,
            declared=declared,
            effective=effective[training_type],
        )
        for training_type, declared in sorted(declared_levels.items())
    ]


__all__ = ["FitnessLevelStanding", "ProfileProgress", "profile_progress"]
