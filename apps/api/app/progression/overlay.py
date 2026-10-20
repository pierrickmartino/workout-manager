"""The read-time Progression overlay (ADR-0004, ADR-0064): one user's record, read once,
answering what each Prescription should ask for at its next outing.

``ProgressionOverlay.from_history`` takes the user's already-loaded Logged Sessions
(newest-first, the repository contract) and does no I/O, so a request reads the history
once however many Prescriptions it projects (ADR-0018). ``progress`` then resolves the
Prescription's stored **Progression Scheme**, steps it through the scheme registry from
the Exercise's latest sets and exposure count, floors a barbell at the empty bar, and
returns the adjusted view together with the scheme's harder-Variation offer. Every caller
— the Protocol view, the live hydration and the harder-Variation offer — goes through
here, so the scheme decides the offer the same way it decides the step.

The overlay is read-only: it returns fresh view objects and never mutates the stored plan
or the cached Generated artifact behind it. No AI, no HTTP."""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace

from app.domain.equipment import Equipment, canonical_equipment
from app.domain.load import parse_load
from app.domain.loadable import EMPTY_BAR_KG
from app.domain.progression import floored_at, next_prescription, resolve_scheme
from app.repositories.logged_session_repository import (
    LoggedSessionView,
    LoggedSetView,
)
from app.repositories.session_repository import PrescriptionView


@dataclass(frozen=True)
class ProgressedPrescription:
    """A Prescription stepped for its next outing, plus its scheme's harder-Variation offer.

    ``suggests_harder_variation`` is the *offer* only (ADR-0026): the movement is never
    auto-swapped, and ``prescription`` holds at its ceiling when the offer fires."""

    prescription: PrescriptionView
    suggests_harder_variation: bool


@dataclass(frozen=True)
class _LoadedPrescription:
    """The minimal shape ``next_prescription`` reads: rep target and free-text load."""

    reps: str
    recommended_load: str | None


@dataclass(frozen=True)
class ProgressionOverlay:
    """The user's record, indexed by Exercise for the Progression step."""

    _latest_sets: Mapping[int, list[LoggedSetView]]
    _exposure_counts: Mapping[int, int]

    @classmethod
    def from_history(
        cls, logged_sessions: list[LoggedSessionView]
    ) -> ProgressionOverlay:
        """Index an already-loaded, newest-first history. Pure: no I/O.

        Every performance is read — Incomplete ones included — because the sets done
        inside an Incomplete Session are real history; only advancement keys off a
        Completed log (ADR-0013), and that is the Protocol view's concern."""

        return cls(
            _latest_sets=_latest_sets_by_exercise(logged_sessions),
            _exposure_counts=_exposure_counts_by_exercise(logged_sessions),
        )

    def previous_sets(self, exercise_id: int) -> list[LoggedSetView]:
        """The Logged Sets from the Exercise's most recent performance — the previous
        performance to beat — or an empty list when it has never been logged."""

        return self._latest_sets.get(exercise_id, [])

    def progress(self, prescription: PrescriptionView) -> ProgressedPrescription:
        """Step ``prescription`` through its stored Progression Scheme.

        A null selection resolves to the default (Double Progression). The step reads the
        free-text load and rep target and returns the stepped values: an external-weight
        load moves its kg, a weighted-bodyweight load its added kg, and a pure-bodyweight
        movement its rep target (ADR-0026); %-1RM, ranges and qualitative loads are left
        untouched, and a Static scheme holds every axis and never offers a harder
        Variation. Session-Count-Based steps on the Exercise's count of performed
        exposures. A barbell is never stepped below the empty bar (ADR-0131). The stepped
        load text is re-typed through :func:`parse_load`, so the view keeps a typed Load
        end to end."""

        load = prescription.recommended_load
        load_text = load["text"] if load else None
        result = next_prescription(
            _LoadedPrescription(reps=prescription.reps, recommended_load=load_text),
            self.previous_sets(prescription.exercise_id),
            resolve_scheme(prescription.scheme),
            self._exposure_counts.get(prescription.exercise_id, 0),
        )
        # A barbell can't be loaded under its own weight, so no step takes it below the bar.
        if Equipment.BARBELL in canonical_equipment(prescription.required_equipment):
            result = floored_at(result, load_text, EMPTY_BAR_KG)
        adjusted_load = (
            parse_load(result.recommended_load).to_dict()
            if result.recommended_load is not None
            else None
        )
        return ProgressedPrescription(
            prescription=replace(
                prescription, reps=result.reps, recommended_load=adjusted_load
            ),
            suggests_harder_variation=result.suggest_harder_variation,
        )


def _latest_sets_by_exercise(
    logged_sessions: list[LoggedSessionView],
) -> dict[int, list[LoggedSetView]]:
    """Each Exercise → the Logged Sets from its most recent performance.

    ``logged_sessions`` arrives newest-first, so the first time an Exercise is seen
    wins: the user's latest sets for that movement drive its next step."""

    latest: dict[int, list[LoggedSetView]] = {}
    for session in logged_sessions:
        by_exercise: dict[int, list[LoggedSetView]] = {}
        for logged_set in session.logged_sets:
            by_exercise.setdefault(logged_set.exercise_id, []).append(logged_set)
        for exercise_id, sets in by_exercise.items():
            latest.setdefault(exercise_id, sets)
    return latest


def _exposure_counts_by_exercise(
    logged_sessions: list[LoggedSessionView],
) -> dict[int, int]:
    """Each Exercise → its count of **performed exposures**, the Session-Count input.

    Each Logged Session carrying at least one set for the Exercise counts once, however
    many sets it holds (ADR-0064). Calendar-free: only a training layoff (no Session at
    all) fails to advance it, never elapsed time."""

    counts: dict[int, int] = {}
    for session in logged_sessions:
        for exercise_id in {ls.exercise_id for ls in session.logged_sets}:
            counts[exercise_id] = counts.get(exercise_id, 0) + 1
    return counts


__all__ = ["ProgressionOverlay", "ProgressedPrescription"]
