"""Deploy validation rules for the Protocol Builder (Module B, ADR-0020).

``validate_deploy`` is the single gate ``DEPLOY PROTOCOL`` runs before anything is
persisted: it takes the desired un-performed tail (a pure ``DeployDraft``) plus the
facts the server knows — which Sessions are performed (frozen), which Session ids
belong to the Protocol, and whether an Exercise id is a real catalog entry — and
returns a typed list of everything wrong with it. An empty list means "safe to
deploy". It is pure: no I/O, exercise existence is injected as a predicate.

The central safety rule (ADR-0020) is the **frozen prefix**: a draft that would
touch a performed Session is rejected server-side, never merely by the client.
"""

from __future__ import annotations

from app.protocols.deploy_validation import (
    DeployDraft,
    DraftPrescription,
    DraftSession,
    validate_deploy,
)


def _prescription(**overrides) -> DraftPrescription:
    base = dict(exercise_id=100, sets=3, reps="5")
    base.update(overrides)
    return DraftPrescription(**base)


def _session(**overrides) -> DraftSession:
    base = dict(session_id=1, week=1, day=1, prescriptions=[_prescription()])
    base.update(overrides)
    return DraftSession(**base)


def _draft(**overrides) -> DeployDraft:
    base = dict(weeks=2, sessions_per_week=1, sessions=[_session()])
    base.update(overrides)
    return DeployDraft(**base)


def _always_exists(_exercise_id: int) -> bool:
    return True


def test_valid_draft_passes_with_no_errors():
    # Arrange — one un-performed Session with one well-formed Prescription
    draft = _draft()

    # Act
    errors = validate_deploy(
        draft,
        performed_session_ids=set(),
        known_session_ids={1},
        exercise_exists=_always_exists,
    )

    # Assert
    assert errors == []


def test_rejects_a_draft_that_touches_a_performed_session():
    # Arrange — the tail carries Session 1, but Session 1 has already been performed
    draft = _draft(sessions=[_session(session_id=1)])

    # Act
    errors = validate_deploy(
        draft,
        performed_session_ids={1},
        known_session_ids={1},
        exercise_exists=_always_exists,
    )

    # Assert — rejected, and the offending Session is named (frozen prefix, ADR-0020)
    assert [e.code for e in errors] == ["performed_session_modified"]
    assert errors[0].session_id == 1


def test_rejects_a_session_with_no_prescriptions():
    # Arrange — an un-performed Session stripped of every Prescription
    draft = _draft(sessions=[_session(session_id=7, prescriptions=[])])

    # Act
    errors = validate_deploy(
        draft,
        performed_session_ids=set(),
        known_session_ids={7},
        exercise_exists=_always_exists,
    )

    # Assert — an empty Session would launch an empty Live Session; it is named
    assert [e.code for e in errors] == ["empty_session"]
    assert errors[0].session_id == 7


def test_rejects_a_prescription_with_fewer_than_one_set():
    # Arrange — a Prescription with zero sets
    draft = _draft(
        sessions=[_session(session_id=3, prescriptions=[_prescription(sets=0)])]
    )

    # Act
    errors = validate_deploy(
        draft,
        performed_session_ids=set(),
        known_session_ids={3},
        exercise_exists=_always_exists,
    )

    # Assert — the offending Prescription is located by Session and position
    assert [e.code for e in errors] == ["invalid_sets"]
    assert errors[0].session_id == 3
    assert errors[0].position == 0


def test_rejects_a_prescription_with_an_empty_rep_target():
    # Arrange — a Prescription whose reps are blank (whitespace only)
    draft = _draft(
        sessions=[_session(session_id=3, prescriptions=[_prescription(reps="   ")])]
    )

    # Act
    errors = validate_deploy(
        draft,
        performed_session_ids=set(),
        known_session_ids={3},
        exercise_exists=_always_exists,
    )

    # Assert
    assert [e.code for e in errors] == ["empty_reps"]
    assert errors[0].position == 0


def test_rejects_a_prescription_referencing_an_unknown_exercise():
    # Arrange — a Prescription pointing at a catalog id that does not exist
    draft = _draft(
        sessions=[
            _session(session_id=3, prescriptions=[_prescription(exercise_id=999)])
        ]
    )

    # Act — no Exercise exists
    errors = validate_deploy(
        draft,
        performed_session_ids=set(),
        known_session_ids={3},
        exercise_exists=lambda _id: False,
    )

    # Assert
    assert [e.code for e in errors] == ["unknown_exercise"]
    assert errors[0].position == 0


def test_rejects_a_session_id_that_does_not_belong_to_the_protocol():
    # Arrange — the tail names Session 42, which is not part of this Protocol
    draft = _draft(sessions=[_session(session_id=42)])

    # Act
    errors = validate_deploy(
        draft,
        performed_session_ids=set(),
        known_session_ids={1, 2},
        exercise_exists=_always_exists,
    )

    # Assert
    assert [e.code for e in errors] == ["unknown_session"]
    assert errors[0].session_id == 42


def test_rejects_weeks_out_of_range():
    # Arrange — 0 weeks is below the minimum
    draft = _draft(weeks=0)

    # Act
    errors = validate_deploy(
        draft,
        performed_session_ids=set(),
        known_session_ids={1},
        exercise_exists=_always_exists,
    )

    # Assert
    assert [e.code for e in errors] == ["weeks_out_of_range"]


def test_rejects_sessions_per_week_out_of_range():
    # Arrange — 15 sessions per week is above the maximum
    draft = _draft(sessions_per_week=15)

    # Act
    errors = validate_deploy(
        draft,
        performed_session_ids=set(),
        known_session_ids={1},
        exercise_exists=_always_exists,
    )

    # Assert
    assert [e.code for e in errors] == ["sessions_per_week_out_of_range"]


def test_rejects_a_draft_with_no_sessions():
    # Arrange — a plan with zero Sessions
    draft = _draft(sessions=[])

    # Act
    errors = validate_deploy(
        draft,
        performed_session_ids=set(),
        known_session_ids=set(),
        exercise_exists=_always_exists,
    )

    # Assert
    assert [e.code for e in errors] == ["no_sessions"]


def test_reports_every_offending_item_at_once():
    # Arrange — one Session with a bad-sets Prescription and one empty Session
    draft = _draft(
        sessions=[
            _session(session_id=1, prescriptions=[_prescription(sets=0)]),
            _session(session_id=2, prescriptions=[]),
        ]
    )

    # Act
    errors = validate_deploy(
        draft,
        performed_session_ids=set(),
        known_session_ids={1, 2},
        exercise_exists=_always_exists,
    )

    # Assert — both problems are surfaced, so the user can fix them in one pass
    assert {e.code for e in errors} == {"invalid_sets", "empty_session"}
