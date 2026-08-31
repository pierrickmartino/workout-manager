"""Pure JSON-shaping for Data Export (ADR-0062, issue #418).

Turns a user's already-gathered, owner-scoped view objects — owned **Protocols** and
standalone **Sessions** (plans), **Logged Sessions** / **Logged Sets** (records), body
metrics, and the **Catalog** Exercises those reference — into one nested,
self-contained dict ready to be serialized to a downloadable JSON file. **Pure**: no
I/O, no repository, no ORM access beyond reading the rows it is handed, so it is
unit-tested directly. The route gathers the owner-scoped views and supplies exactly the
referenced Exercises (self-containment); this module never fetches and never scopes.

Weights are **canonical kilograms** — the values every ``Load`` and Performed Body
Weight already store regardless of the user's **Weight Unit** (ADR-0062) — and the
document labels its canonical units so the file is self-describing. Distance and
duration ride as the metres / seconds a typed ``Quantity`` already stores.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.db.models import Exercise
from app.repositories.logged_session_repository import (
    LoggedSessionView,
    LoggedSetView,
)
from app.repositories.metric_entry_repository import MetricEntryView
from app.repositories.protocol_repository import ProtocolSessionView, ProtocolView
from app.repositories.session_repository import PrescriptionView, SessionView

# Bumped when the document's shape changes in a way a future importer must branch on.
EXPORT_VERSION = 1

# The canonical units every numeric field in the document is expressed in, surfaced so
# the file is self-describing (ADR-0062): weight in kilograms whatever the user's Weight
# Unit, distance in metres and duration in seconds as a typed Quantity stores them.
CANONICAL_UNITS = {"weight": "kg", "distance": "metres", "duration": "seconds"}


def referenced_exercise_ids(
    protocols: Iterable[ProtocolView],
    sessions: Iterable[SessionView],
    logged_sessions: Iterable[LoggedSessionView],
) -> set[int]:
    """Every catalog Exercise id the plans and records reference (issue #418).

    The route fetches exactly these Exercises so the export is **self-contained** — no
    prescription or logged set points at an Exercise the document omits. Pure and
    order-free: a set, deduped across Protocol Sessions, standalone Sessions, and Logged
    Sets."""

    ids: set[int] = set()
    for protocol in protocols:
        for session in protocol.sessions:
            ids.update(p.exercise_id for p in session.prescriptions)
    for session in sessions:
        ids.update(p.exercise_id for p in session.prescriptions)
    for logged in logged_sessions:
        ids.update(s.exercise_id for s in logged.logged_sets)
    return ids


def _prescription(view: PrescriptionView) -> dict:
    return {
        "position": view.position,
        "exercise_id": view.exercise_id,
        "sets": view.sets,
        "reps": view.reps,
        "rest_seconds": view.rest_seconds,
        "tempo": view.tempo,
        "recommended_load": view.recommended_load,
        "prescribed_quantity": view.prescribed_quantity,
        "superset_group": view.superset_group,
        "round_rest_seconds": view.round_rest_seconds,
        "pinned_reps": view.pinned_reps,
    }


def _protocol_session(view: ProtocolSessionView) -> dict:
    return {
        "session_id": view.session_id,
        "position": view.position,
        "week": view.week,
        "day": view.day,
        "title": view.title,
        "prescriptions": [_prescription(p) for p in view.prescriptions],
    }


def _protocol(view: ProtocolView) -> dict:
    return {
        "id": view.id,
        "name": view.name,
        "training_type": view.training_type,
        "objective": view.objective,
        "sessions_per_week": view.sessions_per_week,
        "weeks": view.weeks,
        "duration_minutes": view.duration_minutes,
        "sessions": [_protocol_session(s) for s in view.sessions],
    }


def _session(view: SessionView) -> dict:
    return {
        "id": view.id,
        "name": view.name,
        "training_type": view.training_type,
        "duration_minutes": view.duration_minutes,
        "provenance": view.provenance,
        "author_clerk_user_id": view.author_clerk_user_id,
        "created_at": view.created_at.isoformat(),
        "prescriptions": [_prescription(p) for p in view.prescriptions],
    }


def _logged_set(view: LoggedSetView) -> dict:
    return {
        "position": view.position,
        "exercise_id": view.exercise_id,
        "quantity": view.quantity,
        "load": view.load,
        "perceived_difficulty": view.perceived_difficulty,
        "body_weight_kg": view.body_weight_kg,
    }


def _logged_session(view: LoggedSessionView) -> dict:
    return {
        "id": view.id,
        "session_id": view.session_id,
        "training_type": view.training_type,
        "performed_on": view.performed_on.isoformat(),
        "completion_outcome": view.completion_outcome,
        "duration_seconds": view.duration_seconds,
        "logged_sets": [_logged_set(s) for s in view.logged_sets],
    }


def _metric(view: MetricEntryView) -> dict:
    return {
        "metric": view.metric,
        "value": view.value,
        "unit": view.unit,
        "recorded_on": view.recorded_on.isoformat(),
    }


def _exercise(exercise: Exercise) -> dict:
    return {
        "id": exercise.id,
        "name": exercise.name,
        "normalized_name": exercise.normalized_name,
        "description": exercise.description,
        "provenance": exercise.provenance,
        "targeted_muscles": list(exercise.targeted_muscles),
        "primary_muscles": list(exercise.primary_muscles),
        "secondary_muscles": list(exercise.secondary_muscles),
        "required_equipment": list(exercise.required_equipment),
        "instructions": list(exercise.instructions),
        "difficulty": exercise.difficulty,
        "precautions": list(exercise.precautions),
        "image": exercise.image,
    }


def export_document(
    *,
    user_id: str,
    protocols: Iterable[ProtocolView],
    sessions: Iterable[SessionView],
    logged_sessions: Iterable[LoggedSessionView],
    metrics: Iterable[MetricEntryView],
    exercises: Iterable[Exercise],
) -> dict:
    """Build the nested, self-contained Export document (ADR-0062, issue #418).

    Every plan and record the user owns, nested faithfully: Protocols carry their
    fully-enumerated member Sessions and Prescriptions, standalone Sessions carry theirs,
    Logged Sessions carry their ordered Logged Sets, and ``metrics`` carries the body
    metric time series. The referenced ``exercises`` are emitted once each, ordered by
    id, as a self-contained catalog block — the route supplies exactly the ids
    ``referenced_exercise_ids`` reports, so nothing dangles. ``units`` labels the
    canonical units (weight in kg) so the file is self-describing. Pure: the caller has
    already owner-scoped the inputs; this function never fetches, scopes, or converts."""

    return {
        "export_version": EXPORT_VERSION,
        "user_id": user_id,
        "units": dict(CANONICAL_UNITS),
        "exercises": [
            _exercise(exercise)
            for exercise in sorted(exercises, key=lambda item: item.id)
        ],
        "protocols": [_protocol(protocol) for protocol in protocols],
        "sessions": [_session(session) for session in sessions],
        "logged_sessions": [
            _logged_session(logged) for logged in logged_sessions
        ],
        "metrics": [_metric(metric) for metric in metrics],
    }


__all__ = [
    "EXPORT_VERSION",
    "CANONICAL_UNITS",
    "referenced_exercise_ids",
    "export_document",
]
