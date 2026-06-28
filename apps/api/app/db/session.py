"""Database engine and per-request session dependency."""

from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from sqlmodel import Session, create_engine

from app.config import get_settings


@lru_cache
def get_engine():
    settings = get_settings()
    return create_engine(settings.database_url, pool_pre_ping=True)


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
