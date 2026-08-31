"""Data Export route: a user downloads a faithful JSON copy of their own data (ADR-0062).

``GET /api/export`` gathers the requesting user's owned **Protocols** and standalone
**Sessions** (plans), their **Logged Sessions** / **Logged Sets** (records), body
metrics, and the **Catalog** Exercises those reference, serializes them to nested JSON in
canonical kilograms, and returns the result as a **file download** — an ``attachment``
with a JSON content type, deliberately *outside* the standard response envelope
(ADR-0062). The scope is strictly the authenticated user: never the shared **Generated**
cache, never another user's data. The export is **synchronous**, served from the request
path over the user's own bounded rows — no Redis/RQ job. The JSON is shaped to be
re-importable later, but no import path is built here."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from fastapi.responses import Response

from app.auth.dependencies import get_current_user
from app.export.serializer import export_document, referenced_exercise_ids
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_metric_entry_repository,
    get_protocol_repository,
    get_session_repository,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.metric_entry_repository import MetricEntryRepository
from app.repositories.protocol_repository import ProtocolRepository
from app.repositories.session_repository import SessionRepository

router = APIRouter(prefix="/api", tags=["export"])

# The attachment name the browser saves the download as. Stable (no timestamp) so the
# download shape is deterministic; the caller renames the file as they wish.
EXPORT_FILENAME = "workout-manager-export.json"


@router.get("/export")
def export_user_data(
    clerk_user_id: str = Depends(get_current_user),
    protocols: ProtocolRepository = Depends(get_protocol_repository),
    sessions: SessionRepository = Depends(get_session_repository),
    logged: LoggedSessionRepository = Depends(get_logged_session_repository),
    metrics: MetricEntryRepository = Depends(get_metric_entry_repository),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
) -> Response:
    """Download the caller's own data as a self-contained JSON file (ADR-0062).

    Every read here is owner-scoped to ``clerk_user_id`` through the repositories, so the
    export can only ever contain the caller's plans and records — the shared Generated
    cache and other users' data are structurally unreachable. The referenced Catalog
    Exercises are fetched by exactly the ids the plans and records point at, so the file
    is **self-contained** with no dangling references. The document is returned as an
    ``attachment`` with the JSON content type, **not** wrapped in the standard envelope —
    the one deliberate, documented deviation from the envelope seam (ADR-0062)."""

    owned_protocols = protocols.list_for_user(clerk_user_id)
    owned_sessions = sessions.list_standalone_full(clerk_user_id)
    logged_sessions = logged.list_for_user(clerk_user_id)
    owned_metrics = metrics.list_for_user(clerk_user_id)

    # Fetch exactly the Exercises the plans and records reference, so the file is
    # self-contained (no dangling references). Every referencing row — a Prescription or
    # a Logged Set — holds a foreign key to ``exercise.id``, so a referenced id always
    # resolves: the ``is not None`` guard is defensive belt-and-braces (a row can never
    # point at a deleted catalog entry), never a silent drop of a real reference.
    referenced = referenced_exercise_ids(
        owned_protocols, owned_sessions, logged_sessions
    )
    referenced_exercises = [
        exercise
        for exercise in (exercises.get(exercise_id) for exercise_id in referenced)
        if exercise is not None
    ]

    document = export_document(
        user_id=clerk_user_id,
        protocols=owned_protocols,
        sessions=owned_sessions,
        logged_sessions=logged_sessions,
        metrics=owned_metrics,
        exercises=referenced_exercises,
    )

    # A file the user saves is not an API data payload, so it bypasses the envelope
    # (ADR-0062): an attachment with its own JSON content type, never {success, data,
    # error}. ``ensure_ascii=False`` keeps any non-ASCII names (Exercise, Session) intact.
    return Response(
        content=json.dumps(document, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{EXPORT_FILENAME}"'
        },
    )
