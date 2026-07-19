"""The shared gamification read model — XP, Operator Level, and weekly Streak,
projected read-time from a Logged-Session history (issue #166).

This is the one deep module both Home and Profile fan out from, so the account's
Level / XP / Streak can never disagree between the two screens. It composes the
existing pure domain engines — ``domain/experience.py`` (XP + Operator Level) and
``domain/streak.py`` (the weekly consecutive-week Streak) — over the *record*
side, with no ledger, no stored counters, and no write hooks (ADR-0018/0019). A
corrected, back-dated, or deleted log simply recomputes it, so it is honest and
**non-monotonic**: removing logs lowers it.

``project_gamification`` takes the history the caller has *already loaded* plus a
reference ``today`` and returns the summary — it does no I/O of its own, so a
route that already reads the history for another purpose (Home's Readiness) fans
this out with zero extra reads. Pure and dependency-free: no ORM, no HTTP.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from app.domain.experience import OperatorLevel, operator_level, total_xp
from app.domain.streak import current_streak


@dataclass(frozen=True)
class GamificationSummary:
    """An account's honest gamification figures at read time.

    ``xp`` is the total XP — the sessions-plus-attempted-sets projection over the
    whole record — and ``level`` is the Operator Level it maps into (ADR-0018).
    ``streak`` is the number of consecutive weeks ending at the current week in
    which at least one Logged Session exists (ADR-0019). A user who has logged
    nothing projects to ``0`` XP, Level 1 with an empty bar, and a ``0``-week
    streak.
    """

    xp: int
    level: OperatorLevel
    streak: int


def project_gamification(history: Iterable, *, today: date) -> GamificationSummary:
    """Project a Logged-Session ``history`` onto the ``GamificationSummary`` DTO.

    ``history`` is any iterable of Logged Sessions carrying a ``logged_sets``
    collection (its length is the attempted-set count) and a ``performed_on``
    date — typically the list a repository already returned, so this adds no I/O.
    The XP is the training-type-neutral sessions+sets projection, the level is
    derived from it, and the streak is measured over the session dates as of
    ``today``.
    """

    sessions = list(history)
    xp = total_xp(len(session.logged_sets) for session in sessions)
    return GamificationSummary(
        xp=xp,
        level=operator_level(xp),
        streak=current_streak(
            [session.performed_on for session in sessions], today
        ),
    )


__all__ = ["GamificationSummary", "project_gamification"]
