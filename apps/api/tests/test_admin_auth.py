"""The operator gate for maintenance endpoints (``require_admin``, ADR-0046).

There is no admin concept in the codebase, so "operator" is a single configurable
Clerk claim: ``admin_role_claim`` names the claim and ``admin_role_value`` is the
value that grants access. These tests pin the gate's three outcomes — an unverifiable
token is 401, a verified token without the operator role is 403 (fails closed), and a
verified token carrying the role passes and yields the operator's subject — plus that
the claim key/value are honoured from ``Settings`` rather than hardcoded. The gate is
exercised through a throwaway route so the full FastAPI dependency wiring (header →
verify → role check) is covered offline."""

from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks, require_admin
from app.config import Settings, get_settings
from tests.conftest import ISSUER, make_signing_context


def build_client(settings: Settings | None = None):
    ctx = make_signing_context()
    app = FastAPI()

    @app.get("/admin-only")
    def _admin_only(operator: str = Depends(require_admin)) -> dict:
        return {"operator": operator}

    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: settings or Settings(
        clerk_issuer=ISSUER
    )
    return TestClient(app), ctx


def test_require_admin_rejects_a_missing_token_with_401():
    # Arrange
    client, _ = build_client()

    # Act — no Authorization header at all
    response = client.get("/admin-only")

    # Assert — unauthenticated is 401, before any role check
    assert response.status_code == 401


def test_require_admin_rejects_a_verified_non_operator_with_403():
    # Arrange — a valid token that simply carries no role claim
    client, ctx = build_client()

    # Act — a normal signed-in user hits the maintenance endpoint
    response = client.get(
        "/admin-only",
        headers={"Authorization": f"Bearer {ctx.mint(sub='user_normal')}"},
    )

    # Assert — fails closed: verified but not an operator is 403, never a pass
    assert response.status_code == 403


def test_require_admin_rejects_a_wrong_role_value_with_403():
    # Arrange — the claim is present but holds some other value
    client, ctx = build_client()

    # Act
    response = client.get(
        "/admin-only",
        headers={
            "Authorization": f"Bearer {ctx.mint(extra_claims={'role': 'member'})}"
        },
    )

    # Assert — only the exact operator value grants access
    assert response.status_code == 403


def test_require_admin_admits_the_operator_role_and_returns_the_subject():
    # Arrange
    client, ctx = build_client()

    # Act — a token carrying role=admin (the default operator value)
    response = client.get(
        "/admin-only",
        headers={
            "Authorization": (
                f"Bearer {ctx.mint(sub='user_ops', extra_claims={'role': 'admin'})}"
            )
        },
    )

    # Assert — admitted, and the handler sees the operator's Clerk subject
    assert response.status_code == 200
    assert response.json() == {"operator": "user_ops"}


def test_require_admin_honours_a_configured_claim_key_and_value():
    # Arrange — an operator identified by a custom claim/value, not the defaults
    settings = Settings(
        clerk_issuer=ISSUER,
        admin_role_claim="workout_role",
        admin_role_value="maintainer",
    )
    client, ctx = build_client(settings=settings)

    # Act — a token matching the configured claim passes
    admitted = client.get(
        "/admin-only",
        headers={
            "Authorization": (
                f"Bearer {ctx.mint(extra_claims={'workout_role': 'maintainer'})}"
            )
        },
    )
    # …while the old default claim no longer grants access
    denied = client.get(
        "/admin-only",
        headers={"Authorization": f"Bearer {ctx.mint(extra_claims={'role': 'admin'})}"},
    )

    # Assert — the gate reads the claim path from Settings, not a hardcoded key
    assert admitted.status_code == 200
    assert denied.status_code == 403
