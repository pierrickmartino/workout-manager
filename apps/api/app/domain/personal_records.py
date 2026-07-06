"""Personal Records — the best Estimated 1RM a user has ever logged per Exercise.

A Personal Record is derived purely from the *record* side: ``detect_personal_records``
walks a chronological stream of Logged Sets and reports every set whose Estimated 1RM
strictly beats every prior set's for the same Exercise. There is no PR table and no
write hook (ADR-aligned with detecting read-time): a corrected or back-dated log simply
recomputes, so the feed can never drift from the underlying Logged Sets.

Only ``absolute``-Load sets with reps in the trustworthy 1–12 window carry an Estimated
1RM (``domain/one_rep_max.py``), so only those can set a PR; bodyweight, percent-of-1RM,
qualitative, range, and high-rep sets are skipped — they neither set nor reset a record.

Pure and dependency-free over the domain (``load`` + ``one_rep_max``): no ORM, no HTTP."""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date

from app.domain.load import LoadKind, ParsedLoad
from app.domain.one_rep_max import estimate_1rm


@dataclass(frozen=True)
class LoggedSetRecord:
    """One Logged Set, flattened with the date it was performed on.

    The date lives on the Logged Session, not the set, so the read model pairs each
    set with its ``performed_on`` here — giving the detector everything it needs to
    order the stream and stamp each PR without touching the ORM.
    """

    exercise_id: int
    exercise_name: str
    reps: int
    load: dict | None
    performed_on: date


@dataclass(frozen=True)
class PersonalRecord:
    """A set that set a new best Estimated 1RM for its Exercise.

    ``gain`` is the improvement over the Exercise's prior PR — ``0.0`` for the
    first-ever record, since there is nothing to beat yet.
    """

    exercise_id: int
    exercise_name: str
    estimated_1rm: float
    gain: float
    performed_on: date


def _estimated_1rm(load: dict | None, reps: int) -> float | None:
    """The Estimated 1RM for one set, or ``None`` if it can't set a PR.

    Only ``absolute`` loads carry a comparable kilogram figure; every other Load kind
    (and any load-less set) is ineligible. Reps are gated to the trustworthy window by
    :func:`estimate_1rm`.
    """

    if load is None:
        return None
    parsed = ParsedLoad.from_dict(load)
    if parsed.kind is not LoadKind.ABSOLUTE or parsed.kg is None:
        return None
    return estimate_1rm(parsed.kg, reps)


def detect_personal_records(
    history: Iterable[LoggedSetRecord],
) -> list[PersonalRecord]:
    """Return every set that set a new Estimated-1RM best for its Exercise.

    The stream is read in chronological order (oldest first); a set is a Personal
    Record when its Estimated 1RM strictly exceeds the best seen so far for that same
    Exercise. The first eligible set an Exercise sees always records. Ineligible sets
    (non-absolute Load or untrustworthy reps) are skipped and never reset the best.
    Records are returned oldest-first.
    """

    ordered = sorted(history, key=lambda record: record.performed_on)
    best_by_exercise: dict[int, float] = {}
    records: list[PersonalRecord] = []

    for record in ordered:
        estimate = _estimated_1rm(record.load, record.reps)
        if estimate is None:
            continue
        previous = best_by_exercise.get(record.exercise_id)
        if previous is not None and estimate <= previous:
            continue
        records.append(
            PersonalRecord(
                exercise_id=record.exercise_id,
                exercise_name=record.exercise_name,
                estimated_1rm=estimate,
                gain=0.0 if previous is None else estimate - previous,
                performed_on=record.performed_on,
            )
        )
        best_by_exercise[record.exercise_id] = estimate

    return records


__all__ = ["LoggedSetRecord", "PersonalRecord", "detect_personal_records"]
