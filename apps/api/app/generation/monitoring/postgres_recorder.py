"""The ``GenerationCallRecorder`` backed by the app's own Postgres database (ADR-0135).

The admin AI audit log: every metered ``Generation Call`` is stored as a row and listed for
the operator behind the admin gate. Persistence goes through the
``SqlGenerationCallRepository``.

Two properties are load-bearing:

- **Its own session, its own commit.** The recorder opens a short-lived session per call
  instead of riding the caller's, so a generation whose transaction rolls back still leaves
  its failed call recorded. The failures most worth debugging are not lost.
- **Best-effort.** A DB failure is logged and swallowed and never reaches the generator, so
  monitoring cannot take down the thing it monitors. The purge of expired rows runs after
  the call is stored, in its own guard, so a failed purge never loses the record; the read
  cutoff still hides whatever it left behind.

``flush`` is a no-op because every record commits before it returns.
``delete_user_traces`` is *not* best-effort: an erasure failure raises, so un-erased health
data is never mistaken for erased."""

from __future__ import annotations

import logging
from collections.abc import Callable

from sqlmodel import Session

from app.db.models import _utcnow
from app.generation.monitoring.call import GenerationCall
from app.repositories.generation_call_repository import (
    Clock,
    SqlGenerationCallRepository,
)

logger = logging.getLogger(__name__)

SessionFactory = Callable[[], Session]


class PostgresGenerationCallRecorder:
    def __init__(self, *, session_factory: SessionFactory, now: Clock = _utcnow) -> None:
        self._session_factory = session_factory
        self._now = now

    def record(self, call: GenerationCall) -> None:
        try:
            with self._session_factory() as session:
                repository = SqlGenerationCallRepository(session, now=self._now)
                repository.add(call)
                self._purge_expired(repository)
        except Exception:  # best-effort: a recording failure never propagates
            logger.exception("failed to record generation call")

    def flush(self) -> None:
        return None

    def delete_user_traces(self, clerk_user_id: str) -> None:
        with self._session_factory() as session:
            SqlGenerationCallRepository(session, now=self._now).delete_for_user(
                clerk_user_id
            )

    @staticmethod
    def _purge_expired(repository: SqlGenerationCallRepository) -> None:
        try:
            repository.purge_expired()
        except Exception:  # best-effort: the read cutoff still hides expired rows
            logger.exception("failed to purge expired generation calls")


__all__ = ["PostgresGenerationCallRecorder"]
