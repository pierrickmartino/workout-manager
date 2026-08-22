"""The Pin backend spine end to end (#369, ADR-0053): real JWKS verification, the SQL
repositories over one SQLite database, the read-time Progression overlay, and the response
envelope wired through FastAPI.

This is the load-bearing seam: a Pin writes a user-set rep range onto a bodyweight
Prescription's next un-performed occurrence, and from then on automatic read-time Progression
stops adjusting that Prescription — the plan surfaces the pinned range verbatim — until the
movement is un-pinned. The ``progress.py`` overlay-skip is proven *through* this endpoint, not
with its own test, and the double-count trap (a later qualifying log stepping the pinned
movement a second time) is asserted closed.

The repositories are the real SQL implementations over a shared in-memory SQLite session, so a
Pin written through ``SessionRepository`` is read back through ``ProtocolRepository`` exactly as
it is in production (both read the one ``exercise_prescription`` table). JWKS is injected; no AI
runs (a pure-bodyweight Progression step needs none)."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from tests.conftest import ISSUER, make_signing_context
from tests.quantities import reps_quantity

from app.adoption.service import adopt
from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.db.session import get_session
from app.domain.load import parse_load
from app.generation.protocol_generator import ProtocolGenerationRequest
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProtocol,
    GeneratedProtocolSession,
)
from app.main import create_app
from app.repositories.exercise_repository import SqlExerciseRepository
from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSetDraft,
    SqlLoggedSessionRepository,
)
from app.repositories.protocol_repository import SqlProtocolRepository


PARAMS = ProtocolGenerationRequest(
    training_type="strength",
    objective="gain muscle mass",
    sessions_per_week=1,
    duration_minutes=45,
    weeks=3,
    equipment=[],
)


def _pull_up_protocol() -> GeneratedProtocol:
    """A three-week pull-up Protocol: pure bodyweight, an 8-12 rep target every week."""

    return GeneratedProtocol(
        sessions=[
            GeneratedProtocolSession(
                week=week,
                day=1,
                title=f"Week {week}",
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Pull-Up",
                        sets=3,
                        reps="8-12",
                        recommended_load="bodyweight",
                    )
                ],
            )
            for week in (1, 2, 3)
        ]
    )


def _loaded_protocol() -> GeneratedProtocol:
    """A one-week barbell Protocol: an absolute-load Back Squat, where reps are not the
    progression axis — Pin must refuse it."""

    return GeneratedProtocol(
        sessions=[
            GeneratedProtocolSession(
                week=1,
                day=1,
                title="Week 1",
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Back Squat",
                        sets=5,
                        reps="5",
                        recommended_load="60 kg",
                    )
                ],
            )
        ]
    )


def _build():
    """A TestClient over the real SQL repositories sharing one SQLite session.

    Returns the client, the signing context, and the shared session so a test can seed a
    Protocol (via ``adopt``) and Logged Sessions before exercising the endpoints."""

    ctx = make_signing_context()
    # A single shared in-memory SQLite DB: StaticPool hands every connection the same
    # database, so ``create_all`` and every repository query see one set of tables (a bare
    # ``sqlite://`` gives each connection its own empty DB). FK enforcement is on so a
    # cascade-order bug would surface here as it does on Postgres.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_foreign_keys(dbapi_connection, _record):  # pragma: no cover - trivial
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    SQLModel.metadata.create_all(engine)
    session = Session(engine)

    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    # One shared session backs every SQL repository provider, so a Pin written through the
    # session repo is read back through the protocol repo — the production coherence.
    app.dependency_overrides[get_session] = lambda: session
    return TestClient(app), ctx, session


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _seed_protocol(session, user):
    """Adopt the pull-up Protocol for ``user`` and return its id and per-week session ids."""

    view = adopt(
        _pull_up_protocol(),
        user,
        PARAMS,
        exercises=SqlExerciseRepository(session),
        protocols=SqlProtocolRepository(session),
    )
    session_ids = [s.session_id for s in view.sessions]  # week 1, 2, 3 in order
    return view.id, session_ids


def _log_strong_pull_ups(session, user, session_id, exercise_id, *, reps=12):
    """Log ``session_id`` as three pull-up sets at the rep ceiling, low effort — the strong
    signal that would step every upcoming occurrence up a rep (were it not pinned)."""

    SqlLoggedSessionRepository(session).create(
        user,
        LoggedSessionDraft(
            session_id=session_id,
            performed_on=date(2026, 8, 1),
            training_type="strength",
            completion_outcome="completed",
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=exercise_id,
                    quantity=reps_quantity(reps),
                    load=parse_load("bodyweight").to_dict(),
                    perceived_difficulty=6,
                )
                for _ in range(3)
            ],
        ),
    )


def _exercise_id_of(client, headers, protocol_id, week_index=0):
    data = client.get(f"/api/protocols/{protocol_id}", headers=headers).json()["data"]
    return data["sessions"][week_index]["prescriptions"][0]["exercise_id"]


def _week_reps(client, headers, protocol_id):
    """The overlaid rep target of each week's single pull-up Prescription, by week index."""

    data = client.get(f"/api/protocols/{protocol_id}", headers=headers).json()["data"]
    return [s["prescriptions"][0]["reps"] for s in data["sessions"]]


def test_pin_requires_authentication():
    client, _, _ = _build()
    response = client.post("/api/sessions/1/prescriptions/0/pin", json={"reps": "10-14"})
    assert response.status_code == 401


def test_pin_persists_and_shows_in_the_session_view():
    # Arrange
    client, ctx, session = _build()
    user = "user_pin"
    headers = _auth(ctx, user)
    protocol_id, session_ids = _seed_protocol(session, user)

    # Act — pin the next (un-performed) occurrence, Week 2, to a distinct range
    response = client.post(
        f"/api/sessions/{session_ids[1]}/prescriptions/0/pin",
        headers=headers,
        json={"reps": "10-14"},
    )

    # Assert — the pin is persisted and carried on the returned Session view
    assert response.status_code == 200
    prescription = response.json()["data"]["prescriptions"][0]
    assert prescription["pinned_reps"] == "10-14"
    # Provenance is unchanged: pinning never re-origins an AI plan (ADR-0051/0041).
    assert response.json()["data"]["provenance"] == "ai_generated"


def test_pinned_movement_shows_the_pinned_range_and_never_auto_steps_again():
    # Arrange — pin Week 2 to "10-14", then log a Week 1 that BEATS the ceiling: absent
    # the overlay-skip, those same logs would step every upcoming week to "9-12".
    client, ctx, session = _build()
    user = "user_double"
    headers = _auth(ctx, user)
    protocol_id, session_ids = _seed_protocol(session, user)
    exercise_id = _exercise_id_of(client, headers, protocol_id)

    client.post(
        f"/api/sessions/{session_ids[1]}/prescriptions/0/pin",
        headers=headers,
        json={"reps": "10-14"},
    )
    _log_strong_pull_ups(session, user, session_ids[0], exercise_id)

    # Act
    weeks = _week_reps(client, headers, protocol_id)

    # Assert — Week 2 (pinned) surfaces the pinned range and does NOT take the auto-step;
    # Week 3 (un-pinned) DOES auto-step, proving Progression still runs elsewhere and the
    # pinned movement alone is skipped (the double-count trap is closed).
    assert weeks[1] == "10-14"
    assert weeks[2] == "9-12"


def test_unpin_restores_automatic_progression():
    # Arrange — pinned Week 2, with a strong Week 1 log on record
    client, ctx, session = _build()
    user = "user_unpin"
    headers = _auth(ctx, user)
    protocol_id, session_ids = _seed_protocol(session, user)
    exercise_id = _exercise_id_of(client, headers, protocol_id)
    client.post(
        f"/api/sessions/{session_ids[1]}/prescriptions/0/pin",
        headers=headers,
        json={"reps": "10-14"},
    )
    _log_strong_pull_ups(session, user, session_ids[0], exercise_id)
    assert _week_reps(client, headers, protocol_id)[1] == "10-14"

    # Act — un-pin Week 2
    response = client.delete(
        f"/api/sessions/{session_ids[1]}/prescriptions/0/pin", headers=headers
    )

    # Assert — the pin is cleared and automatic Progression resumes from the latest logs
    # (Week 2 now steps to "9-12" like Week 3), with no lingering effect.
    assert response.status_code == 200
    assert response.json()["data"]["prescriptions"][0]["pinned_reps"] is None
    assert _week_reps(client, headers, protocol_id)[1] == "9-12"


def test_pin_on_a_performed_session_is_refused():
    # Arrange — perform Week 1, then try to pin that same Session
    client, ctx, session = _build()
    user = "user_perf"
    headers = _auth(ctx, user)
    protocol_id, session_ids = _seed_protocol(session, user)
    exercise_id = _exercise_id_of(client, headers, protocol_id)
    _log_strong_pull_ups(session, user, session_ids[0], exercise_id)

    # Act
    response = client.post(
        f"/api/sessions/{session_ids[0]}/prescriptions/0/pin",
        headers=headers,
        json={"reps": "10-14"},
    )

    # Assert — settled record: a performed Session's plan position is never rewritten
    assert response.status_code == 409
    assert response.json()["success"] is False


def test_pin_on_an_unowned_session_is_not_found():
    client, ctx, session = _build()
    owner = "owner"
    protocol_id, session_ids = _seed_protocol(session, owner)

    response = client.post(
        f"/api/sessions/{session_ids[1]}/prescriptions/0/pin",
        headers=_auth(ctx, "intruder"),
        json={"reps": "10-14"},
    )
    assert response.status_code == 404


def test_pin_at_an_absent_position_is_not_found():
    client, ctx, session = _build()
    user = "user_absent"
    headers = _auth(ctx, user)
    _protocol_id, session_ids = _seed_protocol(session, user)

    response = client.post(
        f"/api/sessions/{session_ids[1]}/prescriptions/99/pin",
        headers=headers,
        json={"reps": "10-14"},
    )
    assert response.status_code == 404


def test_pin_rejects_an_invalid_range():
    client, ctx, session = _build()
    user = "user_bad_range"
    headers = _auth(ctx, user)
    _protocol_id, session_ids = _seed_protocol(session, user)

    response = client.post(
        f"/api/sessions/{session_ids[1]}/prescriptions/0/pin",
        headers=headers,
        json={"reps": "14-10"},  # floor > ceiling
    )
    assert response.status_code == 409


def test_pin_on_a_loaded_movement_is_refused():
    # Arrange — a barbell Back Squat: load, not reps, is its progression axis
    client, ctx, session = _build()
    user = "user_loaded"
    headers = _auth(ctx, user)
    view = adopt(
        _loaded_protocol(),
        user,
        PARAMS,
        exercises=SqlExerciseRepository(session),
        protocols=SqlProtocolRepository(session),
    )
    squat_session_id = view.sessions[0].session_id

    # Act
    response = client.post(
        f"/api/sessions/{squat_session_id}/prescriptions/0/pin",
        headers=headers,
        json={"reps": "6-8"},
    )

    # Assert — bodyweight rep target only: pinning reps on a loaded movement is refused
    # so the overlay-skip can never silently freeze its load Progression.
    assert response.status_code == 409
    assert response.json()["success"] is False


def test_generation_feedback_stays_available_after_a_pin():
    # Arrange — pin Week 2 (an ai_generated Protocol Session)
    client, ctx, session = _build()
    user = "user_feedback"
    headers = _auth(ctx, user)
    _protocol_id, session_ids = _seed_protocol(session, user)
    client.post(
        f"/api/sessions/{session_ids[1]}/prescriptions/0/pin",
        headers=headers,
        json={"reps": "10-14"},
    )

    # Act — Generation Feedback (an AI-only affordance) is still accepted: the Pin did not
    # touch Session Provenance, so the AI affordances survive it (ADR-0051/0041).
    response = client.post(
        f"/api/sessions/{session_ids[1]}/feedback",
        headers=headers,
        json={"verdict": "positive"},
    )
    assert response.status_code == 200
