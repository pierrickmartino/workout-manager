"""Unit tests for the standalone Session's display-label rule (issue #394).

``session_label`` is the pure fallback the whole app shares: a standalone Session's
user-given **Session Name** when set, else a derived ``training_type · date`` label
so an unnamed Session is never blank. Mirrors ``protocol_label`` (ADR-0021). The My
Sessions search (#393) reuses this same helper, so it is unit-tested here at the
domain seam."""

from __future__ import annotations

from datetime import datetime

from app.domain.session_naming import session_label


def test_returns_the_session_name_when_set():
    # Arrange
    created_at = datetime(2026, 8, 25, 9, 30)

    # Act
    label = session_label("Leg Day", "strength", created_at)

    # Assert
    assert label == "Leg Day"


def test_falls_back_to_training_type_and_date_when_unnamed():
    # Arrange — an unnamed (born-unnamed, never-backfilled) Session
    created_at = datetime(2026, 8, 25, 9, 30)

    # Act
    label = session_label(None, "strength", created_at)

    # Assert — the derived fallback, so the Session is never blank
    assert label == "strength · 2026-08-25"


def test_treats_a_whitespace_only_name_as_unset():
    # Arrange
    created_at = datetime(2026, 1, 2, 0, 0)

    # Act
    label = session_label("   ", "cardio", created_at)

    # Assert — whitespace is not a real name; the fallback stands in
    assert label == "cardio · 2026-01-02"


def test_trims_surrounding_whitespace_from_a_real_name():
    # Arrange
    created_at = datetime(2026, 8, 25, 9, 30)

    # Act
    label = session_label("  Push A  ", "strength", created_at)

    # Assert
    assert label == "Push A"
