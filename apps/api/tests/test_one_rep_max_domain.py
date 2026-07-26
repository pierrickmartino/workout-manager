"""Estimated 1RM (F3 Slice 4 / F6) — the single comparable strength figure derived
from one Logged Set's absolute Load and integer reps.

``estimate_1rm`` is the Epley estimate (``kg × (1 + reps/30)``) with reps=1 treated
as the trivial identity — a one-rep lift *is* the 1RM, not an estimate of it. The
estimate is only trustworthy in the 1–12 rep window; outside it (AMRAP / high-rep
sets) the function returns ``None`` rather than a number the domain shouldn't trust.
Pure and dependency-free."""

from __future__ import annotations

from app.domain.one_rep_max import estimate_1rm


def test_a_single_rep_returns_the_load_itself():
    # Arrange — a true single: the load lifted for one rep is the 1RM by definition
    load_kg = 100.0

    # Act
    estimate = estimate_1rm(load_kg, 1)

    # Assert — no estimation applied at one rep; the 1RM is the load
    assert estimate == 100.0


def test_a_multi_rep_set_estimates_up_via_epley():
    # Arrange — 100 kg for 10 reps; Epley = 100 × (1 + 10/30)
    load_kg = 100.0

    # Act
    estimate = estimate_1rm(load_kg, 10)

    # Assert — the estimated single is heavier than the working weight
    assert estimate == 100.0 * (1 + 10 / 30)


def test_twelve_reps_is_the_last_trustworthy_point():
    # Arrange — 12 reps is the top of the trustworthy window
    load_kg = 60.0

    # Act
    estimate = estimate_1rm(load_kg, 12)

    # Assert — still estimated, not dropped
    assert estimate == 60.0 * (1 + 12 / 30)


def test_high_rep_sets_are_untrustworthy_and_return_none():
    # Arrange / Act — 13 reps is just past the trustworthy window (an AMRAP-ish set)
    estimate = estimate_1rm(60.0, 13)

    # Assert — no number the domain would treat as comparable
    assert estimate is None


def test_a_non_set_of_zero_reps_returns_none():
    # Arrange / Act — zero reps is not a performed set
    estimate = estimate_1rm(60.0, 0)

    # Assert
    assert estimate is None


def test_a_set_with_no_rep_count_returns_none():
    # Arrange / Act — a set whose amount is not a rep count (a run, a hold) reaches
    # here as reps=None via the Quantity accessor; it carries no Estimated 1RM.
    estimate = estimate_1rm(60.0, None)

    # Assert — the None rep-window path degrades to None, never a TypeError
    assert estimate is None
