"""Behavior of the Profile progress endpoint end to end (F5 Slice 1): real JWKS
verification, the record-side repository, and the response envelope wired through
FastAPI. Repositories are injected via dependency overrides so tests run offline.

``GET /api/profile/progress`` returns the honest Profile read model — the weekly
Streak, the lifetime Total Sessions / Total Sets, and the Fitness Level standing —
scoped to the authenticated user. A user who has logged nothing sees zeros, not an
error; an unauthenticated request is rejected. Mirrors ``test_analytics_endpoint.py``.

The last block is the ADR-0112 placement: the Effective Fitness Level is served here,
and a **negative** test asserts the Profile endpoint does not carry it — the structural
reason it cannot be written back into the declared baseline, pinned as a test rather
than left as a comment."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.completion import CompletionOutcome
from app.domain.exercise import Provenance
from app.domain.fitness_profile import DEFAULT_STRONG_SESSIONS_PER_LEVEL
from app.domain.load import LoadKind, ParsedLoad
from app.domain.progression import LOW_EFFORT_MAX
from app.main import create_app
from app.repositories.deps import (
    get_logged_session_repository,
    get_profile_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    SessionDraft,
)
from tests.conftest import ISSUER, make_signing_context
from tests.quantities import reps_quantity

SQUAT = 1
# One more catalog Exercise per remaining real Muscle Group, so a history can reach Full
# Coverage over HTTP: with Back Squat's quadriceps they make all six.
_COVERAGE = (
    ("Bench Press", "chest"),
    ("Pull-Up", "lats"),
    ("Overhead Press", "deltoids"),
    ("Biceps Curl", "biceps"),
    ("Plank", "abs"),
)
# The catalog ids they are created with, after Back Squat's.
_COVERAGE_IDS = tuple(range(SQUAT + 1, SQUAT + 1 + len(_COVERAGE)))
_WEEK = timedelta(days=7)


def _monday_of(day: date) -> date:
    """The ISO-week Monday of ``day`` — lets tests place a session squarely in the
    current week regardless of which weekday the suite happens to run on."""

    return day - timedelta(days=day.weekday())


def build_client(ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        targeted_muscles=["quadriceps", "glutes"],
    )
    for name, muscle in _COVERAGE:
        exercises.find_or_create(
            name, provenance=Provenance.CURATED, targeted_muscles=[muscle]
        )
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    # The Fitness Level standing's second input: the stored Declared levels (ADR-0112).
    # The progress read is the *only* thing this repository serves here — it is read, and
    # nothing on this route ever writes to it.
    profiles = InMemoryProfileRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    return TestClient(app), ctx, sessions, logged, profiles


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _declare(profiles, user, levels):
    """Save ``user``'s per-Training-Type Declared Fitness Levels."""

    profiles.update(user, ProfileUpdate(fitness_levels=levels))


def _perform(
    sessions,
    logged,
    user,
    performed_on,
    set_count,
    *,
    training_type="strength",
    outcome=None,
    effort=None,
    exercise_ids=(SQUAT,),
    load=None,
):
    """Record one performance, optionally carrying the two signals the Effective
    Fitness Level reads: the declared Completion Outcome and the rated Effort. Returns
    the Logged Session, so a test can delete it again."""

    session_view = sessions.create(
        user,
        SessionDraft(
            training_type=training_type, duration_minutes=45, prescriptions=[]
        ),
    )
    return logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_view.id,
            # Restated on the record, as the log service does for a plan-backed write.
            training_type=training_type,
            performed_on=performed_on,
            completion_outcome=outcome,
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=exercise_id,
                    quantity=reps_quantity(5),
                    load=load,
                    perceived_difficulty=effort,
                )
                for exercise_id in exercise_ids
                for _ in range(set_count)
            ],
        ),
    )


def _perform_comfortable(sessions, logged, user, count):
    """``count`` Completed Sessions whose every rated set sat at low Effort — the
    evidence the Effective level reads *for* the user (ADR-0112)."""

    for index in range(count):
        _perform(
            sessions,
            logged,
            user,
            date.today() - timedelta(days=index),
            1,
            outcome=CompletionOutcome.COMPLETED.value,
            effort=LOW_EFFORT_MAX,
        )


def test_returns_streak_and_lifetime_counts_in_the_envelope():
    # Arrange — two sessions this week and last week, five sets in all
    client, ctx, sessions, logged, _ = build_client()
    this_week = _monday_of(date.today())
    _perform(sessions, logged, "user_a", this_week, 3)
    _perform(sessions, logged, "user_a", this_week - _WEEK, 2)

    # Act
    response = client.get("/api/profile/progress", headers=_auth(ctx, "user_a"))

    # Assert — the honest read model rides in the standard envelope
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    data = body["data"]
    # The achievement wall serializes alongside; its shape is asserted on its own below.
    achievements = data.pop("achievements")
    # XP: two sessions of 3 + 2 sets = 2 * 100 + 5 * 10 = 250, landing inside Level 1.
    assert data == {
        "xp": 250,
        "level": {
            "level": 1,
            "xp_into_level": 250,
            "xp_span_of_level": 400,
            "xp_to_next": 150,
        },
        "streak": 2,
        "total_sessions": 2,
        "total_sets": 5,
        # No Declared level is on file, so there is no standing to read against one.
        "fitness_levels": [],
    }
    # Two Logged Sessions earn the First Session and fall short of every other threshold.
    assert [a["id"] for a in achievements if a["unlocked"]] == ["sessions-1"]


def test_empty_user_sees_zero_states_not_an_error():
    # Arrange — a brand-new user with no logged history
    client, ctx, _, _, _ = build_client()

    # Act
    response = client.get("/api/profile/progress", headers=_auth(ctx, "newcomer"))

    # Assert — sensible zeros in a success envelope; 0 XP is Level 1 with an empty bar
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    achievements = data.pop("achievements")
    assert data == {
        "xp": 0,
        "level": {
            "level": 1,
            "xp_into_level": 0,
            "xp_span_of_level": 400,
            "xp_to_next": 400,
        },
        "streak": 0,
        "total_sessions": 0,
        "total_sets": 0,
        "fitness_levels": [],
    }
    # A brand-new user sees the whole catalog locked at 0 progress, no unlock dates.
    assert achievements
    assert all(
        a["unlocked"] is False and a["current"] == 0 and a["unlocked_on"] is None
        for a in achievements
    )


def test_projection_is_scoped_to_the_authenticated_user():
    # Arrange — another user's history must not leak into mine
    client, ctx, sessions, logged, _ = build_client()
    _perform(sessions, logged, "theirs", date.today(), 9)

    # Act — I have logged nothing
    response = client.get("/api/profile/progress", headers=_auth(ctx, "mine"))

    # Assert — I see my own empty projection, not their sets
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["streak"] == 0
    assert data["total_sessions"] == 0
    assert data["total_sets"] == 0
    assert data["xp"] == 0
    assert data["level"]["level"] == 1


def test_serializes_an_unlocked_achievement_with_its_earned_date():
    # Arrange — five Logged Sessions unlock the 5-session badge; the fifth is dated
    client, ctx, sessions, logged, _ = build_client()
    first_five = [date(2026, 6, 1) + timedelta(days=i) for i in range(5)]
    performed = [_perform(sessions, logged, "user_e", day, 1) for day in first_five]
    fifth = performed[4]

    # Act
    response = client.get("/api/profile/progress", headers=_auth(ctx, "user_e"))

    # Assert — the badge serializes with the full DTO shape, unlocked on the earliest
    # qualifying date
    assert response.status_code == 200
    achievements = response.json()["data"]["achievements"]
    by_id = {a["id"]: a for a in achievements}
    assert by_id["sessions-5"] == {
        "id": "sessions-5",
        "name": "5 Sessions",
        "criteria": "Log 5 Sessions",
        "unlocked": True,
        "current": 5,
        "target": 5,
        "unlocked_on": first_five[4].isoformat(),
        "unlocked_by_session_id": fifth.id,
    }
    # A still-locked badge carries live progress and no date.
    assert by_id["sessions-25"]["unlocked"] is False
    assert by_id["sessions-25"]["current"] == 5
    assert by_id["sessions-25"]["unlocked_on"] is None


# --- the First Session Stamp (ADR-0126, #651) ---


def _first_session(client, ctx, user):
    response = client.get("/api/profile/progress", headers=_auth(ctx, user))
    assert response.status_code == 200
    return response.json()["data"]["achievements"][0]


def test_a_new_user_sees_first_session_first_in_the_catalog_locked_at_zero():
    # Arrange — nothing logged yet
    client, ctx, _, _, _ = build_client()

    # Act
    first = _first_session(client, ctx, "newcomer")

    # Assert — the first entry in catalog order is the First Session, at 0/1
    assert first == {
        "id": "sessions-1",
        "name": "First Session",
        "criteria": "Log your first Session",
        "unlocked": False,
        "current": 0,
        "target": 1,
        "unlocked_on": None,
        "unlocked_by_session_id": None,
    }


def test_the_first_logged_session_earns_first_session_dated_on_that_session():
    # Arrange — two Logged Sessions; the earlier one is the first
    client, ctx, sessions, logged, _ = build_client()
    _perform(sessions, logged, "user_f", date(2026, 6, 9), 1)
    earliest = _perform(sessions, logged, "user_f", date(2026, 6, 2), 1)

    # Act
    first = _first_session(client, ctx, "user_f")

    # Assert
    assert first["id"] == "sessions-1"
    assert first["unlocked"] is True
    assert first["current"] == 2
    assert first["unlocked_on"] == "2026-06-02"
    assert first["unlocked_by_session_id"] == earliest.id


def test_a_partially_completed_session_still_earns_first_session():
    # Arrange — the only Logged Session is Incomplete: the Passport counts work performed
    client, ctx, sessions, logged, _ = build_client()
    _perform(
        sessions,
        logged,
        "user_p",
        date(2026, 6, 2),
        1,
        outcome=CompletionOutcome.INCOMPLETE.value,
    )

    # Act
    first = _first_session(client, ctx, "user_p")

    # Assert
    assert first["unlocked"] is True
    assert first["unlocked_on"] == "2026-06-02"


def test_deleting_the_only_logged_session_locks_first_session_again():
    # Arrange — one Logged Session earned the Stamp, then it is deleted
    client, ctx, sessions, logged, _ = build_client()
    only = _perform(sessions, logged, "user_d", date(2026, 6, 2), 1)
    assert _first_session(client, ctx, "user_d")["unlocked"] is True
    assert logged.delete(only.id, "user_d") is True

    # Act
    first = _first_session(client, ctx, "user_d")

    # Assert — a read-time projection with no ledger re-locks (ADR-0018)
    assert first["unlocked"] is False
    assert first["current"] == 0
    assert first["unlocked_on"] is None
    assert first["unlocked_by_session_id"] is None


# --- the crossing Logged Session behind each Stamp (#652) ---


def _achievements_by_id(client, ctx, user):
    response = client.get("/api/profile/progress", headers=_auth(ctx, user))
    assert response.status_code == 200
    return {a["id"]: a for a in response.json()["data"]["achievements"]}


def test_every_earned_family_names_its_crossing_session_and_locked_ones_none():
    # Arrange — four consecutive weeks: the first week lifts an absolute load (a record),
    # the third trains every Muscle Group, the fourth completes the 4-week run and is the
    # fifth Logged Session overall
    client, ctx, sessions, logged, _ = build_client()
    start = date(2026, 3, 2)  # a Monday
    record = _perform(
        sessions,
        logged,
        "user_x",
        start,
        1,
        load=ParsedLoad(kind=LoadKind.ABSOLUTE, text="100 kg", kg=100.0).to_dict(),
    )
    _perform(sessions, logged, "user_x", start + _WEEK, 1)
    coverage = _perform(
        sessions,
        logged,
        "user_x",
        start + 2 * _WEEK,
        1,
        exercise_ids=(SQUAT, *_COVERAGE_IDS),
    )
    _perform(sessions, logged, "user_x", start + 3 * _WEEK - timedelta(days=1), 1)
    fourth_week = _perform(sessions, logged, "user_x", start + 3 * _WEEK, 1)

    # Act
    by_id = _achievements_by_id(client, ctx, "user_x")

    # Assert — each family names the session that crossed its target
    assert by_id["sessions-1"]["unlocked_by_session_id"] == record.id
    assert by_id["sessions-5"]["unlocked_by_session_id"] == fourth_week.id
    assert by_id["streak-4"]["unlocked_by_session_id"] == fourth_week.id
    assert by_id["muscle-all"]["unlocked_by_session_id"] == coverage.id
    assert by_id["first-pr"]["unlocked_by_session_id"] == record.id
    # ...and every locked one names none
    for locked in ("sessions-25", "sessions-100", "streak-12"):
        assert by_id[locked]["unlocked"] is False
        assert by_id[locked]["unlocked_by_session_id"] is None


def test_an_incomplete_session_can_be_the_crossing_session():
    # Arrange — the fifth Logged Session is Incomplete: the Passport counts work performed
    client, ctx, sessions, logged, _ = build_client()
    days = [date(2026, 6, 1) + timedelta(days=i) for i in range(5)]
    for day in days[:4]:
        _perform(sessions, logged, "user_i", day, 1)
    fifth = _perform(
        sessions,
        logged,
        "user_i",
        days[4],
        1,
        outcome=CompletionOutcome.INCOMPLETE.value,
    )

    # Act
    five = _achievements_by_id(client, ctx, "user_i")["sessions-5"]

    # Assert
    assert five["unlocked_by_session_id"] == fifth.id


def test_deleting_the_crossing_session_moves_the_source_to_the_next_crossing():
    # Arrange — six Logged Sessions; the fifth crossed the 5-session target
    client, ctx, sessions, logged, _ = build_client()
    days = [date(2026, 6, 1) + timedelta(days=i) for i in range(6)]
    performed = [_perform(sessions, logged, "user_m", day, 1) for day in days]
    assert logged.delete(performed[4].id, "user_m") is True

    # Act
    five = _achievements_by_id(client, ctx, "user_m")["sessions-5"]

    # Assert — the sixth session now crosses; the link never names the deleted record
    assert five["unlocked"] is True
    assert five["unlocked_by_session_id"] == performed[5].id
    assert five["unlocked_on"] == days[5].isoformat()


def test_deleting_the_crossing_session_with_no_successor_locks_the_stamp_again():
    # Arrange — exactly five Logged Sessions; the last one crossed the target
    client, ctx, sessions, logged, _ = build_client()
    days = [date(2026, 6, 1) + timedelta(days=i) for i in range(5)]
    performed = [_perform(sessions, logged, "user_n", day, 1) for day in days]
    assert logged.delete(performed[4].id, "user_n") is True

    # Act
    five = _achievements_by_id(client, ctx, "user_n")["sessions-5"]

    # Assert
    assert five["unlocked"] is False
    assert five["unlocked_by_session_id"] is None


# --- the lift behind the First Record Stamp (#653) ---


def test_first_record_carries_the_absolute_lift_that_set_it():
    # Arrange — a 100 kg × 5 squat, the first Personal Record
    client, ctx, sessions, logged, _ = build_client()
    record = _perform(
        sessions,
        logged,
        "user_r",
        date(2026, 6, 2),
        1,
        load=ParsedLoad(kind=LoadKind.ABSOLUTE, text="100 kg", kg=100.0).to_dict(),
    )

    # Act
    by_id = _achievements_by_id(client, ctx, "user_r")

    # Assert — the lift, shaped like a Personal Record plus the typed Load it was lifted at;
    # 100 kg × 5 estimates 116.7 kg by Epley
    first_pr = by_id["first-pr"]
    assert first_pr["unlocked_by_session_id"] == record.id
    assert first_pr["record"] == {
        "exercise_id": SQUAT,
        "exercise": "Back Squat",
        "estimated_1rm": pytest.approx(116.67, abs=0.01),
        "gain": 0.0,
        "date": "2026-06-02",
        "reps": 5,
        "is_bodyweight": False,
        "added_kg": None,
        "load": {"kind": "absolute", "text": "100 kg", "kg": 100.0},
        "body_weight_kg": None,
    }


def test_first_record_carries_a_bodyweight_lift_with_its_added_load_and_body_weight():
    # Arrange — a weighted pull-up, bodyweight + 20 kg × 5 at 80 kg Performed Body Weight
    client, ctx, sessions, logged, _ = build_client()
    pull_up = _COVERAGE_IDS[1]
    session_view = sessions.create(
        "user_b",
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    logged.create(
        "user_b",
        LoggedSessionDraft(
            session_id=session_view.id,
            training_type="strength",
            performed_on=date(2026, 6, 2),
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=pull_up,
                    quantity=reps_quantity(5),
                    load=ParsedLoad(
                        kind=LoadKind.BODYWEIGHT, text="bodyweight + 20 kg", added_kg=20.0
                    ).to_dict(),
                    body_weight_kg=80.0,
                )
            ],
        ),
    )

    # Act
    record = _achievements_by_id(client, ctx, "user_b")["first-pr"]["record"]

    # Assert — the set that achieved it, never a bare kilogram headline (ADR-0026)
    assert record["exercise_id"] == pull_up
    assert record["exercise"] == "Pull-Up"
    assert record["reps"] == 5
    assert record["is_bodyweight"] is True
    assert record["added_kg"] == 20.0
    assert record["body_weight_kg"] == 80.0
    assert record["load"] == {
        "kind": "bodyweight",
        "text": "bodyweight + 20 kg",
        "added_kg": 20.0,
    }


def test_only_an_unlocked_first_record_carries_a_record():
    # Arrange — sessions with no load: First Session earned, First Record locked
    client, ctx, sessions, logged, _ = build_client()
    _perform(sessions, logged, "user_l", date(2026, 6, 2), 1)

    # Act
    by_id = _achievements_by_id(client, ctx, "user_l")

    # Assert — a locked First Record carries null; no other Achievement carries the key
    assert by_id["first-pr"]["unlocked"] is False
    assert by_id["first-pr"]["record"] is None
    assert all("record" not in a for key, a in by_id.items() if key != "first-pr")


def test_deleting_the_record_session_moves_the_record_to_the_next_one_or_clears_it():
    # Arrange — two record-setting sessions; the earlier one is deleted
    client, ctx, sessions, logged, _ = build_client()

    def lift(day, kg):
        return _perform(
            sessions,
            logged,
            "user_z",
            day,
            1,
            load=ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg} kg", kg=kg).to_dict(),
        )

    first = lift(date(2026, 6, 2), 100.0)
    second = lift(date(2026, 6, 9), 110.0)
    assert logged.delete(first.id, "user_z") is True

    # Act
    moved = _achievements_by_id(client, ctx, "user_z")["first-pr"]

    # Assert — the later session now sets the first record
    assert moved["unlocked_by_session_id"] == second.id
    assert moved["record"]["date"] == "2026-06-09"
    assert moved["record"]["load"]["kg"] == 110.0

    # ...and deleting that one too clears it
    assert logged.delete(second.id, "user_z") is True
    cleared = _achievements_by_id(client, ctx, "user_z")["first-pr"]
    assert cleared["unlocked"] is False
    assert cleared["record"] is None


def test_requires_authentication():
    # Arrange
    client, _, _, _, _ = build_client()

    # Act — no token
    response = client.get("/api/profile/progress")

    # Assert
    assert response.status_code == 401


# --- the Fitness Level standing, and where it is *not* served (ADR-0112, #606) ---


def test_serves_the_declared_level_against_the_effective_one_per_training_type():
    # Arrange — a notch's worth of comfortable strength work; yoga is declared, untrained
    client, ctx, sessions, logged, profiles = build_client()
    _declare(profiles, "standing", {"strength": 5, "yoga": 2})
    _perform_comfortable(sessions, logged, "standing", DEFAULT_STRONG_SESSIONS_PER_LEVEL)

    # Act
    response = client.get("/api/profile/progress", headers=_auth(ctx, "standing"))

    # Assert — both readings ride in the standard envelope, one row per declared type
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"]["fitness_levels"] == [
        {"training_type": "strength", "declared": 5, "effective": 6},
        {"training_type": "yoga", "declared": 2, "effective": 2},
    ]


def test_the_equal_case_is_served_as_a_standing_not_an_omission():
    # Arrange — levels declared, nothing logged against them
    client, ctx, _, _, profiles = build_client()
    _declare(profiles, "quiet", {"cardio": 6})

    # Act
    response = client.get("/api/profile/progress", headers=_auth(ctx, "quiet"))

    # Assert — the row is present with both figures equal, so the screen can say the
    # record was read and showed no change rather than render a blank
    assert response.json()["data"]["fitness_levels"] == [
        {"training_type": "cardio", "declared": 6, "effective": 6}
    ]


def test_the_profile_endpoint_does_not_carry_the_effective_level():
    # Arrange — a history that demonstrably raises the Effective level one notch
    client, ctx, sessions, logged, profiles = build_client()
    _declare(profiles, "pinned", {"strength": 5})
    _perform_comfortable(sessions, logged, "pinned", DEFAULT_STRONG_SESSIONS_PER_LEVEL)

    # Act — read both halves of the Profile screen
    progress = client.get(
        "/api/profile/progress", headers=_auth(ctx, "pinned")
    ).json()["data"]
    profile = client.get("/api/profile", headers=_auth(ctx, "pinned")).json()["data"]

    # Assert — the projection is served by the progress read model...
    assert progress["fitness_levels"] == [
        {"training_type": "strength", "declared": 5, "effective": 6}
    ]
    # ...and the Profile endpoint still carries only the *declared* baseline. Its
    # `fitness_levels` field is a validated request field as well as a response field and
    # the Profile form writes it back, so a derived value placed there round-trips and the
    # first careless save would persist a projection into the baseline — the stored-ledger
    # failure ADR-0018 exists to prevent, arriving through the front door. The placement
    # is what structurally prevents it; this is the pin (ADR-0112).
    assert profile["fitness_levels"] == {"strength": 5}
    assert not [key for key in profile if "effective" in key]


def test_editing_the_declared_level_re_reads_the_standing_with_evidence_intact():
    # Arrange — a notch earned at a Declared level of 5
    client, ctx, sessions, logged, profiles = build_client()
    _declare(profiles, "editor", {"strength": 5})
    _perform_comfortable(sessions, logged, "editor", DEFAULT_STRONG_SESSIONS_PER_LEVEL)

    # Act — the user edits their Declared level through the Profile form, then re-reads
    edit = client.put(
        "/api/profile",
        headers=_auth(ctx, "editor"),
        json={"fitness_levels": {"strength": 7}},
    )
    reread = client.get("/api/profile/progress", headers=_auth(ctx, "editor"))

    # Assert — the earned notch rides on the new baseline: re-derived from the record on
    # every read, never accumulated onto the previous reading
    assert edit.status_code == 200
    assert reread.json()["data"]["fitness_levels"] == [
        {"training_type": "strength", "declared": 7, "effective": 8}
    ]
