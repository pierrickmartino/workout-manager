"""Behavior of GET/PUT /api/active-skin end to end: real JWKS verification, the
repository and read-through cache, the admin gate, and the response envelope wired
through FastAPI. JWKS, the repository, and the cache are injected via dependency
overrides so the test runs offline.

The Active Skin is a single global app-setting (ADR-0048): readable by any
authenticated user, published only by an admin (the ADR-0046 ``role=admin``
claim), defaulting to PULSE. Admin-gate cases mirror tests/test_admin_auth.py;
the endpoint shape mirrors tests/test_appearance_endpoint.py."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.active_skin.cache import ActiveSkinCache
from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.main import create_app
from app.repositories.active_skin_repository import InMemoryActiveSkinRepository
from app.repositories.deps import (
    get_active_skin_cache,
    get_active_skin_repository,
)
from tests.conftest import ISSUER, make_signing_context


def build_client(repo=None, cache=None, ctx=None):
    ctx = ctx or make_signing_context()
    repo = repo or InMemoryActiveSkinRepository()
    # A fresh cache per client keeps tests isolated (the production provider is a
    # process-wide singleton). Zero TTL is avoided — a real short TTL is used so the
    # read-through path is exercised, and publish's invalidate is what refreshes it.
    cache = cache or ActiveSkinCache()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_active_skin_repository] = lambda: repo
    app.dependency_overrides[get_active_skin_cache] = lambda: cache
    return TestClient(app), ctx, repo


def _user_headers(ctx, sub="user_reader"):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _admin_headers(ctx, sub="user_admin"):
    return {
        "Authorization": f"Bearer {ctx.mint(sub=sub, extra_claims={'role': 'admin'})}"
    }


# --- GET: readable by any authenticated user, defaults to PULSE -------------


def test_get_defaults_to_pulse():
    # Arrange — a fresh app with no Active Skin published yet
    client, ctx, _ = build_client()

    # Act — any authenticated user may read the Active Skin
    response = client.get("/api/active-skin", headers=_user_headers(ctx))

    # Assert — the shipped default is PULSE (ADR-0048)
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["skin"] == "pulse"


def test_get_rejects_a_request_without_a_token():
    # Arrange
    client, _, _ = build_client()

    # Act
    response = client.get("/api/active-skin")

    # Assert — an unauthenticated read is 401
    assert response.status_code == 401
    assert response.json()["success"] is False


# --- PUT: admin publishes; the change is visible on GET ---------------------


def test_admin_publish_changes_what_get_returns():
    # Arrange — an admin and a normal reader share the one app
    client, ctx, _ = build_client()

    # Act — the admin publishes Aurora, then a user reads the Active Skin
    published = client.put(
        "/api/active-skin", headers=_admin_headers(ctx), json={"skin": "aurora"}
    )
    fetched = client.get("/api/active-skin", headers=_user_headers(ctx))

    # Assert — publishing restyles the app for everyone on their next read
    assert published.status_code == 200
    assert published.json()["success"] is True
    assert published.json()["data"]["skin"] == "aurora"
    assert fetched.json()["data"]["skin"] == "aurora"


def test_publish_invalidates_the_read_cache_so_the_new_skin_shows_immediately():
    # Arrange — a user read warms the cache with the default PULSE
    client, ctx, _ = build_client()
    assert (
        client.get("/api/active-skin", headers=_user_headers(ctx)).json()["data"][
            "skin"
        ]
        == "pulse"
    )

    # Act — an admin publishes Aurora; publish invalidates the cache
    client.put("/api/active-skin", headers=_admin_headers(ctx), json={"skin": "aurora"})

    # Assert — the next read reflects the publish now, not after the TTL
    assert (
        client.get("/api/active-skin", headers=_user_headers(ctx)).json()["data"][
            "skin"
        ]
        == "aurora"
    )


# --- PUT: the admin gate (ADR-0046) ----------------------------------------


def test_admin_token_publishes_with_200():
    # Arrange
    client, ctx, _ = build_client()

    # Act — a role=admin token is admitted
    response = client.put(
        "/api/active-skin", headers=_admin_headers(ctx), json={"skin": "aurora"}
    )

    # Assert
    assert response.status_code == 200


def test_normal_verified_token_is_refused_with_403():
    # Arrange — a valid signed-in user with no admin role
    client, ctx, repo = build_client()

    # Act — an ordinary user tries to publish
    response = client.put(
        "/api/active-skin", headers=_user_headers(ctx), json={"skin": "aurora"}
    )

    # Assert — fails closed: the global look is protected from non-admins
    assert response.status_code == 403
    assert response.json()["success"] is False
    # …and nothing was published
    assert repo.get_active_skin() == "pulse"


def test_missing_token_is_refused_with_401():
    # Arrange
    client, _, repo = build_client()

    # Act — no Authorization header at all
    response = client.put("/api/active-skin", json={"skin": "aurora"})

    # Assert — unauthenticated is 401, before any role or catalog check
    assert response.status_code == 401
    assert repo.get_active_skin() == "pulse"


# --- PUT: unknown Skin id fails closed --------------------------------------


def test_publishing_an_unknown_skin_is_rejected_and_leaves_the_active_skin_unchanged():
    # Arrange — the Active Skin is the default
    client, ctx, repo = build_client()

    # Act — an admin publishes a Skin id that is not in the catalog
    response = client.put(
        "/api/active-skin",
        headers=_admin_headers(ctx),
        json={"skin": "neon-disco"},
    )

    # Assert — rejected (422), and the current Active Skin is untouched
    assert response.status_code == 422
    assert response.json()["success"] is False
    assert repo.get_active_skin() == "pulse"
    assert (
        client.get("/api/active-skin", headers=_user_headers(ctx)).json()["data"][
            "skin"
        ]
        == "pulse"
    )
