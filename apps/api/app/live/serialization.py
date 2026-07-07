"""JSON serialization for the Live Session hydration read model (issue #90).

Turns a ``HydratedSessionView`` into the plain-``dict`` the PWA's live screen
consumes. The shape is the standard Session payload — so the live engine keeps
pre-filling each set row from ``recommended_load`` (now progression-adjusted) — with
one addition per prescription: ``previous_performance``, the ordinal-aligned Logged
Sets of that Exercise's most recent performance (``[]`` when never logged)."""

from __future__ import annotations

from app.live.hydration import HydratedSessionView, PreviousSetView


def _serialize_previous_set(view: PreviousSetView) -> dict:
    return {"reps": view.reps, "load": view.load}


def serialize_hydrated_session(view: HydratedSessionView) -> dict:
    session = view.session
    return {
        "id": session.id,
        "clerk_user_id": session.clerk_user_id,
        "training_type": session.training_type,
        "duration_minutes": session.duration_minutes,
        "has_been_regenerated": session.has_been_regenerated,
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
                "previous_performance": [
                    _serialize_previous_set(s)
                    for s in view.previous_performance.get(p.exercise_id, [])
                ],
            }
            for p in session.prescriptions
        ],
    }


__all__ = ["serialize_hydrated_session"]
