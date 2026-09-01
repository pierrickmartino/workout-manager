"""The in-place Progression Scheme selection endpoints end to end (ADR-0064, #432).

``PUT /api/sessions/{id}/prescriptions/{position}/scheme`` selects a movement's scheme on
a standalone Session, and ``DELETE`` clears it back to the default — a no-AI plan edit, the
same posture as Insert / Remove / Substitution. Real JWKS verification, the in-memory
repositories, the scheme-selection service, and the response envelope wired through
FastAPI. Standalone Sessions are authored via ``POST /api/sessions/plan`` so each carries a
known typed Load to select against.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import InMemoryLoggedSessionRepository
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


def build_client():
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    profiles = InMemoryProfileRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    app.dependency_overrides[get_logged_session_repository] = (
        lambda: InMemoryLoggedSessionRepository(sessions, exercises)
    )
    return TestClient(app), ctx, exercises


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _author_plan(client, headers, exercises, *, load_kind: str, load_value):
    """Author a one-movement standalone plan carrying a known typed Load, returning the
    created Session dict."""

    exercise = exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    body = {
        "training_type": "strength",
        "duration_minutes": 45,
        "prescriptions": [
            {
                "exercise_id": exercise.id,
                "sets": 3,
                "reps": "5",
                "load_kind": load_kind,
                "load_value": load_value,
            }
        ],
    }
    response = client.post("/api/sessions/plan", headers=headers, json=body)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_choose_scheme_requires_authentication():
    client, _, _ = build_client()
    response = client.put(
        "/api/sessions/1/prescriptions/0/scheme", json={"scheme": "greyskull"}
    )
    assert response.status_code == 401


def test_selects_a_compatible_scheme_in_place():
    # Arrange — a standalone plan with an absolute-load Back Squat
    client, ctx, exercises = build_client()
    headers = _auth(ctx, "user_scheme")
    session = _author_plan(client, headers, exercises, load_kind="absolute", load_value="60")

    # Act — choose Greyskull (compatible with a clean kilogram axis)
    response = client.put(
        f"/api/sessions/{session['id']}/prescriptions/0/scheme",
        headers=headers,
        json={"scheme": "greyskull"},
    )

    # Assert — the selection is stored and surfaced on the movement
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["prescriptions"][0]["scheme"] == "greyskull"


def test_rejects_an_incompatible_scheme_via_the_error_envelope():
    # Arrange — a pure-bodyweight movement: no kilogram axis for Greyskull to step
    client, ctx, exercises = build_client()
    headers = _auth(ctx, "user_bad")
    session = _author_plan(
        client, headers, exercises, load_kind="bodyweight", load_value=None
    )

    # Act
    response = client.put(
        f"/api/sessions/{session['id']}/prescriptions/0/scheme",
        headers=headers,
        json={"scheme": "greyskull"},
    )

    # Assert — 422 through the standard error envelope; nothing stored
    assert response.status_code == 422
    payload = response.json()
    assert payload["success"] is False
    assert payload["error"]
    after = client.get(f"/api/sessions/{session['id']}", headers=headers).json()["data"]
    assert after["prescriptions"][0]["scheme"] is None


def test_clearing_restores_the_default():
    # Arrange — a movement with Greyskull selected
    client, ctx, exercises = build_client()
    headers = _auth(ctx, "user_clear")
    session = _author_plan(client, headers, exercises, load_kind="absolute", load_value="60")
    client.put(
        f"/api/sessions/{session['id']}/prescriptions/0/scheme",
        headers=headers,
        json={"scheme": "greyskull"},
    )

    # Act — clear it
    response = client.delete(
        f"/api/sessions/{session['id']}/prescriptions/0/scheme", headers=headers
    )

    # Assert — back to the default (null selection)
    assert response.status_code == 200
    assert response.json()["data"]["prescriptions"][0]["scheme"] is None


def test_an_unknown_scheme_value_is_rejected_at_the_boundary():
    client, ctx, exercises = build_client()
    headers = _auth(ctx, "user_unknown")
    session = _author_plan(client, headers, exercises, load_kind="absolute", load_value="60")

    response = client.put(
        f"/api/sessions/{session['id']}/prescriptions/0/scheme",
        headers=headers,
        json={"scheme": "banana"},
    )
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_choosing_on_an_unowned_session_is_not_found():
    client, ctx, exercises = build_client()
    session = _author_plan(
        client, _auth(ctx, "owner"), exercises, load_kind="absolute", load_value="60"
    )

    response = client.put(
        f"/api/sessions/{session['id']}/prescriptions/0/scheme",
        headers=_auth(ctx, "intruder"),
        json={"scheme": "static"},
    )
    assert response.status_code == 404


def test_choosing_at_an_absent_position_is_not_found():
    client, ctx, exercises = build_client()
    headers = _auth(ctx, "user_absent")
    session = _author_plan(client, headers, exercises, load_kind="absolute", load_value="60")

    response = client.put(
        f"/api/sessions/{session['id']}/prescriptions/99/scheme",
        headers=headers,
        json={"scheme": "static"},
    )
    assert response.status_code == 404
