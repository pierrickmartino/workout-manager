"""Behavior of the **Avatar** facet on GET /api/appearance (issue #747, ADR-0136).

The Avatar is a stored Interface Preference read tolerantly: no record, a null
column, or an id no longer in the catalog all read as the default **Novice**, so
the per-page layout read never fails on it. The existing facets (Mode, Keep
Screen Awake, Weight Unit) read exactly as before. Prior art:
tests/test_appearance_endpoint.py."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlmodel import Session, SQLModel

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.main import create_app
from app.repositories.appearance_preference_repository import (
    InMemoryAppearancePreferenceRepository,
    SqlAppearancePreferenceRepository,
)
from app.repositories.deps import (
    get_appearance_preference_repository,
    get_logged_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import InMemoryLoggedSessionRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_fk_engine, make_signing_context


def build_client(repo):
    ctx = make_signing_context()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_appearance_preference_repository] = lambda: repo
    # Choosing an Avatar reads the Logged-Session history for the Operator Level.
    exercises = InMemoryExerciseRepository()
    logged = InMemoryLoggedSessionRepository(
        InMemorySessionRepository(exercises), exercises
    )
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    return TestClient(app), ctx


def _stored_row(session: Session, clerk_user_id: str, avatar: str | None) -> None:
    session.exec(
        text(
            "INSERT INTO appearance_preference "
            "(clerk_user_id, mode, keep_screen_awake, weight_unit, avatar) "
            "VALUES (:user, 'light', 0, 'lb', :avatar)"
        ).bindparams(user=clerk_user_id, avatar=avatar)
    )
    session.commit()


@pytest.fixture()
def sql_session(tmp_path):
    """A SQL-backed store on a file database, shared across the client's threads."""

    engine = make_fk_engine(f"sqlite:///{tmp_path / 'avatar.db'}")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def test_get_returns_the_novice_when_no_record_exists():
    # Arrange — a brand-new user who has never stored an Interface Preference
    client, ctx = build_client(InMemoryAppearancePreferenceRepository())
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_new')}"}

    # Act
    response = client.get("/api/appearance", headers=headers)

    # Assert — the default Avatar, beside the unchanged shipped facets
    assert response.status_code == 200
    assert response.json()["data"] == {
        "mode": "dark",
        "keep_screen_awake": True,
        "weight_unit": "kg",
        "avatar": "novice",
    }


@pytest.mark.parametrize("stored", ["retired-hero", None], ids=["unknown", "null"])
def test_get_returns_the_novice_for_an_unknown_or_null_stored_id(sql_session, stored):
    # Arrange — a stored row whose Avatar was since retired from the catalog, or
    # one written before the Avatar facet existed
    _stored_row(sql_session, "user_retired", stored)
    client, ctx = build_client(SqlAppearancePreferenceRepository(sql_session))
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_retired')}"}

    # Act
    response = client.get("/api/appearance", headers=headers)

    # Assert — the tolerant read falls back to the Novice; the other stored facets
    # read back unchanged
    assert response.status_code == 200
    assert response.json()["data"] == {
        "mode": "light",
        "keep_screen_awake": False,
        "weight_unit": "lb",
        "avatar": "novice",
    }


# ── PUT /api/appearance with an Avatar (#748) ────────────────────────────────


def test_put_saves_a_chosen_avatar_and_leaves_the_other_facets_untouched():
    # Arrange — a user who already chose Light, Keep Screen Awake off and pounds
    repo = InMemoryAppearancePreferenceRepository()
    client, ctx = build_client(repo)
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_pick')}"}
    client.put(
        "/api/appearance",
        headers=headers,
        json={"mode": "light", "keep_screen_awake": False, "weight_unit": "lb"},
    )

    # Act
    response = client.put(
        "/api/appearance", headers=headers, json={"avatar": "elf-ranger"}
    )
    fetched = client.get("/api/appearance", headers=headers)

    # Assert — the Avatar is saved; Mode, Keep Screen Awake and Weight Unit stand
    expected = {
        "mode": "light",
        "keep_screen_awake": False,
        "weight_unit": "lb",
        "avatar": "elf-ranger",
    }
    assert response.status_code == 200
    assert response.json()["data"] == expected
    assert fetched.json()["data"] == expected


def test_put_without_an_avatar_keeps_the_current_one():
    # Arrange — a user who already chose the Dwarf Lifter
    client, ctx = build_client(InMemoryAppearancePreferenceRepository())
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_keep')}"}
    client.put("/api/appearance", headers=headers, json={"avatar": "dwarf-lifter"})

    # Act — another control saves only its own facet
    response = client.put("/api/appearance", headers=headers, json={"mode": "light"})

    # Assert
    assert response.status_code == 200
    assert response.json()["data"]["avatar"] == "dwarf-lifter"
    assert response.json()["data"]["mode"] == "light"


def test_put_with_an_unknown_avatar_is_a_422_and_writes_nothing():
    # Arrange — a user who already chose the Elf Ranger and Light
    repo = InMemoryAppearancePreferenceRepository()
    client, ctx = build_client(repo)
    headers = {"Authorization": f"Bearer {ctx.mint(sub='user_unknown')}"}
    client.put(
        "/api/appearance",
        headers=headers,
        json={"avatar": "elf-ranger", "mode": "light"},
    )

    # Act — an id the catalog never held, sent beside a valid facet
    response = client.put(
        "/api/appearance",
        headers=headers,
        json={"avatar": "retired-hero", "mode": "dark"},
    )
    fetched = client.get("/api/appearance", headers=headers)

    # Assert — refused at the boundary in the standard envelope; neither facet moved
    assert response.status_code == 422
    assert response.json()["success"] is False
    assert fetched.json()["data"]["avatar"] == "elf-ranger"
    assert fetched.json()["data"]["mode"] == "light"
