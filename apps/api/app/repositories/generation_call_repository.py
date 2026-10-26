"""Repository for the admin AI audit log: recorded ``Generation Call`` rows (ADR-0135).

The persistence seam behind the Postgres recorder and the admin list endpoint. ``add``
stores one call; ``purge_expired`` deletes rows past the 3-day retention window;
``delete_for_user`` erases one user's rows; ``list_recent`` reads one filtered page of the
newest calls first (issue #732);
``get_recent`` reads one call in full; ``summarize_recent`` aggregates the window for the
admin dashboard (issue #769, ADR-0142) — at read time, never from stored counters.
Every read applies the retention cutoff, so an expired row is never served even when a
purge failed. ``now`` is injectable so retention is tested deterministically.

The list reads a ``GenerationCallSummary`` (metadata only, no prompt or output text), so
the list payload stays small; the detail reads a ``GenerationCallDetail``, which adds the
prompts, the output or the failure, the schema name and the token budget. Either way the
ORM never leaves the repository."""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime
from statistics import median
from typing import Protocol

from sqlalchemy import delete, func
from sqlmodel import Session, select

from app.db.models import GenerationCallRecord, _utcnow
from app.generation.monitoring.call import (
    GenerationCall,
    GenerationOutcome,
    GeneratorKind,
)
from app.generation.monitoring.retention import (
    GENERATION_CALL_RETENTION,
    retention_cutoff,
)

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


@dataclass(frozen=True)
class GenerationCallFilters:
    """What the admin list narrows to; each ``None`` field leaves that axis open.

    Set fields combine (AND), so "failed protocol generations for this user" is all three."""

    generator_kind: GeneratorKind | None = None
    outcome: GenerationOutcome | None = None
    clerk_user_id: str | None = None


@dataclass(frozen=True)
class GenerationCallPage:
    """One newest-first page of the admin list plus the full match count.

    ``total`` counts every call matching the filters inside the retention window, across
    all pages, so the route can report pagination ``meta``."""

    items: list[GenerationCallSummary]
    total: int


@dataclass(frozen=True)
class GenerationCallWindowSummary:
    """Counts and sums over every call inside the retention window (ADR-0142).

    ``by_outcome`` and ``by_generator_kind`` carry every enum value (zero when none), in enum
    order. The token sums cover only calls that reported usage; ``unreported_usage_calls``
    counts the rest, so a sum is known to be a floor. ``median_latency_ms`` is over every
    call, successes and errors alike, and ``None`` when the window holds no call."""

    total_calls: int
    by_outcome: dict[GenerationOutcome, int]
    by_generator_kind: dict[GeneratorKind, int]
    input_tokens: int
    output_tokens: int
    unreported_usage_calls: int
    median_latency_ms: float | None
    window_days: int


class _SummarizedRow(Protocol):
    """One row of the five summarized columns ``summarize_recent`` reads — never a prompt."""

    @property
    def generator_kind(self) -> str: ...
    @property
    def outcome(self) -> str: ...
    @property
    def input_tokens(self) -> int | None: ...
    @property
    def output_tokens(self) -> int | None: ...
    @property
    def latency_ms(self) -> float: ...


def _window_summary(rows: Sequence[_SummarizedRow]) -> GenerationCallWindowSummary:
    """Aggregate rows of the five summarized columns (kind, outcome, tokens, latency)."""

    reported = [
        row
        for row in rows
        if row.input_tokens is not None and row.output_tokens is not None
    ]
    latencies = [row.latency_ms for row in rows]
    return GenerationCallWindowSummary(
        total_calls=len(rows),
        by_outcome={
            outcome: sum(1 for row in rows if row.outcome == outcome.value)
            for outcome in GenerationOutcome
        },
        by_generator_kind={
            kind: sum(1 for row in rows if row.generator_kind == kind.value)
            for kind in GeneratorKind
        },
        input_tokens=sum(row.input_tokens for row in reported),
        output_tokens=sum(row.output_tokens for row in reported),
        unreported_usage_calls=len(rows) - len(reported),
        median_latency_ms=median(latencies) if latencies else None,
        window_days=GENERATION_CALL_RETENTION.days,
    )


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


def _matching(filters: GenerationCallFilters) -> list:
    """The WHERE clauses for the set filters; an open axis adds none."""

    clauses = []
    if filters.generator_kind is not None:
        clauses.append(
            GenerationCallRecord.generator_kind == filters.generator_kind.value
        )
    if filters.outcome is not None:
        clauses.append(GenerationCallRecord.outcome == filters.outcome.value)
    if filters.clerk_user_id is not None:
        clauses.append(GenerationCallRecord.clerk_user_id == filters.clerk_user_id)
    return clauses


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

    def list_recent(
        self, *, filters: GenerationCallFilters, limit: int, offset: int
    ) -> GenerationCallPage:
        """One page of the matching calls inside the retention window, newest first."""
        ...

    def get_recent(self, call_id: int) -> GenerationCallDetail | None:
        """One call in full, or ``None`` when unknown or past the retention window."""
        ...

    def summarize_recent(self) -> GenerationCallWindowSummary:
        """Counts and sums over every call inside the retention window."""
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

    def list_recent(
        self, *, filters: GenerationCallFilters, limit: int, offset: int
    ) -> GenerationCallPage:
        """One page of the matching calls inside the retention window, newest first."""

        where = (
            GenerationCallRecord.created_at >= retention_cutoff(self._now()),
            *_matching(filters),
        )
        total = self._session.exec(
            select(func.count()).select_from(GenerationCallRecord).where(*where)
        ).one()
        statement = (
            select(GenerationCallRecord)
            .where(*where)
            # The id tiebreaks calls sharing a timestamp, so the order is total and stable.
            .order_by(
                GenerationCallRecord.created_at.desc(), GenerationCallRecord.id.desc()
            )
            .offset(offset)
            .limit(limit)
        )
        rows = self._session.exec(statement).all()
        return GenerationCallPage(items=[_summary(row) for row in rows], total=total)

    def get_recent(self, call_id: int) -> GenerationCallDetail | None:
        """One call in full, or ``None`` when unknown or past the retention window."""

        statement = select(GenerationCallRecord).where(
            GenerationCallRecord.id == call_id,
            GenerationCallRecord.created_at >= retention_cutoff(self._now()),
        )
        row = self._session.exec(statement).first()
        return None if row is None else _detail(row)

    def summarize_recent(self) -> GenerationCallWindowSummary:
        """Counts and sums over every call inside the retention window, at read time.

        Only the five aggregated columns are read (never a prompt or output); the window
        holds at most three days of calls, so the median is taken in Python, which keeps it
        portable across SQLite and Postgres."""

        statement = select(
            GenerationCallRecord.generator_kind,
            GenerationCallRecord.outcome,
            GenerationCallRecord.input_tokens,
            GenerationCallRecord.output_tokens,
            GenerationCallRecord.latency_ms,
        ).where(GenerationCallRecord.created_at >= retention_cutoff(self._now()))
        return _window_summary(self._session.exec(statement).all())


__all__ = [
    "GenerationCallDetail",
    "GenerationCallFilters",
    "GenerationCallPage",
    "GenerationCallRepository",
    "GenerationCallSummary",
    "GenerationCallWindowSummary",
    "SqlGenerationCallRepository",
]
