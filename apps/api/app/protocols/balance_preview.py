"""Balance preview for the Protocol Builder (Module C, ADR-0021).

``SIMULATE`` gives the Builder an **honest, non-predictive** read on the plan the user
has actually assembled: how big it is (per-week Session/Set counts) and how balanced it
is (Muscle-Group distribution across the whole edited Protocol). There is deliberately
**no** fatigue/recovery/volume-projection or 1RM-curve model — the domain has no honest
basis for one (ADR-0021) — so this module only counts and rolls up what is already in
the draft.

The muscle split reuses ``domain/muscle_groups.py`` — the curated six-bucket roll-up
Analytics uses: set-count weighted, each Set split evenly across its Exercise's distinct
groups, percentages summing to 100 with an explicit Unclassified bucket. A draft
Prescription references a catalog Exercise only by id, so the caller injects a
``resolve_muscles`` lookup (id → ``targeted_muscles``); the module never imports the
catalog and stays pure — no I/O, testable with plain stubs.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass, field

from app.domain.muscle_groups import MuscleGroup, distribution
from app.protocols.deploy_validation import DeployDraft


@dataclass(frozen=True)
class WeekBalance:
    """The size of one positional week: how many Sessions it holds and how many Sets
    they prescribe in total."""

    week: int
    session_count: int
    set_count: int


@dataclass(frozen=True)
class BalancePreview:
    """A non-predictive read on the whole edited draft: per-week size and the curated
    Muscle-Group split over every prescribed Set."""

    weeks: list[WeekBalance]
    muscle_distribution: dict[MuscleGroup, float]


@dataclass(frozen=True)
class _Set:
    """One prescribed Set as the Muscle-Group roll-up reads it: just the muscles its
    Exercise trains."""

    targeted_muscles: Sequence[str]


@dataclass(frozen=True)
class _PseudoSession:
    """A carrier of prescribed Sets shaped for ``muscle_groups.distribution`` — the
    grouping into Sessions is irrelevant to a set-count weighted roll-up, so the whole
    draft folds into one."""

    logged_sets: list[_Set] = field(default_factory=list)


def build_balance_preview(
    draft: DeployDraft,
    *,
    resolve_muscles: Callable[[int], Sequence[str]],
) -> BalancePreview:
    """Roll a draft up into its per-week size and Muscle-Group distribution."""

    return BalancePreview(
        weeks=_week_balances(draft),
        muscle_distribution=_muscle_distribution(draft, resolve_muscles),
    )


def _muscle_distribution(
    draft: DeployDraft,
    resolve_muscles: Callable[[int], Sequence[str]],
) -> dict[MuscleGroup, float]:
    """The curated Muscle-Group split over every prescribed Set, reusing the same
    set-count weighted roll-up Analytics uses. Each Prescription expands to its ``sets``
    Sets, all carrying its Exercise's muscles; ``distribution`` then splits each Set
    evenly across that Exercise's distinct groups and normalizes to 100%."""

    sets: list[_Set] = []
    for session in draft.sessions:
        for prescription in session.prescriptions:
            muscles = list(resolve_muscles(prescription.exercise_id))
            sets.extend(
                _Set(targeted_muscles=muscles) for _ in range(prescription.sets)
            )

    return distribution([_PseudoSession(logged_sets=sets)])


def _week_balances(draft: DeployDraft) -> list[WeekBalance]:
    """Per-week Session and Set totals, one row per week that carries a Session, in
    ascending week order."""

    per_week: dict[int, tuple[int, int]] = {}
    for session in draft.sessions:
        session_sets = sum(p.sets for p in session.prescriptions)
        sessions, sets = per_week.get(session.week, (0, 0))
        per_week[session.week] = (sessions + 1, sets + session_sets)

    return [
        WeekBalance(week=week, session_count=counts[0], set_count=counts[1])
        for week, counts in sorted(per_week.items())
    ]


__all__ = [
    "WeekBalance",
    "BalancePreview",
    "build_balance_preview",
]
