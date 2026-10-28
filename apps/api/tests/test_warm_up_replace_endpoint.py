"""Replacing a Session's existing warm-up, end to end (ADR-0143, ADR-0074, #782).

When a Session already opens with a Warm-up Section — curated, generated, hand-authored or
added earlier — ``PUT /api/sessions/{id}/warm-up`` swaps exactly that leading run, as the
Session Section projection defines it, for the new drills. Every Prescription after it is
kept unchanged and in order, renumbered contiguously. The Add guards still apply."""

from __future__ import annotations

from app.domain.exercise import Provenance
from app.repositories.prescription_mapping import PrescriptionDraft
from app.repositories.session_repository import SessionDraft
from tests.test_warm_up_apply_endpoint import OWNER, STRANGER, Harness, _rows


def _session_with_warm_up(harness: Harness, *, protocol_id: int | None = None) -> int:
    """A Session opening with a hand-authored prep drill and a warm-up-typed drill, then
    the work — including a later warm-up-typed ramp set that is not part of the lead."""

    def ex(name: str) -> int:
        return harness.exercises.find_or_create(name, provenance=Provenance.CURATED).id

    drafts = [
        PrescriptionDraft(exercise_id=ex("Jumping Jack"), sets=1, reps="20"),
        PrescriptionDraft(exercise_id=ex("Cat Cow"), sets=1, reps="8", set_type="warm_up"),
        PrescriptionDraft(exercise_id=ex("Back Squat"), sets=5, reps="5", rest_seconds=180),
        PrescriptionDraft(exercise_id=ex("Bench Press"), sets=2, reps="5", set_type="warm_up"),
        PrescriptionDraft(exercise_id=ex("Bench Press"), sets=3, reps="8"),
    ]
    view = harness.sessions.create(
        OWNER,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=drafts,
            provenance="curated",
        ),
    )
    if protocol_id is not None:
        harness.sessions._sessions[view.id].protocol_id = protocol_id
    return view.id


def _without_identity(prescription: dict) -> dict:
    return {k: v for k, v in prescription.items() if k not in {"id", "position"}}


def test_replace_swaps_only_the_leading_warm_up_section():
    # Arrange
    harness = Harness()
    session_id = _session_with_warm_up(harness)
    drills = [harness.drill("Glute Bridge"), harness.drill("Hip Circle")]

    # Act
    response = harness.apply(session_id, drills)

    # Assert
    assert response.status_code == 200
    assert _rows(response.json()["data"]) == [
        (0, "Glute Bridge", "warm_up"),
        (1, "Hip Circle", "warm_up"),
        (2, "Back Squat", None),
        (3, "Bench Press", "warm_up"),
        (4, "Bench Press", None),
    ]
    assert _rows(harness.read(session_id)) == _rows(response.json()["data"])


def test_replace_leaves_every_later_prescription_unchanged():
    # Arrange
    harness = Harness()
    session_id = _session_with_warm_up(harness)
    later_before = [_without_identity(p) for p in harness.read(session_id)["prescriptions"][2:]]

    # Act
    after = harness.apply(session_id, [harness.drill("Glute Bridge")]).json()["data"]

    # Assert
    later_after = [_without_identity(p) for p in after["prescriptions"][1:]]
    assert later_after == later_before


def test_replace_keeps_session_provenance():
    harness = Harness()
    session_id = _session_with_warm_up(harness)

    applied = harness.apply(session_id, [harness.drill("Glute Bridge")]).json()["data"]

    assert applied["provenance"] == "curated"
    assert harness.read(session_id)["provenance"] == "curated"


def test_replace_on_a_performed_session_is_refused_and_left_unchanged():
    harness = Harness()
    session_id = _session_with_warm_up(harness, protocol_id=7)
    harness.log(session_id)
    before = harness.read(session_id)

    response = harness.apply(session_id, [harness.drill("Glute Bridge")])

    assert response.status_code == 409
    assert harness.read(session_id) == before


def test_replace_on_another_users_session_is_refused_and_left_unchanged():
    harness = Harness()
    session_id = _session_with_warm_up(harness)
    before = harness.read(session_id)

    response = harness.apply(session_id, [harness.drill("Glute Bridge")], sub=STRANGER)

    assert response.status_code == 404
    assert harness.read(session_id) == before


def test_a_session_without_a_warm_up_still_gets_the_drills_added_in_front():
    harness = Harness()
    session_id = harness.session()

    response = harness.apply(session_id, [harness.drill("Glute Bridge")])

    assert _rows(response.json()["data"]) == [
        (0, "Glute Bridge", "warm_up"),
        (1, "Back Squat", None),
        (2, "Romanian Deadlift", None),
    ]


def test_adding_twice_replaces_the_earlier_warm_up_instead_of_stacking():
    # Arrange — the first warm-up added becomes the Session's Warm-up Section.
    harness = Harness()
    session_id = harness.session()
    harness.apply(session_id, [harness.drill("Glute Bridge"), harness.drill("Hip Circle")])

    # Act
    response = harness.apply(session_id, [harness.drill("Arm Circle")])

    # Assert
    assert _rows(response.json()["data"]) == [
        (0, "Arm Circle", "warm_up"),
        (1, "Back Squat", None),
        (2, "Romanian Deadlift", None),
    ]
