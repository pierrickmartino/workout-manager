"""Behavior of the My Sessions list endpoint end to end (issue #397): real JWKS
verification, the session repository, and the response envelope wired through FastAPI.
The repositories are injected via dependency overrides so the tests run offline.

``GET /api/sessions`` is the read behind the My Sessions library: the caller's own
**standalone** Sessions only, searchable over name/fallback-label/Training Type and
narrowable to Favorites, the two combining, paginated through ``meta``."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.main import create_app
from app.repositories.deps import (
    get_profile_repository,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    SessionDraft,
)
from tests.conftest import ISSUER, make_signing_context


def build_client(ctx=None, profiles=None, sessions=None, exercises=None):
    ctx = ctx or make_signing_context()
    exercises = exercises or InMemoryExerciseRepository()
    profiles = profiles or InMemoryProfileRepository()
    sessions = sessions or InMemorySessionRepository(exercises, profiles)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    return TestClient(app), ctx, sessions


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _make_session(
    sessions, user, *, training_type="strength", name=None, favorite=False
) -> int:
    """Create one standalone Session for ``user``, optionally named/favorited, and return
    its id. Prescriptions are irrelevant to the library list, so it is created empty."""

    view = sessions.create(
        user,
        SessionDraft(
            training_type=training_type, duration_minutes=45, prescriptions=[]
        ),
    )
    if name is not None:
        sessions.set_name(view.id, user, name)
    if favorite:
        sessions.set_favorite(view.id, user, True)
    return view.id


def _list(client, ctx, user, **params):
    return client.get("/api/sessions", headers=_auth(ctx, user), params=params)


def test_list_requires_authentication():
    client, _, _ = build_client()

    response = client.get("/api/sessions")

    assert response.status_code == 401
    assert response.json()["success"] is False


def test_lists_only_the_callers_own_sessions():
    # Arrange — two users each own a standalone Session
    client, ctx, sessions = build_client()
    _make_session(sessions, "user_a", name="Alpha Plan")
    _make_session(sessions, "user_b", name="Bravo Plan")

    # Act — user_a lists
    body = _list(client, ctx, "user_a").json()

    # Assert — only user_a's Session appears, never user_b's
    assert body["success"] is True
    names = [row["display_name"] for row in body["data"]]
    assert names == ["Alpha Plan"]
    assert body["meta"]["total"] == 1


def test_excludes_protocol_member_sessions():
    # Arrange — a standalone Session and a Protocol-member Session for the same user
    client, ctx, sessions = build_client()
    standalone = _make_session(sessions, "user_c", name="Standalone")
    member = _make_session(sessions, "user_c", name="In A Protocol")
    # A Protocol-member Session carries a protocol_id — the library must never list it.
    sessions._sessions[member].protocol_id = 42

    # Act
    body = _list(client, ctx, "user_c").json()

    # Assert — only the standalone Session is listed
    ids = [row["id"] for row in body["data"]]
    assert ids == [standalone]
    assert body["meta"]["total"] == 1


def test_row_carries_name_fallback_type_author_and_favorite():
    # Arrange — the creating user has a Profile name (the Author credit)
    profiles = InMemoryProfileRepository()
    profiles.update("user_d", ProfileUpdate(display_name="Dana Lin"))
    client, ctx, sessions = build_client(profiles=profiles)
    sid = _make_session(
        sessions, "user_d", training_type="yoga", name="Morning Flow", favorite=True
    )

    # Act
    row = _list(client, ctx, "user_d").json()["data"][0]

    # Assert — the row is the thin My Sessions projection
    assert row["id"] == sid
    assert row["name"] == "Morning Flow"
    assert row["display_name"] == "Morning Flow"
    assert row["training_type"] == "yoga"
    assert row["author"] == {"display_name": "Dana Lin"}
    assert row["is_favorite"] is True


def test_unnamed_session_reads_back_the_derived_fallback_label():
    # Arrange — a born-unnamed Session falls back to "training_type · date"
    client, ctx, sessions = build_client()
    _make_session(sessions, "user_e", training_type="cardio", name=None)

    # Act
    row = _list(client, ctx, "user_e").json()["data"][0]

    # Assert — name is null, display_name is the derived label, created_at its date
    assert row["name"] is None
    assert row["display_name"] == f"cardio · {row['created_at']}"


def test_blank_query_returns_the_full_list():
    client, ctx, sessions = build_client()
    _make_session(sessions, "user_f", name="One")
    _make_session(sessions, "user_f", name="Two")

    body = _list(client, ctx, "user_f", query="   ").json()

    assert body["meta"]["total"] == 2


def test_search_matches_name_case_insensitively():
    client, ctx, sessions = build_client()
    _make_session(sessions, "user_g", name="Leg Day A")
    _make_session(sessions, "user_g", name="Push Day")

    body = _list(client, ctx, "user_g", query="leg").json()

    names = [row["display_name"] for row in body["data"]]
    assert names == ["Leg Day A"]
    assert body["meta"]["total"] == 1


def test_search_matches_training_type():
    client, ctx, sessions = build_client()
    _make_session(sessions, "user_h", training_type="strength", name="A")
    _make_session(sessions, "user_h", training_type="mobility", name="B")

    body = _list(client, ctx, "user_h", query="mobil").json()

    names = [row["display_name"] for row in body["data"]]
    assert names == ["B"]


def test_search_matches_the_fallback_label_of_a_named_session():
    # A named Session is still findable by its creation date via the derived fallback label.
    client, ctx, sessions = build_client()
    _make_session(sessions, "user_i", training_type="strength", name="Squats")
    row = _list(client, ctx, "user_i").json()["data"][0]
    date = row["created_at"]

    body = _list(client, ctx, "user_i", query=date).json()

    assert [r["display_name"] for r in body["data"]] == ["Squats"]


def test_favorites_only_flag_narrows_the_list():
    client, ctx, sessions = build_client()
    _make_session(sessions, "user_j", name="Loved", favorite=True)
    _make_session(sessions, "user_j", name="Plain", favorite=False)

    body = _list(client, ctx, "user_j", favorites=True).json()

    names = [row["display_name"] for row in body["data"]]
    assert names == ["Loved"]
    assert body["meta"]["total"] == 1


def test_favorites_flag_and_search_combine():
    # Arrange — two Favorites and a non-Favorite; only a favorited Session that also
    # matches the search survives the combined (AND) filter.
    client, ctx, sessions = build_client()
    _make_session(sessions, "user_k", name="Leg Day", favorite=True)
    _make_session(sessions, "user_k", name="Leg Mobility", favorite=False)
    _make_session(sessions, "user_k", name="Push Day", favorite=True)

    body = _list(client, ctx, "user_k", query="leg", favorites=True).json()

    names = [row["display_name"] for row in body["data"]]
    assert names == ["Leg Day"]
    assert body["meta"]["total"] == 1


def test_results_are_newest_first():
    client, ctx, sessions = build_client()
    first = _make_session(sessions, "user_l", name="Older")
    second = _make_session(sessions, "user_l", name="Newer")

    ids = [row["id"] for row in _list(client, ctx, "user_l").json()["data"]]

    assert ids == [second, first]


def test_pagination_slices_while_total_counts_all_matches():
    client, ctx, sessions = build_client()
    for index in range(3):
        _make_session(sessions, "user_m", name=f"Plan {index}")

    body = _list(client, ctx, "user_m", limit=2, offset=0).json()

    assert len(body["data"]) == 2
    assert body["meta"] == {"total": 3, "limit": 2, "offset": 0}


def test_empty_library_returns_an_empty_list():
    client, ctx, _ = build_client()

    body = _list(client, ctx, "user_empty").json()

    assert body["success"] is True
    assert body["data"] == []
    assert body["meta"]["total"] == 0
