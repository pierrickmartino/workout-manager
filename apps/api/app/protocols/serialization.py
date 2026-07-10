"""JSON serialization for the self-paced Protocol progress view.

Turns the ``ProtocolProgressView`` (and its nested Sessions/Prescriptions) into the
plain-``dict`` shape the PWA consumes. Shared by every route that returns a
progressed Protocol — ``GET /api/protocols/{id}`` and the aggregated ``GET
/api/home`` — so the Current Protocol on Home and a directly-opened Protocol carry
byte-for-byte the same payload."""

from __future__ import annotations

from app.domain.protocol import protocol_label
from app.protocols.balance_preview import BalancePreview
from app.protocols.progress import ProtocolProgressView
from app.repositories.protocol_repository import ProtocolSessionView, ProtocolView


def serialize_session(
    session: ProtocolSessionView, *, performed: bool = False
) -> dict:
    return {
        "session_id": session.session_id,
        "position": session.position,
        "week": session.week,
        "day": session.day,
        "title": session.title,
        "performed": performed,
        "prescriptions": [
            {
                "position": p.position,
                "sets": p.sets,
                "reps": p.reps,
                "rest_seconds": p.rest_seconds,
                "tempo": p.tempo,
                "recommended_load": p.recommended_load,
                "exercise_id": p.exercise_id,
                "exercise_name": p.exercise_name,
                "exercise_description": p.exercise_description,
                "targeted_muscles": p.targeted_muscles,
                "required_equipment": p.required_equipment,
                "provenance": p.provenance,
            }
            for p in session.prescriptions
        ],
    }


def serialize_protocol(
    view: ProtocolView, *, performed_session_ids: frozenset[int] = frozenset()
) -> dict:
    return {
        "id": view.id,
        "clerk_user_id": view.clerk_user_id,
        "training_type": view.training_type,
        "objective": view.objective,
        "sessions_per_week": view.sessions_per_week,
        "weeks": view.weeks,
        "duration_minutes": view.duration_minutes,
        # The user-editable name (nullable) plus the resolved display label — the
        # name when set, else the derived ``objective · training_type`` (ADR-0021),
        # so an unnamed adopted Protocol reads sensibly with no backfill.
        "name": view.name,
        "label": protocol_label(view.name, view.objective, view.training_type),
        "sessions": [
            serialize_session(s, performed=s.session_id in performed_session_ids)
            for s in view.sessions
        ],
    }


def serialize_protocol_progress(progress: ProtocolProgressView) -> dict:
    performed = progress.performed_session_ids
    data = serialize_protocol(progress.protocol, performed_session_ids=performed)
    data["completed_count"] = progress.completed_count
    data["next_session"] = (
        serialize_session(
            progress.next_session,
            performed=progress.next_session.session_id in performed,
        )
        if progress.next_session is not None
        else None
    )
    return data


def serialize_balance_preview(preview: BalancePreview) -> dict:
    """The non-predictive SIMULATE payload the Builder renders (ADR-0021): per-week
    Session/Set counts, plan totals, and the curated Muscle-Group split as an ordered
    list (``muscle_groups.distribution`` already emits it in canonical GROUP_ORDER, so
    the list reads Legs→…→Unclassified). No fatigue/recovery/volume figure is present —
    none is computed."""

    return {
        "weeks": [
            {
                "week": week.week,
                "session_count": week.session_count,
                "set_count": week.set_count,
            }
            for week in preview.weeks
        ],
        "total_sessions": sum(week.session_count for week in preview.weeks),
        "total_sets": sum(week.set_count for week in preview.weeks),
        "muscle_distribution": [
            {"group": group.value, "pct": pct}
            for group, pct in preview.muscle_distribution.items()
        ],
    }


__all__ = [
    "serialize_session",
    "serialize_protocol",
    "serialize_protocol_progress",
    "serialize_balance_preview",
]
