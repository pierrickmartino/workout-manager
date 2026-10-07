"""Behavior of Clerk JWT verification against a JWKS."""

from __future__ import annotations

import base64

import jwt
import pytest

from app.auth.jwks import AuthError, verify_clerk_jwt
from tests.conftest import make_signing_context

# Far beyond the JSON decoder's recursion limit on any interpreter.
NESTING_PAST_RECURSION_LIMIT = 100_000


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


def test_rejects_token_whose_header_is_too_deeply_nested_to_decode():
    # Arrange: a header JSON nested past the parser's recursion limit, so
    # decoding it raises RecursionError rather than a PyJWTError.
    ctx = make_signing_context()
    nested_header = (
        b'{"alg":"RS256","x":'
        + b"[" * NESTING_PAST_RECURSION_LIMIT
        + b"]" * NESTING_PAST_RECURSION_LIMIT
        + b"}"
    )
    header = base64.urlsafe_b64encode(nested_header).rstrip(b"=").decode()
    _, payload, signature = ctx.mint().split(".")
    token = f"{header}.{payload}.{signature}"

    # Act / Assert
    with pytest.raises(AuthError):
        verify_clerk_jwt(token, jwks=ctx.jwks, issuer=ctx.issuer)


@pytest.mark.parametrize("decode_error", [RecursionError, ValueError])
def test_header_decode_errors_outside_pyjwt_become_auth_errors_with_a_fixed_message(
    monkeypatch, decode_error
):
    # Arrange: a PyJWT that lets a raw decode error escape (as releases before
    # 2.15.1 do for a nested header), independent of the installed version.
    ctx = make_signing_context()

    def raise_decode_error(_token):
        raise decode_error("internal parser detail")

    monkeypatch.setattr(jwt, "get_unverified_header", raise_decode_error)

    # Act / Assert: a 401-bound AuthError whose text leaks nothing of the parser.
    with pytest.raises(AuthError, match="^malformed token header$"):
        verify_clerk_jwt(ctx.mint(), jwks=ctx.jwks, issuer=ctx.issuer)


@pytest.mark.parametrize("decode_error", [RecursionError, ValueError])
def test_body_decode_errors_outside_pyjwt_become_auth_errors_with_a_fixed_message(
    monkeypatch, decode_error
):
    # Arrange
    ctx = make_signing_context()

    def raise_decode_error(*_args, **_kwargs):
        raise decode_error("internal parser detail")

    monkeypatch.setattr(jwt, "decode", raise_decode_error)

    # Act / Assert
    with pytest.raises(AuthError, match="^malformed token$"):
        verify_clerk_jwt(ctx.mint(), jwks=ctx.jwks, issuer=ctx.issuer)
