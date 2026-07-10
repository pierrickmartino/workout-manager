"""The derived Protocol label (Module H, ADR-0021, F4 Slice 5).

A Protocol gains a user-editable ``name``; every read path that shows a Protocol
falls back to a derived ``objective · training_type`` label when the name is unset,
so an existing adopted Protocol (never named, never backfilled) still reads
sensibly. ``protocol_label`` is that single pure fallback rule — no I/O, no ORM."""

from __future__ import annotations

from app.domain.protocol import protocol_label


def test_returns_the_name_when_set():
    # Arrange / Act
    label = protocol_label("Summer Cut", "gain muscle mass", "strength")

    # Assert — a named Protocol reads as its name
    assert label == "Summer Cut"


def test_falls_back_to_objective_and_training_type_when_name_is_none():
    # Arrange / Act — an existing adopted Protocol never named
    label = protocol_label(None, "gain muscle mass", "strength")

    # Assert — the derived label joins objective and training type
    assert label == "gain muscle mass · strength"


def test_falls_back_when_name_is_blank_or_whitespace():
    # A name the user cleared to whitespace is not a real name.
    assert protocol_label("", "lose fat", "cardio") == "lose fat · cardio"
    assert protocol_label("   ", "lose fat", "cardio") == "lose fat · cardio"


def test_trims_surrounding_whitespace_from_a_real_name():
    assert protocol_label("  My Plan  ", "gain muscle mass", "strength") == "My Plan"
