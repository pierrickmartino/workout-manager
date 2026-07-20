"""Achievements — curated, type-neutral milestones derived read-time (F5 Slice 3).

An Achievement is a fixed, curated predicate over the user's Logged history — "unlocked"
iff it currently holds, with an honest ``unlocked_on`` recovered as the earliest replay
point at which it first held (ADR-0018/0019). There is no unlock table and no write hook:
every field is a pure **read-time** projection of the *record* side, exactly like a
Personal Record or the Operator Level. That makes it **non-monotonic** — deleting the
logs behind an Achievement re-locks it — and it backfills every existing user for free.

The catalog is **data, not AI-generated**, and deliberately **type-neutral**: session
counts, streak-length milestones, and covering all six Muscle Groups all unlock from a
yoga / mobility history, so such a user is never faced with an all-locked strength wall.
Only "first Personal Record" is strength-shaped (it needs an absolute-load lift), and it
sits alongside the neutral majority rather than gating the wall.

Each milestone carries an integer ``current`` progress toward an integer ``target``, so a
locked Achievement can show live progress ("Log 25 Sessions — 18/25"). Every catalog
metric is monotonic non-decreasing over a chronological prefix of the history, which is
what lets ``unlocked_on`` be recovered by replay and keeps it consistent with the
full-history unlock check.

Pure and dependency-free over the domain (streak, muscle groups, personal records): no
ORM, no HTTP."""

from __future__ import annotations

from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Protocol

from app.domain.muscle_groups import MuscleGroup, covered_groups
from app.domain.personal_records import LoggedSetRecord, detect_personal_records
from app.domain.streak import longest_week_run

# The six real Muscle Groups (Unclassified excluded) — the target for full coverage.
_REAL_MUSCLE_GROUPS = tuple(g for g in MuscleGroup if g is not MuscleGroup.UNCLASSIFIED)
_ALL_MUSCLE_GROUPS = len(_REAL_MUSCLE_GROUPS)


class _LoggedSet(Protocol):
    """The Logged Set fields the catalog metrics read (satisfied by ``LoggedSetView``)."""

    exercise_id: int
    exercise_name: str
    reps: int
    load: dict | None
    targeted_muscles: Sequence[str]


class _LoggedSession(Protocol):
    """The Logged Session fields the catalog metrics read (satisfied by the view)."""

    performed_on: date
    logged_sets: Sequence[_LoggedSet]


@dataclass(frozen=True)
class Achievement:
    """One evaluated milestone — the honest read model the Profile wall renders.

    ``unlocked`` is whether the predicate holds over the *whole current* history;
    ``current``/``target`` are the live progress a locked badge shows; ``unlocked_on`` is
    the earliest date at which the predicate first held (``None`` while locked). Because
    every field is derived read-time, a deleted log recomputes and can re-lock the badge.
    """

    id: str
    name: str
    criteria: str
    unlocked: bool
    current: int
    target: int
    unlocked_on: date | None


def _session_count(history: Sequence[_LoggedSession]) -> int:
    """How many Logged Sessions the history holds — training-type-neutral."""

    return len(history)


def _longest_streak(history: Sequence[_LoggedSession]) -> int:
    """The longest run of consecutive training weeks — training-type-neutral."""

    return longest_week_run(session.performed_on for session in history)


def _muscle_groups_covered(history: Sequence[_LoggedSession]) -> int:
    """How many of the six real Muscle Groups the history has ever trained.

    Derived from the shared :func:`covered_groups` predicate (issue #187) so this count
    and the Muscle Group Coverage read can never drift on what "covered" means: any
    Exercise whose free-form muscles roll into a real group counts it; the Unclassified
    bucket is not one of the six and never contributes. Reachable from a non-strength
    history — a yoga/mobility session still targets muscles.
    """

    return len(covered_groups(history))


def _has_personal_record(history: Sequence[_LoggedSession]) -> int:
    """``1`` once any Exercise has an Estimated-1RM Personal Record, else ``0``.

    The one strength-shaped milestone: only absolute-load lifts in the trustworthy rep
    window can set a PR (``domain/personal_records.py``), so a purely bodyweight or
    qualitative history stays at ``0`` — by design, it is the neutral milestones that
    carry a non-strength user.
    """

    records = detect_personal_records(
        LoggedSetRecord(
            exercise_id=logged_set.exercise_id,
            exercise_name=logged_set.exercise_name,
            reps=logged_set.reps,
            load=logged_set.load,
            performed_on=session.performed_on,
        )
        for session in history
        for logged_set in session.logged_sets
    )
    return 1 if records else 0


@dataclass(frozen=True)
class _Definition:
    """A catalog entry: identity, human-facing copy, target, and its progress metric.

    ``metric`` maps a history to an integer ``current`` and must be **order-independent**
    (it aggregates the whole set) and **monotonic non-decreasing over a chronological
    prefix** — both hold for every metric here, which is what makes ``unlocked_on``
    recoverable by replay.
    """

    id: str
    name: str
    criteria: str
    target: int
    metric: Callable[[Sequence[_LoggedSession]], int]


# The seed catalog — curated data, fixed, in a stable display order. Type-neutral
# milestones (sessions, streaks, muscle coverage) come first and dominate; the single
# strength-shaped one (first PR) sits last, never gating the wall (ADR-0018/0019).
CATALOG: tuple[_Definition, ...] = (
    _Definition("sessions-5", "5 Sessions", "Log 5 Sessions", 5, _session_count),
    _Definition("sessions-25", "25 Sessions", "Log 25 Sessions", 25, _session_count),
    _Definition(
        "sessions-100", "100 Sessions", "Log 100 Sessions", 100, _session_count
    ),
    _Definition(
        "streak-4", "4-Week Streak", "Train 4 weeks in a row", 4, _longest_streak
    ),
    _Definition(
        "streak-12", "12-Week Streak", "Train 12 weeks in a row", 12, _longest_streak
    ),
    _Definition(
        "muscle-all",
        "Full Coverage",
        "Train all six Muscle Groups",
        _ALL_MUSCLE_GROUPS,
        _muscle_groups_covered,
    ),
    _Definition(
        "first-pr",
        "First Record",
        "Set your first Personal Record",
        1,
        _has_personal_record,
    ),
)


def _unlocked_on(
    definition: _Definition, chronological: Sequence[_LoggedSession]
) -> date:
    """The earliest date at which the prefix first satisfies ``definition``'s target.

    Sessions are replayed oldest-first; the metric is monotonic over the growing prefix,
    so the first session whose inclusion crosses the target stamps the honest unlock
    date. Only called once the full history is known to satisfy the target, so a crossing
    always exists.
    """

    prefix: list[_LoggedSession] = []
    for session in chronological:
        prefix.append(session)
        if definition.metric(prefix) >= definition.target:
            return session.performed_on
    # Unreachable: the caller has already confirmed the full history qualifies.
    return chronological[-1].performed_on


def _evaluate(
    definition: _Definition,
    history: Sequence[_LoggedSession],
    chronological: Sequence[_LoggedSession],
) -> Achievement:
    current = definition.metric(history)
    unlocked = current >= definition.target
    return Achievement(
        id=definition.id,
        name=definition.name,
        criteria=definition.criteria,
        unlocked=unlocked,
        current=current,
        target=definition.target,
        unlocked_on=_unlocked_on(definition, chronological) if unlocked else None,
    )


def evaluate_achievements(history: Iterable[_LoggedSession]) -> list[Achievement]:
    """Evaluate the whole curated catalog against ``history``, in catalog order.

    Each milestone reports its live ``current`` progress over the full history and, when
    unlocked, the earliest date it first held. A brand-new user gets every badge locked
    at ``0`` progress with no unlock date and no error. Deleting logs simply recomputes,
    so a badge can re-lock — the same honest non-monotonicity as the Operator Level.
    """

    sessions = list(history)
    chronological = sorted(sessions, key=lambda session: session.performed_on)
    return [_evaluate(definition, sessions, chronological) for definition in CATALOG]


__all__ = ["Achievement", "CATALOG", "evaluate_achievements"]
