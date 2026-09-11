"""JSON serialization for the Live Session hydration read model (issue #90).

Turns a ``HydratedSessionView`` into the plain-``dict`` the PWA's live screen
consumes. The shape is the standard Session payload — each Prescription rendered
through the shared :func:`serialize_prescription` (``app.session_serialization``), so
the live read can never again drift out of the plain Session read the way it once
dropped the Superset overlay (ADR-0023) and flattened Supersets on Start — with one
addition per prescription: ``previous_performance``, the ordinal-aligned Logged Sets
of that Exercise's most recent performance (``[]`` when never logged)."""

from __future__ import annotations

from app.live.hydration import HydratedSessionView, PreviousSetView
from app.session_serialization import serialize_prescription


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
                **serialize_prescription(p),
                # The live read's one addition over the canonical Prescription shape:
                # the ordinal-aligned Logged Sets of this Exercise's most recent
                # performance — the reference the user is beating (``[]`` when never logged).
                "previous_performance": [
                    _serialize_previous_set(s)
                    for s in view.previous_performance.get(p.exercise_id, [])
                ],
            }
            for p in session.prescriptions
        ],
    }


__all__ = ["serialize_hydrated_session"]
