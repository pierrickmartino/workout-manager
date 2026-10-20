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
from app.repositories.deps import get_appearance_preference_repository
from tests.conftest import ISSUER, make_fk_engine, make_signing_context


def build_client(repo):
    ctx = make_signing_context()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_appearance_preference_repository] = lambda: repo
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
