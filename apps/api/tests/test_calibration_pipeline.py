"""Behavior of the Calibrate pipeline module (``app.protocols.calibration``).

Calibrate stores a **Calibration** — a relative offset from a Protocol's authored values —
and materialises it onto the Protocol's **un-performed tail** (CONTEXT §Calibration,
ADR-0111). It follows the two-tier convention of ``protocols/deploy.py`` and
``protocols/progress.py``: a **pure** planning tier (``plan_calibration``) that folds the
resolver over an already-loaded ``ProtocolProgressView`` with no I/O, and a thin **service**
tier (``calibrate_protocol``) that resolves ownership, reads the history once, plans and
writes.

The invariants under test:

- the **performed prefix is never pitched** (ADR-0020), in the pure tier *and* again in the
  repository, which is where the defence-in-depth matters;
- the anchor is the **Next Session**, so one integer re-pitches the whole remaining plan;
- nothing is written when the offset does not move, and ``UNCHANGED`` says so honestly;
- a Sensitive Constraint yields a **caveat, never a refusal**, in both directions
  (ADR-0058's precedent);
- the band comes from the **folded** Fitness Level — the same fold generation keys on — so a
  user is never re-pitched in one band and cached in another;
- the Calibration **survives a re-read** and stacks.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.domain.calibration import (
    EASIER_STEP_KG,
    HARDER_STEP_KG,
    MAX_CALIBRATION,
    MIN_CALIBRATION,
    CalibrationLever,
)
from app.domain.completion import CompletionOutcome
from app.domain.exercise import Provenance
from app.domain.load import parse_load
from app.domain.quantity import quantity_from_text
from app.protocols.calibration import (
    CalibrationStatus,
    calibrate_protocol,
    plan_calibration,
    validate_calibration,
)
from app.protocols.progress import protocol_progress
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from app.repositories.protocol_repository import (
    InMemoryProtocolRepository,
    ProtocolDraft,
    ProtocolSessionDraft,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
)

USER = "user_calibrate"


# ------------------------------------------------------------------------ fixtures


@pytest.fixture()
def exercises() -> InMemoryExerciseRepository:
    repo = InMemoryExerciseRepository()
    repo.find_or_create(
        "Back Squat", provenance=Provenance.CURATED, targeted_muscles=["quads"]
    )
    return repo


@pytest.fixture()
def protocols(exercises: InMemoryExerciseRepository) -> InMemoryProtocolRepository:
    return InMemoryProtocolRepository(exercises)


@pytest.fixture()
def logged(exercises: InMemoryExerciseRepository) -> InMemoryLoggedSessionRepository:
    return InMemoryLoggedSessionRepository(
        InMemorySessionRepository(exercises), exercises
    )


@pytest.fixture()
def profiles() -> InMemoryProfileRepository:
    return InMemoryProfileRepository()


def _prescription(exercise_id: int, *, sets: int = 3, load: str = "60 kg") -> PrescriptionDraft:
    return PrescriptionDraft(
        exercise_id=exercise_id,
        sets=sets,
        reps="8-12",
        rest_seconds=90,
        recommended_load=parse_load(load).to_dict(),
    )


def _protocol(
    protocols: InMemoryProtocolRepository, *, sessions: int = 3, load: str = "60 kg"
):
    """A strength Protocol of ``sessions`` identical Sessions, each one movement."""

    return protocols.create(
        USER,
        ProtocolDraft(
            training_type="strength",
            objective="hypertrophy",
            sessions_per_week=3,
            weeks=1,
            duration_minutes=60,
            sessions=[
                ProtocolSessionDraft(
                    week=1,
                    day=index + 1,
                    prescriptions=[_prescription(1, load=load)],
                )
                for index in range(sessions)
            ],
        ),
    )


def _perform(
    logged: InMemoryLoggedSessionRepository,
    session_id: int,
    *,
    outcome: str = CompletionOutcome.COMPLETED.value,
) -> None:
    logged.create(
        USER,
        LoggedSessionDraft(
            session_id=session_id,
            training_type="strength",
            performed_on=date(2026, 9, 1),
            completion_outcome=outcome,
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=1,
                    quantity=quantity_from_text("10").to_dict(),
                    load=parse_load("60 kg").to_dict(),
                )
            ],
        ),
    )


def _loads(protocol) -> list[float | None]:
    """Each Session's single prescription's absolute kilograms, in position order."""

    return [
        parse_load(session.prescriptions[0].recommended_load["text"]).kg
        for session in protocol.sessions
    ]


# ----------------------------------------------------------------- the pure tier


class TestPlanCalibration:
    """``plan_calibration`` folds the resolver over a loaded view and does no I/O."""

    def test_pitches_every_un_performed_prescription(
        self, protocols: InMemoryProtocolRepository, logged, profiles
    ) -> None:
        _protocol(protocols, sessions=3)
        progress = protocol_progress(USER, 1, protocols=protocols, logged=logged)

        plan = plan_calibration(
            progress, desired=-1, lever=CalibrationLever.LOAD, band="intermediate"
        )

        assert len(plan.pitches) == 3

    def test_never_pitches_a_performed_session(
        self, protocols: InMemoryProtocolRepository, logged
    ) -> None:
        created = _protocol(protocols, sessions=3)
        _perform(logged, created.sessions[0].session_id)
        progress = protocol_progress(USER, 1, protocols=protocols, logged=logged)

        plan = plan_calibration(
            progress, desired=-1, lever=CalibrationLever.LOAD, band="intermediate"
        )

        pitched = {pitch.session_id for pitch in plan.pitches}
        assert created.sessions[0].session_id not in pitched
        assert len(plan.pitches) == 2

    def test_plans_nothing_when_the_offset_does_not_move(
        self, protocols: InMemoryProtocolRepository, logged
    ) -> None:
        _protocol(protocols)
        progress = protocol_progress(USER, 1, protocols=protocols, logged=logged)

        plan = plan_calibration(
            progress, desired=0, lever=CalibrationLever.LOAD, band="intermediate"
        )

        assert plan.pitches == []

    def test_clamps_an_out_of_range_request_rather_than_rejecting_it(
        self, protocols: InMemoryProtocolRepository, logged
    ) -> None:
        _protocol(protocols)
        progress = protocol_progress(USER, 1, protocols=protocols, logged=logged)

        plan = plan_calibration(
            progress, desired=99, lever=CalibrationLever.LOAD, band="intermediate"
        )

        assert plan.desired == MAX_CALIBRATION

    def test_reports_the_rail(
        self, protocols: InMemoryProtocolRepository, logged
    ) -> None:
        _protocol(protocols)
        progress = protocol_progress(USER, 1, protocols=protocols, logged=logged)

        assert plan_calibration(
            progress, desired=MIN_CALIBRATION, lever=CalibrationLever.LOAD, band="beginner"
        ).at_rail
        assert not plan_calibration(
            progress, desired=1, lever=CalibrationLever.LOAD, band="beginner"
        ).at_rail

    def test_the_planned_tail_clears_deploys_floors(
        self, protocols: InMemoryProtocolRepository, logged
    ) -> None:
        """The resolver floors sets at one, so the tripwire finds nothing — which is the
        point of keeping it: it fails loudly if a future rule stops flooring."""

        _protocol(protocols)
        progress = protocol_progress(USER, 1, protocols=protocols, logged=logged)

        plan = plan_calibration(
            progress, desired=-3, lever=CalibrationLever.VOLUME, band="advanced"
        )

        assert validate_calibration(plan) == []


# -------------------------------------------------------------- the service tier


class TestCalibrateProtocol:
    def test_materialises_the_offset_onto_the_tail(
        self, protocols, logged, profiles
    ) -> None:
        _protocol(protocols, sessions=2, load="60 kg")
        profiles.get_or_create(USER)

        result = calibrate_protocol(
            USER, 1, -1, protocols=protocols, logged=logged, profiles=profiles
        )

        assert result.status is CalibrationStatus.CALIBRATED
        # A level-less profile bands as beginner, the conservative band.
        assert _loads(result.protocol.protocol) == [
            60 - EASIER_STEP_KG["beginner"],
            60 - EASIER_STEP_KG["beginner"],
        ]

    def test_stores_the_offset_as_the_users_intent(
        self, protocols, logged, profiles
    ) -> None:
        _protocol(protocols)
        profiles.get_or_create(USER)

        calibrate_protocol(
            USER, 1, 2, protocols=protocols, logged=logged, profiles=profiles
        )

        assert protocols.get(1, USER).calibration == 2

    def test_a_second_nudge_stacks_onto_the_stored_offset(
        self, protocols, logged, profiles
    ) -> None:
        _protocol(protocols, sessions=1, load="60 kg")
        profiles.get_or_create(USER)

        calibrate_protocol(
            USER, 1, 1, protocols=protocols, logged=logged, profiles=profiles
        )
        result = calibrate_protocol(
            USER, 1, 2, protocols=protocols, logged=logged, profiles=profiles
        )

        assert protocols.get(1, USER).calibration == 2
        assert _loads(result.protocol.protocol) == [
            60 + 2 * HARDER_STEP_KG["beginner"]
        ]

    def test_returning_to_zero_restores_the_authored_load(
        self, protocols, logged, profiles
    ) -> None:
        _protocol(protocols, sessions=1, load="60 kg")
        profiles.get_or_create(USER)

        calibrate_protocol(
            USER, 1, -2, protocols=protocols, logged=logged, profiles=profiles
        )
        result = calibrate_protocol(
            USER, 1, 0, protocols=protocols, logged=logged, profiles=profiles
        )

        assert protocols.get(1, USER).calibration == 0
        assert _loads(result.protocol.protocol) == [60.0]

    def test_asking_for_the_standing_offset_writes_nothing(
        self, protocols, logged, profiles
    ) -> None:
        _protocol(protocols)
        profiles.get_or_create(USER)

        result = calibrate_protocol(
            USER, 1, 0, protocols=protocols, logged=logged, profiles=profiles
        )

        assert result.status is CalibrationStatus.UNCHANGED
        assert result.calibration == 0

    def test_a_performed_session_keeps_its_authored_load(
        self, protocols, logged, profiles
    ) -> None:
        """ADR-0020's frozen prefix: a Session already performed is settled record."""

        created = _protocol(protocols, sessions=2, load="60 kg")
        _perform(logged, created.sessions[0].session_id)
        profiles.get_or_create(USER)

        calibrate_protocol(
            USER, 1, -1, protocols=protocols, logged=logged, profiles=profiles
        )

        stored = protocols.get(1, USER)
        assert _loads(stored)[0] == 60.0
        assert _loads(stored)[1] == 60 - EASIER_STEP_KG["beginner"]

    def test_an_unknown_protocol_is_not_found(self, protocols, logged, profiles) -> None:
        result = calibrate_protocol(
            USER, 404, -1, protocols=protocols, logged=logged, profiles=profiles
        )

        assert result.status is CalibrationStatus.NOT_FOUND

    def test_another_users_protocol_is_not_found(
        self, protocols, logged, profiles
    ) -> None:
        _protocol(protocols)

        result = calibrate_protocol(
            "user_other", 1, -1, protocols=protocols, logged=logged, profiles=profiles
        )

        assert result.status is CalibrationStatus.NOT_FOUND

    def test_the_session_ids_survive_a_calibration(
        self, protocols, logged, profiles
    ) -> None:
        """A Calibration changes no shape, so unlike Deploy it must not re-key the tail —
        a new Session id would orphan every Logged Session pointing at the old one."""

        created = _protocol(protocols, sessions=3)
        before = [session.session_id for session in created.sessions]
        profiles.get_or_create(USER)

        calibrate_protocol(
            USER, 1, -1, protocols=protocols, logged=logged, profiles=profiles
        )

        assert [s.session_id for s in protocols.get(1, USER).sessions] == before


# ------------------------------------------------------------------ band & lever


class TestBandAndLever:
    def test_the_band_comes_from_the_declared_fitness_level(
        self, protocols, logged, profiles
    ) -> None:
        _protocol(protocols, sessions=1, load="100 kg")
        profiles.update(USER, _with_levels({"strength": 9}))

        result = calibrate_protocol(
            USER, 1, 1, protocols=protocols, logged=logged, profiles=profiles
        )

        assert _loads(result.protocol.protocol) == [100 + HARDER_STEP_KG["advanced"]]

    def test_recent_incomplete_work_moves_the_sets_instead_of_the_load(
        self, protocols, logged, profiles
    ) -> None:
        created = _protocol(protocols, sessions=2, load="60 kg")
        _perform(
            logged,
            created.sessions[0].session_id,
            outcome=CompletionOutcome.INCOMPLETE.value,
        )
        profiles.get_or_create(USER)

        result = calibrate_protocol(
            USER, 1, -1, protocols=protocols, logged=logged, profiles=profiles
        )

        tail = result.protocol.protocol.sessions[1]
        assert tail.prescriptions[0].sets == 2
        assert parse_load(tail.prescriptions[0].recommended_load["text"]).kg == 60.0


# ---------------------------------------------------------------- safety posture


class TestSensitiveConstraint:
    """ADR-0058's precedent: a caveat, never a refusal — in both directions."""

    def test_the_increase_is_allowed(self, protocols, logged, profiles) -> None:
        _protocol(protocols, sessions=1)
        profiles.update(USER, _with_sensitive(["injury"]))

        result = calibrate_protocol(
            USER, 1, 1, protocols=protocols, logged=logged, profiles=profiles
        )

        assert result.status is CalibrationStatus.CALIBRATED

    def test_the_increase_is_disclosed(self, protocols, logged, profiles) -> None:
        _protocol(protocols, sessions=1)
        profiles.update(USER, _with_sensitive(["postpartum"]))

        result = calibrate_protocol(
            USER, 1, 1, protocols=protocols, logged=logged, profiles=profiles
        )

        assert result.sensitive_caveat is True

    def test_an_unconstrained_user_gets_no_caveat(
        self, protocols, logged, profiles
    ) -> None:
        _protocol(protocols, sessions=1)
        profiles.get_or_create(USER)

        result = calibrate_protocol(
            USER, 1, 1, protocols=protocols, logged=logged, profiles=profiles
        )

        assert result.sensitive_caveat is False


# ------------------------------------------------------------- repository guard


def test_the_repository_ignores_a_pitch_aimed_at_a_performed_session(
    protocols, logged
) -> None:
    """Defence in depth: the service already filters the performed prefix, and the
    repository refuses it again — the same posture ``deploy_tail`` takes, because ADR-0020
    requires the invariant be server-enforced rather than merely respected upstream."""

    created = _protocol(protocols, sessions=2, load="60 kg")
    frozen = created.sessions[0].session_id

    from app.repositories.protocol_repository import CalibrationSpec

    protocols.calibrate_tail(
        1,
        USER,
        calibration=-1,
        performed_session_ids={frozen},
        pitches=[
            CalibrationSpec(
                session_id=frozen,
                position=0,
                sets=1,
                recommended_load=parse_load("5 kg").to_dict(),
                prescribed_quantity=None,
                rest_seconds=10,
                target_effort=None,
            )
        ],
    )

    assert _loads(protocols.get(1, USER))[0] == 60.0


# ------------------------------------------------------------------------ helpers


def _with_levels(levels: dict[str, int]) -> ProfileUpdate:
    """A profile snapshot carrying only the per-type Fitness Levels the band reads."""

    return ProfileUpdate(fitness_levels=levels)


def _with_sensitive(constraints: list[str]) -> ProfileUpdate:
    """A profile snapshot carrying only the Sensitive Constraints the caveat reads."""

    return ProfileUpdate(sensitive_constraints=constraints)
