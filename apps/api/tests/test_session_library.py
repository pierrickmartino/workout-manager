"""The My Sessions search predicate (Session Library & Sharing, issue #397).

``matches_session_search`` is the pure rule the endpoint filters standalone Sessions
by: a case-insensitive substring over the Session Name, the derived fallback label
(``training_type · date``), and the Training Type. It is exercised here in isolation so
the repository/route stay thin, and so the web view-model's mirror
(``apps/web/lib/session-library.ts``) has a documented parity target."""

from __future__ import annotations

from datetime import datetime, timezone

from app.domain.session_library import matches_session_search

_CREATED = datetime(2026, 8, 25, 12, 0, tzinfo=timezone.utc)


def test_blank_query_matches_every_session():
    # An empty or whitespace-only query imposes no constraint (the full list).
    assert matches_session_search("Leg Day", "strength", _CREATED, "") is True
    assert matches_session_search(None, "cardio", _CREATED, "   ") is True


def test_matches_the_user_given_name_case_insensitively():
    assert matches_session_search("Leg Day A", "strength", _CREATED, "leg") is True
    assert matches_session_search("Leg Day A", "strength", _CREATED, "DAY") is True


def test_matches_the_training_type():
    # Even an unnamed Session is found by its Training Type.
    assert matches_session_search(None, "mobility", _CREATED, "mobil") is True


def test_matches_the_derived_fallback_label_of_an_unnamed_session():
    # A born-unnamed Session reads as "training_type · date"; searching the date finds it.
    assert matches_session_search(None, "cardio", _CREATED, "2026-08-25") is True


def test_matches_the_fallback_label_even_when_the_session_is_named():
    # The fallback label is always searchable, so a named Session is still found by its
    # creation date — the name does not hide the derived label from search (parity target).
    assert (
        matches_session_search("Leg Day A", "strength", _CREATED, "2026-08-25") is True
    )


def test_non_matching_query_excludes_the_session():
    assert matches_session_search("Leg Day A", "strength", _CREATED, "yoga") is False


def test_surrounding_whitespace_in_the_query_is_ignored():
    assert matches_session_search("Leg Day A", "strength", _CREATED, "  leg  ") is True
