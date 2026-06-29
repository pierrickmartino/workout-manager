"""Metric-history routes: record a dated body-metric reading and read it back.

``POST /api/metrics`` records one reading — a named metric (e.g. ``weight``), its
numeric value, an optional unit, and the date it was recorded. ``GET /api/metrics``
returns the user's history, most recent first, optionally narrowed to one metric
via ``?metric=``. This is the time series the Fitness Profile snapshot is not: the
Profile's "now" is never touched. All responses use the standard envelope."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.auth.dependencies import get_current_user
from app.envelope import success_envelope
from app.repositories.deps import get_metric_entry_repository
from app.repositories.metric_entry_repository import (
    MetricEntryDraft,
    MetricEntryRepository,
    MetricEntryView,
)

router = APIRouter(prefix="/api", tags=["metrics"])


class RecordMetricBody(BaseModel):
    """Validated request to record one dated metric reading."""

    metric: str = Field(min_length=1)
    value: float
    unit: str | None = None
    recorded_on: date

    def to_draft(self) -> MetricEntryDraft:
        return MetricEntryDraft(
            metric=self.metric,
            value=self.value,
            unit=self.unit,
            recorded_on=self.recorded_on,
        )


def _serialize(view: MetricEntryView) -> dict:
    return {
        "id": view.id,
        "clerk_user_id": view.clerk_user_id,
        "metric": view.metric,
        "value": view.value,
        "unit": view.unit,
        "recorded_on": view.recorded_on.isoformat(),
    }


@router.post("/metrics")
def record_metric(
    payload: RecordMetricBody,
    clerk_user_id: str = Depends(get_current_user),
    metrics: MetricEntryRepository = Depends(get_metric_entry_repository),
) -> dict:
    view = metrics.create(clerk_user_id, payload.to_draft())
    return success_envelope(_serialize(view))


@router.get("/metrics")
def read_metrics(
    metric: str | None = None,
    clerk_user_id: str = Depends(get_current_user),
    metrics: MetricEntryRepository = Depends(get_metric_entry_repository),
) -> dict:
    history = metrics.list_for_user(clerk_user_id, metric=metric)
    return success_envelope([_serialize(view) for view in history])
