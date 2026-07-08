"""Experience — the XP + Operator Level engine, derived read-time (F5 Slice 2).

XP is the honest experience currency of an account: a single accumulating figure that
is a pure **read-time** function of the user's Logged Sessions and Logged Sets, never a
stored, awarded, or write-hooked balance (ADR-0018). Like a Personal Record it is a
projection of the *record* — a corrected, back-dated, or deleted log simply recomputes
it — so it can never drift from what the user actually logged, and it is **non-monotonic**
(removing logs lowers it).

``total_xp`` counts training-type-neutral units only: a flat ``SESSION_XP`` per Logged
Session plus ``PER_SET_XP`` per attempted Logged Set. Its input is *only* the per-session
attempted-set counts, so it is blind to load kind, training type, live-vs-static logging,
and Completion Outcome by construction — a yoga session and a barbell session of equal
size earn the same, and an Incomplete Session still earns for the sets it attempted (work
performed, not plan adherence).

``operator_level`` maps that XP onto the account-wide **Operator Level** — an escalating,
unbounded, **closed-form** curve with no stored table. Level ``L`` begins at
``LEVEL_CURVE_K × (L - 1)²`` XP, so each level costs progressively more than the last;
the ``xp_into_level / xp_span_of_level`` ratio is the progress-bar fill. Distinct from the
per-training-type **Fitness Level** (ability); Operator Level is one number for the whole
account and measures *investment* (see ``CONTEXT.md`` / ADR-0018).

The constants are module-level, tunable defaults — the mechanics are honest, the exact
numbers are expected to be tuned. Pure and dependency-free: no ORM, no HTTP."""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass

# Tunable XP constants: what one Logged Session and one attempted Logged Set are worth.
SESSION_XP = 100
PER_SET_XP = 10

# Tunable level-curve constant. Level ``L`` starts at ``LEVEL_CURVE_K × (L - 1)²`` XP, so
# a bigger K stretches every level out. Governs how fast Operator Level climbs.
LEVEL_CURVE_K = 400


@dataclass(frozen=True)
class OperatorLevel:
    """Where a given XP total sits on the Operator Level curve.

    ``level`` is the account-wide tier (1-based, unbounded). ``xp_into_level`` is how far
    past this level's start the XP has climbed and ``xp_span_of_level`` is the width of
    this level, so ``xp_into_level / xp_span_of_level`` is the progress-bar fill toward
    the next level; ``xp_to_next`` is the XP still owed to reach it.
    """

    level: int
    xp_into_level: int
    xp_span_of_level: int
    xp_to_next: int


def operator_level(xp: int) -> OperatorLevel:
    """Map ``xp`` onto the Operator Level curve — closed-form, unbounded, no table.

    Level ``L`` begins at ``LEVEL_CURVE_K × (L - 1)²`` XP, so the current level is
    ``isqrt(xp // K) + 1`` (exact integer arithmetic) and each level is wider than the
    one before it — early levels come quickly, later ones are earned. ``xp = 0`` is
    Level 1 with an empty bar. Because ``xp`` is itself non-monotonic, so is the level:
    removing logs can drop it back down.
    """

    xp = max(0, xp)
    steps = math.isqrt(xp // LEVEL_CURVE_K)  # floor(sqrt(xp / K)); the level minus one
    level_start = LEVEL_CURVE_K * steps**2
    next_start = LEVEL_CURVE_K * (steps + 1) ** 2
    return OperatorLevel(
        level=steps + 1,
        xp_into_level=xp - level_start,
        xp_span_of_level=next_start - level_start,
        xp_to_next=next_start - xp,
    )


def total_xp(attempted_sets_per_session: Iterable[int]) -> int:
    """Return the account's total XP over its Logged Sessions.

    Each element of ``attempted_sets_per_session`` is the number of attempted Logged
    Sets in one Logged Session; every session earns a flat ``SESSION_XP`` plus
    ``PER_SET_XP`` per attempted set. Because the input carries nothing but counts, the
    figure is training-type-neutral, live-vs-static-neutral, and outcome-neutral — an
    Incomplete Session still contributes the XP of the sets it attempted. A user who has
    logged nothing earns ``0``.
    """

    total = 0
    for attempted_sets in attempted_sets_per_session:
        total += SESSION_XP + PER_SET_XP * attempted_sets
    return total


__all__ = [
    "SESSION_XP",
    "PER_SET_XP",
    "LEVEL_CURVE_K",
    "OperatorLevel",
    "operator_level",
    "total_xp",
]
