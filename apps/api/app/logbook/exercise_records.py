"""Per-exercise stat header read model (F6 Slice 2) — an honest read of the *record*.

``exercise_records`` reads the user's Logged Sessions and projects them onto a single
Exercise, deriving the two figures the stat header shows above the SPECS / HISTORY /
RECORDS tabs (ADR-0017):

- ``personal_record`` — the **Personal Record**: the highest Estimated 1RM the user
  has ever logged for the Exercise, or ``None`` when no absolute-Load set in the
  trustworthy 1–12-rep window exists. For a bodyweight / qualitative / %-1RM / range
  Exercise this stays ``None`` so the tile is *hidden, never zeroed* — a ``0 kg`` would
  be a fabrication. It is the highest Estimated 1RM, never the heaviest bar touched:
  CONTEXT.md reserves "Personal Record" for the estimate, not a raw-load "personal best".
- ``total_sets`` — the count of the user's Logged Sets of the Exercise, across every
  session and regardless of Load kind. It always exists, so it always renders.

The strength figure reuses the shipped ``one_rep_max`` / ``personal_records`` domain
(``detect_personal_records``): the records it returns are oldest-first with each strictly
beating the prior, so the last one is the highest — the Personal Record. No new strength
logic, no ORM, no HTTP. Reads are scoped to the owning user because the underlying
repository's ``list_for_user`` already is. Mirrors ``logbook/progress.py`` and
``logbook/analytics.py``.

Later F6 slices extend this same module with the top-set series and PR milestones."""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.personal_records import LoggedSetRecord, detect_personal_records
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    LoggedSessionView,
)


@dataclass(frozen=True)
class ExerciseRecordsView:
    """The stat-header figures for one Exercise, derived purely from the record side.

    ``personal_record`` is the highest Estimated 1RM (kg), or ``None`` when the Exercise
    has no absolute-Load set in the trustworthy rep window — the signal to *hide* the PR
    tile rather than show zero. ``total_sets`` counts every Logged Set of the Exercise.
    ``exercise_name`` is empty when the user has never logged the Exercise.
    """

    exercise_id: int
    exercise_name: str
    personal_record: float | None
    total_sets: int


def exercise_records(
    clerk_user_id: str,
    exercise_id: int,
    *,
    logged: LoggedSessionRepository,
) -> ExerciseRecordsView:
    """Return the Personal Record and Total Sets for one Exercise, user-scoped.

    Only the requested Exercise's Logged Sets contribute. The Personal Record is the
    highest Estimated 1RM over that history (``None`` when no absolute-Load qualifying
    set exists); Total Sets counts all of them. A user who has never logged the Exercise
    yields ``None`` / ``0`` with an empty name — an honest empty state, never an error.
    """

    history = logged.list_for_user(clerk_user_id)

    exercise_name = ""
    total_sets = 0
    for session in history:
        for logged_set in session.logged_sets:
            if logged_set.exercise_id != exercise_id:
                continue
            total_sets += 1
            if not exercise_name:
                exercise_name = logged_set.exercise_name

    records = detect_personal_records(_set_records(history, exercise_id))
    # Records are oldest-first with each strictly beating the prior, so the last is the
    # highest Estimated 1RM — the Personal Record. Absent when nothing qualified.
    personal_record = records[-1].estimated_1rm if records else None

    return ExerciseRecordsView(
        exercise_id=exercise_id,
        exercise_name=exercise_name,
        personal_record=personal_record,
        total_sets=total_sets,
    )


def _set_records(
    history: list[LoggedSessionView], exercise_id: int
) -> list[LoggedSetRecord]:
    """Flatten the Exercise's Logged Sets into dated records for PR detection.

    Filtered to the one Exercise so the detector — which is scoped per Exercise but
    otherwise history-wide — only ever weighs this movement. Each set is paired with
    its session's ``performed_on`` so the stream can be ordered.
    """

    return [
        LoggedSetRecord(
            exercise_id=logged_set.exercise_id,
            exercise_name=logged_set.exercise_name,
            reps=logged_set.reps,
            load=logged_set.load,
            performed_on=session.performed_on,
        )
        for session in history
        for logged_set in session.logged_sets
        if logged_set.exercise_id == exercise_id
    ]


__all__ = ["ExerciseRecordsView", "exercise_records"]
