"""Per-exercise stat header read model (F6 Slice 2) — the *record* side, honest.

``exercise_records`` reads the user's Logged Sessions and projects them onto a single
Exercise, deriving the two figures the stat header shows: the **Personal Record**
(highest Estimated 1RM, or ``None`` when no absolute-Load set in the trustworthy
1–12-rep window exists) and **Total Sets** (a count of the user's Logged Sets of the
Exercise). It reuses the shipped ``one_rep_max`` / ``personal_records`` domain and is
scoped to the owning user — no new strength logic, no ORM, no HTTP. Exercised with the
in-memory Logged-Session repository."""

from __future__ import annotations

from datetime import date

from app.domain.exercise import Provenance
from app.domain.load import LoadKind, ParsedLoad
from app.logbook.exercise_records import exercise_records
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
PRESS = 2


def _build():
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    exercises.find_or_create("Push-up", provenance=Provenance.CURATED)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    return exercises, sessions, logged


def _session(sessions, user) -> int:
    view = sessions.create(
        user,
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    return view.id


def _log(logged, user, session_id, performed_on, sets):
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_id, performed_on=performed_on, logged_sets=sets
        ),
    )


def _absolute(kg: float) -> dict:
    """The stored typed-Load dict for an absolute kilogram load."""

    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def test_personal_record_is_the_highest_estimated_1rm_over_absolute_load_history():
    # Arrange — three squat sets; the middle one carries the heaviest Estimated 1RM
    _, sessions, logged = _build()
    s = _session(sessions, "user_a")
    _log(
        logged,
        "user_a",
        s,
        date(2026, 1, 1),
        [
            LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(100.0)),
            LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(120.0)),
            LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(110.0)),
        ],
    )

    # Act
    view = exercise_records("user_a", SQUAT, logged=logged)

    # Assert — the best Estimated 1RM across the history, and the Exercise's name
    assert view.exercise_id == SQUAT
    assert view.exercise_name == "Back Squat"
    assert view.personal_record == 120.0


def test_a_heavier_estimated_max_at_more_reps_beats_a_lighter_true_single():
    # Arrange — a 100 kg single, then 90 kg × 5 (Epley ≈ 105 kg estimated)
    _, sessions, logged = _build()
    s = _session(sessions, "user_reps")
    _log(
        logged,
        "user_reps",
        s,
        date(2026, 1, 1),
        [
            LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(100.0)),
            LoggedSetDraft(exercise_id=SQUAT, reps=5, load=_absolute(90.0)),
        ],
    )

    # Act
    view = exercise_records("user_reps", SQUAT, logged=logged)

    # Assert — the Personal Record is the estimate, not the heaviest bar (90 kg)
    assert view.personal_record == 90.0 * (1 + 5 / 30)


def test_personal_record_is_absent_when_only_non_absolute_or_high_rep_sets_exist():
    # Arrange — a bodyweight set, a qualitative set, and an untrustworthy 20-rep set:
    # none carries a comparable Estimated 1RM
    _, sessions, logged = _build()
    s = _session(sessions, "user_bw")
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    qualitative = ParsedLoad(kind=LoadKind.QUALITATIVE, text="hard").to_dict()
    _log(
        logged,
        "user_bw",
        s,
        date(2026, 1, 1),
        [
            LoggedSetDraft(exercise_id=PRESS, reps=10, load=bodyweight),
            LoggedSetDraft(exercise_id=PRESS, reps=8, load=qualitative),
            LoggedSetDraft(exercise_id=PRESS, reps=20, load=_absolute(40.0)),
        ],
    )

    # Act
    view = exercise_records("user_bw", PRESS, logged=logged)

    # Assert — no PR (tile is hidden, not zeroed), but the sets still count
    assert view.personal_record is None
    assert view.total_sets == 3


def test_total_sets_counts_every_logged_set_of_the_exercise_across_sessions():
    # Arrange — two performances of the squat, three sets then two
    _, sessions, logged = _build()
    s1 = _session(sessions, "user_ts")
    s2 = _session(sessions, "user_ts")
    _log(
        logged,
        "user_ts",
        s1,
        date(2026, 1, 1),
        [LoggedSetDraft(exercise_id=SQUAT, reps=5, load=_absolute(100.0))] * 3,
    )
    _log(
        logged,
        "user_ts",
        s2,
        date(2026, 1, 8),
        [LoggedSetDraft(exercise_id=SQUAT, reps=5, load=_absolute(105.0))] * 2,
    )

    # Act
    view = exercise_records("user_ts", SQUAT, logged=logged)

    # Assert — all five sets across both sessions are counted
    assert view.total_sets == 5


def test_only_the_requested_exercises_sets_contribute():
    # Arrange — one session mixes squats and presses
    _, sessions, logged = _build()
    s = _session(sessions, "user_mix")
    _log(
        logged,
        "user_mix",
        s,
        date(2026, 1, 1),
        [
            LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(100.0)),
            LoggedSetDraft(exercise_id=PRESS, reps=1, load=_absolute(200.0)),
        ],
    )

    # Act — ask only about the squat
    view = exercise_records("user_mix", SQUAT, logged=logged)

    # Assert — the press's heavier set neither counts nor sets this Exercise's PR
    assert view.total_sets == 1
    assert view.personal_record == 100.0


def test_another_users_performances_do_not_appear():
    # Arrange — only the owner's logs count
    _, sessions, logged = _build()
    mine = _session(sessions, "user_me")
    theirs = _session(sessions, "user_them")
    _log(
        logged,
        "user_them",
        theirs,
        date(2026, 1, 1),
        [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(200.0))],
    )
    _log(
        logged,
        "user_me",
        mine,
        date(2026, 1, 2),
        [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(100.0))],
    )

    # Act
    view = exercise_records("user_me", SQUAT, logged=logged)

    # Assert — I see only my own set and my own PR
    assert view.total_sets == 1
    assert view.personal_record == 100.0


def test_never_performed_exercise_is_an_honest_empty_state():
    # Arrange — the user logged presses, never squats
    _, sessions, logged = _build()
    s = _session(sessions, "user_none")
    _log(
        logged,
        "user_none",
        s,
        date(2026, 1, 1),
        [LoggedSetDraft(exercise_id=PRESS, reps=1, load=_absolute(60.0))],
    )

    # Act
    view = exercise_records("user_none", SQUAT, logged=logged)

    # Assert — zero sets, no PR, no name to surface — never an error
    assert view.total_sets == 0
    assert view.personal_record is None
    assert view.exercise_name == ""
    assert view.top_set_series == []


def test_top_set_series_is_the_best_estimated_1rm_per_session_oldest_first():
    # Arrange — two performances; each session's *best* Est. 1RM is the top set, and
    # the later session's is heavier
    _, sessions, logged = _build()
    s1 = _session(sessions, "user_ts1")
    s2 = _session(sessions, "user_ts1")
    _log(
        logged,
        "user_ts1",
        s1,
        date(2026, 1, 1),
        [
            LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(100.0)),
            LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(110.0)),
        ],
    )
    _log(
        logged,
        "user_ts1",
        s2,
        date(2026, 1, 8),
        [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(120.0))],
    )

    # Act
    view = exercise_records("user_ts1", SQUAT, logged=logged)

    # Assert — one point per session, oldest-first, each the session's best Est. 1RM
    assert [(p.performed_on, p.estimated_1rm) for p in view.top_set_series] == [
        (date(2026, 1, 1), 110.0),
        (date(2026, 1, 8), 120.0),
    ]


def test_top_set_series_omits_non_qualifying_sessions_with_no_zero_padding():
    # Arrange — three sessions, but the middle one holds only a bodyweight set, so it
    # has no comparable Est. 1RM and must not appear (never a 0-height gap bar)
    _, sessions, logged = _build()
    s1 = _session(sessions, "user_gap")
    s2 = _session(sessions, "user_gap")
    s3 = _session(sessions, "user_gap")
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    _log(logged, "user_gap", s1, date(2026, 1, 1),
         [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(100.0))])
    _log(logged, "user_gap", s2, date(2026, 1, 8),
         [LoggedSetDraft(exercise_id=SQUAT, reps=5, load=bodyweight)])
    _log(logged, "user_gap", s3, date(2026, 1, 15),
         [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(105.0))])

    # Act
    view = exercise_records("user_gap", SQUAT, logged=logged)

    # Assert — only the two qualifying sessions contribute; no gap point for the middle
    assert [(p.performed_on, p.estimated_1rm) for p in view.top_set_series] == [
        (date(2026, 1, 1), 100.0),
        (date(2026, 1, 15), 105.0),
    ]


def test_top_set_series_caps_at_the_last_eight_qualifying_sessions():
    # Arrange — ten qualifying squat sessions, one per day, increasing
    _, sessions, logged = _build()
    for day in range(1, 11):
        s = _session(sessions, "user_cap")
        _log(logged, "user_cap", s, date(2026, 1, day),
             [LoggedSetDraft(exercise_id=SQUAT, reps=1, load=_absolute(100.0 + day))])

    # Act
    view = exercise_records("user_cap", SQUAT, logged=logged)

    # Assert — only the most recent eight, still oldest-first (days 3..10 kept)
    assert len(view.top_set_series) == 8
    assert [p.performed_on for p in view.top_set_series] == [
        date(2026, 1, day) for day in range(3, 11)
    ]
