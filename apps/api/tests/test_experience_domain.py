"""The Experience domain (F5 Slice 2) — the XP + Operator Level engine, honestly.

``total_xp`` sums a training-type-neutral experience currency over the user's Logged
Sessions: a flat amount per Session plus an amount per attempted Logged Set. The input
is *only* the per-session attempted-set counts, so XP is blind to load kind, training
type, live-vs-static logging, and Completion Outcome by construction — a yoga session
and a barbell session of equal size earn the same, and an Incomplete Session still earns
for the sets it attempted. ``operator_level`` maps total XP onto an escalating, unbounded
closed-form curve with no stored table.

These tests feed constructed histories and assert the projected numbers, referencing the
tunable module constants only to place inputs at observable level thresholds — never
reaching into the curve's internals. Prior art: ``test_personal_records_domain.py``."""

from __future__ import annotations

from app.domain.experience import (
    LEVEL_CURVE_K,
    PER_SET_XP,
    SESSION_XP,
    operator_level,
    total_xp,
)


def test_xp_accrues_per_session_and_per_attempted_set():
    # Arrange — two Logged Sessions, one of 3 attempted sets and one of 2
    history = [3, 2]

    # Act
    xp = total_xp(history)

    # Assert — a flat amount per session plus a per-set amount over 5 sets
    assert xp == 2 * SESSION_XP + 5 * PER_SET_XP


def test_empty_history_earns_no_xp():
    # Arrange / Act / Assert — a brand-new user with nothing logged earns 0, not an error
    assert total_xp([]) == 0


def test_xp_is_type_neutral_equal_sized_sessions_earn_equally():
    # Arrange — a "yoga" session and a "barbell" session, each 4 attempted sets. XP is
    # blind to training type and load kind by construction (the input is only counts).
    yoga_session = [4]
    barbell_session = [4]

    # Act / Assert — equal work earns equal XP regardless of imagined training type
    assert total_xp(yoga_session) == total_xp(barbell_session)


def test_incomplete_session_still_earns_for_its_attempted_sets():
    # Arrange — an Incomplete Session that got through 2 of its planned sets earns the
    # same as any Session with 2 attempted sets: XP credits work performed, not adherence
    incomplete_session_attempted = [2]

    # Act / Assert
    assert total_xp(incomplete_session_attempted) == SESSION_XP + 2 * PER_SET_XP


def test_zero_xp_is_level_one_with_an_empty_bar():
    # Arrange / Act — a brand-new user's zero XP
    level = operator_level(0)

    # Assert — Level 1, nothing into the level yet, a positive span so the bar renders
    assert level.level == 1
    assert level.xp_into_level == 0
    assert level.xp_span_of_level > 0
    assert level.xp_to_next == level.xp_span_of_level


def test_level_ticks_over_exactly_at_the_threshold():
    # Arrange — Level 2 begins at LEVEL_CURVE_K XP (the curve's first threshold)
    just_below = operator_level(LEVEL_CURVE_K - 1)
    at_threshold = operator_level(LEVEL_CURVE_K)

    # Assert — one XP short is still Level 1 (all but full); the threshold itself is
    # Level 2 with a freshly-empty bar
    assert just_below.level == 1
    assert just_below.xp_to_next == 1
    assert at_threshold.level == 2
    assert at_threshold.xp_into_level == 0


def test_levels_get_wider_as_they_climb():
    # Arrange — the span of Level 1 vs the span of Level 2
    level_one_span = operator_level(0).xp_span_of_level
    level_two_span = operator_level(LEVEL_CURVE_K).xp_span_of_level

    # Assert — an escalating curve: each level costs more XP than the one before it
    assert level_two_span > level_one_span


def test_progress_into_a_level_is_the_bar_fill():
    # Arrange — exactly halfway through Level 1's span
    halfway = operator_level(LEVEL_CURVE_K // 2)

    # Assert — the into/span ratio (the progress-bar fill) reads as half, and into +
    # remaining always reconstitutes the whole span
    assert halfway.level == 1
    assert halfway.xp_into_level * 2 == halfway.xp_span_of_level
    assert halfway.xp_into_level + halfway.xp_to_next == halfway.xp_span_of_level


def test_removing_a_session_lowers_xp_and_can_lower_level():
    # Arrange — a history rich enough to sit a few levels up, then the same history with
    # most of it deleted. XP is a pure projection of the record, so deletion recomputes
    # downward (ADR-0018) and can pull the derived Operator Level back down with it.
    full_history = [8] * 12
    after_deletion = [8]

    # Act
    full = operator_level(total_xp(full_history))
    reduced = operator_level(total_xp(after_deletion))

    # Assert — deleting logs strictly lowers both the XP and the level it maps to
    assert total_xp(after_deletion) < total_xp(full_history)
    assert reduced.level < full.level
