"""The in-place Progression Scheme selection service (ADR-0064, #432).

``set_scheme`` / ``clear_scheme`` are the standalone-Session write path — a no-AI plan
edit, the same posture as Insert / Remove / Substitution. These tests drive the whole
guard ladder over a lightweight fake ``SessionRepository`` (no DB, no HTTP): ownership,
the standalone-only rule (a Protocol member is a Builder/Deploy edit), the (scheme, Load)
compatibility rejection, and the clean clear-restores-default path.
"""

from __future__ import annotations

from dataclasses import replace

import pytest

from app.domain.load import parse_load
from app.domain.progression import ProgressionScheme
from app.repositories.session_repository import PrescriptionView, SessionView
from app.scheme_selection.service import (
    IncompatibleScheme,
    PrescriptionNotFound,
    SchemeNotOnProtocolMember,
    SessionNotFound,
    clear_scheme,
    set_scheme,
)

OWNER = "user_owner"


def _prescription(position: int, *, load: str | None, scheme: str | None = None) -> PrescriptionView:
    return PrescriptionView(
        position=position,
        sets=3,
        reps="5",
        rest_seconds=None,
        tempo=None,
        recommended_load=parse_load(load).to_dict() if load is not None else None,
        prescribed_quantity=None,
        superset_group=None,
        round_rest_seconds=None,
        pinned_reps=None,
        exercise_id=100 + position,
        exercise_name="Back Squat",
        exercise_description=None,
        targeted_muscles=[],
        required_equipment=[],
        provenance="curated",
        scheme=scheme,
    )


def _session(
    *, prescriptions: list[PrescriptionView], is_protocol_member: bool = False
) -> SessionView:
    return SessionView(
        id=1,
        clerk_user_id=OWNER,
        training_type="strength",
        duration_minutes=45,
        prescriptions=prescriptions,
        is_protocol_member=is_protocol_member,
    )


class FakeSessionRepository:
    """The two methods the scheme-selection service touches. ``get`` is owner-scoped;
    ``set_scheme`` mutates only the targeted prescription's scheme immutably."""

    def __init__(self, view: SessionView) -> None:
        self._view = view

    def get(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        if session_id != self._view.id or clerk_user_id != self._view.clerk_user_id:
            return None
        return self._view

    def set_scheme(self, session_id, clerk_user_id, position, scheme):
        if session_id != self._view.id or clerk_user_id != self._view.clerk_user_id:
            return None
        if not any(p.position == position for p in self._view.prescriptions):
            return None
        self._view = replace(
            self._view,
            prescriptions=[
                replace(p, scheme=scheme) if p.position == position else p
                for p in self._view.prescriptions
            ],
        )
        return self._view


def test_sets_a_compatible_scheme_on_a_standalone_prescription():
    # Arrange — an absolute-load movement: Greyskull has a kilogram axis to step
    repo = FakeSessionRepository(_session(prescriptions=[_prescription(0, load="60 kg")]))

    # Act
    view = set_scheme(1, OWNER, 0, ProgressionScheme.GREYSKULL, sessions=repo)

    # Assert — the selection is stored on the target prescription
    assert view.prescriptions[0].scheme == "greyskull"


def test_rejects_an_incompatible_scheme_and_writes_nothing():
    # Arrange — a pure-bodyweight movement has no kilogram axis for Greyskull to step
    repo = FakeSessionRepository(
        _session(prescriptions=[_prescription(0, load="bodyweight")])
    )

    # Act / Assert — rejected with the chosen scheme named; nothing is written
    with pytest.raises(IncompatibleScheme) as exc:
        set_scheme(1, OWNER, 0, ProgressionScheme.GREYSKULL, sessions=repo)
    assert exc.value.scheme is ProgressionScheme.GREYSKULL
    assert repo.get(1, OWNER).prescriptions[0].scheme is None


def test_rejects_a_bounded_scheme_on_a_load_less_prescription():
    # Arrange — no typed Load at all: a weight-axis scheme has nothing to step
    repo = FakeSessionRepository(_session(prescriptions=[_prescription(0, load=None)]))

    # Act / Assert
    with pytest.raises(IncompatibleScheme):
        set_scheme(1, OWNER, 0, ProgressionScheme.GREYSKULL, sessions=repo)


def test_a_universal_scheme_applies_to_any_load():
    # Arrange — Static holds every Load kind, so it is legal on pure bodyweight
    repo = FakeSessionRepository(
        _session(prescriptions=[_prescription(0, load="bodyweight")])
    )

    # Act
    view = set_scheme(1, OWNER, 0, ProgressionScheme.STATIC, sessions=repo)

    # Assert
    assert view.prescriptions[0].scheme == "static"


def test_clearing_restores_the_default():
    # Arrange — a movement already carrying a chosen scheme
    repo = FakeSessionRepository(
        _session(prescriptions=[_prescription(0, load="60 kg", scheme="greyskull")])
    )

    # Act — clearing drops the selection to None (the default, Double Progression)
    view = clear_scheme(1, OWNER, 0, sessions=repo)

    # Assert
    assert view.prescriptions[0].scheme is None


def test_clearing_is_idempotent_on_an_already_default_prescription():
    # Arrange — a movement with no scheme chosen
    repo = FakeSessionRepository(_session(prescriptions=[_prescription(0, load="60 kg")]))

    # Act
    view = clear_scheme(1, OWNER, 0, sessions=repo)

    # Assert — still the default, no error
    assert view.prescriptions[0].scheme is None


def test_a_protocol_member_is_refused_for_the_in_place_edit():
    # Arrange — a Session inside a Protocol: its scheme is a Builder/Deploy edit
    repo = FakeSessionRepository(
        _session(prescriptions=[_prescription(0, load="60 kg")], is_protocol_member=True)
    )

    # Act / Assert — refused before any write, directing the user to the Builder
    with pytest.raises(SchemeNotOnProtocolMember):
        set_scheme(1, OWNER, 0, ProgressionScheme.STATIC, sessions=repo)
    with pytest.raises(SchemeNotOnProtocolMember):
        clear_scheme(1, OWNER, 0, sessions=repo)


def test_a_non_owner_gets_session_not_found():
    repo = FakeSessionRepository(_session(prescriptions=[_prescription(0, load="60 kg")]))
    with pytest.raises(SessionNotFound):
        set_scheme(1, "someone_else", 0, ProgressionScheme.STATIC, sessions=repo)


def test_an_absent_position_is_prescription_not_found():
    repo = FakeSessionRepository(_session(prescriptions=[_prescription(0, load="60 kg")]))
    with pytest.raises(PrescriptionNotFound):
        set_scheme(1, OWNER, 99, ProgressionScheme.STATIC, sessions=repo)
