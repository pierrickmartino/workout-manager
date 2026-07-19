"""The shared Superset validator (ADR-0023): the single source of truth for what a
valid Superset is, consumed by the DEPLOY gate (and, later, the generation parse
boundary).

A Superset is an ordered group of 2+ *contiguous* Prescriptions sharing a group tag,
performed in rounds — so every member has an equal set count (N rounds), and the
group owns a single round-rest. ``validate_supersets`` is a pure function: it takes
the session's Prescriptions (each with its group tag, set count, and round-rest) and
returns a typed list of every structural violation, located to the offending group.
An empty list means "every group is a valid Superset". Its signature already accepts
``has_sensitive_constraint`` so the interface is stable; the safety-suppression
*behaviour* lands in Slice 4 (this slice leaves it allowed).
"""

from __future__ import annotations

from app.domain.superset import (
    SupersetMember,
    validate_supersets,
)


def _member(**overrides) -> SupersetMember:
    base = dict(position=0, superset_group=None, sets=3, round_rest_seconds=None)
    base.update(overrides)
    return SupersetMember(**base)


def _grouped(group: str, positions, *, sets=3, round_rest=90):
    """A contiguous, well-formed group of members sharing ``group``."""

    return [
        _member(
            position=position,
            superset_group=group,
            sets=sets,
            round_rest_seconds=round_rest,
        )
        for position in positions
    ]


def test_a_well_formed_two_member_superset_has_no_violations():
    # Arrange — two contiguous members, equal sets, a single shared round-rest
    members = _grouped("A", [0, 1])

    # Act
    violations = validate_supersets(members)

    # Assert
    assert violations == []


def test_ungrouped_prescriptions_have_no_violations():
    # Arrange — a flat Session: every Prescription is solo (no group tag)
    members = [_member(position=0), _member(position=1), _member(position=2)]

    # Act
    violations = validate_supersets(members)

    # Assert — nothing to validate; a flat plan is always fine
    assert violations == []


def test_a_lone_one_member_group_is_rejected():
    # Arrange — a single Prescription carries a group tag (a Superset needs 2+)
    members = [_member(position=0, superset_group="A", round_rest_seconds=90)]

    # Act
    violations = validate_supersets(members)

    # Assert — located to the lone group, and *only* that code fires
    assert [v.code for v in violations] == ["superset_lone_member"]
    assert violations[0].group == "A"
    assert violations[0].position == 0


def test_non_contiguous_members_are_rejected():
    # Arrange — group "A" at positions 0 and 2, with a solo Prescription at 1 between
    members = [
        _member(position=0, superset_group="A", sets=3, round_rest_seconds=90),
        _member(position=1, superset_group=None, sets=3),
        _member(position=2, superset_group="A", sets=3, round_rest_seconds=90),
    ]

    # Act
    violations = validate_supersets(members)

    # Assert — the group is not a contiguous block
    assert [v.code for v in violations] == ["superset_non_contiguous"]
    assert violations[0].group == "A"


def test_uneven_member_set_counts_are_rejected():
    # Arrange — two contiguous members whose set counts differ (ragged rounds)
    members = [
        _member(position=0, superset_group="A", sets=3, round_rest_seconds=90),
        _member(position=1, superset_group="A", sets=4, round_rest_seconds=90),
    ]

    # Act
    violations = validate_supersets(members)

    # Assert — equal set counts are what makes "round" a clean invariant (ADR-0023)
    assert [v.code for v in violations] == ["superset_uneven_sets"]
    assert violations[0].group == "A"


def test_a_missing_round_rest_is_rejected():
    # Arrange — a contiguous, equal-count group with no round-rest set
    members = [
        _member(position=0, superset_group="A", sets=3, round_rest_seconds=None),
        _member(position=1, superset_group="A", sets=3, round_rest_seconds=None),
    ]

    # Act
    violations = validate_supersets(members)

    # Assert — the group owns a single round-rest; it must be present
    assert [v.code for v in violations] == ["superset_missing_round_rest"]
    assert violations[0].group == "A"


def test_a_three_member_superset_is_valid():
    # Arrange — the umbrella term covers many members, not just two (ADR-0023)
    members = _grouped("A", [0, 1, 2])

    # Act
    violations = validate_supersets(members)

    # Assert
    assert violations == []


def test_only_the_offending_group_is_reported_among_several():
    # Arrange — a valid group "A" (0,1) and a lone group "B" (3) around a solo (2)
    members = [
        *_grouped("A", [0, 1]),
        _member(position=2, superset_group=None),
        _member(position=3, superset_group="B", round_rest_seconds=90),
    ]

    # Act
    violations = validate_supersets(members)

    # Assert — the valid group is silent; only "B" is named
    assert [v.code for v in violations] == ["superset_lone_member"]
    assert violations[0].group == "B"


def test_a_valid_group_is_forbidden_under_a_sensitive_constraint():
    # Arrange — a structurally-valid Superset, but the user carries a Sensitive
    # Constraint. Supersets compress rest and raise intensity, so they are a safety
    # rule of the same class as the cache bypass (ADR-0003): forbidden outright,
    # regardless of shape.
    members = _grouped("A", [0, 1])

    # Act
    violations = validate_supersets(members, has_sensitive_constraint=True)

    # Assert — the group is named as forbidden, located to its first member
    assert [v.code for v in violations] == [
        "superset_forbidden_under_sensitive_constraint"
    ]
    assert violations[0].group == "A"
    assert violations[0].position == 0


def test_a_flat_plan_is_allowed_under_a_sensitive_constraint():
    # Arrange — a Sensitive-Constraint user with no Supersets at all
    members = [_member(position=0), _member(position=1), _member(position=2)]

    # Act
    violations = validate_supersets(members, has_sensitive_constraint=True)

    # Assert — the gate only forbids grouping; a flat plan is untouched
    assert violations == []


def test_the_forbidden_gate_reports_once_per_group_not_per_structural_flaw():
    # Arrange — a Sensitive-Constraint user with a group that is *also* structurally
    # invalid (uneven set counts). The safety gate is the dominant reason; the group
    # should be named forbidden once, not buried under shape violations.
    members = [
        _member(position=0, superset_group="A", sets=3, round_rest_seconds=90),
        _member(position=1, superset_group="A", sets=4, round_rest_seconds=90),
    ]

    # Act
    violations = validate_supersets(members, has_sensitive_constraint=True)

    # Assert — a single forbidden violation for the group
    assert [v.code for v in violations] == [
        "superset_forbidden_under_sensitive_constraint"
    ]
    assert violations[0].group == "A"


def test_a_non_sensitive_user_keeps_a_valid_group():
    # Arrange — the same valid group, flag unset (a non-medical Preference / Limitation
    # never sets it): grouping stays allowed.
    members = _grouped("A", [0, 1])

    # Act
    violations = validate_supersets(members, has_sensitive_constraint=False)

    # Assert
    assert violations == []
