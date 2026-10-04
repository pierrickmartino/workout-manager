"""Profile & Level domain rules.

Two rules live here, and both are *derived* from stored data rather than persisted
as standalone values:

- The generation *safety bypass*: a user with any Sensitive Constraint (injury,
  rehabilitation, postpartum, flagged medical) is never served shared/cached
  content (ADR-0003). The specific constraint *types* are stored; the boolean gate
  is derived from them.
- The **Effective Fitness Level**: ``effective_fitness_levels`` reads, per training type,
  the **Declared Fitness Level** plus net evidence from a window of the most recent
  Logged Sessions *of that type* (ADR-0004 §2, settled by ADR-0112). It is a read-time
  projection — nothing is stored, no write hook fires — so re-reading one history is
  idempotent and correcting a mis-logged Session corrects the level in the same instant.
  No raw logged history ever reaches AI generation; adaptation flows only through this
  coarse level.

The module is **pure**: no ORM, no HTTP, and no clock. The window is counted in sessions
and never in days, because there is no "today" (ADR-0001)."""

from __future__ import annotations

from enum import Enum
from typing import Mapping, Protocol, Sequence

from app.domain.completion import CompletionOutcome
from app.domain.effort import HIGH_EFFORT_MIN
from app.domain.progression import LOW_EFFORT_MAX


class Gender(str, Enum):
    """The allowed Gender choices on the Fitness Profile.

    A constrained vocabulary (stored as the raw value, like the constraint
    types): gender is optional, but when set it must be one of these. Demographic
    input to generation, never a safety gate."""

    MALE = "M"
    FEMALE = "F"


class SensitiveConstraintType(str, Enum):
    """The specific constraint types that trigger the safety bypass."""

    INJURY = "injury"
    REHABILITATION = "rehabilitation"
    POSTPARTUM = "postpartum"
    FLAGGED_MEDICAL = "flagged_medical"


SENSITIVE_CONSTRAINT_TYPES: frozenset[str] = frozenset(
    member.value for member in SensitiveConstraintType
)


class HasSensitiveConstraints(Protocol):
    """The one structural contract the Sensitive-Constraint gate reads: the stored constraint
    types. Shared so every derivation of "sensitive" (the generation cache-bypass here and the
    ADR-0058 Received-Share caveat) types against the same shape and can never drift."""

    sensitive_constraints: list[str]


def is_sensitive(profile: HasSensitiveConstraints) -> bool:
    """Whether ``profile`` carries any Sensitive Constraint.

    Derived from the stored constraint types: ``True`` if at least one stored
    constraint is a recognized sensitive type. Preferences / Limitations are a
    separate field and never make a profile sensitive.
    """

    return any(
        constraint in SENSITIVE_CONSTRAINT_TYPES
        for constraint in profile.sensitive_constraints
    )


def resolve_equipment(
    request_equipment: list[str] | None, default_equipment: list[str]
) -> list[str]:
    """Resolve the Available Equipment for one generation (CONTEXT: Available Equipment).

    A request that states no equipment (``None``) inherits the user's saved
    Default Equipment. A request that *states* equipment is honored literally —
    including an explicitly empty list, which is a real bodyweight-only choice, not
    an absence (ADR-0038). Returns a new list; neither input is mutated.
    """

    if request_equipment is None:
        return list(default_equipment)
    return list(request_equipment)


# Fitness Level is a 1–10 score; earned notches never push a type past the ceiling.
MAX_FITNESS_LEVEL = 10

# How many *net* comfortable Logged Sessions of a training type earn one Fitness Level
# notch, and equally the quorum below which a window is read as no evidence at all.
# Tunable from the environment (``STRONG_SESSIONS_PER_LEVEL``, see ``config.Settings``)
# so the cadence can be adjusted without a code change; the env name predates ADR-0112's
# two-directional rule and is kept for the deployments that already set it.
DEFAULT_STRONG_SESSIONS_PER_LEVEL = 3

# How many of a training type's most recent Logged Sessions the Effective level reads.
# Settled at twelve by ADR-0112 — four notches' worth at the default cadence, which is the
# "at most four notches above a Declared floor" bound that ADR records as the accepted cost
# of the wider cache spread. Counted in sessions, never in days (ADR-0001). Tunable from
# the environment (``EFFECTIVE_LEVEL_WINDOW``, see ``config.Settings``).
DEFAULT_EFFECTIVE_LEVEL_WINDOW = 12


class _LoggedSetSignal(Protocol):
    """The one field the effort axis reads: the logged Effort as an RPE number.

    No scale branch is needed here. The log write boundary dual-writes a typed Effort
    (ADR-0066) and mirrors its RPE-equivalent into ``perceived_difficulty``, so a set
    logged as "1 RIR" already reads as RPE 9 by the time it reaches this module."""

    perceived_difficulty: int | None


class _LoggedSessionRecord(Protocol):
    """The Logged Session fields the Effective level reads: its type, its declared
    Completion Outcome (ADR-0013), and its sets."""

    training_type: str
    completion_outcome: str | None
    logged_sets: Sequence[_LoggedSetSignal]


def effective_fitness_levels(
    declared_levels: Mapping[str, int],
    logged_sessions: Sequence[_LoggedSessionRecord],
    *,
    sessions_per_notch: int = DEFAULT_STRONG_SESSIONS_PER_LEVEL,
    window: int = DEFAULT_EFFECTIVE_LEVEL_WINDOW,
) -> dict[str, int]:
    """Read each training type's **Effective Fitness Level** from the recent record.

    **Precondition: ``logged_sessions`` is ordered newest-performed first** — the flat,
    all-types history ``LoggedSessionRepository.list_for_user`` returns. This function
    does its own per-type grouping and windowing, so it takes that history exactly as
    both call sites already hold it; but it reads the *first* ``window`` Sessions of each
    type as "the most recent", and so a change to that ordering would silently mis-window
    every user rather than fail. Asserted by a test, not trusted to a docstring.

    Returns a new mapping — the Declared baseline is never mutated — so the projection is
    idempotent over one history and nothing is ever written back (ADR-0018).

    Per training type, over its window of most recent Sessions (ADR-0112):

    - **Quorum** — fewer Sessions in the window than ``sessions_per_notch`` means the
      Effective level *is* the Declared level; it falls out of the notch arithmetic rather
      than needing a guard (see ``_earned_notches``). A type with no history keeps its
      Declared level, so a user's first day reads at exactly what they stated.
    - **Comfortable** — declared ``Completed``, **and** at least one set rated, **and**
      every rated set at or below ``LOW_EFFORT_MAX``. All three conjuncts, so a Session
      with nothing rated is never comfortable by vacuous truth: finishing the prescribed
      work says the level is *right*, not that it is too low.
    - **Strained** — declared ``Incomplete``, **or** any set rated at or above
      ``HIGH_EFFORT_MIN``. Mutually exclusive with comfortable by construction.
    - **Notches** — comfortable minus strained, divided by ``sessions_per_notch``, floored
      at zero. The integer division is also the only stability on offer: it gives every
      notch a multi-session plateau, where a deadband would need the *previous* value and
      so the stored ledger ADR-0018 forbids.
    - **Effective** — Declared plus those notches, capped at ``MAX_FITNESS_LEVEL``. The
      Declared level is a **floor**: strained Sessions withdraw earned credit and never
      read a user as less able than they say they are.

    An unrated set **abstains** rather than disqualifying its Session, because the rating
    is optional at the log boundary; a wholly unrated Session is neutral on effort yet
    still counted on its Completion Outcome — "no effort evidence" is not "no session".
    """

    effective = dict(declared_levels)

    for training_type, recent in _windows(logged_sessions, window).items():
        notches = _earned_notches(recent, sessions_per_notch)
        if notches == 0:
            continue
        declared = effective.get(training_type, 0)
        effective[training_type] = min(declared + notches, MAX_FITNESS_LEVEL)

    return effective


def _windows(
    logged_sessions: Sequence[_LoggedSessionRecord], window: int
) -> dict[str, list[_LoggedSessionRecord]]:
    """Group a flat newest-first history into each type's own window of recent Sessions.

    One type's Sessions never consume another's window: the cap is applied per type, so a
    user who trains strength and yoga alternately is read on a full window of each.
    """

    windows: dict[str, list[_LoggedSessionRecord]] = {}
    for session in logged_sessions:
        recent = windows.setdefault(session.training_type, [])
        if len(recent) < window:
            recent.append(session)
    return windows


def _earned_notches(
    recent: Sequence[_LoggedSessionRecord], sessions_per_notch: int
) -> int:
    """Net evidence over one type's window, as whole Fitness Level notches.

    The **quorum** needs no guard of its own: a window yields at most one verdict per
    Session, so net evidence can never exceed the window's own length, and a window
    shorter than ``sessions_per_notch`` therefore divides to zero notches by arithmetic.

    The two verdicts are read independently rather than as an ``if``/``else``, so their
    mutual exclusion stays a property of the predicates — which a test asserts — instead
    of being imposed here, where an overlap would be silently absorbed.
    """

    net = 0
    for session in recent:
        if _is_comfortable(session):
            net += 1
        if _is_strained(session):
            net -= 1

    # Floor the *net* before dividing: Python's integer division rounds toward negative
    # infinity, so dividing a negative net first would read -1 as a whole notch lost.
    return max(net, 0) // sessions_per_notch


def _is_comfortable(session: _LoggedSessionRecord) -> bool:
    """Whether a Session is evidence the level is too low: finished, rated, and easy."""

    if session.completion_outcome != CompletionOutcome.COMPLETED.value:
        return False
    rated = _rated_efforts(session)
    if not rated:
        return False
    return all(effort <= LOW_EFFORT_MAX for effort in rated)


def _is_strained(session: _LoggedSessionRecord) -> bool:
    """Whether a Session is evidence the level is too high: unfinished, or ground out."""

    if session.completion_outcome == CompletionOutcome.INCOMPLETE.value:
        return True
    return any(effort >= HIGH_EFFORT_MIN for effort in _rated_efforts(session))


def _rated_efforts(session: _LoggedSessionRecord) -> list[int]:
    """The Session's rated efforts, as RPE numbers. An unrated set simply abstains."""

    return [
        logged_set.perceived_difficulty
        for logged_set in session.logged_sets
        if logged_set.perceived_difficulty is not None
    ]
