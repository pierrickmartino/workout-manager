"""Progress Story (#655, #656) — the latest Logged Session of an Exercise against the most
recent earlier comparable one.

``progress_story`` returns a structured result — never a sentence. It compares absolute
Loads in non-warm-up sets: first at the **heaviest shared load** (best reps at it), else at
the **heaviest shared rep count** (heaviest load for it), scanning earlier sessions
backwards until one matches. Anything it cannot compare exactly is ``insufficient``;
Estimated 1RM is never used.

Pure and dependency-free — exercised here with hand-built session stubs."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

import pytest

from app.domain.load import LoadKind, ParsedLoad
from app.domain.progress_story import (
    StoryAxis,
    StoryKind,
    progress_story,
    progress_story_payload,
)
from app.domain.quantity import Quantity, QuantityKind

SQUAT = 1
PRESS = 2


@dataclass(frozen=True)
class _Set:
    exercise_id: int
    quantity: dict | None
    load: dict | None
    set_type: str | None = None
    body_weight_kg: float | None = None


@dataclass(frozen=True)
class _Session:
    id: int
    performed_on: date
    logged_sets: list[_Set] = field(default_factory=list)


def _reps(count: int) -> dict:
    return Quantity(kind=QuantityKind.REPETITIONS, text=str(count), count=count).to_dict()


def _absolute(kg: float) -> dict:
    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _squat(kg: float, reps: int, *, set_type: str | None = None) -> _Set:
    return _Set(SQUAT, _reps(reps), _absolute(kg), set_type=set_type)


def _session(session_id: int, day: int, *sets: _Set) -> _Session:
    return _Session(session_id, date(2026, 3, day), list(sets))


def test_more_reps_at_the_same_load_is_an_improvement():
    # Arrange — 8 reps at 60 kg last time, 10 reps at 60 kg now
    history = [
        _session(2, 8, _squat(60.0, 10)),
        _session(1, 1, _squat(60.0, 8)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — 2 more reps at the held 60 kg, carrying both sessions
    assert story.kind is StoryKind.IMPROVED
    assert story.axis is StoryAxis.REPS_AT_LOAD
    assert story.load_kind is LoadKind.ABSOLUTE
    assert story.held == 60.0
    assert story.latest.value == 10
    assert story.previous.value == 8
    assert story.delta == 2
    assert story.latest.logged_session_id == 2
    assert story.latest.performed_on == date(2026, 3, 8)
    assert story.previous.logged_session_id == 1
    assert story.previous.performed_on == date(2026, 3, 1)


def test_equal_reps_at_the_same_load_is_unchanged():
    # Arrange
    history = [
        _session(2, 8, _squat(60.0, 8)),
        _session(1, 1, _squat(60.0, 8)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert
    assert story.kind is StoryKind.UNCHANGED
    assert story.held == 60.0
    assert (story.latest.value, story.previous.value, story.delta) == (8, 8, 0)


def test_fewer_reps_at_the_same_load_is_a_decline():
    # Arrange
    history = [
        _session(2, 8, _squat(60.0, 7)),
        _session(1, 1, _squat(60.0, 8)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — the delta is signed
    assert story.kind is StoryKind.DECLINED
    assert story.delta == -1


def test_the_heaviest_shared_load_is_chosen_among_several():
    # Arrange — both sessions share 50 and 60 kg; 70 kg appears only in the latest,
    # 65 kg only in the previous
    history = [
        _session(2, 8, _squat(50.0, 12), _squat(60.0, 9), _squat(70.0, 3)),
        _session(1, 1, _squat(50.0, 10), _squat(60.0, 8), _squat(65.0, 5)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — 60 kg is the heaviest load present in both
    assert story.held == 60.0
    assert (story.latest.value, story.previous.value) == (9, 8)


def test_the_best_reps_at_the_shared_load_are_compared():
    # Arrange — several sets at 60 kg in each session
    history = [
        _session(2, 8, _squat(60.0, 6), _squat(60.0, 9), _squat(60.0, 7)),
        _session(1, 1, _squat(60.0, 8), _squat(60.0, 5)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert
    assert (story.latest.value, story.previous.value, story.delta) == (9, 8, 1)


def test_warm_up_sets_are_ignored():
    # Arrange — the only 100 kg the previous session holds is a warm-up, so the shared
    # load is 60 kg, not 100 kg
    history = [
        _session(2, 8, _squat(100.0, 3), _squat(60.0, 10)),
        _session(1, 1, _squat(100.0, 5, set_type="warm_up"), _squat(60.0, 8)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert
    assert story.held == 60.0
    assert story.delta == 2


def test_a_session_holding_only_warm_ups_of_the_exercise_is_not_a_performance_of_it():
    # Arrange — the newest session warmed up on squats but did no working squat set
    history = [
        _session(3, 15, _squat(40.0, 10, set_type="warm_up")),
        _session(2, 8, _squat(60.0, 10)),
        _session(1, 1, _squat(60.0, 8)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — the pair is the two sessions that actually performed it
    assert (story.latest.logged_session_id, story.previous.logged_session_id) == (2, 1)


def test_a_single_session_is_insufficient():
    # Arrange
    history = [_session(1, 1, _squat(60.0, 8))]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — no pair, so nothing is claimed
    assert story.kind is StoryKind.INSUFFICIENT
    assert story.axis is None
    assert story.latest is None
    assert story.previous is None
    assert story.delta is None


def test_no_history_is_insufficient():
    # Act
    story = progress_story([], SQUAT)

    # Assert
    assert story.kind is StoryKind.INSUFFICIENT


def test_no_shared_load_and_no_shared_rep_count_is_insufficient():
    # Arrange — every load and every rep count changed
    history = [
        _session(2, 8, _squat(62.5, 7)),
        _session(1, 1, _squat(60.0, 8)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert
    assert story.kind is StoryKind.INSUFFICIENT


def test_a_heavier_load_at_a_shared_rep_count_is_an_improvement():
    # Arrange — every load changed, but both sessions did 5 reps: 60 kg then 62.5 kg
    history = [
        _session(2, 8, _squat(62.5, 5)),
        _session(1, 1, _squat(60.0, 5)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — the rep count is held, the load is measured, in kg
    assert story.kind is StoryKind.IMPROVED
    assert story.axis is StoryAxis.LOAD_AT_REPS
    assert story.load_kind is LoadKind.ABSOLUTE
    assert story.held == 5
    assert (story.latest.value, story.previous.value) == (62.5, 60.0)
    assert story.delta == 2.5
    assert (story.latest.logged_session_id, story.previous.logged_session_id) == (2, 1)


def test_a_lighter_load_at_a_shared_rep_count_is_a_decline():
    # Arrange
    history = [
        _session(2, 8, _squat(57.5, 5)),
        _session(1, 1, _squat(60.0, 5)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — the delta is signed
    assert story.kind is StoryKind.DECLINED
    assert story.axis is StoryAxis.LOAD_AT_REPS
    assert story.delta == -2.5


def test_an_equal_load_at_a_shared_rep_count_reads_as_the_same_on_the_shared_load():
    # Arrange — 5 reps at 60 kg both times: an equal load at the shared rep count is
    # itself a shared load, so the shared-load rule always claims it
    history = [
        _session(2, 8, _squat(60.0, 5)),
        _session(1, 1, _squat(60.0, 5)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — "Same as last time", held on the load
    assert story.kind is StoryKind.UNCHANGED
    assert story.axis is StoryAxis.REPS_AT_LOAD
    assert story.held == 60.0


def test_the_heaviest_shared_rep_count_is_chosen_among_several():
    # Arrange — both sessions did 5 and 8 reps; 3 reps only in the latest, 10 only before
    history = [
        _session(2, 8, _squat(52.5, 8), _squat(62.5, 5), _squat(70.0, 3)),
        _session(1, 1, _squat(50.0, 8), _squat(60.0, 5), _squat(45.0, 10)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — 8 reps is the highest count present in both; the heaviest load at it wins
    assert story.axis is StoryAxis.LOAD_AT_REPS
    assert story.held == 8
    assert (story.latest.value, story.previous.value) == (52.5, 50.0)


def test_the_heaviest_load_at_the_shared_rep_count_is_compared():
    # Arrange — several sets of 5 in each session
    history = [
        _session(2, 8, _squat(55.0, 5), _squat(65.0, 5)),
        _session(1, 1, _squat(62.5, 5), _squat(57.5, 5)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert
    assert (story.latest.value, story.previous.value, story.delta) == (65.0, 62.5, 2.5)


def test_a_shared_load_wins_over_a_shared_rep_count():
    # Arrange — the pair shares 60 kg (8 then 10 reps) and also 5 reps (70 then 72.5 kg)
    history = [
        _session(2, 8, _squat(60.0, 10), _squat(72.5, 5)),
        _session(1, 1, _squat(60.0, 8), _squat(70.0, 5)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert
    assert story.axis is StoryAxis.REPS_AT_LOAD
    assert story.held == 60.0
    assert story.delta == 2


def test_the_scan_pairs_with_an_earlier_session_matching_on_reps_only():
    # Arrange — the middle session shares nothing; the oldest shares 5 reps, not a load
    history = [
        _session(3, 15, _squat(65.0, 5)),
        _session(2, 8, _squat(80.0, 2)),
        _session(1, 1, _squat(60.0, 5)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert
    assert story.axis is StoryAxis.LOAD_AT_REPS
    assert story.previous.logged_session_id == 1
    assert story.delta == 5.0


def test_the_scan_skips_a_non_comparable_intermediate_session():
    # Arrange — the session right before the latest shares neither a load nor a rep count
    history = [
        _session(3, 15, _squat(60.0, 10)),
        _session(2, 8, _squat(70.0, 5)),
        _session(1, 1, _squat(60.0, 8)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — the latest pairs with the most recent earlier comparable session
    assert story.kind is StoryKind.IMPROVED
    assert story.axis is StoryAxis.REPS_AT_LOAD
    assert (story.latest.logged_session_id, story.previous.logged_session_id) == (3, 1)
    assert story.delta == 2


def test_a_nearer_rep_count_match_beats_an_older_shared_load():
    # Arrange — the middle session shares only 5 reps; the oldest shares 60 kg
    history = [
        _session(3, 15, _squat(60.0, 5)),
        _session(2, 8, _squat(57.5, 5)),
        _session(1, 1, _squat(60.0, 3)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — "last time" is the nearest comparable session, whichever rule matched
    assert story.axis is StoryAxis.LOAD_AT_REPS
    assert story.previous.logged_session_id == 2
    assert story.delta == 2.5


def test_the_scan_stops_at_the_most_recent_comparable_session():
    # Arrange — both earlier sessions share 60 kg with the latest
    history = [
        _session(3, 15, _squat(60.0, 10)),
        _session(2, 8, _squat(60.0, 9)),
        _session(1, 1, _squat(60.0, 6)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — the nearer one wins, never the oldest
    assert story.previous.logged_session_id == 2
    assert story.delta == 1


def test_no_earlier_comparable_session_is_insufficient():
    # Arrange — three sessions, none sharing a load or a rep count with the latest
    history = [
        _session(3, 15, _squat(60.0, 10)),
        _session(2, 8, _squat(70.0, 5)),
        _session(1, 1, _squat(65.0, 6)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert
    assert story.kind is StoryKind.INSUFFICIENT


def test_the_latest_session_is_found_whatever_the_input_order():
    # Arrange — oldest-first input, and two sessions on one day ordered by id
    history = [
        _session(1, 1, _squat(60.0, 6)),
        _session(2, 8, _squat(60.0, 8)),
        _session(3, 8, _squat(60.0, 9)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert
    assert (story.latest.logged_session_id, story.previous.logged_session_id) == (3, 2)
    assert story.delta == 1


def test_other_exercises_are_ignored():
    # Arrange — the latest session of anything is a press, not a squat
    press = _Set(PRESS, _reps(5), _absolute(60.0))
    history = [
        _session(3, 15, press),
        _session(2, 8, _squat(60.0, 9)),
        _session(1, 1, _squat(60.0, 8)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert
    assert (story.latest.logged_session_id, story.previous.logged_session_id) == (2, 1)


@pytest.mark.parametrize(
    ("load", "quantity"),
    [
        (ParsedLoad(kind=LoadKind.PERCENT_1RM, text="70%", percent=70.0).to_dict(), _reps(8)),
        (ParsedLoad(kind=LoadKind.QUALITATIVE, text="heavy").to_dict(), _reps(8)),
        (
            ParsedLoad(kind=LoadKind.RANGE, text="60-70 kg", low_kg=60.0, high_kg=70.0).to_dict(),
            _reps(8),
        ),
        (
            _absolute(60.0),
            Quantity(kind=QuantityKind.DURATION, text="45s", seconds=45).to_dict(),
        ),
    ],
    ids=["percent_1rm", "qualitative", "range", "duration"],
)
def test_ineligible_sets_are_insufficient(load, quantity):
    # Arrange — the same ineligible set in both sessions
    history = [
        _session(2, 8, _Set(SQUAT, quantity, load)),
        _session(1, 1, _Set(SQUAT, quantity, load)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — nothing exactly comparable, so nothing is guessed
    assert story.kind is StoryKind.INSUFFICIENT


def test_loads_are_equal_only_at_logged_precision():
    # Arrange — 60.25 kg is not 60 kg
    history = [
        _session(2, 8, _squat(60.25, 10)),
        _session(1, 1, _squat(60.0, 8)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert
    assert story.kind is StoryKind.INSUFFICIENT


def test_float_residue_below_logged_precision_does_not_split_a_load():
    # Arrange — 60 lb converted to kilograms on two different paths
    history = [
        _session(2, 8, _squat(60 * 0.45359237, 10)),
        _session(1, 1, _squat(27.2155422 + 1e-9, 8)),
    ]

    # Act
    story = progress_story(history, SQUAT)

    # Assert — the same logged load, so the reps are compared
    assert story.kind is StoryKind.IMPROVED
    assert story.delta == 2


def test_the_payload_carries_the_structured_result():
    # Arrange
    history = [
        _session(2, 8, _squat(60.0, 10)),
        _session(1, 1, _squat(60.0, 8)),
    ]

    # Act
    payload = progress_story_payload(progress_story(history, SQUAT))

    # Assert
    assert payload == {
        "kind": "improved",
        "axis": "reps_at_load",
        "load_kind": "absolute",
        "held": 60.0,
        "delta": 2,
        "latest": {"logged_session_id": 2, "performed_on": "2026-03-08", "value": 10},
        "previous": {"logged_session_id": 1, "performed_on": "2026-03-01", "value": 8},
    }


def test_the_insufficient_payload_claims_nothing():
    # Act
    payload = progress_story_payload(progress_story([], SQUAT))

    # Assert
    assert payload == {
        "kind": "insufficient",
        "axis": None,
        "load_kind": None,
        "held": None,
        "delta": None,
        "latest": None,
        "previous": None,
    }
