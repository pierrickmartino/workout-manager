"""The read-time Progression overlay resolves a Prescription's stored Progression
Scheme (ADR-0064, #429) and dispatches through the registry from #428.

``ProgressionOverlay`` is the pure projection tier: built once from the user's Logged
Sessions, it steps one Prescription view's recommended load / rep target through the
Prescription's chosen scheme and reports that scheme's harder-Variation offer. Every test
here crosses that one interface — history in, progressed Prescription out. A **null** selection resolves to the default (Double
Progression), so an un-chosen movement behaves exactly as it did before schemes existed;
an explicit **static** selection holds the authored values against the very same record.

Because #429 is the *expand* step — the persistence + read path, with the selection write
path deferred to #432 — the column is exercised here by projecting a Prescription that
already carries a scheme, per the issue. Prior art: the protocol-progress /
exercise-progress projection tests, tested directly over hand-built view objects."""

from __future__ import annotations

from dataclasses import replace
from datetime import date

from app.domain.load import parse_load
from app.progression.overlay import ProgressedPrescription, ProgressionOverlay
from app.protocols.progress import progressed_protocol_from
from app.repositories.logged_session_repository import LoggedSessionView, LoggedSetView
from app.repositories.protocol_repository import ProtocolSessionView, ProtocolView
from app.repositories.session_repository import PrescriptionView
from tests.quantities import reps_quantity


def _prescription(
    *,
    scheme: str | None,
    load: str = "60 kg",
    target_effort: dict | None = None,
    equipment: list[str] | None = None,
) -> PrescriptionView:
    """A minimal external-weight Prescription view carrying the given scheme selection and,
    optionally, a plan-side Target Effort (ADR-0066) — which the progression tier must ignore."""

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
        exercise_id=1,
        exercise_name="Back Squat",
        exercise_description=None,
        targeted_muscles=[],
        required_equipment=equipment or [],
        provenance="curated",
        scheme=scheme,
        target_effort=target_effort,
    )


def _performed(sets: list[LoggedSetView], session_id: int = 1) -> LoggedSessionView:
    """One performed Logged Session carrying ``sets``."""

    return LoggedSessionView(
        id=session_id,
        clerk_user_id="user_overlay",
        session_id=session_id,
        training_type="strength",
        performed_on=date(2026, 1, session_id),
        logged_sets=sets,
    )


def _progressed(
    prescription: PrescriptionView, sets: list[LoggedSetView]
) -> PrescriptionView:
    """``prescription`` stepped by an overlay over one performance of ``sets``."""

    overlay = ProgressionOverlay.from_history([_performed(sets)])
    return overlay.progress(prescription).prescription


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
    progressed = _progressed(prescription, _strong_sets())

    # Assert — null resolves to Double Progression: the load steps up, exactly as today
    assert progressed.recommended_load == parse_load("62.5 kg").to_dict()


def test_an_explicit_static_scheme_holds_against_the_same_strong_record():
    # Arrange — the identical strong record, but the movement is set to Static
    prescription = _prescription(scheme="static")

    # Act
    progressed = _progressed(prescription, _strong_sets())

    # Assert — Static never auto-steps: the authored load is carried through unchanged
    assert progressed.recommended_load == parse_load("60 kg").to_dict()
    assert progressed.reps == "5"


def test_an_explicit_default_scheme_matches_the_null_selections_output():
    # Arrange — the same record projected through an explicit default and through null
    strong = _strong_sets()

    # Act
    explicit = _progressed(
        _prescription(scheme="double_progression"), strong
    )
    unset = _progressed(_prescription(scheme=None), strong)

    # Assert — the stepped output is indistinguishable from leaving the choice unset;
    # only the retained selection field differs (it is carried through verbatim).
    assert explicit.reps == unset.reps
    assert explicit.recommended_load == unset.recommended_load
    assert explicit.recommended_load == parse_load("62.5 kg").to_dict()


def test_a_target_effort_is_not_a_progression_input_and_never_changes_the_step():
    # The load-bearing invariant of ADR-0066/#454: Target Effort is *descriptive* — stepping
    # is a function of the *record* (the logged sets), never the *plan*. The same strong record
    # projected through the default scheme must step identically whether or not the movement
    # carries a Target Effort, and whatever that target is. If progression ever consulted the
    # plan target, one of these branches would diverge.
    strong = _strong_sets()

    unset = _progressed(_prescription(scheme=None), strong)
    aim_hard = _progressed(
        _prescription(scheme=None, target_effort={"scale": "rpe", "value": 9}), strong
    )
    aim_easy = _progressed(
        _prescription(scheme=None, target_effort={"scale": "rir", "value": 4}), strong
    )

    # Assert — the step is byte-for-byte identical across all three (load steps up to 62.5 kg);
    # only the retained plan target differs, and it is carried through verbatim, not consulted.
    assert unset.recommended_load == parse_load("62.5 kg").to_dict()
    assert aim_hard.recommended_load == unset.recommended_load
    assert aim_easy.recommended_load == unset.recommended_load
    assert aim_hard.reps == unset.reps == aim_easy.reps
    # ...and the target is retained on the projected view (carried through, never consulted).
    assert aim_hard.target_effort == {"scale": "rpe", "value": 9}


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
    progressed = _progressed(prescription, missed)

    # Assert — Static holds in both directions: the record never moves a Static movement
    assert progressed.recommended_load == parse_load("60 kg").to_dict()


def test_the_overlay_does_not_mutate_the_prescription_it_projects():
    # Arrange — a scheme-bearing view and strong sets that would step it
    prescription = _prescription(scheme=None)

    # Act
    progressed = _progressed(prescription, _strong_sets())

    # Assert — a fresh view is returned; the input is untouched (pure, read-only overlay)
    assert progressed is not prescription
    assert prescription.recommended_load == parse_load("60 kg").to_dict()
    assert progressed.scheme == prescription.scheme


# --- Session-Count-Based: the overlay derives the exposure count from history (#431) ---
# The scheme steps on the *count*, not the reps/effort: the same neutral record either
# holds or steps purely by how many performed Sessions included the movement.


def _neutral_sets(exercise_id: int = 1) -> list[LoggedSetView]:
    """Sets that neither hit the ceiling nor miss the floor for the "5" target — so any
    step is driven by the exposure count the overlay derives, not the logged record."""

    return [
        LoggedSetView(
            position=index,
            quantity=reps_quantity(5),
            load=parse_load("60 kg").to_dict(),
            perceived_difficulty=8,
            exercise_id=exercise_id,
            exercise_name=f"Exercise {exercise_id}",
        )
        for index in range(3)
    ]


def _session_count_load(history: list[LoggedSessionView]) -> dict:
    overlay = ProgressionOverlay.from_history(history)
    progressed = overlay.progress(_prescription(scheme="session_count"))
    return progressed.prescription.recommended_load


def test_session_count_overlay_steps_the_load_on_the_nth_exposure():
    # Arrange — three performed Sessions included the movement: the cadence is reached
    history = [_performed(_neutral_sets(), sid) for sid in (1, 2, 3)]

    # Act
    load = _session_count_load(history)

    # Assert — the count drives the step: the load rises one increment
    assert load == parse_load("62.5 kg").to_dict()


def test_session_count_overlay_holds_between_the_nth_exposures():
    # Arrange — the identical record, one exposure short of the cadence
    history = [_performed(_neutral_sets(), sid) for sid in (1, 2)]

    # Act
    load = _session_count_load(history)

    # Assert — off-cadence, the overlay holds the authored load
    assert load == parse_load("60 kg").to_dict()


def test_session_count_overlay_holds_a_never_performed_movement():
    # Arrange — no history at all
    history: list[LoggedSessionView] = []

    # Act
    load = _session_count_load(history)

    # Assert — a zero count never steps, so the load holds
    assert load == parse_load("60 kg").to_dict()


def test_an_exposure_is_only_a_session_that_included_the_movement():
    # Arrange — three performed Sessions, but only two included Exercise 1
    history = [
        _performed(_neutral_sets(exercise_id=1), 1),
        _performed(_neutral_sets(exercise_id=2), 2),
        _performed(_neutral_sets(exercise_id=1), 3),
    ]

    # Act
    load = _session_count_load(history)

    # Assert — two exposures, short of the cadence: the load holds
    assert load == parse_load("60 kg").to_dict()


def test_an_exposure_counts_a_session_once_however_many_sets_it_holds():
    # Arrange — three Sessions of three sets each: nine sets, three exposures
    history = [_performed(_neutral_sets(), sid) for sid in (1, 2, 3)]

    # Act
    load = _session_count_load(history)

    # Assert — one cadence (one increment), not three
    assert load == parse_load("62.5 kg").to_dict()


# --- The harder-Variation offer follows the scheme (ADR-0026, ADR-0064) ---------------


def _bodyweight_ceiling(*, scheme: str | None) -> ProgressedPrescription:
    """A pure-bodyweight "5" target after three easy sets at the ceiling."""

    prescription = replace(
        _prescription(scheme=scheme, load="bodyweight"), exercise_name="Pull-Up"
    )
    easy = [
        LoggedSetView(
            position=index,
            quantity=reps_quantity(5),
            load=parse_load("bodyweight").to_dict(),
            perceived_difficulty=6,
            exercise_id=1,
            exercise_name="Pull-Up",
        )
        for index in range(3)
    ]
    return ProgressionOverlay.from_history([_performed(easy)]).progress(prescription)


def test_the_default_scheme_offers_a_harder_variation_at_the_ceiling():
    # Act
    progressed = _bodyweight_ceiling(scheme=None)

    # Assert — the offer fires and the Prescription itself holds (never auto-swaps)
    assert progressed.suggests_harder_variation is True
    assert progressed.prescription.reps == "5"


def test_a_static_scheme_never_offers_a_harder_variation():
    # Act
    progressed = _bodyweight_ceiling(scheme="static")

    # Assert
    assert progressed.suggests_harder_variation is False


def test_previous_sets_are_the_latest_performance_of_the_exercise():
    # Arrange — newest-first: Session 2 is the latest performance of Exercise 1
    latest = _neutral_sets()
    history = [_performed(latest, 2), _performed(_strong_sets(), 1)]

    # Act
    overlay = ProgressionOverlay.from_history(history)

    # Assert — the newest performance wins; an unlogged Exercise has none
    assert overlay.previous_sets(1) == latest
    assert overlay.previous_sets(42) == []


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
    history = [_performed(_neutral_sets(), sid) for sid in (1, 2, 3)]

    # Act — the overlay derives the exposure count (3) from history and passes it in
    progress = progressed_protocol_from(protocol, history)

    # Assert — three exposures hit the cadence, so the upcoming load steps up
    upcoming = progress.next_session
    assert upcoming.session_id == 99
    assert upcoming.prescriptions[0].recommended_load == parse_load("62.5 kg").to_dict()


def test_the_protocol_overlay_holds_session_count_between_the_nth_exposures():
    # Arrange — only two earlier exposures: the cadence has not come round yet
    protocol = _session_count_protocol()
    history = [_performed(_neutral_sets(), sid) for sid in (1, 2)]

    # Act
    progress = progressed_protocol_from(protocol, history)

    # Assert — off-cadence, the upcoming load holds its authored value
    upcoming = progress.next_session
    assert upcoming.prescriptions[0].recommended_load == parse_load("60 kg").to_dict()


# --- The empty-bar floor (ADR-0131) -----------------------------------------------------
# A barbell can't be loaded under its own weight, so a step down never takes a barbell
# Prescription below the 20 kg bar. Movements without a barbell step as before.


def _missed_sets(load: str) -> list[LoggedSetView]:
    """One set well short of the rep floor: a miss under every scheme."""

    return [
        LoggedSetView(
            position=0,
            quantity=reps_quantity(2),
            load=parse_load(load).to_dict(),
            perceived_difficulty=10,
            exercise_id=1,
            exercise_name="Back Squat",
        )
    ]


def test_a_barbell_miss_never_steps_below_the_empty_bar():
    # Arrange — a 20 kg barbell press whose −5 kg back-off would reach 15 kg
    prescription = _prescription(
        scheme="double_progression", load="20 kg", equipment=["barbell", "rack"]
    )

    # Act
    progressed = _progressed(prescription, _missed_sets("20 kg"))

    # Assert — held at the bar
    assert progressed.recommended_load == parse_load("20 kg").to_dict()


def test_a_barbell_greyskull_reset_stops_at_the_empty_bar():
    # Arrange — 22.5 kg resets 10% to 20.25 kg, rounded down to 20 kg; 20 kg would reach 17.5 kg
    near = _prescription(scheme="greyskull", load="22.5 kg", equipment=["barbell"])
    at_bar = _prescription(scheme="greyskull", load="20 kg", equipment=["barbell"])

    # Act
    from_near = _progressed(near, _missed_sets("22.5 kg"))
    from_bar = _progressed(at_bar, _missed_sets("20 kg"))

    # Assert — the bar is the floor, never crossed
    assert from_near.recommended_load == parse_load("20 kg").to_dict()
    assert from_bar.recommended_load == parse_load("20 kg").to_dict()


def test_a_barbell_load_already_under_the_bar_is_never_raised_by_a_miss():
    # Arrange — a light bar (an EZ bar reads as barbell) at 12.5 kg, then a miss
    prescription = _prescription(
        scheme="double_progression", load="12.5 kg", equipment=["barbell"]
    )

    # Act
    progressed = _progressed(prescription, _missed_sets("12.5 kg"))

    # Assert — the floor never pushes a weight up: it holds where it was
    assert progressed.recommended_load == parse_load("12.5 kg").to_dict()


def test_a_movement_without_a_barbell_steps_below_twenty_kg():
    # Arrange — a dumbbell movement at 20 kg missing its floor
    prescription = _prescription(
        scheme="double_progression", load="20 kg", equipment=["dumbbell"]
    )

    # Act
    progressed = _progressed(prescription, _missed_sets("20 kg"))

    # Assert — no bar, no floor: the usual −5 kg back-off
    assert progressed.recommended_load == parse_load("15 kg").to_dict()
