"""Profile & Level domain rules.

Two rules live here, and both are *derived* from stored data rather than persisted
as standalone values:

- The generation *safety bypass*: a user with any Sensitive Constraint (injury,
  rehabilitation, postpartum, flagged medical) is never served shared/cached
  content (ADR-0003). The specific constraint *types* are stored; the boolean gate
  is derived from them.
- *Level folding*: ``advance_level`` folds sustained strong logged progress into the
  per-training-type Fitness Level (ADR-0004). The advanced level is derived from the
  baseline level plus the logged history each time it is needed (chiefly when keying
  generation), so the baseline stays the user's declared "now" and re-deriving from
  the same history is idempotent — no double counting. No raw logged history ever
  reaches AI generation; adaptation flows only through this coarse level."""

from __future__ import annotations

from enum import Enum
from typing import Mapping, Protocol, Sequence

from app.domain.progression import LOW_EFFORT_MAX


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


# Fitness Level is a 1–10 score; folding never pushes a type past the ceiling.
MAX_FITNESS_LEVEL = 10

# "Sustained" defaults to this many strong logged sessions of a training type per
# one Fitness Level notch. Tunable from the environment (see ``config.Settings``)
# so the folding cadence can be adjusted without a code change.
DEFAULT_STRONG_SESSIONS_PER_LEVEL = 3


class _LoggedSetSignal(Protocol):
    perceived_difficulty: int | None


class _LoggedSessionRecord(Protocol):
    training_type: str
    logged_sets: Sequence[_LoggedSetSignal]


def advance_level(
    fitness_levels: Mapping[str, int],
    logged_sessions: Sequence[_LoggedSessionRecord],
    *,
    sessions_per_notch: int = DEFAULT_STRONG_SESSIONS_PER_LEVEL,
) -> dict[str, int]:
    """Return per-type Fitness Levels with sustained strong progress folded in.

    Returns a new mapping (the baseline is never mutated). Types with no logged
    progress keep their baseline level.

    A logged session counts as *strong* when it was performed comfortably — every
    Logged Set at low perceived effort (the same ``LOW_EFFORT_MAX`` RPE threshold
    Progression uses to add load). Every ``sessions_per_notch`` strong sessions of a
    training type folds into one Fitness Level notch, capped at ``MAX_FITNESS_LEVEL``.
    """

    advanced = dict(fitness_levels)
    strong_counts: dict[str, int] = {}
    for session in logged_sessions:
        if _is_strong(session):
            strong_counts[session.training_type] = (
                strong_counts.get(session.training_type, 0) + 1
            )

    for training_type, count in strong_counts.items():
        earned = count // sessions_per_notch
        if earned == 0:
            continue
        baseline = advanced.get(training_type, 0)
        advanced[training_type] = min(baseline + earned, MAX_FITNESS_LEVEL)

    return advanced


def _is_strong(session: _LoggedSessionRecord) -> bool:
    """Whether a logged session was performed comfortably at low perceived effort.

    Empty sessions never count; a single hard or unrated set is enough to disqualify
    one — advancement is the optimistic direction, so it demands clean evidence.
    """

    if not session.logged_sets:
        return False
    return all(
        logged_set.perceived_difficulty is not None
        and logged_set.perceived_difficulty <= LOW_EFFORT_MAX
        for logged_set in session.logged_sets
    )
