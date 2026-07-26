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

The Top-Set Trend (best Est. 1RM per qualifying session, oldest-first) comes from the
shared ``logbook/top_sets.top_set_series`` — lifted out of here by issue #177 so Exercise
Detail and Strength Analytics compute the *identical* trajectory. F6 Slice 4 adds
``pr_milestones`` — every set that struck a new Estimated-1RM best, newest-first (the
RECORDS lens) — reusing the same ``detect_personal_records`` output already computed for
the Personal Record tile."""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.load import LoadKind, ParsedLoad
from app.domain.one_rep_max import MAX_TRUSTWORTHY_REPS, MIN_TRUSTWORTHY_REPS
from app.domain.quantity import repetitions_of
from app.domain.personal_records import (
    LoggedSetRecord,
    PersonalRecord,
    detect_personal_records,
    logged_set_records,
)
from app.logbook.top_sets import TOP_SET_SERIES_LIMIT, TopSetPoint, top_set_series
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
    ``top_set_series`` is the Top Set (best Est. 1RM) per qualifying session, oldest-first
    and capped at the last :data:`TOP_SET_SERIES_LIMIT`, with no zero-padding — empty for
    an Exercise with no qualifying session. ``pr_milestones`` is every set that struck a
    new Estimated-1RM best for the Exercise — the RECORDS lens (ADR-0017) — newest-first,
    each carrying the new Est. 1RM, the gain over the prior PR (``0.0`` for the first), and
    its date; empty for an Exercise that can set no Personal Record. ``exercise_name`` is
    empty when the user has never logged the Exercise.
    """

    exercise_id: int
    exercise_name: str
    personal_record: float | None
    total_sets: int
    top_set_series: list[TopSetPoint]
    pr_milestones: list[PersonalRecord]
    # True when a bodyweight set is record-ineligible *only* because no Performed Body
    # Weight was on file (ADR-0026) — the signal to prompt the user to record their body
    # weight so their calisthenics work can start setting Personal Records. False once the
    # Exercise holds any Personal Record, or when no would-be-eligible mass-less set exists.
    body_weight_nudge: bool = False


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

    records = detect_personal_records(_exercise_set_records(history, exercise_id))
    # Records are oldest-first with each strictly beating the prior, so the last is the
    # highest Estimated 1RM — the Personal Record. The ``personal_record`` kg figure is
    # the *absolute* headline only: a bodyweight record must never surface as a kilogram
    # (ADR-0026), so it is withheld here and the tile renders the set from the milestones
    # instead. Absent when nothing qualified.
    personal_record = (
        records[-1].estimated_1rm
        if records and not records[-1].is_bodyweight
        else None
    )

    return ExerciseRecordsView(
        exercise_id=exercise_id,
        exercise_name=exercise_name,
        personal_record=personal_record,
        total_sets=total_sets,
        top_set_series=top_set_series(history, exercise_id),
        # The RECORDS lens shows the milestones newest-first (mirroring the Analytics
        # feed); the detector returns them oldest-first, so reverse the same records
        # already computed for the PR tile — no second pass over the history.
        pr_milestones=list(reversed(records)),
        body_weight_nudge=_needs_body_weight_nudge(history, exercise_id, records),
    )


def _needs_body_weight_nudge(
    history: list[LoggedSessionView],
    exercise_id: int,
    records: list[PersonalRecord],
) -> bool:
    """Whether to prompt the user to record their body weight for this Exercise.

    True only when the Exercise holds no Personal Record yet *and* the user has logged a
    bodyweight set that would qualify — a bodyweight Load with reps in the trustworthy
    1–12 window — save for the one missing fact: no Performed Body Weight was captured on
    it. That is the honest ask (ADR-0026): recording a weight would unlock records the
    user's calisthenics work has already earned. Once any record exists the prompt is
    silenced, so it never nags a user who is already scoring.
    """

    if records:
        return False
    for session in history:
        for logged_set in session.logged_sets:
            if logged_set.exercise_id != exercise_id:
                continue
            if logged_set.body_weight_kg is not None or logged_set.load is None:
                continue
            reps = repetitions_of(logged_set.quantity)
            if reps is None or not (MIN_TRUSTWORTHY_REPS <= reps <= MAX_TRUSTWORTHY_REPS):
                continue
            if ParsedLoad.from_dict(logged_set.load).kind is LoadKind.BODYWEIGHT:
                return True
    return False


def _exercise_set_records(
    history: list[LoggedSessionView], exercise_id: int
) -> list[LoggedSetRecord]:
    """Flatten the Exercise's Logged Sets into dated records for PR detection.

    Filtered to the one Exercise so the detector — which is scoped per Exercise but
    otherwise history-wide — only ever weighs this movement. Reuses the one domain
    flattening (``domain/personal_records.logged_set_records``) so a per-Exercise PR is
    stamped exactly as the all-time Analytics / Home feeds stamp it, then narrows to
    this movement.
    """

    return [
        record
        for record in logged_set_records(history)
        if record.exercise_id == exercise_id
    ]


__all__ = [
    "ExerciseRecordsView",
    "TopSetPoint",
    "TOP_SET_SERIES_LIMIT",
    "exercise_records",
]
