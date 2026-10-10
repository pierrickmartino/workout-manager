"""Behavior of the per-exercise records endpoint end to end (F6 Slice 2): real JWKS
verification, the record-side repository, and the response envelope wired through
FastAPI. Repositories are injected via dependency overrides so tests run offline.

A user logs performances of a Session, then reads the stat-header figures for one
Exercise — the Personal Record (highest Estimated 1RM) and Total Sets — under the
standard success envelope. The read is scoped to the owning user, and the Personal
Record is hidden (``None``) for a movement with no absolute-Load history."""

from __future__ import annotations

from tests.quantities import reps_quantity

from datetime import date

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.domain.load import LoadKind, ParsedLoad
from app.main import create_app
from app.repositories.deps import get_logged_session_repository
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
from tests.conftest import ISSUER, make_signing_context

SQUAT = 1
PUSHUP = 2


def build_client(ctx=None):
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    exercises.find_or_create("Push-up", provenance=Provenance.CURATED)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    return TestClient(app), ctx, sessions, logged


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _absolute(kg: float) -> dict:
    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _perform(sessions, logged, user, exercise_id, performed_on, reps, load):
    session_view = sessions.create(
        user,
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=performed_on,
            logged_sets=[
                LoggedSetDraft(exercise_id=exercise_id, quantity=reps_quantity(reps), load=load)
            ],
        ),
    )


def _bodyweight(added_kg: float | None = None) -> dict:
    text = "bodyweight" if added_kg is None else f"bodyweight + {added_kg:g} kg"
    return ParsedLoad(kind=LoadKind.BODYWEIGHT, text=text, added_kg=added_kg).to_dict()


def _perform_bw(sessions, logged, user, exercise_id, performed_on, reps, *, added_kg, mass):
    session_view = sessions.create(
        user,
        SessionDraft(training_type="strength", duration_minutes=45, prescriptions=[]),
    )
    logged.create(
        user,
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=performed_on,
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=exercise_id,
                    quantity=reps_quantity(reps),
                    load=_bodyweight(added_kg),
                    body_weight_kg=mass,
                )
            ],
        ),
    )


def test_records_endpoint_surfaces_a_bodyweight_pr_as_the_set_not_kilograms():
    # Arrange — 8 pull-ups at a captured mass of 75 kg: a qualifying bodyweight PR
    client, ctx, sessions, logged = build_client()
    _perform_bw(
        sessions, logged, "user_bw_pr", PUSHUP, date(2026, 1, 1), 8,
        added_kg=None, mass=75.0,
    )

    # Act
    response = client.get(
        f"/api/exercises/{PUSHUP}/records", headers=_auth(ctx, "user_bw_pr")
    )

    # Assert — the milestone carries the set descriptor (reps, bodyweight, no added), and
    # the kg headline field stays null so no fabricated kilogram is shown (ADR-0026)
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["personal_record"] is None
    assert data["body_weight_nudge"] is False
    assert data["pr_milestones"] == [
        {
            "exercise": "Push-up",
            "estimated_1rm": 75.0 * (1 + 8 / 30),
            "gain": 0.0,
            "date": "2026-01-01",
            "reps": 8,
            "is_bodyweight": True,
            "added_kg": None,
        }
    ]


def test_records_endpoint_nudges_to_record_body_weight_when_mass_is_missing():
    # Arrange — a qualifying bodyweight set (8 reps) logged with no Performed Body Weight
    client, ctx, sessions, logged = build_client()
    _perform_bw(
        sessions, logged, "user_nudge", PUSHUP, date(2026, 1, 1), 8,
        added_kg=None, mass=None,
    )

    # Act
    response = client.get(
        f"/api/exercises/{PUSHUP}/records", headers=_auth(ctx, "user_nudge")
    )

    # Assert — record-ineligible only for the missing mass, so prompt to record weight
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["pr_milestones"] == []
    assert data["body_weight_nudge"] is True


def test_records_endpoint_returns_pr_and_total_sets_under_the_envelope():
    # Arrange — two squat singles on different dates, the newer heavier
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_a", SQUAT, date(2026, 1, 1), 1, _absolute(100.0))
    _perform(sessions, logged, "user_a", SQUAT, date(2026, 2, 1), 1, _absolute(110.0))

    # Act
    response = client.get(
        f"/api/exercises/{SQUAT}/records", headers=_auth(ctx, "user_a")
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["exercise_id"] == SQUAT
    assert data["exercise_name"] == "Back Squat"
    assert data["personal_record"] == 110.0
    assert data["total_sets"] == 2


def test_records_endpoint_returns_the_top_set_series_oldest_first():
    # Arrange — two qualifying squat sessions, the newer heavier
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_ts", SQUAT, date(2026, 1, 1), 1, _absolute(100.0))
    _perform(sessions, logged, "user_ts", SQUAT, date(2026, 1, 8), 1, _absolute(120.0))

    # Act
    response = client.get(
        f"/api/exercises/{SQUAT}/records", headers=_auth(ctx, "user_ts")
    )

    # Assert — the series rides the envelope, oldest-first, dates ISO-serialized
    assert response.status_code == 200
    series = response.json()["data"]["top_set_series"]
    assert series == [
        {"date": "2026-01-01", "estimated_1rm": 100.0},
        {"date": "2026-01-08", "estimated_1rm": 120.0},
    ]


def test_records_endpoint_returns_pr_milestones_newest_first():
    # Arrange — two squat PRs on different dates, the newer heavier
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_m", SQUAT, date(2026, 1, 1), 1, _absolute(100.0))
    _perform(sessions, logged, "user_m", SQUAT, date(2026, 2, 1), 1, _absolute(110.0))

    # Act
    response = client.get(
        f"/api/exercises/{SQUAT}/records", headers=_auth(ctx, "user_m")
    )

    # Assert — milestones ride the envelope newest-first, each with its Est. 1RM, gain
    # over the prior PR (0 for the first), and ISO date
    assert response.status_code == 200
    milestones = response.json()["data"]["pr_milestones"]
    assert milestones == [
        {
            "exercise": "Back Squat",
            "estimated_1rm": 110.0,
            "gain": 10.0,
            "date": "2026-02-01",
            "reps": 1,
            "is_bodyweight": False,
            "added_kg": None,
        },
        {
            "exercise": "Back Squat",
            "estimated_1rm": 100.0,
            "gain": 0.0,
            "date": "2026-01-01",
            "reps": 1,
            "is_bodyweight": False,
            "added_kg": None,
        },
    ]


def test_records_endpoint_returns_empty_milestones_for_a_non_absolute_exercise():
    # Arrange — a bodyweight push-up can set no Personal Record
    client, ctx, sessions, logged = build_client()
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    _perform(sessions, logged, "user_bw3", PUSHUP, date(2026, 1, 1), 12, bodyweight)

    # Act
    response = client.get(
        f"/api/exercises/{PUSHUP}/records", headers=_auth(ctx, "user_bw3")
    )

    # Assert — an honest empty milestone list, not an error
    assert response.status_code == 200
    assert response.json()["data"]["pr_milestones"] == []


def test_records_endpoint_returns_an_empty_series_for_a_non_absolute_exercise():
    # Arrange — a bodyweight push-up has no qualifying Top Set
    client, ctx, sessions, logged = build_client()
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    _perform(sessions, logged, "user_bw", PUSHUP, date(2026, 1, 1), 12, bodyweight)

    # Act
    response = client.get(
        f"/api/exercises/{PUSHUP}/records", headers=_auth(ctx, "user_bw")
    )

    # Assert — an honest empty series (no chart), never a fabricated zero bar
    assert response.status_code == 200
    assert response.json()["data"]["top_set_series"] == []


def test_records_endpoint_hides_personal_record_for_a_non_absolute_exercise():
    # Arrange — a bodyweight push-up: no comparable Estimated 1RM
    client, ctx, sessions, logged = build_client()
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    _perform(sessions, logged, "user_b", PUSHUP, date(2026, 1, 1), 12, bodyweight)

    # Act
    response = client.get(
        f"/api/exercises/{PUSHUP}/records", headers=_auth(ctx, "user_b")
    )

    # Assert — PR is null (tile hidden, not zeroed), but Total Sets still renders
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["personal_record"] is None
    assert data["total_sets"] == 1


def test_records_endpoint_is_scoped_to_the_authenticated_user():
    # Arrange — another user's heavier squat must not leak into mine
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_them", SQUAT, date(2026, 1, 1), 1, _absolute(200.0))

    # Act — I have logged nothing
    response = client.get(
        f"/api/exercises/{SQUAT}/records", headers=_auth(ctx, "user_me")
    )

    # Assert — an honest empty read, not the other user's record
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["personal_record"] is None
    assert data["total_sets"] == 0


def test_records_endpoint_requires_authentication():
    # Arrange
    client, _, _, _ = build_client()

    # Act — no token
    response = client.get(f"/api/exercises/{SQUAT}/records")

    # Assert
    assert response.status_code == 401


def _story(client, ctx, user, exercise_id):
    response = client.get(
        f"/api/exercises/{exercise_id}/records", headers=_auth(ctx, user)
    )
    assert response.status_code == 200
    return response.json()["data"]["story"]


def test_records_endpoint_carries_the_progress_story():
    # Arrange — 8 then 10 squats at 60 kg
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_story", SQUAT, date(2026, 1, 1), 8, _absolute(60.0))
    _perform(sessions, logged, "user_story", SQUAT, date(2026, 1, 8), 10, _absolute(60.0))
    previous, latest = sorted(
        logged.list_for_user("user_story"), key=lambda session: session.performed_on
    )

    # Act
    story = _story(client, ctx, "user_story", SQUAT)

    # Assert — the structured result, linking the caller's own two Logged Sessions
    assert story == {
        "kind": "improved",
        "axis": "reps_at_load",
        "load_kind": "absolute",
        "held": 60.0,
        "delta": 2,
        "latest": {"logged_session_id": latest.id, "performed_on": "2026-01-08", "value": 10},
        "previous": {
            "logged_session_id": previous.id,
            "performed_on": "2026-01-01",
            "value": 8,
        },
        "body_weight": None,
    }


def test_records_endpoint_story_compares_bodyweight_on_the_added_load():
    # Arrange — weighted push-ups at +10 kg: 4 reps at 80 kg body weight, then 6 at 78 kg
    client, ctx, sessions, logged = build_client()
    _perform_bw(
        sessions, logged, "user_bw_story", PUSHUP, date(2026, 1, 1), 4,
        added_kg=10.0, mass=80.0,
    )
    _perform_bw(
        sessions, logged, "user_bw_story", PUSHUP, date(2026, 1, 8), 6,
        added_kg=10.0, mass=78.0,
    )
    previous, latest = sorted(
        logged.list_for_user("user_bw_story"), key=lambda session: session.performed_on
    )

    # Act
    story = _story(client, ctx, "user_bw_story", PUSHUP)

    # Assert — held on the added 10 kg, with both Performed Body Weights for the footnote
    assert story == {
        "kind": "improved",
        "axis": "reps_at_load",
        "load_kind": "bodyweight",
        "held": 10.0,
        "delta": 2,
        "latest": {"logged_session_id": latest.id, "performed_on": "2026-01-08", "value": 6},
        "previous": {
            "logged_session_id": previous.id,
            "performed_on": "2026-01-01",
            "value": 4,
        },
        "body_weight": {"previous_kg": 80.0, "latest_kg": 78.0},
    }


def test_records_endpoint_story_pairs_with_a_non_adjacent_earlier_session():
    # Arrange — 5 reps at 60 kg, then a non-comparable 2 at 80 kg, then 5 reps at 65 kg
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_scan", SQUAT, date(2026, 1, 1), 5, _absolute(60.0))
    _perform(sessions, logged, "user_scan", SQUAT, date(2026, 1, 8), 2, _absolute(80.0))
    _perform(sessions, logged, "user_scan", SQUAT, date(2026, 1, 15), 5, _absolute(65.0))
    oldest, middle, newest = sorted(
        logged.list_for_user("user_scan"), key=lambda session: session.performed_on
    )

    # Act
    story = _story(client, ctx, "user_scan", SQUAT)

    # Assert — the shared-rep rule pairs the latest with the oldest, skipping the middle
    assert story["kind"] == "improved"
    assert story["axis"] == "load_at_reps"
    assert story["held"] == 5
    assert story["delta"] == 5.0
    linked = (story["latest"]["logged_session_id"], story["previous"]["logged_session_id"])
    assert linked == (newest.id, oldest.id)
    assert middle.id not in linked
    # Both links resolve to the caller's own Logged Sessions (the owner-scoped detail read)
    for logged_session_id in linked:
        response = client.get(
            f"/api/logs/{logged_session_id}", headers=_auth(ctx, "user_scan")
        )
        assert response.status_code == 200


def test_records_endpoint_story_is_insufficient_for_a_single_session():
    # Arrange
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_once", SQUAT, date(2026, 1, 1), 8, _absolute(60.0))

    # Act
    story = _story(client, ctx, "user_once", SQUAT)

    # Assert — present, honestly insufficient
    assert story["kind"] == "insufficient"
    assert story["latest"] is None


def test_deleting_the_latest_logged_session_changes_the_story():
    # Arrange — 6, 8, then 10 reps at 60 kg
    client, ctx, sessions, logged = build_client()
    for day, reps in ((1, 6), (8, 8), (15, 10)):
        _perform(sessions, logged, "user_del", SQUAT, date(2026, 1, day), reps, _absolute(60.0))
    newest = logged.list_for_user("user_del")[0]
    assert _story(client, ctx, "user_del", SQUAT)["latest"]["value"] == 10

    # Act
    logged.delete(newest.id, "user_del")
    story = _story(client, ctx, "user_del", SQUAT)

    # Assert — the story falls back to the remaining pair, never linking the deleted one
    assert story["latest"]["value"] == 8
    assert story["previous"]["value"] == 6
    assert newest.id not in (
        story["latest"]["logged_session_id"],
        story["previous"]["logged_session_id"],
    )


def test_another_users_sessions_are_never_paired():
    # Arrange — I logged once; another user logged the same load since
    client, ctx, sessions, logged = build_client()
    _perform(sessions, logged, "user_mine", SQUAT, date(2026, 1, 1), 8, _absolute(60.0))
    _perform(sessions, logged, "user_other", SQUAT, date(2026, 1, 8), 10, _absolute(60.0))

    # Act
    story = _story(client, ctx, "user_mine", SQUAT)

    # Assert — one session of mine is no pair
    assert story["kind"] == "insufficient"
