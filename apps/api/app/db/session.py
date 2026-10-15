"""Database engine and per-request session dependency."""

from __future__ import annotations

from collections.abc import Iterator
from functools import lru_cache

from sqlmodel import Session, create_engine

from app.config import get_settings


@lru_cache
def engine_for(database_url: str):
    """One pooled engine per database URL, shared by every caller in the process."""

    return create_engine(database_url, pool_pre_ping=True)


def get_engine():
    return engine_for(get_settings().database_url)


def get_session() -> Iterator[Session]:
    with Session(get_engine()) as session:
        yield session
