"""The pure JSON-shaping serializer for Data Export (ADR-0062, issue #418).

Tested directly over hand-built view objects — no repository, no HTTP — because the
serializer is pure. The route's job (owner-scoping, the file download) is asserted
separately in the endpoint test; here we pin the *shape*: canonical-kg weights with the
unit labeled, faithful nesting of plans and records, and self-containment (every
referenced Exercise present, nothing dangling)."""

from __future__ import annotations

from datetime import date, datetime, timezone

from app.db.models import Exercise
from app.export.serializer import (
    CANONICAL_UNITS,
    EXPORT_VERSION,
    export_document,
    referenced_exercise_ids,
)
from app.repositories.logged_session_repository import (
    LoggedSessionView,
    LoggedSetView,
)
from app.repositories.metric_entry_repository import MetricEntryView
from app.repositories.protocol_repository import ProtocolSessionView, ProtocolView
from app.repositories.session_repository import PrescriptionView, SessionView


def _exercise(exercise_id: int, name: str) -> Exercise:
    return Exercise(
        id=exercise_id,
        normalized_name=name.lower(),
        name=name,
        provenance="curated",
        targeted_muscles=["quads"],
    )


def _prescription(exercise_id: int, *, load: dict | None = None) -> PrescriptionView:
    return PrescriptionView(
        position=0,
        sets=5,
        reps="5",
        rest_seconds=120,
        tempo=None,
        recommended_load=load,
        prescribed_quantity=None,
        superset_group=None,
        round_rest_seconds=None,
        pinned_reps=None,
        exercise_id=exercise_id,
        exercise_name="X",
        exercise_description=None,
        targeted_muscles=[],
        required_equipment=[],
        provenance="curated",
    )


def _standalone_session(session_id: int, exercise_id: int, *, load=None) -> SessionView:
    return SessionView(
        id=session_id,
        clerk_user_id="user_1",
        training_type="strength",
        duration_minutes=45,
        prescriptions=[_prescription(exercise_id, load=load)],
        name="Leg Day",
        created_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )


def _protocol(protocol_id: int, exercise_id: int) -> ProtocolView:
    return ProtocolView(
        id=protocol_id,
        clerk_user_id="user_1",
        training_type="strength",
        objective="hypertrophy",
        sessions_per_week=3,
        weeks=4,
        duration_minutes=60,
        name="Block A",
        sessions=[
            ProtocolSessionView(
                session_id=900 + protocol_id,
                position=0,
                week=1,
                day=1,
                title="Day 1",
                prescriptions=[_prescription(exercise_id)],
            )
        ],
    )


def _logged_session(exercise_id: int, *, load=None) -> LoggedSessionView:
    return LoggedSessionView(
        id=7,
        clerk_user_id="user_1",
        session_id=1,
        training_type="strength",
        performed_on=date(2026, 1, 3),
        logged_sets=[
            LoggedSetView(
                position=0,
                quantity={"kind": "repetitions", "text": "5", "count": 5},
                load=load,
                perceived_difficulty=8,
                exercise_id=exercise_id,
                exercise_name="X",
                body_weight_kg=80.0,
            )
        ],
        completion_outcome="completed",
        duration_seconds=1800,
    )


def _metric() -> MetricEntryView:
    return MetricEntryView(
        id=1,
        clerk_user_id="user_1",
        metric="weight",
        value=82.5,
        unit="kg",
        recorded_on=date(2026, 1, 1),
    )


def test_document_carries_version_user_and_canonical_unit_labels():
    # Arrange / Act
    doc = export_document(
        user_id="user_1",
        protocols=[],
        sessions=[],
        logged_sessions=[],
        metrics=[],
        exercises=[],
    )

    # Assert — the file is self-describing: version, owner, and the canonical units.
    assert doc["export_version"] == EXPORT_VERSION
    assert doc["user_id"] == "user_1"
    assert doc["units"] == CANONICAL_UNITS
    assert doc["units"]["weight"] == "kg"
    # An empty account still produces a well-formed, empty document.
    assert doc["exercises"] == []
    assert doc["protocols"] == []
    assert doc["sessions"] == []
    assert doc["logged_sessions"] == []
    assert doc["metrics"] == []


def test_weights_are_emitted_as_canonical_kilograms():
    # Arrange — an absolute Load carries its canonical kg value; the record side too.
    absolute = {"kind": "absolute", "text": "100 kg", "kg": 100.0}
    session = _standalone_session(1, 10, load=absolute)
    logged = _logged_session(10, load=absolute)

    # Act
    doc = export_document(
        user_id="user_1",
        protocols=[],
        sessions=[session],
        logged_sessions=[logged],
        metrics=[],
        exercises=[_exercise(10, "Back Squat")],
    )

    # Assert — the kg value rides through verbatim on both the plan and the record.
    assert doc["sessions"][0]["prescriptions"][0]["recommended_load"]["kg"] == 100.0
    assert doc["logged_sessions"][0]["logged_sets"][0]["load"]["kg"] == 100.0
    assert doc["logged_sessions"][0]["logged_sets"][0]["body_weight_kg"] == 80.0


def test_document_is_self_contained_every_referenced_exercise_present():
    # Arrange — three different Exercises across a protocol, a session, and a log.
    protocol = _protocol(1, 11)
    session = _standalone_session(1, 12)
    logged = _logged_session(13)
    exercises = [_exercise(i, f"Ex{i}") for i in (11, 12, 13)]

    # Act
    doc = export_document(
        user_id="user_1",
        protocols=[protocol],
        sessions=[session],
        logged_sessions=[logged],
        metrics=[],
        exercises=exercises,
    )

    # Assert — no dangling reference: every referenced id appears in the catalog block.
    referenced = referenced_exercise_ids([protocol], [session], [logged])
    assert referenced == {11, 12, 13}
    exported_ids = {e["id"] for e in doc["exercises"]}
    assert referenced <= exported_ids
    # Exercises are emitted once each, ordered by id.
    assert [e["id"] for e in doc["exercises"]] == [11, 12, 13]


def test_plans_and_records_are_nested_faithfully():
    # Arrange
    protocol = _protocol(1, 11)
    session = _standalone_session(2, 12)
    logged = _logged_session(13)

    # Act
    doc = export_document(
        user_id="user_1",
        protocols=[protocol],
        sessions=[session],
        logged_sessions=[logged],
        metrics=[_metric()],
        exercises=[_exercise(i, f"Ex{i}") for i in (11, 12, 13)],
    )

    # Assert — the protocol owns its member session + prescriptions
    exported_protocol = doc["protocols"][0]
    assert exported_protocol["name"] == "Block A"
    assert exported_protocol["sessions"][0]["prescriptions"][0]["exercise_id"] == 11
    # the standalone session owns its own prescriptions and name
    assert doc["sessions"][0]["name"] == "Leg Day"
    assert doc["sessions"][0]["prescriptions"][0]["exercise_id"] == 12
    # the record owns its ordered logged sets, dated
    assert doc["logged_sessions"][0]["performed_on"] == "2026-01-03"
    assert doc["logged_sessions"][0]["logged_sets"][0]["exercise_id"] == 13
    # the metric time series rides along
    assert doc["metrics"][0] == {
        "metric": "weight",
        "value": 82.5,
        "unit": "kg",
        "recorded_on": "2026-01-01",
    }


def test_referenced_ids_dedupe_across_sources():
    # The same Exercise used by a plan and a record is one referenced id, not two.
    session = _standalone_session(1, 42)
    logged = _logged_session(42)

    assert referenced_exercise_ids([], [session], [logged]) == {42}
