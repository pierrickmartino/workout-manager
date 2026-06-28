"""Verification of Clerk-issued JWTs against a JWKS.

The verifier is deliberately a pure function over an already-fetched JWKS so it
is trivial to test offline. Fetching/caching the live Clerk JWKS is the job of
the caller (see ``app.auth.dependencies``)."""

from __future__ import annotations

from typing import Any

import jwt
from jwt import PyJWKSet


class AuthError(Exception):
    """Raised when a token cannot be verified or trusted."""


def verify_clerk_jwt(token: str, *, jwks: dict, issuer: str) -> dict[str, Any]:
    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except jwt.PyJWTError as exc:
        raise AuthError("malformed token header") from exc

    signing_key = _find_signing_key(jwks, kid)

    try:
        return jwt.decode(
            token,
            key=signing_key,
            algorithms=["RS256"],
            issuer=issuer,
        )
    except jwt.PyJWTError as exc:
        raise AuthError(str(exc)) from exc


def _find_signing_key(jwks: dict, kid: str | None):
    key_set = PyJWKSet.from_dict(jwks)
    for key in key_set.keys:
        if key.key_id == kid:
            return key.key
    raise AuthError(f"no signing key matches kid {kid!r}")
