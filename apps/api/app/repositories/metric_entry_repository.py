"""Repository for MetricEntry — the user's dated body-metric time series.

This is the persistence seam for progress over time (Slice 12), kept deliberately
separate from the Fitness Profile snapshot: writing a reading never touches the
Profile's "now". Writes take a ``MetricEntryDraft`` (the metric name, numeric
value, optional unit, and the date it was recorded). Reads return a
``MetricEntryView`` so consumers never touch the ORM, are scoped to the owning
user, come back most-recently-recorded first, and may be narrowed to one metric.
SQLModel-backed and in-memory implementations honor the same contract."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Protocol

from sqlmodel import Session, select

from app.db.models import MetricEntry


@dataclass(frozen=True)
class MetricEntryDraft:
    """A reading to record: which metric, its value, when, and an optional unit."""

    metric: str
    value: float
    recorded_on: date
    unit: str | None = None


@dataclass(frozen=True)
class MetricEntryView:
    """A recorded reading, ready to serialize."""

    id: int
    clerk_user_id: str
    metric: str
    value: float
    unit: str | None
    recorded_on: date


class MetricEntryRepository(Protocol):
    def create(self, clerk_user_id: str, draft: MetricEntryDraft) -> MetricEntryView:
        """Persist ``draft`` as a reading owned by ``clerk_user_id`` and return it."""
        ...

    def list_for_user(
        self, clerk_user_id: str, metric: str | None = None
    ) -> list[MetricEntryView]:
        """Return the user's readings, most recently recorded first. When ``metric``
        is given, only readings of that metric are returned."""
        ...


def _view(entry: MetricEntry) -> MetricEntryView:
    return MetricEntryView(
        id=entry.id,
        clerk_user_id=entry.clerk_user_id,
        metric=entry.metric,
        value=entry.value,
        unit=entry.unit,
        recorded_on=entry.recorded_on,
    )


class SqlMetricEntryRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def create(self, clerk_user_id: str, draft: MetricEntryDraft) -> MetricEntryView:
        entry = MetricEntry(
            clerk_user_id=clerk_user_id,
            metric=draft.metric,
            value=draft.value,
            unit=draft.unit,
            recorded_on=draft.recorded_on,
        )
        self._session.add(entry)
        self._session.commit()
        self._session.refresh(entry)
        return _view(entry)

    def list_for_user(
        self, clerk_user_id: str, metric: str | None = None
    ) -> list[MetricEntryView]:
        statement = select(MetricEntry).where(
            MetricEntry.clerk_user_id == clerk_user_id
        )
        if metric is not None:
            statement = statement.where(MetricEntry.metric == metric)
        statement = statement.order_by(
            MetricEntry.recorded_on.desc(), MetricEntry.id.desc()
        )
        return [_view(entry) for entry in self._session.exec(statement).all()]


class InMemoryMetricEntryRepository:
    def __init__(self) -> None:
        self._entries: dict[int, MetricEntry] = {}
        self._next_id = 1

    def create(self, clerk_user_id: str, draft: MetricEntryDraft) -> MetricEntryView:
        entry = MetricEntry(
            id=self._next_id,
            clerk_user_id=clerk_user_id,
            metric=draft.metric,
            value=draft.value,
            unit=draft.unit,
            recorded_on=draft.recorded_on,
        )
        self._next_id += 1
        self._entries[entry.id] = entry
        return _view(entry)

    def list_for_user(
        self, clerk_user_id: str, metric: str | None = None
    ) -> list[MetricEntryView]:
        owned = [
            entry
            for entry in self._entries.values()
            if entry.clerk_user_id == clerk_user_id
            and (metric is None or entry.metric == metric)
        ]
        owned.sort(key=lambda entry: (entry.recorded_on, entry.id), reverse=True)
        return [_view(entry) for entry in owned]


__all__ = [
    "MetricEntryDraft",
    "MetricEntryView",
    "MetricEntryRepository",
    "SqlMetricEntryRepository",
    "InMemoryMetricEntryRepository",
]
