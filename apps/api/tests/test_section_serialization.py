"""The Session Section projection rides through the plan serializers (ADR-0074).

A movement's read-time Section (warm-up / main / accessory / cooldown) has to reach the
PWA on both plan reads — the standalone-Session serializer and the Protocol-Session
serializer — so a read-only plan view can group the composition without re-deriving it.
Section is a projection over the *ordered* Session, so these tests build a small ordered
view and assert the whole section sequence, not one movement in isolation. Pure
``view → dict`` (no repository, no HTTP)."""

from __future__ import annotations

from app.protocols.serialization import serialize_session as serialize_protocol_session
from app.repositories.protocol_repository import ProtocolSessionView
from app.repositories.session_repository import PrescriptionView
from app.session_serialization import serialize_prescription, serialize_session


def _prescription(name: str, position: int) -> PrescriptionView:
    return PrescriptionView(
        position=position,
        sets=3,
        reps="8",
        rest_seconds=90,
        tempo=None,
        recommended_load=None,
        prescribed_quantity=None,
        superset_group=None,
        round_rest_seconds=None,
        exercise_id=position + 1,
        exercise_name=name,
        exercise_description=None,
        targeted_muscles=[],
        required_equipment=[],
        provenance="curated",
    )


def _composition() -> list[PrescriptionView]:
    # A session touching every section, in order.
    names = ["World's Greatest Stretch", "Back Squat", "Bicep Curl", "Pigeon Stretch"]
    return [_prescription(name, position) for position, name in enumerate(names)]


def _session_view():
    from datetime import datetime, timezone

    from app.repositories.session_repository import SessionView

    return SessionView(
        id=1,
        clerk_user_id="user_1",
        training_type="strength",
        duration_minutes=45,
        has_been_regenerated=False,
        provenance="curated",
        name=None,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        author_display_name="A. Author",
        is_protocol_member=False,
        is_favorite=False,
        prescriptions=_composition(),
    )


def test_prescription_serializer_defaults_section_to_null():
    # Act — rendered without Session context (the Live read shape) carries no section.
    payload = serialize_prescription(_prescription("Back Squat", 0))

    # Assert
    assert payload["section"] is None


def test_standalone_session_serialization_sections_in_order():
    # Act
    payload = serialize_session(_session_view())

    # Assert — every Prescription carries its projected Section, in Session order.
    sections = [p["section"] for p in payload["prescriptions"]]
    assert sections == ["warm_up", "main", "accessory", "cooldown"]


def test_protocol_session_serialization_sections_in_order():
    # Arrange
    session = ProtocolSessionView(
        session_id=1,
        position=0,
        week=1,
        day=1,
        title="Day 1",
        prescriptions=_composition(),
    )

    # Act
    payload = serialize_protocol_session(session)

    # Assert — the Protocol/Builder read shape carries the same projected Sections.
    sections = [p["section"] for p in payload["prescriptions"]]
    assert sections == ["warm_up", "main", "accessory", "cooldown"]
