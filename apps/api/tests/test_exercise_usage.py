"""Unit tests for the per-Exercise last-performed projection (ADR-0042)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

from app.domain.exercise_usage import last_performed


@dataclass
class _Set:
    exercise_id: int


@dataclass
class _Session:
    performed_on: date
    logged_sets: list[_Set] = field(default_factory=list)


def test_empty_history_yields_an_empty_map():
    assert last_performed([]) == {}


def test_maps_each_exercise_to_its_latest_performed_date():
    history = [
        _Session(date(2026, 1, 5), [_Set(1), _Set(2)]),
        _Session(date(2026, 3, 10), [_Set(1)]),  # exercise 1 seen more recently
    ]
    assert last_performed(history) == {1: date(2026, 3, 10), 2: date(2026, 1, 5)}


def test_older_session_never_overwrites_a_newer_date_regardless_of_order():
    # The newest date wins even when the older session is iterated last
    history = [
        _Session(date(2026, 3, 10), [_Set(1)]),
        _Session(date(2026, 1, 5), [_Set(1)]),
    ]
    assert last_performed(history) == {1: date(2026, 3, 10)}


def test_an_unlogged_exercise_is_absent():
    history = [_Session(date(2026, 2, 1), [_Set(7)])]
    result = last_performed(history)
    assert 7 in result
    assert 99 not in result  # never performed → absent → the browse marker reads NEW
