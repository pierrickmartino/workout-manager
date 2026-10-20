"""The Live Session hydration read model (issue #90 — F2·S5).

``hydrate_session`` is the read the live screen loads from. It joins a user-owned
Session to the user's performance record and returns two reference numbers per
set the Pulse mock shows:

* the **load to lift today** — every Prescription overlaid with the read-time
  Progression step (``ProgressionOverlay``), which steps the recommended load or, for
  a pure-bodyweight movement, the rep target (Home already surfaces the same
  progression for a Protocol's Next Session); and
* the **previous performance to beat** — the Logged Sets from each Exercise's
  *most recent* performance across the user's whole history, aligned to the
  current sets by ordinal, and blank when the Exercise has never been logged.

Both read off one ``ProgressionOverlay`` over a single history read, and it follows the
pure-orchestration pattern of the other read models: it returns fresh view objects
and never mutates the stored Session. ``None`` for a missing or unowned Session, so
the route can answer ``404`` for non-owners."""

from __future__ import annotations

from dataclasses import dataclass, replace

from app.domain.quantity import repetitions_of
from app.progression.overlay import ProgressionOverlay
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSetView,
)
from app.repositories.session_repository import SessionRepository, SessionView


@dataclass(frozen=True)
class PreviousSetView:
    """One set of an Exercise's previous performance — the reps and load to beat.

    ``reps`` is read from the set's typed Quantity (ADR-0032) via its ``repetitions``
    accessor; a set with a non-rep amount (a run, a hold) surfaces ``None`` reps."""

    reps: int | None
    load: dict | None


@dataclass(frozen=True)
class HydratedSessionView:
    """A progression-adjusted Session plus each Exercise's previous performance.

    ``previous_performance`` is keyed by ``exercise_id``; each value is the latest
    Logged Sets for that Exercise in ordinal order, so the live table can align set
    row *n* with the *n*-th previous set. An Exercise absent from the map has never
    been logged and shows no reference.
    """

    session: SessionView
    previous_performance: dict[int, list[PreviousSetView]]


def _previous_set_view(logged_set: LoggedSetView) -> PreviousSetView:
    return PreviousSetView(
        reps=repetitions_of(logged_set.quantity), load=logged_set.load
    )


def hydrate_session(
    clerk_user_id: str,
    session_id: int,
    *,
    sessions: SessionRepository,
    logged: LoggedSessionRepository,
) -> HydratedSessionView | None:
    """Return the owner's Session hydrated for the live screen, or ``None``.

    ``None`` when the Session is missing or owned by another user. Every
    recommended load is progressed from the user's latest Logged Sets of that
    Exercise, and the same latest sets are surfaced verbatim as the previous
    performance to beat.
    """

    session = sessions.get(session_id, clerk_user_id)
    if session is None:
        return None

    overlay = ProgressionOverlay.from_history(logged.list_for_user(clerk_user_id))
    progressed = replace(
        session,
        prescriptions=[
            overlay.progress(prescription).prescription
            for prescription in session.prescriptions
        ],
    )
    previous_performance = {
        exercise_id: [_previous_set_view(s) for s in sets]
        for exercise_id in {p.exercise_id for p in session.prescriptions}
        if (sets := overlay.previous_sets(exercise_id))
    }
    return HydratedSessionView(
        session=progressed, previous_performance=previous_performance
    )


__all__ = ["PreviousSetView", "HydratedSessionView", "hydrate_session"]
