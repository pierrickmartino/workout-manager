"""Dependency providers for repositories.

Routes depend on these so the concrete storage implementation can be swapped
(e.g. an in-memory fake in tests) without touching handler code."""

from __future__ import annotations

from fastapi import Depends
from sqlmodel import Session

from app.db.session import get_session
from app.repositories.profile_repository import (
    ProfileRepository,
    SqlProfileRepository,
)


def get_profile_repository(
    session: Session = Depends(get_session),
) -> ProfileRepository:
    return SqlProfileRepository(session)
