"""Behavior of Clerk JWT verification against a JWKS."""

from __future__ import annotations

import pytest

from app.auth.jwks import AuthError, verify_clerk_jwt
from tests.conftest import make_signing_context


def test_returns_claims_for_token_signed_by_a_jwks_key():
    # Arrange
    ctx = make_signing_context()
    token = ctx.mint(sub="user_abc")

    # Act
    claims = verify_clerk_jwt(token, jwks=ctx.jwks, issuer=ctx.issuer)

    # Assert
    assert claims["sub"] == "user_abc"


def test_rejects_token_whose_kid_is_not_in_the_jwks():
    # Arrange
    ctx = make_signing_context()
    token = ctx.mint(kid="some-other-key")

    # Act / Assert
    with pytest.raises(AuthError):
        verify_clerk_jwt(token, jwks=ctx.jwks, issuer=ctx.issuer)


def test_rejects_expired_token():
    # Arrange
    ctx = make_signing_context()
    token = ctx.mint(expires_in=-10)

    # Act / Assert
    with pytest.raises(AuthError):
        verify_clerk_jwt(token, jwks=ctx.jwks, issuer=ctx.issuer)


def test_rejects_token_from_a_different_issuer():
    # Arrange
    ctx = make_signing_context()
    token = ctx.mint(issuer="https://evil.example.com")

    # Act / Assert
    with pytest.raises(AuthError):
        verify_clerk_jwt(token, jwks=ctx.jwks, issuer=ctx.issuer)


def test_rejects_token_with_a_tampered_payload():
    # Arrange
    ctx = make_signing_context()
    header, payload, signature = ctx.mint().split(".")
    tampered = f"{header}.{payload}x.{signature}"

    # Act / Assert
    with pytest.raises(AuthError):
        verify_clerk_jwt(tampered, jwks=ctx.jwks, issuer=ctx.issuer)
