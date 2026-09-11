"""FastAPI auth dependencies: turn a Clerk bearer token into a verified user id.

Unauthenticated or invalid requests are rejected with 401 before any handler
runs, so routes only ever see an authenticated Clerk subject. ``require_admin``
adds a second gate on top for maintenance endpoints (ADR-0046): a verified token
is not enough — it must also carry the operator role claim, or the request is
rejected with 403."""

from __future__ import annotations

from typing import Any

from fastapi import Depends, Header, HTTPException, status

from app.auth.jwks import AuthError, verify_clerk_jwt
from app.auth.jwks_provider import get_jwks
from app.config import Settings, get_settings


def _verified_claims(
    authorization: str | None, jwks: dict, settings: Settings
) -> dict[str, Any]:
    """Verify the bearer token and return its claims, or raise 401.

    The single place the ``Authorization`` header is parsed and the Clerk JWT is
    verified, so ``get_current_user`` and ``require_admin`` share one notion of
    "authenticated" and can never drift on it."""

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )

    token = authorization.split(" ", 1)[1]
    try:
        return verify_clerk_jwt(token, jwks=jwks, issuer=settings.clerk_issuer)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc


def get_current_user(
    authorization: str | None = Header(default=None),
    jwks: dict = Depends(get_jwks),
    settings: Settings = Depends(get_settings),
) -> str:
    return _verified_claims(authorization, jwks, settings)["sub"]


def require_admin(
    authorization: str | None = Header(default=None),
    jwks: dict = Depends(get_jwks),
    settings: Settings = Depends(get_settings),
) -> str:
    """Verify the caller and require the operator role claim (ADR-0046).

    Reuses the same JWT verification as ``get_current_user`` (so a bad/absent token
    is a 401), then reads the configured ``admin_role_claim`` and requires it to equal
    ``admin_role_value``. **Fails closed**: a verified but non-operator token — the
    claim missing, or holding any other value — is a 403, never a silent pass. Returns
    the operator's Clerk subject so a handler can attribute the action."""

    claims = _verified_claims(authorization, jwks, settings)
    if claims.get(settings.admin_role_claim) != settings.admin_role_value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="operator role required",
        )
    return claims["sub"]
