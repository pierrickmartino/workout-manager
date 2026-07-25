"""The shared Personal-Record read helpers behind Analytics and Home.

``app/domain/personal_records.py`` owns the one history→``LoggedSetRecord`` flattening
(``logged_set_records``) that Analytics, Home, the per-Exercise stat header and the
Achievement wall all detect PRs off, so PR detection can never drift between surfaces
(ADR-0029). ``latest_personal_record`` sits on top of it: the newest Personal Record by
date across every Exercise, or
``None`` when the record holds no absolute-Load PR in the trustworthy rep window.

Exercised with the in-memory Logged-Session repository — offline, no ORM."""

from __future__ import annotations

from datetime import date, timedelta

from app.domain.exercise import Provenance
from app.domain.load import LoadKind, ParsedLoad
from app.domain.personal_records import logged_set_records
from app.logbook.records import latest_personal_record
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    SessionDraft,
)

SQUAT = 1
DEADLIFT = 2
TODAY = date(2026, 7, 19)


def _build():
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create(
        "Back Squat", provenance=Provenance.CURATED, targeted_muscles=["quadriceps"]
    )
    exercises.find_or_create(
        "Deadlift", provenance=Provenance.CURATED, targeted_muscles=["hamstrings"]
    )
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return sessions, logged


def _abs(kg: float) -> dict:
    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _log(sessions, logged, user, performed_on, sets):
    session_view = sessions.create(
        user,
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_view.id, performed_on=performed_on, logged_sets=sets
        ),
    )


def test_flattening_pairs_each_set_with_its_session_date():
    # Arrange — one session, two sets, on a known date
    sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_flat",
        TODAY,
        [
            LoggedSetDraft(exercise_id=SQUAT, reps=5, load=_abs(100.0)),
            LoggedSetDraft(exercise_id=DEADLIFT, reps=3, load=_abs(140.0)),
        ],
    )

    # Act
    records = logged_set_records(logged.list_for_user("user_flat"))

    # Assert — every Logged Set is flattened and stamped with its session's date
    assert [(r.exercise_id, r.reps, r.performed_on) for r in records] == [
        (SQUAT, 5, TODAY),
        (DEADLIFT, 3, TODAY),
    ]


def test_flattening_carries_the_performed_body_weight_onto_each_record():
    # Arrange — a bodyweight set logged with the mass it was performed at (ADR-0026)
    sessions, logged = _build()
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    _log(
        sessions,
        logged,
        "user_mass",
        TODAY,
        [
            LoggedSetDraft(
                exercise_id=SQUAT, reps=5, load=bodyweight, body_weight_kg=75.0
            )
        ],
    )

    # Act
    records = logged_set_records(logged.list_for_user("user_mass"))

    # Assert — the field a hand-rolled flattening dropped survives the seam (ADR-0029)
    assert [record.body_weight_kg for record in records] == [75.0]


def test_latest_personal_record_is_the_newest_pr_by_date_across_exercises():
    # Arrange — a Squat PR 10 days ago and a Deadlift PR 3 days ago; the Deadlift is
    # the more recent record even though it is a different (and here lighter) lift.
    sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_a",
        TODAY - timedelta(days=10),
        [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_abs(200.0))],
    )
    _log(
        sessions,
        logged,
        "user_a",
        TODAY - timedelta(days=3),
        [LoggedSetDraft(exercise_id=DEADLIFT, reps=1, load=_abs(142.0))],
    )

    # Act
    latest = latest_personal_record(logged.list_for_user("user_a"))

    # Assert — the newest PR by date wins, not the heaviest lift
    assert latest is not None
    assert latest.exercise_id == DEADLIFT
    assert latest.exercise_name == "Deadlift"
    assert latest.estimated_1rm == 142.0
    assert latest.performed_on == TODAY - timedelta(days=3)


def test_latest_personal_record_is_none_without_a_qualifying_absolute_load_pr():
    # Arrange — a bodyweight-only trainee: reps logged, but no absolute Load ever, so
    # no set carries a comparable Estimated 1RM and nothing can set a PR.
    sessions, logged = _build()
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    _log(
        sessions,
        logged,
        "user_bw",
        TODAY,
        [LoggedSetDraft(exercise_id=SQUAT, reps=10, load=bodyweight)],
    )

    # Act
    latest = latest_personal_record(logged.list_for_user("user_bw"))

    # Assert — the honest hidden state, never a zeroed PR
    assert latest is None


def test_latest_personal_record_is_none_for_a_brand_new_account():
    # Arrange — a user who has logged nothing at all
    _, logged = _build()

    # Act & Assert — an empty history projects to no PR, not an error
    assert latest_personal_record(logged.list_for_user("user_fresh")) is None


def test_latest_personal_record_recomputes_when_the_pr_behind_it_is_removed():
    # Arrange — an earlier 130 kg Squat PR and a later, heavier 150 kg one. The latest
    # PR is the 150 kg set.
    sessions, logged = _build()
    _log(
        sessions,
        logged,
        "user_del",
        TODAY - timedelta(days=20),
        [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_abs(130.0))],
    )
    _log(
        sessions,
        logged,
        "user_del",
        TODAY - timedelta(days=2),
        [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_abs(150.0))],
    )
    full_history = logged.list_for_user("user_del")
    assert latest_personal_record(full_history).estimated_1rm == 150.0

    # Act — the record is a read-time projection with no PR table (ADR-0010/0018), so
    # "deleting" the heavier log is simply reading a history without that session.
    without_heaviest = [
        session
        for session in full_history
        if session.performed_on != TODAY - timedelta(days=2)
    ]
    latest = latest_personal_record(without_heaviest)

    # Assert — non-monotonic: the PR falls back to the surviving 130 kg record, never
    # frozen at the now-deleted 150 kg best.
    assert latest is not None
    assert latest.estimated_1rm == 130.0
