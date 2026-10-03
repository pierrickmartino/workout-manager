"""The Calibrate pipeline (CONTEXT §Calibration, ADR-0111).

Calibrate stores a user's **Calibration** — a relative offset from the Protocol's authored
values — and materialises it onto the Protocol's **un-performed tail**. It is the sibling of
``protocols/deploy.py`` and deliberately not it: a Calibration changes **no shape**, so there
is nothing to re-enumerate, no Session to insert or delete, and no ``DeployDraft`` to build.
What it does share is the pieces that must not be re-derived — ``protocol_progress``'s
performed-prefix read and ``deploy_validation``'s floors.

Layered like ``deploy.py``: a **pure** planning tier (``plan_calibration``) folds the resolver
over an already-loaded ``ProtocolProgressView`` and does no I/O, and a thin **service** tier
(``calibrate_protocol``) resolves ownership, reads the history once, plans, and writes.

Three facts the service reads, each answering a different question (ADR-0111):

- the **Fitness Profile**'s per-type Fitness Level, with logged progress folded in exactly as
  generation folds it (``advance_level``), gives the band and so the *magnitude*;
- the user's **recent Completion Outcomes** give the *lever*;
- ``is_sensitive`` gives the **caveat** — never a refusal. A Sensitive Constraint does not gate
  either direction, on ADR-0058's precedent; it is disclosed and the act proceeds.

The anchor is always the **Next Session**, so the tail is every un-performed Session and the
Calibration is one integer on the Protocol rather than a piecewise function over positions.

**Work that arrives later** follows one rule: *the resolver applies to numbers the system
chose, never to numbers the user typed.* Today that rule needs no code. A **Substitution**
changes only the Prescription's ``exercise_id`` (``evolve_prescription_row(p,
exercise_id=…)``), preserving its sets, Quantity and Load — which already carry the standing
Calibration — so a replacement inherits the re-pitch by construction. A Prescription
**hand-authored** through the Builder is persisted verbatim, which is the other half of the
rule and also needs nothing. It becomes live code only if Substitution ever starts supplying
its *own* Load or Quantity; at that point the replacement must be resolved from the authored
pitch (``standing=0, desired=<the stored offset>``) before it is written.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from app.config import get_settings
from app.domain.calibration import (
    MAX_CALIBRATION,
    MIN_CALIBRATION,
    CalibrationLever,
    PrescriptionPitch,
    calibrate_prescription,
    clamp_calibration,
    level_band,
    resolve_lever,
)
from app.domain.fitness_profile import advance_level, is_sensitive
from app.protocols.deploy_validation import DeployError
from app.protocols.progress import (
    ProtocolProgressView,
    progressed_protocol,
    protocol_progress,
)
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.protocol_repository import CalibrationSpec, ProtocolRepository

#: How many of the user's most recent Logged Sessions the lever reads. A short window, so a
#: single bad week stops steering the plan once it is behind the user — the same posture as
#: Progression reading only the latest exposure rather than the whole history.
RECENT_WINDOW = 3


class CalibrationStatus(str, Enum):
    """The outcome of a Calibrate call.

    ``UNCHANGED`` is not a failure and not a no-op dressed as success: the user asked for an
    offset they already stand at (or one the clamp resolves to it), so there is nothing to
    write and the plan is already correct. The route reports it as success with the plan
    untouched, which is also what makes the control idempotent at the rail.
    """

    CALIBRATED = "calibrated"
    UNCHANGED = "unchanged"
    REJECTED = "rejected"
    NOT_FOUND = "not_found"


@dataclass(frozen=True)
class CalibrationPlan:
    """The pure tier's verdict: the clamped offset and the rows to rewrite."""

    standing: int
    desired: int
    lever: CalibrationLever
    band: str
    pitches: list[CalibrationSpec] = field(default_factory=list)
    performed_session_ids: frozenset[int] = frozenset()

    @property
    def at_rail(self) -> bool:
        """Whether the clamp refused part of what was asked — the one moment a Calibration
        is not silent (ADR-0111). A control that stops responding without saying so is a
        defect, and the rail is also where the Fitness Level fold takes over."""

        return self.desired in (MIN_CALIBRATION, MAX_CALIBRATION)


@dataclass(frozen=True)
class CalibrationResult:
    """What the route needs: a status, the re-read plan, and the disclosures."""

    status: CalibrationStatus
    protocol: object | None = None
    calibration: int = 0
    at_rail: bool = False
    # ADR-0058's posture, carried to the client as copy rather than enforced as a gate: a
    # user with any Sensitive Constraint re-pitches in both directions, with a caveat.
    sensitive_caveat: bool = False
    errors: list[DeployError] = field(default_factory=list)

    @classmethod
    def not_found(cls) -> CalibrationResult:
        return cls(status=CalibrationStatus.NOT_FOUND)

    @classmethod
    def rejected(cls, errors: list[DeployError]) -> CalibrationResult:
        return cls(status=CalibrationStatus.REJECTED, errors=list(errors))


def plan_calibration(
    progress: ProtocolProgressView,
    *,
    desired: int,
    lever: CalibrationLever,
    band: str,
) -> CalibrationPlan:
    """Fold the resolver over the un-performed tail — pure, no I/O.

    The tail is every Session with no advancing Logged Session behind it, which *is* the run
    from the Next Session onward (the performed sequence is gap-free, ADR-0034), so the anchor
    needs no separate position arithmetic. A performed Session is never pitched: ADR-0020's
    frozen prefix is enforced here and again in the repository.

    Returns a plan even when nothing moves — ``pitches`` is simply empty, which the service
    reads as ``UNCHANGED``. It never raises and never rejects: a pure fold has no vocabulary
    for refusal, and the floors it respects are the resolver's own.
    """

    standing = clamp_calibration(progress.protocol.calibration or 0)
    end = clamp_calibration(desired)

    pitches: list[CalibrationSpec] = []
    if standing != end:
        for session in progress.protocol.sessions:
            if session.session_id in progress.performed_session_ids:
                continue
            for prescription in session.prescriptions:
                pitched = calibrate_prescription(
                    _pitch_of(prescription),
                    standing=standing,
                    desired=end,
                    lever=lever,
                    band=band,
                )
                pitches.append(
                    CalibrationSpec(
                        session_id=session.session_id,
                        position=prescription.position,
                        sets=pitched.sets,
                        recommended_load=pitched.recommended_load,
                        prescribed_quantity=pitched.prescribed_quantity,
                        rest_seconds=pitched.rest_seconds,
                        target_effort=pitched.target_effort,
                    )
                )

    return CalibrationPlan(
        standing=standing,
        desired=end,
        lever=lever,
        band=band,
        pitches=pitches,
        performed_session_ids=progress.performed_session_ids,
    )


def validate_calibration(plan: CalibrationPlan) -> list[DeployError]:
    """Hold the planned tail to Deploy's own floors (ADR-0020/0111).

    The resolver already floors ``sets`` at one, so this is a **tripwire, not a remedy**: if a
    rule ever lets a Calibration prescribe a Session the Builder would refuse to deploy, the
    write is rejected whole rather than persisting a plan the rest of the app treats as
    invalid. Deploy's reject-whole-nothing-persisted posture, kept.
    """

    return [
        DeployError(
            code="invalid_sets",
            message=(
                f"A Calibration would leave {pitch.sets} sets at position "
                f"{pitch.position}; a Session keeps at least one."
            ),
        )
        for pitch in plan.pitches
        if pitch.sets < 1
    ]


def calibrate_protocol(
    clerk_user_id: str,
    protocol_id: int,
    desired: int,
    *,
    protocols: ProtocolRepository,
    logged: LoggedSessionRepository,
    profiles: ProfileRepository,
) -> CalibrationResult:
    """Re-pitch the owner's Protocol to the ``desired`` offset (the service tier).

    Resolves ownership and reads the history once via ``protocol_progress``; a missing or
    non-owned Protocol yields ``not_found``. Reads the profile for the band and the
    Sensitive-Constraint caveat, the recent record for the lever, plans, validates, and
    writes — returning the re-read **progressed** view so the client sees the calibrated plan
    with the Progression overlay already on top of it, which is the composition ADR-0111
    chose materialisation for.
    """

    progress = protocol_progress(
        clerk_user_id, protocol_id, protocols=protocols, logged=logged
    )
    if progress is None:
        return CalibrationResult.not_found()

    profile = profiles.get_or_create(clerk_user_id)
    history = logged.list_for_user(clerk_user_id)

    # The same fold generation uses, so a user who has progressed is re-pitched in the band
    # their next Protocol would be cached at — never a second, divergent notion of "level".
    levels = advance_level(
        profile.fitness_levels,
        history,
        sessions_per_notch=get_settings().strong_sessions_per_level,
    )
    band = level_band(levels.get(progress.protocol.training_type, 0))
    lever = resolve_lever(_recent_outcomes(history))

    plan = plan_calibration(progress, desired=desired, lever=lever, band=band)

    errors = validate_calibration(plan)
    if errors:
        return CalibrationResult.rejected(errors)

    caveat = is_sensitive(profile)
    if not plan.pitches:
        return CalibrationResult(
            status=CalibrationStatus.UNCHANGED,
            protocol=progressed_protocol(
                clerk_user_id, protocol_id, protocols=protocols, logged=logged
            ),
            calibration=plan.standing,
            at_rail=plan.at_rail,
            sensitive_caveat=caveat,
        )

    written = protocols.calibrate_tail(
        protocol_id,
        clerk_user_id,
        calibration=plan.desired,
        performed_session_ids=set(plan.performed_session_ids),
        pitches=plan.pitches,
    )
    if written is None:  # ownership was checked above; defensive only
        return CalibrationResult.not_found()

    return CalibrationResult(
        status=CalibrationStatus.CALIBRATED,
        protocol=progressed_protocol(
            clerk_user_id, protocol_id, protocols=protocols, logged=logged
        ),
        calibration=plan.desired,
        at_rail=plan.at_rail,
        sensitive_caveat=caveat,
    )


def _pitch_of(prescription) -> PrescriptionPitch:
    """Project a ``PrescriptionView`` down to the calibratable spine (ADR-0069/0111)."""

    return PrescriptionPitch(
        sets=prescription.sets,
        reps=prescription.reps,
        recommended_load=prescription.recommended_load,
        prescribed_quantity=prescription.prescribed_quantity,
        rest_seconds=prescription.rest_seconds,
        target_effort=prescription.target_effort,
    )


def _recent_outcomes(history) -> list[str]:
    """The Completion Outcomes of the user's most recent Logged Sessions.

    Capped at ``RECENT_WINDOW``, relying on the repository's documented
    most-recently-performed-first order rather than re-sorting it. An **undeclared** outcome
    is skipped rather than read as Completed: it predates the Completion Outcome, and
    asserting capacity from a record that never declared any would be guessing — the same
    honesty as leaving a muscle Unclassified.
    """

    return [
        entry.completion_outcome
        for entry in history[:RECENT_WINDOW]
        if entry.completion_outcome is not None
    ]


__all__ = [
    "RECENT_WINDOW",
    "CalibrationPlan",
    "CalibrationResult",
    "CalibrationStatus",
    "calibrate_protocol",
    "plan_calibration",
    "validate_calibration",
]
