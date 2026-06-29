"""Profile & Level domain rules.

The one rule that lives here is the derivation of the generation *safety
bypass*: a user with any Sensitive Constraint (injury, rehabilitation,
postpartum, flagged medical) is never served shared/cached content (ADR-0003).
Per that decision the specific constraint *types* are stored, and the boolean
bypass gate is **derived** from them — never persisted as a standalone flag."""

from __future__ import annotations

from enum import Enum
from typing import Protocol


class SensitiveConstraintType(str, Enum):
    """The specific constraint types that trigger the safety bypass."""

    INJURY = "injury"
    REHABILITATION = "rehabilitation"
    POSTPARTUM = "postpartum"
    FLAGGED_MEDICAL = "flagged_medical"


SENSITIVE_CONSTRAINT_TYPES: frozenset[str] = frozenset(
    member.value for member in SensitiveConstraintType
)


class _HasSensitiveConstraints(Protocol):
    sensitive_constraints: list[str]


def is_sensitive(profile: _HasSensitiveConstraints) -> bool:
    """Whether ``profile`` carries any Sensitive Constraint.

    Derived from the stored constraint types: ``True`` if at least one stored
    constraint is a recognized sensitive type. Preferences / Limitations are a
    separate field and never make a profile sensitive.
    """

    return any(
        constraint in SENSITIVE_CONSTRAINT_TYPES
        for constraint in profile.sensitive_constraints
    )
