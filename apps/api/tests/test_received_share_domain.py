"""The Received-Share safety caveat as a pure domain fact (ADR-0058, CONTEXT: Redeem).

A Redeem is *shared generation*, which ADR-0003 would hard-block for a Sensitive-Constraint
user. ADR-0058 is the deliberate carve-out: the Redeem is **never blocked**, but a redeemer
**with** a Sensitive Constraint receives the copy under a mandatory caveat — *built for another
user, not tailored to your constraints*. This exercises the pure rule that decides whether the
caveat applies as a function of the redeemer's Sensitive-Constraint state — no repository, no
ORM — reusing the same ADR-0003 detection the generation cache-bypass uses (``is_sensitive``).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from app.domain.fitness_profile import SensitiveConstraintType
from app.domain.received_share import (
    RECEIVED_SHARE_CAVEAT,
    redeem_caveat,
)


@dataclass
class _ProfileStub:
    """The one field the caveat rule reads — the stored Sensitive-Constraint types."""

    sensitive_constraints: list[str] = field(default_factory=list)


def test_unconstrained_redeemer_gets_no_caveat():
    # Arrange — a redeemer with no Sensitive Constraint at all.
    profile = _ProfileStub(sensitive_constraints=[])

    # Act
    caveat = redeem_caveat(profile)

    # Assert — the copy is an ordinary saved Session; nothing is flagged.
    assert caveat.applies is False
    assert caveat.message is None


def test_constrained_redeemer_gets_the_mandatory_caveat():
    # Arrange — a redeemer carrying a recognized Sensitive Constraint.
    profile = _ProfileStub(
        sensitive_constraints=[SensitiveConstraintType.INJURY.value]
    )

    # Act
    caveat = redeem_caveat(profile)

    # Assert — the caveat applies and carries the canonical "built for another user" message.
    assert caveat.applies is True
    assert caveat.message == RECEIVED_SHARE_CAVEAT


@pytest.mark.parametrize("constraint_type", list(SensitiveConstraintType))
def test_every_sensitive_constraint_type_triggers_the_caveat(constraint_type):
    profile = _ProfileStub(sensitive_constraints=[constraint_type.value])

    assert redeem_caveat(profile).applies is True


def test_a_non_sensitive_limitation_never_triggers_the_caveat():
    # A plain preference / limitation is a separate field and never makes a profile sensitive,
    # so it must not raise the caveat either (reuses the same is_sensitive boundary).
    profile = _ProfileStub(sensitive_constraints=["no running"])

    assert redeem_caveat(profile).applies is False


def test_the_rule_never_blocks_it_only_flags():
    # The caveat rule is a pure classification: for either state it *returns* a decision and
    # never raises — ADR-0058's core promise that a Redeem is never blocked.
    for constraints in ([], ["injury"], ["no running"]):
        assert redeem_caveat(_ProfileStub(sensitive_constraints=constraints)) is not None
