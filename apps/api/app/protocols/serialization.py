"""JSON serialization for the self-paced Protocol progress view.

Turns the ``ProtocolProgressView`` (and its nested Sessions/Prescriptions) into the
plain-``dict`` shape the PWA consumes. Shared by every route that returns a
progressed Protocol — ``GET /api/protocols/{id}`` and the aggregated ``GET
/api/home`` — so the Current Protocol on Home and a directly-opened Protocol carry
byte-for-byte the same payload."""

from __future__ import annotations

from app.protocols.progress import ProtocolProgressView
from app.repositories.protocol_repository import ProtocolSessionView, ProtocolView


def serialize_session(session: ProtocolSessionView) -> dict:
    return {
        "session_id": session.session_id,
        "position": session.position,
        "week": session.week,
        "day": session.day,
        "title": session.title,
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


def serialize_protocol(view: ProtocolView) -> dict:
    return {
        "id": view.id,
        "clerk_user_id": view.clerk_user_id,
        "training_type": view.training_type,
        "objective": view.objective,
        "sessions_per_week": view.sessions_per_week,
        "weeks": view.weeks,
        "duration_minutes": view.duration_minutes,
        "sessions": [serialize_session(s) for s in view.sessions],
    }


def serialize_protocol_progress(progress: ProtocolProgressView) -> dict:
    data = serialize_protocol(progress.protocol)
    data["completed_count"] = progress.completed_count
    data["next_session"] = (
        serialize_session(progress.next_session)
        if progress.next_session is not None
        else None
    )
    return data


__all__ = [
    "serialize_session",
    "serialize_protocol",
    "serialize_protocol_progress",
]
