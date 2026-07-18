"""The shared Superset validator (ADR-0023).

A **Superset** is a round-major overlay on a Session's Prescriptions: an ordered
group of two or more *contiguous* Prescriptions sharing a group tag, performed in
rounds — one set of each member in turn — with a single group-owned round-rest. This
module holds the *one* definition of "what a valid Superset is", so the DEPLOY gate
and (later) the generation parse boundary validate against a single source of truth
rather than two drifting copies.

``validate_supersets`` is pure — no I/O. It reads the Session's members (each a group
tag, a set count, and the group's round-rest) and returns every structural violation,
located to the offending group. An empty list means every group is a valid Superset.

The rules (ADR-0023):

- **≥2 members** — a lone tagged Prescription is not a Superset.
- **Contiguous** — a group's members occupy an unbroken run of positions; free reorder
  can pull a member out from between others, so contiguity is validated, not assumed.
- **Equal set counts** — a Superset is exactly N rounds, so every member has N sets.
- **One round-rest** — the group owns a single round-rest, which must be present.

The signature also accepts ``has_sensitive_constraint``: a user with any Sensitive
Constraint is never given a Superset (a safety rule of the same class as the cache
bypass, ADR-0003). That parameter is accepted here so the interface is stable, but the
suppression *behaviour* lands in a later slice; this slice does not act on it.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

MIN_SUPERSET_MEMBERS = 2


@dataclass(frozen=True)
class SupersetMember:
    """One Prescription as the validator reads it: its position in the Session, the
    group tag it carries (``None`` when solo), its set count, and the group-owned
    round-rest (denormalized onto each member so it is reorder-stable)."""

    position: int
    superset_group: str | None
    sets: int
    round_rest_seconds: int | None


@dataclass(frozen=True)
class SupersetViolation:
    """One structural reason a group is not a valid Superset, located to the group
    and its first (lowest-position) member. ``code`` is a stable machine tag."""

    code: str
    message: str
    group: str
    position: int


def validate_supersets(
    members: Sequence[SupersetMember],
    *,
    has_sensitive_constraint: bool = False,
) -> list[SupersetViolation]:
    """Return every structural Superset violation in ``members``, or ``[]`` if valid.

    ``has_sensitive_constraint`` is accepted to keep the interface stable; the
    safety-suppression behaviour it will drive lands in a later slice (ADR-0023), so
    it does not affect the result here.
    """

    violations: list[SupersetViolation] = []
    for group, group_members in _groups(members).items():
        violations.extend(_group_violations(group, group_members))
    return violations


def _groups(
    members: Sequence[SupersetMember],
) -> dict[str, list[SupersetMember]]:
    """Members bucketed by their group tag, first-appearance order, solos dropped."""

    grouped: dict[str, list[SupersetMember]] = {}
    for member in members:
        if member.superset_group is None:
            continue
        grouped.setdefault(member.superset_group, []).append(member)
    return grouped


def _group_violations(
    group: str, members: list[SupersetMember]
) -> list[SupersetViolation]:
    """Every violation for one tagged group, located to its first member."""

    ordered = sorted(members, key=lambda member: member.position)
    anchor = ordered[0].position

    # A lone group cannot be any other kind of Superset problem — report only that,
    # so a one-member group never also trips the round-rest/set-count checks.
    if len(ordered) < MIN_SUPERSET_MEMBERS:
        return [
            SupersetViolation(
                code="superset_lone_member",
                message=(
                    f"Superset '{group}' has only one member; a Superset needs at "
                    "least two Exercises."
                ),
                group=group,
                position=anchor,
            )
        ]

    violations: list[SupersetViolation] = []

    positions = [member.position for member in ordered]
    if positions[-1] - positions[0] + 1 != len(positions):
        violations.append(
            SupersetViolation(
                code="superset_non_contiguous",
                message=(
                    f"Superset '{group}' members must be contiguous — no other "
                    "Exercise may sit between them."
                ),
                group=group,
                position=anchor,
            )
        )

    if len({member.sets for member in ordered}) > 1:
        violations.append(
            SupersetViolation(
                code="superset_uneven_sets",
                message=(
                    f"Superset '{group}' members must have equal set counts — a "
                    "Superset is exactly N rounds."
                ),
                group=group,
                position=anchor,
            )
        )

    if any(member.round_rest_seconds is None for member in ordered):
        violations.append(
            SupersetViolation(
                code="superset_missing_round_rest",
                message=(
                    f"Superset '{group}' needs a round-rest — the group rests once "
                    "per round, not between members."
                ),
                group=group,
                position=anchor,
            )
        )

    return violations


__all__ = [
    "MIN_SUPERSET_MEMBERS",
    "SupersetMember",
    "SupersetViolation",
    "validate_supersets",
]
