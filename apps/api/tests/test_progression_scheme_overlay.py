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

from datetime import date

from app.domain.load import parse_load
from app.protocols.progress import (
    exposure_counts_by_exercise,
    progressed_prescription,
    progressed_protocol_from,
)
from app.repositories.logged_session_repository import LoggedSessionView, LoggedSetView
from app.repositories.protocol_repository import ProtocolSessionView, ProtocolView
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


# --- Session-Count-Based: the overlay passes the exposure count into the scheme (#431) ---
# The scheme steps on the *count*, not the reps/effort: the same neutral record either
# holds or steps purely by which exposure the overlay reports. Here the count is passed
# directly to ``progressed_prescription``; the end-to-end computation of the count from
# history is covered in the protocol-view projection test.


def _neutral_sets() -> list[LoggedSetView]:
    """Sets that neither hit the ceiling nor miss the floor for the "5" target — so any
    step is driven by the exposure count the overlay passes, not the logged record."""

    return [
        LoggedSetView(
            position=index,
            quantity=reps_quantity(5),
            load=parse_load("60 kg").to_dict(),
            perceived_difficulty=8,
            exercise_id=1,
            exercise_name="Back Squat",
        )
        for index in range(3)
    ]


def test_session_count_overlay_steps_the_load_on_the_nth_exposure():
    # Arrange — a Session-Count movement whose exposure count reached the cadence
    prescription = _prescription(scheme="session_count")

    # Act — the overlay passes the exposure count straight into the scheme
    progressed = progressed_prescription(prescription, _neutral_sets(), exposure_count=3)

    # Assert — the count drives the step: the load rises one increment
    assert progressed.recommended_load == parse_load("62.5 kg").to_dict()


def test_session_count_overlay_holds_between_the_nth_exposures():
    # Arrange — the identical movement and record, but an intervening exposure
    prescription = _prescription(scheme="session_count")

    # Act
    progressed = progressed_prescription(prescription, _neutral_sets(), exposure_count=2)

    # Assert — off-cadence, the overlay holds the authored load
    assert progressed.recommended_load == parse_load("60 kg").to_dict()


def test_session_count_overlay_defaults_to_a_zero_count_that_holds():
    # Arrange — a Session-Count movement projected with no exposure count supplied
    prescription = _prescription(scheme="session_count")

    # Act — the default count is zero (a never-performed movement)
    progressed = progressed_prescription(prescription, _neutral_sets())

    # Assert — a zero count never steps, so the load holds
    assert progressed.recommended_load == parse_load("60 kg").to_dict()


# --- exposure_counts_by_exercise: the count the overlay derives from history (#431) ---


def _logged_session(session_id: int, exercise_ids: list[int]) -> LoggedSessionView:
    """A performed Session carrying one neutral set for each listed Exercise."""

    return LoggedSessionView(
        id=session_id,
        clerk_user_id="user_sc",
        session_id=session_id,
        training_type="strength",
        performed_on=date(2026, 1, session_id),
        logged_sets=[
            LoggedSetView(
                position=index,
                quantity=reps_quantity(5),
                load=parse_load("60 kg").to_dict(),
                perceived_difficulty=8,
                exercise_id=exercise_id,
                exercise_name=f"Exercise {exercise_id}",
            )
            for index, exercise_id in enumerate(exercise_ids)
        ],
    )


def test_exposure_counts_count_each_performed_session_that_includes_the_exercise():
    # Arrange — Exercise 1 appears in two performed Sessions, Exercise 2 in one
    history = [
        _logged_session(1, [1, 2]),
        _logged_session(2, [1]),
    ]

    # Act
    counts = exposure_counts_by_exercise(history)

    # Assert — one tally per performed Session that included the movement
    assert counts == {1: 2, 2: 1}


def test_exposure_counts_count_a_session_once_however_many_sets_it_holds():
    # Arrange — a single Session logging the same Exercise across three sets
    history = [_logged_session(1, [1, 1, 1])]

    # Act
    counts = exposure_counts_by_exercise(history)

    # Assert — an exposure is a performed Session, not a set count
    assert counts == {1: 1}


# --- end to end: the protocol overlay computes the count from history and steps (#431) ---


def _session_count_protocol() -> ProtocolView:
    """A one-Session Protocol whose only movement (Exercise 1) is on Session-Count."""

    upcoming = ProtocolSessionView(
        session_id=99,
        position=0,
        week=1,
        day=1,
        title="Upcoming",
        prescriptions=[_prescription(scheme="session_count")],
    )
    return ProtocolView(
        id=7,
        clerk_user_id="user_sc",
        training_type="strength",
        objective="gain muscle mass",
        sessions_per_week=1,
        weeks=1,
        duration_minutes=45,
        sessions=[upcoming],
    )


def test_the_protocol_overlay_steps_session_count_off_the_history_derived_count():
    # Arrange — the movement has been performed in three earlier Sessions (three
    # exposures), and the upcoming Session (id 99) is still un-performed
    protocol = _session_count_protocol()
    history = [_logged_session(sid, [1]) for sid in (1, 2, 3)]

    # Act — the overlay derives the exposure count (3) from history and passes it in
    progress = progressed_protocol_from(protocol, history)

    # Assert — three exposures hit the cadence, so the upcoming load steps up
    upcoming = progress.next_session
    assert upcoming.session_id == 99
    assert upcoming.prescriptions[0].recommended_load == parse_load("62.5 kg").to_dict()


def test_the_protocol_overlay_holds_session_count_between_the_nth_exposures():
    # Arrange — only two earlier exposures: the cadence has not come round yet
    protocol = _session_count_protocol()
    history = [_logged_session(sid, [1]) for sid in (1, 2)]

    # Act
    progress = progressed_protocol_from(protocol, history)

    # Assert — off-cadence, the upcoming load holds its authored value
    upcoming = progress.next_session
    assert upcoming.prescriptions[0].recommended_load == parse_load("60 kg").to_dict()
