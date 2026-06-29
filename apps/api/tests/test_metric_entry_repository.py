"""Behavior of the MetricEntry repository through its public interface, over both
the in-memory fake and the SQLModel-backed implementation.

A MetricEntry is a dated body-metric reading (weight, body-fat, …) recorded as a
time series — explicitly *not* the mutable Fitness Profile snapshot. The repository
persists a reading and reads a user's history back, most recent first, optionally
narrowed to a single metric. Reads are always scoped to the owning user."""

from __future__ import annotations

from datetime import date

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.repositories.metric_entry_repository import (
    InMemoryMetricEntryRepository,
    MetricEntryDraft,
    SqlMetricEntryRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def metrics(request):
    """Yield a MetricEntryRepository over the chosen backing store."""
    if request.param == "in_memory":
        yield InMemoryMetricEntryRepository()
        return
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlMetricEntryRepository(session)


def test_a_recorded_reading_round_trips_with_an_assigned_id(metrics):
    # Arrange
    draft = MetricEntryDraft(
        metric="weight", value=82.5, unit="kg", recorded_on=date(2026, 1, 1)
    )

    # Act
    view = metrics.create("user_a", draft)

    # Assert — the reading is returned with its persisted identity and fields
    assert view.id is not None
    assert view.clerk_user_id == "user_a"
    assert view.metric == "weight"
    assert view.value == 82.5
    assert view.unit == "kg"
    assert view.recorded_on == date(2026, 1, 1)


def test_history_is_returned_most_recent_first(metrics):
    # Arrange — three weigh-ins logged out of order
    metrics.create("user_b", MetricEntryDraft("weight", 81.0, date(2026, 2, 1), "kg"))
    metrics.create("user_b", MetricEntryDraft("weight", 82.0, date(2026, 1, 1), "kg"))
    metrics.create("user_b", MetricEntryDraft("weight", 80.0, date(2026, 3, 1), "kg"))

    # Act
    history = metrics.list_for_user("user_b")

    # Assert — newest reading first
    assert [e.recorded_on for e in history] == [
        date(2026, 3, 1),
        date(2026, 2, 1),
        date(2026, 1, 1),
    ]


def test_history_can_be_narrowed_to_a_single_metric(metrics):
    # Arrange — the user tracks two different metrics
    metrics.create("user_c", MetricEntryDraft("weight", 82.0, date(2026, 1, 1), "kg"))
    metrics.create("user_c", MetricEntryDraft("body_fat", 18.0, date(2026, 1, 1), "%"))
    metrics.create("user_c", MetricEntryDraft("weight", 81.0, date(2026, 2, 1), "kg"))

    # Act
    weights = metrics.list_for_user("user_c", metric="weight")

    # Assert — only weight readings come back
    assert {e.metric for e in weights} == {"weight"}
    assert [e.value for e in weights] == [81.0, 82.0]


def test_readings_are_scoped_to_the_owning_user(metrics):
    # Arrange — two users each record a reading
    metrics.create("user_me", MetricEntryDraft("weight", 70.0, date(2026, 1, 1), "kg"))
    metrics.create("user_them", MetricEntryDraft("weight", 90.0, date(2026, 1, 1), "kg"))

    # Act
    mine = metrics.list_for_user("user_me")

    # Assert — I never see another user's readings
    assert len(mine) == 1
    assert mine[0].value == 70.0


def test_unit_is_optional(metrics):
    # Arrange — a unitless metric (e.g. a count)
    draft = MetricEntryDraft(metric="pushups", value=42.0, recorded_on=date(2026, 1, 1))

    # Act
    view = metrics.create("user_d", draft)

    # Assert
    assert view.unit is None
