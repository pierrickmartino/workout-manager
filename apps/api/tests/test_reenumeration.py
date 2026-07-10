"""Tail re-enumeration for the Protocol Builder (Module A, ADR-0020).

``reenumerate_tail`` is the heart of the Builder's deploy: given the frozen performed
prefix and the desired un-performed tail, it produces the new fully-enumerated Session
list — contiguous ``position``s, positional ``week``/``day`` labels derived from the
grid, and the performed prefix preserved byte-for-byte. It is pure (no I/O) and, per
ADR-0020/0021, treats ``sessions_per_week`` as a soft header, not a rigid invariant:
the enumeration reflects the *actual* per-week Session count, so uneven weeks (deloads)
are legitimate.
"""

from __future__ import annotations

from app.protocols.reenumeration import (
    EnumeratedSession,
    TailSession,
    reenumerate_tail,
)


def _prefix(*specs: tuple[int, int, int, int]) -> list[EnumeratedSession]:
    """Build a performed prefix from ``(session_id, position, week, day)`` tuples."""

    return [
        EnumeratedSession(session_id=sid, position=pos, week=week, day=day)
        for sid, pos, week, day in specs
    ]


def test_enumerates_a_tail_onto_an_empty_prefix():
    # Arrange — nothing performed yet; two new-week Sessions in order
    tail = [
        TailSession(session_id=10, week=1, payload="a"),
        TailSession(session_id=11, week=2, payload="b"),
    ]

    # Act
    result = reenumerate_tail([], tail)

    # Assert — contiguous positions from 0, positional week/day labels
    assert [(s.position, s.week, s.day) for s in result] == [(0, 1, 1), (1, 2, 1)]
    assert [s.payload for s in result] == ["a", "b"]


def test_preserves_the_performed_prefix_byte_for_byte():
    # Arrange — two performed Sessions (the frozen prefix), then an edited tail
    prefix = _prefix((1, 0, 1, 1), (2, 1, 1, 2))
    tail = [TailSession(session_id=3, week=2, payload="x")]

    # Act
    result = reenumerate_tail(prefix, tail)

    # Assert — the prefix Sessions come back the very same objects, untouched
    assert result[:2] == prefix
    assert result[0] is prefix[0] and result[1] is prefix[1]


def test_appends_the_tail_with_contiguous_positions_after_the_prefix():
    # Arrange — three performed Sessions occupy positions 0..2
    prefix = _prefix((1, 0, 1, 1), (2, 1, 1, 2), (3, 2, 1, 3))
    tail = [
        TailSession(session_id=4, week=2, payload="d"),
        TailSession(session_id=5, week=2, payload="e"),
    ]

    # Act
    result = reenumerate_tail(prefix, tail)

    # Assert — positions run unbroken 0..4 across the whole plan
    assert [s.position for s in result] == [0, 1, 2, 3, 4]


def test_labels_new_weeks_positionally_with_days_reset_per_week():
    # Arrange — an empty prefix; a tail placing 2 Sessions in week 1 and 1 in week 2
    tail = [
        TailSession(session_id=1, week=1, payload="a"),
        TailSession(session_id=2, week=1, payload="b"),
        TailSession(session_id=3, week=2, payload="c"),
    ]

    # Act
    result = reenumerate_tail([], tail)

    # Assert — day counts 1..k within a week and resets at the week boundary
    assert [(s.week, s.day) for s in result] == [(1, 1), (1, 2), (2, 1)]


def test_reflects_uneven_per_week_counts_rather_than_a_fixed_frequency():
    # Arrange — a deload shape: week 1 has 3 Sessions, week 2 (deload) has 1
    tail = [
        TailSession(session_id=1, week=1),
        TailSession(session_id=2, week=1),
        TailSession(session_id=3, week=1),
        TailSession(session_id=4, week=2),
    ]

    # Act
    result = reenumerate_tail([], tail)

    # Assert — the enumeration keeps the actual per-week counts (3 then 1), not a
    # rigid sessions_per_week grid (ADR-0020: frequency is a soft header)
    per_week: dict[int, int] = {}
    for session in result:
        per_week[session.week] = per_week.get(session.week, 0) + 1
    assert per_week == {1: 3, 2: 1}


def test_a_tail_continuing_the_prefix_partial_week_picks_up_its_day_count():
    # Arrange — week 1 is partly performed: day 1 done (frozen), days 2..3 un-performed.
    # The tail carries the same client week (1) for the un-performed remainder.
    prefix = _prefix((1, 0, 1, 1))
    tail = [
        TailSession(session_id=2, week=1, payload="d2"),
        TailSession(session_id=3, week=1, payload="d3"),
    ]

    # Act
    result = reenumerate_tail(prefix, tail)

    # Assert — the tail continues week 1 as days 2 and 3 (a straddling week), not a
    # fresh week, and the frozen day 1 is preserved
    assert [(s.week, s.day) for s in result] == [(1, 1), (1, 2), (1, 3)]


def test_compacts_new_weeks_directly_after_the_prefixs_last_week():
    # Arrange — prefix ends at week 2; the client tags new Sessions with a gapped
    # week number (5), as a reshape that skipped weeks might
    prefix = _prefix((1, 0, 1, 1), (2, 1, 2, 1))
    tail = [
        TailSession(session_id=3, week=5, payload="a"),
        TailSession(session_id=4, week=5, payload="b"),
        TailSession(session_id=5, week=8, payload="c"),
    ]

    # Act
    result = reenumerate_tail(prefix, tail)

    # Assert — no fabricated empty weeks: distinct tail weeks map onto 3, then 4
    assert [(s.week, s.day) for s in result[2:]] == [(3, 1), (3, 2), (4, 1)]


def test_carries_new_session_slots_with_a_null_id_through_the_fold():
    # Arrange — a brand-new empty Session slot (session_id None) beside an existing one
    prefix = _prefix((1, 0, 1, 1))
    tail = [
        TailSession(session_id=2, week=2, payload="existing"),
        TailSession(session_id=None, week=2, payload="new-slot"),
    ]

    # Act
    result = reenumerate_tail(prefix, tail)

    # Assert — the new slot enumerates like any other, keeping its null id for insert
    new_session = result[-1]
    assert new_session.session_id is None
    assert (new_session.week, new_session.day) == (2, 2)
    assert new_session.payload == "new-slot"


def test_an_empty_tail_returns_just_the_prefix():
    # Arrange — every Session performed; nothing left to enumerate
    prefix = _prefix((1, 0, 1, 1), (2, 1, 2, 1))

    # Act
    result = reenumerate_tail(prefix, [])

    # Assert
    assert result == prefix
