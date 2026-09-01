"""The read-time Progression overlay resolves a Prescription's stored Progression
Scheme (ADR-0064, #429) and dispatches through the registry from #428.

``progressed_prescription`` is the pure projection tier: given one Prescription view and
the user's latest Logged Sets, it steps the recommended load / rep target through the
Prescription's chosen scheme. A **null** selection resolves to the default (Double
Progression), so an un-chosen movement behaves exactly as it did before schemes existed;
an explicit **static** selection holds the authored values against the very same record.

Because #429 is the *expand* step — the persistence + read path, with the selection write
path deferred to #432 — the column is exercised here by projecting a Prescription that
already carries a scheme, per the issue. Prior art: the protocol-progress /
exercise-progress projection tests, tested directly over hand-built view objects."""

from __future__ import annotations

from app.domain.load import parse_load
from app.protocols.progress import progressed_prescription
from app.repositories.logged_session_repository import LoggedSetView
from app.repositories.session_repository import PrescriptionView
from tests.quantities import reps_quantity


def _prescription(*, scheme: str | None, load: str = "60 kg") -> PrescriptionView:
    """A minimal external-weight Prescription view carrying the given scheme selection."""

    return PrescriptionView(
        position=0,
        sets=3,
        reps="5",
        rest_seconds=120,
        tempo=None,
        recommended_load=parse_load(load).to_dict(),
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


def _strong_sets() -> list[LoggedSetView]:
    """Three sets at the rep ceiling and low effort — strong enough to step the load up."""

    return [
        LoggedSetView(
            position=index,
            quantity=reps_quantity(5),
            load=parse_load("60 kg").to_dict(),
            perceived_difficulty=6,
            exercise_id=1,
            exercise_name="Back Squat",
        )
        for index in range(3)
    ]


def test_a_null_scheme_resolves_to_the_default_and_steps_the_load():
    # Arrange — an un-chosen movement (null scheme) with strong logged sets
    prescription = _prescription(scheme=None)

    # Act
    progressed = progressed_prescription(prescription, _strong_sets())

    # Assert — null resolves to Double Progression: the load steps up, exactly as today
    assert progressed.recommended_load == parse_load("62.5 kg").to_dict()


def test_an_explicit_static_scheme_holds_against_the_same_strong_record():
    # Arrange — the identical strong record, but the movement is set to Static
    prescription = _prescription(scheme="static")

    # Act
    progressed = progressed_prescription(prescription, _strong_sets())

    # Assert — Static never auto-steps: the authored load is carried through unchanged
    assert progressed.recommended_load == parse_load("60 kg").to_dict()
    assert progressed.reps == "5"


def test_an_explicit_default_scheme_matches_the_null_selections_output():
    # Arrange — the same record projected through an explicit default and through null
    strong = _strong_sets()

    # Act
    explicit = progressed_prescription(
        _prescription(scheme="double_progression"), strong
    )
    unset = progressed_prescription(_prescription(scheme=None), strong)

    # Assert — the stepped output is indistinguishable from leaving the choice unset;
    # only the retained selection field differs (it is carried through verbatim).
    assert explicit.reps == unset.reps
    assert explicit.recommended_load == unset.recommended_load
    assert explicit.recommended_load == parse_load("62.5 kg").to_dict()


def test_a_static_movement_holds_a_missed_session_that_would_back_the_load_off():
    # Arrange — a badly missed session that Double Progression would step *down*
    prescription = _prescription(scheme="static")
    missed = [
        LoggedSetView(
            position=0,
            quantity=reps_quantity(1),
            load=parse_load("60 kg").to_dict(),
            perceived_difficulty=10,
            exercise_id=1,
            exercise_name="Back Squat",
        )
    ]

    # Act
    progressed = progressed_prescription(prescription, missed)

    # Assert — Static holds in both directions: the record never moves a Static movement
    assert progressed.recommended_load == parse_load("60 kg").to_dict()


def test_the_overlay_does_not_mutate_the_prescription_it_projects():
    # Arrange — a scheme-bearing view and strong sets that would step it
    prescription = _prescription(scheme=None)

    # Act
    progressed = progressed_prescription(prescription, _strong_sets())

    # Assert — a fresh view is returned; the input is untouched (pure, read-only overlay)
    assert progressed is not prescription
    assert prescription.recommended_load == parse_load("60 kg").to_dict()
    assert progressed.scheme == prescription.scheme
