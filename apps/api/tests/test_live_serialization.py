"""The Live Session hydration serializer must carry every Prescription field the
plain Session read carries — the Superset overlay especially (ADR-0023).

Regression guard for the bug where Starting a Session flattened its Supersets:
``serialize_hydrated_session`` hand-rolled its own prescription dict and never
emitted ``superset_group``/``round_rest_seconds``, so the live engine — which
partitions round-major performance on that tag — saw only solo movements. The plan
view was unaffected (it reads the plain shape), which is why the Superset displayed
right up until Start. Both reads now render through one shared serializer."""

from __future__ import annotations

from app.live.serialization import serialize_hydrated_session
from app.live.hydration import HydratedSessionView, PreviousSetView
from app.session_serialization import serialize_prescription
from app.repositories.session_repository import PrescriptionView, SessionView


def _prescription(**overrides) -> PrescriptionView:
    base = dict(
        position=1,
        sets=3,
        reps="8",
        rest_seconds=90,
        tempo=None,
        recommended_load={"kind": "absolute", "text": "60 kg", "kg": 60},
        prescribed_quantity=None,
        superset_group="1",
        round_rest_seconds=120,
        exercise_id=100,
        exercise_name="Bench Press",
        exercise_description=None,
        targeted_muscles=["chest"],
        required_equipment=["barbell"],
        provenance="curated",
    )
    base.update(overrides)
    return PrescriptionView(**base)


def _hydrated(prescriptions, previous_performance=None) -> HydratedSessionView:
    session = SessionView(
        id=7,
        clerk_user_id="user_1",
        training_type="strength",
        duration_minutes=45,
        prescriptions=prescriptions,
    )
    return HydratedSessionView(
        session=session, previous_performance=previous_performance or {}
    )


def test_hydrated_prescriptions_carry_the_superset_overlay():
    # Arrange — two members of one Superset (the shape a saved Superset hydrates as)
    view = _hydrated(
        [
            _prescription(position=1, exercise_id=100, exercise_name="Bench Press"),
            _prescription(position=2, exercise_id=200, exercise_name="Barbell Row"),
        ]
    )

    # Act
    payload = serialize_hydrated_session(view)

    # Assert — the group tag and round-rest survive to the live read, so the engine
    # can partition the Superset round-major instead of flattening it to solos.
    groups = [p["superset_group"] for p in payload["prescriptions"]]
    round_rests = [p["round_rest_seconds"] for p in payload["prescriptions"]]
    assert groups == ["1", "1"]
    assert round_rests == [120, 120]


def test_hydrated_prescription_shape_matches_the_canonical_serializer():
    # Arrange — one prescription, plus a previous performance for it
    view = _hydrated(
        [_prescription()],
        previous_performance={
            100: [PreviousSetView(reps=6, load={"kind": "absolute", "text": "55 kg"})]
        },
    )

    # Act
    payload = serialize_hydrated_session(view)
    prescription = payload["prescriptions"][0]

    # Assert — the live read is exactly the canonical Prescription shape plus its one
    # addition, ``previous_performance``. Nothing the plain read carries is dropped.
    expected = {
        **serialize_prescription(view.session.prescriptions[0]),
        "previous_performance": [{"reps": 6, "load": {"kind": "absolute", "text": "55 kg"}}],
    }
    assert prescription == expected


def test_solo_prescription_has_null_superset_fields():
    # Arrange — a flat, solo Prescription carries no group
    view = _hydrated(
        [_prescription(superset_group=None, round_rest_seconds=None)]
    )

    # Act
    payload = serialize_hydrated_session(view)

    # Assert — null overlay, so the engine treats it as a solo unit
    assert payload["prescriptions"][0]["superset_group"] is None
    assert payload["prescriptions"][0]["round_rest_seconds"] is None
