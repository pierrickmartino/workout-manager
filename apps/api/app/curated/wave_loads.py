"""A wave Curated Protocol's weights, computed once from a recent working set (ADR-0130).

``percent_1rm`` Loads are never written to the plan, and an Estimated 1RM exists only once a
user has records (ADR-0010), so the wave program asks for a recent working set per main lift
instead. From it ``wave_reference_kg`` derives a **reference** weight, once: a share of the
set's Epley Estimated 1RM, the one yardstick every strength surface reads. ``wave_dose`` then
gives any week its sets, reps and **absolute** kilograms: the week's share of the reference,
rounded down to a loadable increment and never below the empty bar, plus the lift's fixed increment once per completed
cycle. The increment is blind: nothing here reads whether the user hit their reps, which the
Curated Protocol's description discloses (Calibrate re-pitches it, ADR-0111).

Pure: no I/O."""

from __future__ import annotations

from dataclasses import dataclass

from app.curated.loading import floor_to_loadable
from app.curated.model import Wave
from app.domain.one_rep_max import estimate_1rm


@dataclass(frozen=True)
class WorkingSet:
    """A recent working set the user enters for a main lift: ``kg`` lifted for ``reps``."""

    kg: float
    reps: int


@dataclass(frozen=True)
class WaveDose:
    """One week of one main lift: ``sets`` × ``reps`` at ``kg``."""

    sets: int
    reps: str
    kg: float


def wave_reference_kg(wave: Wave, working_set: WorkingSet) -> float:
    """The lift's reference weight: ``wave.reference_share`` of the working set's Estimated
    1RM. Callers validate the reps into the trustworthy window first."""

    estimate = estimate_1rm(working_set.kg, working_set.reps)
    if estimate is None:
        raise ValueError(f"{working_set.reps} reps carry no trustworthy Estimated 1RM.")
    return estimate * wave.reference_share


def wave_dose(wave: Wave, reference_kg: float, cycle_increment_kg: float, week: int) -> WaveDose:
    """Week ``week`` (from 1) of a lift with ``reference_kg``: the wave's week within the
    cycle, at its share of the reference rounded down to a loadable weight (never below the
    wave's ``min_kg``), plus ``cycle_increment_kg`` for every cycle already done."""

    cycle, index = divmod(week - 1, wave.cycle_weeks)
    wave_week = wave.weeks[index]
    base = max(floor_to_loadable(reference_kg * wave_week.share), wave.min_kg)
    return WaveDose(
        sets=wave_week.sets, reps=wave_week.reps, kg=base + cycle * cycle_increment_kg
    )


__all__ = ["WorkingSet", "WaveDose", "wave_reference_kg", "wave_dose"]
