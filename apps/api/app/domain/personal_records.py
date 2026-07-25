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

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import date
from typing import Protocol

from app.domain.load import LoadKind, ParsedLoad, resolve_bodyweight_kg
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
    # The Performed Body Weight (ADR-0026) snapshotted onto the set, or ``None`` when
    # none was captured. A bodyweight set scores only against this mass; an absolute
    # set ignores it entirely.
    body_weight_kg: float | None = None


class LoggedSet(Protocol):
    """The Logged Set fields the flattening reads (satisfied by ``LoggedSetView``).

    ``body_weight_kg`` is named here deliberately. It is the field a hand-rolled second
    flattening silently omitted, which is what let the First Record milestone disagree
    with every other Personal-Record surface (ADR-0029) — so the shared shape declares it
    and a consumer composing from this Protocol cannot quietly drop it again.
    """

    exercise_id: int
    exercise_name: str
    reps: int
    load: dict | None
    body_weight_kg: float | None


class LoggedSession(Protocol):
    """The Logged Session fields the flattening reads (satisfied by ``LoggedSessionView``).

    Structural, not nominal: the read model passes repository views straight in, and a
    test passes plain stubs, without either importing the other.
    """

    performed_on: date
    logged_sets: Sequence[LoggedSet]


def logged_set_records(history: Iterable[LoggedSession]) -> list[LoggedSetRecord]:
    """Flatten Logged Sessions into dated Logged Set records for PR detection.

    Each Logged Set is paired with its session's ``performed_on`` — the date lives on the
    session, not the set — so the detector, which knows nothing about sessions, can order
    the stream and stamp each PR.

    This is **the one flattening**, and it lives in the domain rather than the read model
    so a pure consumer (the Achievement catalog) can reach it without inverting the
    layering. Every Personal-Record surface reads through it, so "a PR" means the same
    thing on Analytics, Home, Exercise Detail, and the Achievement wall. A hand-rolled
    ``LoggedSetRecord`` elsewhere in the production tree trips the terminology guard
    (ADR-0029).
    """

    return [
        LoggedSetRecord(
            exercise_id=logged_set.exercise_id,
            exercise_name=logged_set.exercise_name,
            reps=logged_set.reps,
            load=logged_set.load,
            performed_on=session.performed_on,
            body_weight_kg=logged_set.body_weight_kg,
        )
        for session in history
        for logged_set in session.logged_sets
    ]


@dataclass(frozen=True)
class PersonalRecord:
    """A set that set a new best Estimated 1RM for its Exercise.

    ``gain`` is the improvement over the Exercise's prior PR — ``0.0`` for the
    first-ever record, since there is nothing to beat yet.

    The set-descriptor fields let a surface render a bodyweight record honestly (ADR-0026)
    as *the set that achieved it* — ``reps`` and any ``added_kg`` — rather than a kilogram
    headline. ``is_bodyweight`` tells absolute records (which keep their kg figure) apart
    from bodyweight ones. For an absolute record ``added_kg`` is ``None``.
    """

    exercise_id: int
    exercise_name: str
    estimated_1rm: float
    gain: float
    performed_on: date
    reps: int = 0
    is_bodyweight: bool = False
    added_kg: float | None = None


def estimated_1rm_for_set(
    load: dict | None, reps: int, body_weight_kg: float | None = None
) -> float | None:
    """The Estimated 1RM for one set, or ``None`` if it can't set a PR.

    Two Load kinds carry a comparable kilogram figure: an ``absolute`` load carries its
    kg directly, and a ``bodyweight`` load resolves to a kg-equivalent against the
    ``body_weight_kg`` performed at (the snapshotted Performed Body Weight, ADR-0026) —
    ``bodyweight`` or ``bodyweight + added``. A bodyweight set with no captured mass, and
    every other Load kind (or a load-less set), is ineligible. Reps are gated to the
    trustworthy window by :func:`estimate_1rm`, so a 13+-rep set of either kind scores
    ``None``. This is the *one yardstick* the record side compares on — the PR detector,
    the Personal Record tile, and the top-set trend all qualify a set through it, so
    "best Est. 1RM" means the same thing everywhere (ADR-0017). Absolute behavior is
    unchanged: the default ``body_weight_kg`` of ``None`` never affects an absolute set.
    """

    if load is None:
        return None
    parsed = ParsedLoad.from_dict(load)
    if parsed.kind is LoadKind.ABSOLUTE:
        if parsed.kg is None:
            return None
        return estimate_1rm(parsed.kg, reps)
    if parsed.kind is LoadKind.BODYWEIGHT:
        resolved = resolve_bodyweight_kg(parsed, body_weight_kg)
        if resolved is None:
            return None
        return estimate_1rm(resolved, reps)
    return None


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
        estimate = estimated_1rm_for_set(
            record.load, record.reps, record.body_weight_kg
        )
        if estimate is None:
            continue
        previous = best_by_exercise.get(record.exercise_id)
        if previous is not None and estimate <= previous:
            continue
        parsed = ParsedLoad.from_dict(record.load) if record.load else None
        is_bodyweight = parsed is not None and parsed.kind is LoadKind.BODYWEIGHT
        records.append(
            PersonalRecord(
                exercise_id=record.exercise_id,
                exercise_name=record.exercise_name,
                estimated_1rm=estimate,
                gain=0.0 if previous is None else estimate - previous,
                performed_on=record.performed_on,
                reps=record.reps,
                is_bodyweight=is_bodyweight,
                added_kg=parsed.added_kg if is_bodyweight else None,
            )
        )
        best_by_exercise[record.exercise_id] = estimate

    return records


__all__ = [
    "LoggedSet",
    "LoggedSession",
    "LoggedSetRecord",
    "PersonalRecord",
    "detect_personal_records",
    "estimated_1rm_for_set",
    "logged_set_records",
]
