"""The Progression Scheme selection is carried through the plan serializers (ADR-0064,
#429).

A Prescription's chosen scheme has to survive the trip to the PWA the same way ``reps``,
``recommended_load`` and ``pinned_reps`` do — through both the standalone-Session
serializer and the Protocol-Session serializer — so the client can show which scheme a
movement is on. These are pure ``view → dict`` functions, tested directly over hand-built
views (no repository, no HTTP)."""

from __future__ import annotations

from app.protocols.serialization import serialize_session as serialize_protocol_session
from app.repositories.protocol_repository import ProtocolSessionView
from app.repositories.session_repository import PrescriptionView
from app.session_serialization import serialize_prescription


def _prescription(scheme: str | None) -> PrescriptionView:
    return PrescriptionView(
        position=0,
        sets=3,
        reps="5",
        rest_seconds=90,
        tempo=None,
        recommended_load=None,
        prescribed_quantity=None,
        superset_group=None,
        round_rest_seconds=None,
        pinned_reps=None,
        exercise_id=1,
        exercise_name="Back Squat",
        exercise_description=None,
        targeted_muscles=[],
        required_equipment=[],
        provenance="curated",
        scheme=scheme,
    )


def test_standalone_session_serialization_carries_a_chosen_scheme():
    # Act
    payload = serialize_prescription(_prescription("static"))

    # Assert — the chosen scheme rides along in the standalone-Session read shape
    assert payload["scheme"] == "static"


def test_standalone_session_serialization_carries_a_null_scheme_as_null():
    # Act
    payload = serialize_prescription(_prescription(None))

    # Assert — an unset selection serializes as null (the default, resolved read-time)
    assert payload["scheme"] is None


def test_protocol_session_serialization_carries_a_chosen_scheme():
    # Arrange — one Protocol Session holding a Static movement
    session = ProtocolSessionView(
        session_id=1,
        position=0,
        week=1,
        day=1,
        title="Day 1",
        prescriptions=[_prescription("static")],
    )

    # Act
    payload = serialize_protocol_session(session)

    # Assert — the scheme is carried through the Protocol read shape too
    assert payload["prescriptions"][0]["scheme"] == "static"
