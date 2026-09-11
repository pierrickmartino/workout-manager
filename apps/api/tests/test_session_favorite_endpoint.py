"""The Favorite endpoints end to end: real JWKS verification, the repositories, and the
response envelope wired through FastAPI (CONTEXT: Favorite, issue #396).

``POST /api/sessions/{id}/favorite`` marks the owner's standalone Session as a Favorite and
``DELETE`` unmarks it. The marker is a stored, per-user, per-copy preference surfaced on the
Session read as ``is_favorite``. Scoped to the authenticated owner (``404`` for a non-owner),
standalone-only (``409`` on a Protocol member), private per-user, and never carried by
Duplicate. Repositories and the generator are injected via dependency overrides so the tests
run offline."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.generator import GenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_generator,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.favorite_repository import InMemoryFavoriteRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
)
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


class FakeGenerator:
    def generate(self, request: GenerationRequest) -> GeneratedSession:
        return GeneratedSession(
            prescriptions=[
                GeneratedExercisePrescription(
                    exercise_name="Back Squat", sets=5, reps="5", rest_seconds=120
                ),
            ]
        )


def build_client():
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    profiles = InMemoryProfileRepository()
    # One shared Favorite store across every request so per-user isolation is observable
    # between two callers hitting the same Session.
    favorites = InMemoryFavoriteRepository()
    sessions = InMemorySessionRepository(exercises, profiles, favorites)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_session_generator] = lambda: FakeGenerator()
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    return TestClient(app), ctx, sessions


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _create_session(client, headers):
    body = {"training_type": "strength", "duration_minutes": 45, "equipment": []}
    return client.post("/api/sessions/generate", headers=headers, json=body).json()[
        "data"
    ]


def test_favorite_requires_authentication():
    client, _, _ = build_client()
    assert client.post("/api/sessions/1/favorite").status_code == 401
    assert client.delete("/api/sessions/1/favorite").status_code == 401


def test_a_new_session_reads_as_not_favorite():
    # Arrange
    client, ctx, _ = build_client()
    headers = _auth(ctx, "user_a")

    # Act
    session = _create_session(client, headers)

    # Assert — born un-favorited, and the state is exposed on the read payload
    assert session["is_favorite"] is False


def test_mark_and_unmark_toggles_the_read_state():
    # Arrange
    client, ctx, _ = build_client()
    headers = _auth(ctx, "user_a")
    session = _create_session(client, headers)

    # Act — mark
    marked = client.post(f"/api/sessions/{session['id']}/favorite", headers=headers)

    # Assert — the mark response and a fresh read both reflect it
    assert marked.status_code == 200
    assert marked.json()["data"]["is_favorite"] is True
    reread = client.get(f"/api/sessions/{session['id']}", headers=headers).json()
    assert reread["data"]["is_favorite"] is True

    # Act — unmark
    unmarked = client.delete(
        f"/api/sessions/{session['id']}/favorite", headers=headers
    )

    # Assert
    assert unmarked.status_code == 200
    assert unmarked.json()["data"]["is_favorite"] is False
    reread = client.get(f"/api/sessions/{session['id']}", headers=headers).json()
    assert reread["data"]["is_favorite"] is False


def test_marking_is_idempotent():
    # Arrange
    client, ctx, _ = build_client()
    headers = _auth(ctx, "user_a")
    session = _create_session(client, headers)

    # Act — marking twice stays favorited (no duplicate-row error)
    client.post(f"/api/sessions/{session['id']}/favorite", headers=headers)
    second = client.post(
        f"/api/sessions/{session['id']}/favorite", headers=headers
    )

    # Assert
    assert second.status_code == 200
    assert second.json()["data"]["is_favorite"] is True


def test_favorite_is_private_per_user():
    # Arrange — two users, each with their own Session, sharing one Favorite store (a Session is
    # owner-scoped, so isolation is observed across each user's own read rather than a shared one).
    client, ctx, _ = build_client()
    user_a = _auth(ctx, "user_a")
    user_b = _auth(ctx, "user_b")
    session_a = _create_session(client, user_a)
    session_b = _create_session(client, user_b)

    # Act — only user_a favorites their Session
    client.post(f"/api/sessions/{session_a['id']}/favorite", headers=user_a)

    # Assert — end to end through the API: user_a's read reflects the mark, user_b's own read is
    # unaffected (the marker is private per-user, never a global flag on the Session)
    a_read = client.get(f"/api/sessions/{session_a['id']}", headers=user_a).json()
    b_read = client.get(f"/api/sessions/{session_b['id']}", headers=user_b).json()
    assert a_read["data"]["is_favorite"] is True
    assert b_read["data"]["is_favorite"] is False


def test_favorite_404s_for_a_non_owner():
    # Arrange — user_owner owns the Session
    client, ctx, _ = build_client()
    session = _create_session(client, _auth(ctx, "user_owner"))

    # Act — a non-owner can neither mark nor unmark it
    marked = client.post(
        f"/api/sessions/{session['id']}/favorite",
        headers=_auth(ctx, "user_intruder"),
    )
    unmarked = client.delete(
        f"/api/sessions/{session['id']}/favorite",
        headers=_auth(ctx, "user_intruder"),
    )

    # Assert
    assert marked.status_code == 404
    assert unmarked.status_code == 404


def test_favorite_404s_for_an_unknown_session():
    client, ctx, _ = build_client()
    response = client.post(
        "/api/sessions/424242/favorite", headers=_auth(ctx, "user_any")
    )
    assert response.status_code == 404


def test_favorite_409s_on_a_protocol_member_session():
    # Arrange — a Protocol-member Session (Favorite is standalone-only, like the Session Name).
    # Build one directly in the store, then mark it a member so the read carries the flag.
    client, ctx, sessions = build_client()
    headers = _auth(ctx, "user_a")
    session = _create_session(client, headers)
    sessions._sessions[session["id"]].protocol_id = 999

    # Act
    marked = client.post(f"/api/sessions/{session['id']}/favorite", headers=headers)
    unmarked = client.delete(
        f"/api/sessions/{session['id']}/favorite", headers=headers
    )

    # Assert — refused as a standalone-only concept; the read withholds the marker (null)
    assert marked.status_code == 409
    assert unmarked.status_code == 409
    reread = client.get(f"/api/sessions/{session['id']}", headers=headers).json()
    assert reread["data"]["is_favorite"] is None


def test_favorite_is_not_carried_by_duplicate():
    # Arrange — a favorited source Session
    client, ctx, _ = build_client()
    headers = _auth(ctx, "user_a")
    source = _create_session(client, headers)
    client.post(f"/api/sessions/{source['id']}/favorite", headers=headers)

    # Act — Duplicate deep-copies the plan
    copy = client.post(
        f"/api/sessions/{source['id']}/duplicate", headers=headers
    ).json()["data"]

    # Assert — the copy starts un-favorited (per-copy), while the source keeps its mark
    assert copy["id"] != source["id"]
    assert copy["is_favorite"] is False
    source_reread = client.get(
        f"/api/sessions/{source['id']}", headers=headers
    ).json()
    assert source_reread["data"]["is_favorite"] is True
