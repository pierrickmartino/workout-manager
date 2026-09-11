"""Unit tests for the Set Type domain value (ADR-0065, CONTEXT: Set Type).

Set Type is a curated, closed enum — warm-up / working / drop / failure / AMRAP —
with an unset→working resolution and no default-inventing parse for the write boundary.
It is descriptive only: these tests pin membership and the two boundary behaviours, and
deliberately assert nothing about Progression or analytics (Set Type feeds neither yet).
"""

from __future__ import annotations

import pytest

from app.domain.set_type import (
    DEFAULT_SET_TYPE,
    SetType,
    is_warm_up,
    parse_set_type,
    resolve_set_type,
)


def test_curated_catalog_is_exactly_the_five_v1_members() -> None:
    # Arrange / Act
    members = {member.value for member in SetType}

    # Assert — the closed v1 set, never user- or AI-extended.
    assert members == {"warm_up", "working", "drop", "failure", "amrap"}


def test_default_set_type_is_working() -> None:
    # Assert — an unset Set Type reads as a working set, so no existing row shifts.
    assert DEFAULT_SET_TYPE is SetType.WORKING


@pytest.mark.parametrize("member", list(SetType))
def test_parse_round_trips_every_member(member: SetType) -> None:
    # A stored value is only ever a member's own ``value``; parsing returns it exactly.
    assert parse_set_type(member.value) is member


def test_parse_none_is_none_no_default_invented() -> None:
    # Unlike ``resolve_set_type``, parse does not default a null selection — the write
    # boundary must be able to store "unset" (NULL) rather than a coerced "working".
    assert parse_set_type(None) is None


def test_parse_blank_is_none() -> None:
    # A blank/whitespace selection is the un-annotated default, normalized to unset.
    assert parse_set_type("") is None
    assert parse_set_type("   ") is None


@pytest.mark.parametrize("unknown", ["superset", "circuit", "Working", "WARMUP", "5+"])
def test_parse_unknown_is_none_never_coerced(unknown: str) -> None:
    # A present-but-unknown value is rejected (``None``) so a validator can 422 it —
    # never silently coerced to working.
    assert parse_set_type(unknown) is None


def test_resolve_unset_is_working() -> None:
    # The read-side resolution: unset (NULL) reads as working.
    assert resolve_set_type(None) is SetType.WORKING


@pytest.mark.parametrize("member", list(SetType))
def test_resolve_a_stored_member_is_that_member(member: SetType) -> None:
    assert resolve_set_type(member.value) is member


def test_resolve_unknown_falls_back_to_working() -> None:
    # A stored value is only ever written through the validated boundary, but the read
    # path stays total: an unrecognized string reads as working rather than raising.
    assert resolve_set_type("nonsense") is SetType.WORKING


def test_is_warm_up_true_only_for_a_warm_up_set() -> None:
    # The one member with an analytics consequence (ADR-0065): a warm-up leaves
    # working-set Volume and strength records.
    assert is_warm_up(SetType.WARM_UP.value) is True


@pytest.mark.parametrize(
    "value", [None, "", "   ", "working", "drop", "failure", "amrap", "nonsense"]
)
def test_is_warm_up_false_for_everything_else(value: str | None) -> None:
    # Unset (→ working), every other member, and an unrecognized value are all
    # working-set analytics candidates — only ``warm_up`` leaves them.
    assert is_warm_up(value) is False
