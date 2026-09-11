"""The Exercise Prescription field spine has one home, and nothing may silently
drop a field from it (ADR-0069).

``PrescriptionDraft`` is the single declaration of the prescription spine, and
every persistence site routes through the ``prescription_mapping`` mappers. These
tests are the completeness guard the ADR promises instead of code generation:

- the authorship **partition** covers the whole spine, so a new field forces a
  conscious "does the AI author this?" decision;
- the spine is a subset of the ORM columns, so a manifest field always has a
  home to persist into;
- both JSON **projections** carry every spine field (their intentional extras and
  omissions are about the catalog join, never the spine);
- a **round trip** through create/read, Duplicate, Redeem, Regeneration, and a
  Protocol create + Deploy preserves every spine value — the check that would
  have caught the Superset-flatten regression (ADR-0023) at any of those sites.
"""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

from app.db.models import ExercisePrescription
from app.domain.exercise import Provenance
from app.export.serializer import _prescription as export_prescription
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)
from app.repositories.prescription_mapping import (
    AI_AUTHORED_FIELDS,
    USER_AUTHORED_FIELDS,
    PrescriptionDraft,
    PrescriptionView,
    prescription_spine_fields,
)
from app.repositories.protocol_repository import (
    DeploySessionSpec,
    InMemoryProtocolRepository,
    ProtocolDraft,
    ProtocolSessionDraft,
    SqlProtocolRepository,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    SessionDraft,
    SqlSessionRepository,
)
from app.session_serialization import serialize_prescription

USER = "user_spine"
OTHER = "user_other"


# A distinct, non-default value for every spine field, so a dropped field shows up
# as a missing or reset value rather than coincidentally matching a default.
def _full_draft(exercise_id: int) -> PrescriptionDraft:
    return PrescriptionDraft(
        exercise_id=exercise_id,
        sets=4,
        reps="6-10",
        rest_seconds=77,
        tempo="4-1-1",
        recommended_load={"kind": "absolute", "text": "60kg", "kg": 60.0},
        prescribed_quantity={"kind": "repetitions", "text": "8", "reps": 8},
        superset_group="Z",
        round_rest_seconds=111,
        scheme="static",
        set_type="warm_up",
        target_effort={"scale": "rpe", "value": 8.0},
        note="brace hard",
    )


def _assert_spine_matches(actual, expected: PrescriptionDraft) -> None:
    """Every spine field on a read view (or draft) equals the seeded draft's."""

    for name in prescription_spine_fields():
        assert getattr(actual, name) == getattr(expected, name), name


# --- Static structure: partition, ORM coverage, projection keys ---------------


def test_authorship_partition_covers_every_spine_field_disjointly():
    spine = set(prescription_spine_fields())
    # Every field is classified exactly once — a new field cannot slip in
    # unclassified (the generation subset stays honest, ADR-0069).
    assert AI_AUTHORED_FIELDS | USER_AUTHORED_FIELDS == spine
    assert AI_AUTHORED_FIELDS.isdisjoint(USER_AUTHORED_FIELDS)


def test_every_spine_field_is_a_real_orm_column():
    # A manifest field with no column would have nowhere to persist — the spine
    # must be a subset of the persisted row's fields.
    columns = set(ExercisePrescription.model_fields)
    assert set(prescription_spine_fields()) <= columns


def _full_view() -> PrescriptionView:
    draft = _full_draft(exercise_id=42)
    spine = {name: getattr(draft, name) for name in prescription_spine_fields()}
    return PrescriptionView(
        position=0,
        exercise_name="Back Squat",
        exercise_description="A squat.",
        targeted_muscles=["quads"],
        required_equipment=["barbell"],
        provenance="ai_generated",
        **spine,
    )


@pytest.mark.parametrize(
    "project", [serialize_prescription, export_prescription], ids=["api", "export"]
)
def test_both_json_projections_carry_every_spine_field(project):
    payload = project(_full_view())
    for name in prescription_spine_fields():
        assert name in payload, name


# --- Round trip through the persistence sites ---------------------------------


@pytest.fixture(params=["in_memory", "sql"])
def session_repo(request):
    if request.param == "in_memory":
        exercises = InMemoryExerciseRepository()
        yield InMemorySessionRepository(exercises), exercises
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlSessionRepository(session), SqlExerciseRepository(session)


@pytest.fixture(params=["in_memory", "sql"])
def protocol_repo(request):
    if request.param == "in_memory":
        exercises = InMemoryExerciseRepository()
        yield InMemoryProtocolRepository(exercises), exercises
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlProtocolRepository(session), SqlExerciseRepository(session)


def _seed_exercise(exercises) -> int:
    return exercises.find_or_create(
        "Back Squat", provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    ).id


def test_session_round_trip_preserves_every_spine_field(session_repo):
    repo, exercises = session_repo
    draft = _full_draft(_seed_exercise(exercises))

    created = repo.create(USER, SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[draft]))
    _assert_spine_matches(created.prescriptions[0], draft)

    # Read-back, and both JSON projections, carry every field.
    fetched = repo.get(created.id, USER)
    _assert_spine_matches(fetched.prescriptions[0], draft)
    for name in prescription_spine_fields():
        assert name in serialize_prescription(fetched.prescriptions[0])
        assert name in export_prescription(fetched.prescriptions[0])

    # Duplicate (own copy) and Regeneration-keep both round the spine through
    # draft_from_row → row_from_draft.
    duplicated = repo.duplicate(created.id, USER)
    _assert_spine_matches(duplicated.prescriptions[0], draft)

    regenerated = repo.regenerate(
        created.id, USER, keep_positions=[0], replacements=[]
    )
    _assert_spine_matches(regenerated.prescriptions[0], draft)

    # Redeem (cross-user copy) preserves the plan spine for its new owner.
    redeemed = repo.redeem(created.id, OTHER)
    _assert_spine_matches(redeemed.prescriptions[0], draft)


def test_protocol_create_and_deploy_preserve_every_spine_field(protocol_repo):
    repo, exercises = protocol_repo
    draft = _full_draft(_seed_exercise(exercises))

    created = repo.create(
        USER,
        ProtocolDraft(
            training_type="strength",
            objective="build",
            sessions_per_week=1,
            weeks=1,
            duration_minutes=45,
            sessions=[
                ProtocolSessionDraft(week=1, day=1, prescriptions=[draft], title="A")
            ],
        ),
    )
    _assert_spine_matches(created.sessions[0].prescriptions[0], draft)

    # Deploy the whole (un-performed) tail as one fresh Session carrying the draft.
    deployed = repo.deploy_tail(
        created.id,
        USER,
        performed_session_ids=set(),
        tail=[
            DeploySessionSpec(
                position=0, week=1, day=1, prescriptions=[draft], title="A"
            )
        ],
        weeks=1,
        sessions_per_week=1,
    )
    _assert_spine_matches(deployed.sessions[0].prescriptions[0], draft)
