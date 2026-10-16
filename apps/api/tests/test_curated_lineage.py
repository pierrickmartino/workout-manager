"""Curated lineage: an adopted copy remembers which Curated Protocol, and version, it came
from (issue #688, ADR-0130, ADR-0043).

The lineage is an immutable plan property, like Session Provenance: Adopt
writes it on the Protocol and every member Session, nothing else changes it, and Duplicate and
Redeem carry it forward unchanged. Reads expose it as ``curated_lineage`` so the web can show
"Based on <name>". Driven over HTTP against the same SQLite harness as the Curated Protocol
endpoint tests, so the copy is read back through the real Protocol, Session and Share routes."""

from __future__ import annotations

from dataclasses import replace

from app.adoption.service import adopt
from app.curated.registry import CuratedRegistry, get_curated_registry
from app.domain.curated_lineage import CuratedLineage
from app.export.serializer import export_document
from app.generation.protocol_generator import ProtocolGenerationRequest
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProtocol,
    GeneratedProtocolSession,
)
from app.protocols.serialization import serialize_protocol
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.protocol_repository import InMemoryProtocolRepository
from app.repositories.session_repository import (
    InMemorySessionRepository,
    SessionDraft,
    SessionView,
)
from app.session_serialization import serialize_session
from tests.test_curated_protocols_endpoint import RELEASED, build_harness

RECIPIENT = "user_recipient"
LINEAGE_V1 = {
    "identifier": "beginner-linear-progression",
    "version": 1,
    "name": "Beginner linear progression",
}


def _adopted_protocol(h) -> dict:
    return h.adopted(h.adopt())


def _first_session_id(protocol: dict) -> int:
    return protocol["sessions"][0]["session_id"]


def _duplicate(h, session_id: int) -> dict:
    return h.client.post(
        f"/api/sessions/{session_id}/duplicate", headers=h.auth()
    ).json()["data"]


def test_adopting_a_curated_protocol_exposes_its_lineage_on_the_protocol_read():
    # Arrange
    h = build_harness(RELEASED)

    # Act
    protocol = _adopted_protocol(h)

    # Assert
    assert protocol["curated_lineage"] == LINEAGE_V1


def test_every_adopted_member_session_exposes_the_lineage_on_the_session_read():
    # Arrange
    h = build_harness(RELEASED)
    protocol = _adopted_protocol(h)

    # Act
    lineages = [
        h.get(f"/api/sessions/{s['session_id']}").json()["data"]["curated_lineage"]
        for s in protocol["sessions"]
    ]

    # Assert
    assert lineages == [LINEAGE_V1] * len(protocol["sessions"])


def test_a_duplicated_curated_session_keeps_curated_provenance_and_the_lineage():
    # Arrange
    h = build_harness(RELEASED)
    session_id = _first_session_id(_adopted_protocol(h))

    # Act
    copy = _duplicate(h, session_id)

    # Assert
    assert copy["id"] != session_id
    assert copy["provenance"] == "curated"
    assert copy["curated_lineage"] == LINEAGE_V1


def test_redeeming_a_share_of_a_curated_session_keeps_curated_provenance_and_the_lineage():
    # Arrange — only a standalone Session can be shared, so lift one out with Duplicate first.
    h = build_harness(RELEASED)
    standalone = _duplicate(h, _first_session_id(_adopted_protocol(h)))
    token = h.client.post(
        f"/api/sessions/{standalone['id']}/share", headers=h.auth()
    ).json()["data"]["token"]

    # Act
    redeemed = h.client.post(
        f"/api/shares/{token}/redeem", headers=h.auth(RECIPIENT)
    ).json()["data"]

    # Assert
    assert redeemed["clerk_user_id"] == RECIPIENT
    assert redeemed["provenance"] == "curated"
    assert redeemed["curated_lineage"] == LINEAGE_V1


def test_bumping_the_curated_protocol_version_leaves_an_existing_copy_untouched():
    # Arrange — adopt v1, then ship a v2 with a new name and a lighter first session.
    h = build_harness(RELEASED)
    adopted = h.adopt().json()["data"]["protocol_id"]
    before = h.get(f"/api/protocols/{adopted}").json()["data"]
    first, *rest = RELEASED.weekly_pattern
    v2 = replace(
        RELEASED,
        version=2,
        name="Beginner linear progression, revised",
        weekly_pattern=(replace(first, title="Revised day"), *rest),
    )
    h.client.app.dependency_overrides[get_curated_registry] = lambda: CuratedRegistry(
        (v2,)
    )

    # Act
    newer = h.adopted(h.adopt())
    after = h.get(f"/api/protocols/{adopted}").json()["data"]

    # Assert — the new adopt is v2; the existing copy is byte-for-byte what it was.
    assert newer["curated_lineage"] == {
        "identifier": "beginner-linear-progression",
        "version": 2,
        "name": "Beginner linear progression, revised",
    }
    assert after == before
    assert after["curated_lineage"] == LINEAGE_V1


def test_a_protocol_adopted_from_a_generated_protocol_has_no_curated_lineage():
    # Arrange
    exercises = InMemoryExerciseRepository()
    protocols = InMemoryProtocolRepository(exercises)
    generated = GeneratedProtocol(
        sessions=[
            GeneratedProtocolSession(
                week=1,
                day=1,
                title="Push",
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Back Squat", sets=5, reps="5"
                    )
                ],
            )
        ]
    )

    # Act
    view = adopt(
        generated,
        "user_generated",
        ProtocolGenerationRequest(
            training_type="strength",
            objective="gain muscle mass",
            sessions_per_week=1,
            duration_minutes=45,
            weeks=1,
            equipment=["barbell"],
        ),
        exercises=exercises,
        protocols=protocols,
    )

    # Assert
    assert serialize_protocol(view)["curated_lineage"] is None


def test_a_hand_authored_session_has_no_curated_lineage():
    # Arrange
    sessions = InMemorySessionRepository(InMemoryExerciseRepository())

    # Act
    view = sessions.create(
        "user_author",
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            provenance="user_authored",
        ),
    )

    # Assert
    assert serialize_session(view)["curated_lineage"] is None


def test_a_builder_deploy_keeps_the_lineage_on_the_rewritten_tail():
    # Arrange — the user re-deploys the whole (un-performed) plan from the Builder.
    h = build_harness(RELEASED)
    protocol = _adopted_protocol(h)
    sessions = [
        {
            "session_id": s["session_id"],
            "week": s["week"],
            "day": s["day"],
            "prescriptions": [
                {"exercise_id": p["exercise_id"], "sets": p["sets"], "reps": p["reps"]}
                for p in s["prescriptions"]
            ],
        }
        for s in protocol["sessions"]
    ]

    # Act
    h.client.post(
        f"/api/protocols/{protocol['id']}/deploy",
        json={"weeks": 4, "sessions_per_week": 3, "sessions": sessions},
        headers=h.auth(),
    )

    # Assert
    deployed = h.get(f"/api/protocols/{protocol['id']}").json()["data"]
    lineages = [
        h.get(f"/api/sessions/{s['session_id']}").json()["data"]["curated_lineage"]
        for s in deployed["sessions"]
    ]
    assert deployed["curated_lineage"] == LINEAGE_V1
    assert lineages == [LINEAGE_V1] * len(deployed["sessions"])


def test_data_export_carries_the_lineage_of_a_curated_copy():
    # Arrange — a Session carrying lineage, as Duplicate leaves it.
    lineage = CuratedLineage(
        identifier="beginner-linear-progression",
        version=1,
        name="Beginner linear progression",
    )
    session = SessionView(
        id=1,
        clerk_user_id="user_export",
        training_type="strength",
        duration_minutes=45,
        prescriptions=[],
        provenance="curated",
        curated_lineage=lineage,
    )

    # Act
    doc = export_document(
        user_id="user_export",
        protocols=[],
        sessions=[session],
        logged_sessions=[],
        metrics=[],
        exercises=[],
    )

    # Assert
    assert doc["sessions"][0]["curated_lineage"] == LINEAGE_V1
