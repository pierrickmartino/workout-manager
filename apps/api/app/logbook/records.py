"""Shared Personal-Record read helpers — the one PR-detection path every surface reuses.

The Analytics feed, the Home "Latest PR" line, and the per-Exercise stat header all
answer questions about **Personal Records** off the same Logged-Session history. To keep
those answers from drifting, the history→``LoggedSetRecord`` flattening lives here once
(``set_records``) rather than being re-inlined per surface, and the detector
(``domain/personal_records.detect_personal_records``) runs over its output.

``latest_personal_record`` sits on top: the single newest Personal Record by date across
every Exercise, or ``None`` when the record holds no absolute-Load PR in the trustworthy
rep window (a brand-new account, or a bodyweight / qualitative-only trainee). Like every
PR read it is a pure read-time projection — no PR table, no write hook (ADR-0010/0018) —
so a corrected or deleted log simply recomputes.

Pure orchestration over the Logged-Session repository view: no ORM, no HTTP."""

from __future__ import annotations

from app.domain.personal_records import (
    LoggedSetRecord,
    PersonalRecord,
    detect_personal_records,
)
from app.repositories.logged_session_repository import LoggedSessionView


def set_records(history: list[LoggedSessionView]) -> list[LoggedSetRecord]:
    """Flatten Logged Sessions into dated Logged Set records for PR detection.

    Each Logged Set is paired with its session's ``performed_on`` — the date lives on
    the session, not the set — so the detector, which knows nothing about sessions, can
    order the stream and stamp each PR. This is the one flattening every PR surface reads
    through, so "a PR" means the same thing on Analytics, Home, and the Exercise header.
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


def personal_record_payload(record: PersonalRecord) -> dict:
    """The one JSON shape every Personal-Record surface emits (records, analytics, home).

    Centralized so the feeds cannot drift: ``exercise`` / ``estimated_1rm`` / ``gain`` /
    ``date`` are the within-Exercise ordering figures, and ``reps`` / ``is_bodyweight`` /
    ``added_kg`` are the set descriptor a client renders a bodyweight record from — the set
    that achieved it, never a kilogram headline (ADR-0026). ``added_kg`` is ``None`` for an
    absolute record and for a pure-bodyweight one.
    """

    return {
        "exercise": record.exercise_name,
        "estimated_1rm": record.estimated_1rm,
        "gain": record.gain,
        "date": record.performed_on.isoformat(),
        "reps": record.reps,
        "is_bodyweight": record.is_bodyweight,
        "added_kg": record.added_kg,
    }


def latest_personal_record(
    history: list[LoggedSessionView],
) -> PersonalRecord | None:
    """Return the newest Personal Record by date, or ``None`` when there is none.

    Detected records come back oldest-first (each strictly beating the prior best for its
    Exercise), so the last one is the most recent PR across the whole record. ``None`` when
    no absolute-Load set in the trustworthy rep window exists — the signal for Home to
    *hide* the line rather than show a fabricated zero.
    """

    records = detect_personal_records(set_records(history))
    return records[-1] if records else None


__all__ = ["set_records", "latest_personal_record", "personal_record_payload"]
