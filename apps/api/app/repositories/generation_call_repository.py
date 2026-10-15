"""Repository for the admin AI audit log: recorded ``Generation Call`` rows (ADR-0135).

The persistence seam behind the Postgres recorder and the admin list endpoint. ``add``
stores one call; ``purge_expired`` deletes rows past the 3-day retention window;
``delete_for_user`` erases one user's rows; ``list_recent`` reads the newest calls first;
``get_recent`` reads one call in full.
Every read applies the retention cutoff, so an expired row is never served even when a
purge failed. ``now`` is injectable so retention is tested deterministically.

The list reads a ``GenerationCallSummary`` (metadata only, no prompt or output text), so
the list payload stays small; the detail reads a ``GenerationCallDetail``, which adds the
prompts, the output or the failure, the schema name and the token budget. Either way the
ORM never leaves the repository."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from sqlalchemy import delete
from sqlmodel import Session, select

from app.db.models import GenerationCallRecord, _utcnow
from app.generation.monitoring.call import GenerationCall
from app.generation.monitoring.retention import retention_cutoff

Clock = Callable[[], datetime]


@dataclass(frozen=True)
class GenerationCallSummary:
    """One recorded call's metadata, as the admin list shows it."""

    id: int
    created_at: datetime
    generator_kind: str
    clerk_user_id: str | None
    provider: str
    model: str
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: float
    outcome: str


@dataclass(frozen=True)
class GenerationCallDetail:
    """One recorded call in full, as the admin detail view shows it.

    ``output_text`` is null on a failed call, which carries ``error_message`` instead.
    ``schema_name`` and ``max_tokens`` are null only on rows recorded before they were."""

    summary: GenerationCallSummary
    system_prompt: str
    user_prompt: str
    output_text: str | None
    error_message: str | None
    schema_name: str | None
    max_tokens: int | None


def _summary(row: GenerationCallRecord) -> GenerationCallSummary:
    return GenerationCallSummary(
        id=row.id,
        created_at=row.created_at,
        generator_kind=row.generator_kind,
        clerk_user_id=row.clerk_user_id,
        provider=row.provider,
        model=row.model,
        input_tokens=row.input_tokens,
        output_tokens=row.output_tokens,
        latency_ms=row.latency_ms,
        outcome=row.outcome,
    )


def _detail(row: GenerationCallRecord) -> GenerationCallDetail:
    return GenerationCallDetail(
        summary=_summary(row),
        system_prompt=row.system_prompt,
        user_prompt=row.user_prompt,
        output_text=row.output_text,
        error_message=row.error_message,
        schema_name=row.schema_name,
        max_tokens=row.max_tokens,
    )


class GenerationCallRepository(Protocol):
    def add(self, call: GenerationCall) -> None:
        """Store one recorded call, stamped with the repository's clock."""
        ...

    def purge_expired(self) -> None:
        """Delete every row older than the retention cutoff."""
        ...

    def delete_for_user(self, clerk_user_id: str) -> None:
        """Erase every row attributed to ``clerk_user_id``."""
        ...

    def list_recent(self, *, limit: int) -> list[GenerationCallSummary]:
        """The newest ``limit`` calls inside the retention window, newest first."""
        ...

    def get_recent(self, call_id: int) -> GenerationCallDetail | None:
        """One call in full, or ``None`` when unknown or past the retention window."""
        ...


class SqlGenerationCallRepository:
    def __init__(self, session: Session, *, now: Clock = _utcnow) -> None:
        self._session = session
        self._now = now

    def add(self, call: GenerationCall) -> None:
        """Store one recorded call, stamped with the injected clock, and commit."""

        self._session.add(
            GenerationCallRecord(
                created_at=self._now(),
                generator_kind=call.generator_kind.value,
                clerk_user_id=call.clerk_user_id,
                provider=call.provider,
                model=call.model,
                input_tokens=call.input_tokens,
                output_tokens=call.output_tokens,
                latency_ms=call.latency_ms,
                outcome=call.outcome.value,
                system_prompt=call.system_prompt,
                user_prompt=call.user_prompt,
                output_text=call.output_text,
                error_message=call.error_message,
                schema_name=call.schema_name,
                max_tokens=call.max_tokens,
            )
        )
        self._session.commit()

    def purge_expired(self) -> None:
        """Delete every row older than the retention cutoff, and commit."""

        cutoff = retention_cutoff(self._now())
        self._session.exec(
            delete(GenerationCallRecord).where(GenerationCallRecord.created_at < cutoff)
        )
        self._session.commit()

    def delete_for_user(self, clerk_user_id: str) -> None:
        """Erase every row attributed to ``clerk_user_id``, and commit."""

        self._session.exec(
            delete(GenerationCallRecord).where(
                GenerationCallRecord.clerk_user_id == clerk_user_id
            )
        )
        self._session.commit()

    def list_recent(self, *, limit: int) -> list[GenerationCallSummary]:
        """The newest ``limit`` calls inside the retention window, newest first."""

        cutoff = retention_cutoff(self._now())
        statement = (
            select(GenerationCallRecord)
            .where(GenerationCallRecord.created_at >= cutoff)
            # The id tiebreaks calls sharing a timestamp, so the order is total and stable.
            .order_by(
                GenerationCallRecord.created_at.desc(), GenerationCallRecord.id.desc()
            )
            .limit(limit)
        )
        return [_summary(row) for row in self._session.exec(statement).all()]

    def get_recent(self, call_id: int) -> GenerationCallDetail | None:
        """One call in full, or ``None`` when unknown or past the retention window."""

        statement = select(GenerationCallRecord).where(
            GenerationCallRecord.id == call_id,
            GenerationCallRecord.created_at >= retention_cutoff(self._now()),
        )
        row = self._session.exec(statement).first()
        return None if row is None else _detail(row)


__all__ = [
    "GenerationCallDetail",
    "GenerationCallRepository",
    "GenerationCallSummary",
    "SqlGenerationCallRepository",
]
