"""FastAPI auth dependency: turns a Clerk bearer token into a verified user id.

Unauthenticated or invalid requests are rejected with 401 before any handler
runs, so routes only ever see an authenticated Clerk subject."""

from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status

from app.auth.jwks import AuthError, verify_clerk_jwt
from app.auth.jwks_provider import get_jwks
from app.config import Settings, get_settings


def get_current_user(
    authorization: str | None = Header(default=None),
    jwks: dict = Depends(get_jwks),
    settings: Settings = Depends(get_settings),
) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )

    token = authorization.split(" ", 1)[1]
    try:
        claims = verify_clerk_jwt(token, jwks=jwks, issuer=settings.clerk_issuer)
    except AuthError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc

    return claims["sub"]
