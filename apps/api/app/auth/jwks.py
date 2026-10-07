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


# Raw decode failures PyJWT may let escape on attacker-controlled input, e.g. a
# RecursionError from a deeply nested JSON header, which older releases (e.g.
# 2.9) do not wrap (CVE-2026-102265). They must surface as AuthError -> 401, never as an unhandled 500,
# and with a fixed message: their text is parser detail, not client-facing.
_RAW_DECODE_ERRORS = (ValueError, RecursionError)


def verify_clerk_jwt(token: str, *, jwks: dict, issuer: str) -> dict[str, Any]:
    try:
        kid = jwt.get_unverified_header(token).get("kid")
    except (jwt.PyJWTError, *_RAW_DECODE_ERRORS) as exc:
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
    except _RAW_DECODE_ERRORS as exc:
        raise AuthError("malformed token") from exc


def _find_signing_key(jwks: dict, kid: str | None):
    key_set = PyJWKSet.from_dict(jwks)
    for key in key_set.keys:
        if key.key_id == kid:
            return key.key
    raise AuthError(f"no signing key matches kid {kid!r}")
