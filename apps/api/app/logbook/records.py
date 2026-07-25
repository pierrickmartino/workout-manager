"""Shared Personal-Record read helpers over the one domain flattening.

The Analytics feed, the Home "Latest PR" line, and the per-Exercise stat header all
answer questions about **Personal Records** off the same Logged-Session history. The
history→``LoggedSetRecord`` flattening itself lives in
``domain/personal_records.logged_set_records`` — in the domain, not here, so the pure
Achievement catalog can reach it without inverting the layering (ADR-0029) — and the
detector (``domain/personal_records.detect_personal_records``) runs over its output.

``latest_personal_record`` sits on top: the single newest Personal Record by date across
every Exercise, or ``None`` when the record holds no absolute-Load PR in the trustworthy
rep window (a brand-new account, or a bodyweight / qualitative-only trainee). Like every
PR read it is a pure read-time projection — no PR table, no write hook (ADR-0010/0018) —
so a corrected or deleted log simply recomputes.

Pure orchestration over the Logged-Session repository view: no ORM, no HTTP."""

from __future__ import annotations

from app.domain.personal_records import (
    PersonalRecord,
    detect_personal_records,
    logged_set_records,
)
from app.repositories.logged_session_repository import LoggedSessionView


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

    records = detect_personal_records(logged_set_records(history))
    return records[-1] if records else None


__all__ = ["latest_personal_record", "personal_record_payload"]
