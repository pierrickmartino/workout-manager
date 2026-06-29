"""Behavior of the Profile & Level domain module: the derived ``is_sensitive``
predicate that gates the generation safety bypass (ADR-0003). The bypass is
*derived* from the stored specific constraint types, never a standalone
boolean."""

from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from app.domain.fitness_profile import (
    SensitiveConstraintType,
    is_sensitive,
)


@dataclass
class _ProfileStub:
    """Minimal stand-in carrying only what ``is_sensitive`` reads."""

    sensitive_constraints: list[str] = field(default_factory=list)


def test_profile_with_no_constraints_is_not_sensitive():
    # Arrange
    profile = _ProfileStub(sensitive_constraints=[])

    # Act / Assert
    assert is_sensitive(profile) is False


def test_profile_with_a_sensitive_type_is_sensitive():
    # Arrange
    profile = _ProfileStub(
        sensitive_constraints=[SensitiveConstraintType.INJURY.value]
    )

    # Act / Assert
    assert is_sensitive(profile) is True


@pytest.mark.parametrize("constraint_type", list(SensitiveConstraintType))
def test_every_sensitive_type_triggers_the_bypass(constraint_type):
    # Arrange
    profile = _ProfileStub(sensitive_constraints=[constraint_type.value])

    # Act / Assert
    assert is_sensitive(profile) is True


def test_unrecognized_constraint_string_does_not_make_profile_sensitive():
    # Arrange — a free-text preference accidentally landing in the wrong field
    profile = _ProfileStub(sensitive_constraints=["no running"])

    # Act / Assert
    assert is_sensitive(profile) is False
