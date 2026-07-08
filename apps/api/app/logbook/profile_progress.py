"""The read-time projection behind the Profile view screen (F5 Slices 1–2).

``profile_progress`` reads the user's Logged Sessions **once** and projects them onto a
single immutable ``ProfileProgress`` DTO: the account's XP and Operator Level, the weekly
Streak, and the lifetime Total Sessions / Total Sets. Every figure is derived from the
*record* side — no ledger, no stored counters, no write hooks (ADR-0018) — so a corrected
or deleted log simply recomputes, mirroring ``logbook/analytics.py`` and
``domain/personal_records.py``.

This is the shared spine later F5 slices extend (Achievements). Pure orchestration over
the Logged-Session repository: no ORM, no HTTP, user-scoped because the repository is.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from app.domain.experience import OperatorLevel, operator_level, total_xp
from app.domain.streak import current_streak
from app.repositories.logged_session_repository import LoggedSessionRepository


@dataclass(frozen=True)
class ProfileProgress:
    """The Profile view's honest read model (F5 Slices 1–2).

    ``xp`` is the account's total XP — the sessions-plus-attempted-sets projection over
    the whole record — and ``level`` is the Operator Level it maps into (ADR-0018).
    ``streak`` is the number of consecutive weeks ending at the current week in which at
    least one Logged Session exists (ADR-0019). ``total_sessions`` and ``total_sets`` are
    all-time counts over the user's whole record. Every figure is read-time and
    non-monotonic: a user who has logged nothing projects to all zeros and Level 1.
    """

    xp: int
    level: OperatorLevel
    streak: int
    total_sessions: int
    total_sets: int


def profile_progress(
    clerk_user_id: str,
    *,
    logged: LoggedSessionRepository,
    today: date,
) -> ProfileProgress:
    """Project the user's Logged Sessions onto the ``ProfileProgress`` DTO.

    The history is read once; the Streak is computed over the session dates and the
    lifetime totals are simple counts over the whole record. Scoped to the owning user
    because ``list_for_user`` already is.
    """

    history = logged.list_for_user(clerk_user_id)
    xp = total_xp(len(session.logged_sets) for session in history)
    return ProfileProgress(
        xp=xp,
        level=operator_level(xp),
        streak=current_streak([session.performed_on for session in history], today),
        total_sessions=len(history),
        total_sets=sum(len(session.logged_sets) for session in history),
    )


__all__ = ["ProfileProgress", "profile_progress"]
