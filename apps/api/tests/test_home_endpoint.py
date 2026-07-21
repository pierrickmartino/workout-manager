"""Behavior of the aggregated Home read endpoint end to end (F1 slice 1).

``GET /api/home`` returns the standard envelope with ``{ readiness,
current_protocol }``: the user's Readiness computed server-side, and — in this
slice — a ``current_protocol`` that is always ``null`` (the protocol wiring lands
in slice 2). The profile and logged-session repositories are injected via
dependency overrides so the tests run offline; Readiness itself is exercised
exhaustively in ``test_readiness.py``, so here we verify the endpoint contract:
authentication, the envelope, and that the computed state reaches the payload."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.adoption.service import adopt
from app.auth.dependencies import get_jwks
from app.domain.exercise import Provenance
from app.domain.load import LoadKind, ParsedLoad
from app.config import Settings, get_settings
from app.generation.protocol_generator import ProtocolGenerationRequest
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProtocol,
    GeneratedProtocolSession,
)
from app.main import create_app
from app.repositories.deps import (
    get_logged_session_repository,
    get_profile_repository,
    get_protocol_repository,
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
from app.repositories.protocol_repository import InMemoryProtocolRepository
from app.repositories.session_repository import InMemorySessionRepository
from tests.conftest import ISSUER, make_signing_context


def _abs(kg: float) -> dict:
    """The stored typed-Load dict for an absolute kilogram load."""

    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


PARAMS = ProtocolGenerationRequest(
    training_type="strength",
    objective="gain muscle mass",
    sessions_per_week=1,
    duration_minutes=45,
    weeks=2,
    equipment=[],
)


def _two_week_protocol() -> GeneratedProtocol:
    return GeneratedProtocol(
        sessions=[
            GeneratedProtocolSession(
                week=week,
                day=1,
                title=f"Week {week}",
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Back Squat", sets=5, reps="5"
                    ),
                    GeneratedExercisePrescription(
                        exercise_name="Overhead Press", sets=3, reps="8"
                    ),
                ],
            )
            for week in (1, 2)
        ]
    )


class _Harness:
    def __init__(self, client, ctx, profiles, exercises, protocols, logged):
        self.client = client
        self.ctx = ctx
        self.profiles = profiles
        self.exercises = exercises
        self.protocols = protocols
        self.logged = logged

    def auth(self, sub):
        return {"Authorization": f"Bearer {self.ctx.mint(sub=sub)}"}

    def fetch_home(self, sub):
        return self.client.get("/api/home", headers=self.auth(sub))

    def adopt_protocol(self, sub):
        return adopt(
            _two_week_protocol(),
            sub,
            PARAMS,
            exercises=self.exercises,
            protocols=self.protocols,
        )

    def perform(self, sub, session_id, performed_on=None, logged_sets=None):
        self.logged.create(
            sub,
            LoggedSessionDraft(
                session_id=session_id,
                performed_on=performed_on or date(2026, 1, 1),
                logged_sets=logged_sets or [],
            ),
        )

    def exercise_id(self, name):
        return self.exercises.find_or_create(name, provenance=Provenance.CURATED).id


def build_harness(profiles=None) -> _Harness:
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    protocols = InMemoryProtocolRepository(exercises)
    profiles = profiles or InMemoryProfileRepository()

    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_protocol_repository] = lambda: protocols
    return _Harness(TestClient(app), ctx, profiles, exercises, protocols, logged)


def test_home_requires_authentication():
    h = build_harness()
    response = h.client.get("/api/home")
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_home_returns_readiness_and_a_null_current_protocol():
    # Arrange — a clean, unconstrained user with no logged history
    h = build_harness()

    # Act
    response = h.fetch_home("user_ready")

    # Assert — the standard envelope carries Ready and, this slice, no protocol
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert body["data"] == {
        "readiness": "READY",
        "current_protocol": None,
        "gamification": {
            "xp": 0,
            "level": {
                "level": 1,
                "xp_into_level": 0,
                "xp_span_of_level": 400,
                "xp_to_next": 400,
            },
            "streak": 0,
        },
        "latest_pr": None,
    }


def test_a_sensitive_user_sees_extra_caution():
    # Arrange — the user carries a Sensitive Constraint
    profiles = InMemoryProfileRepository()
    profiles.update("user_sensitive", ProfileUpdate(sensitive_constraints=["injury"]))
    h = build_harness(profiles=profiles)

    # Act
    data = h.fetch_home("user_sensitive").json()["data"]

    # Assert — the top of the precedence ladder reaches the payload
    assert data["readiness"] == "EXTRA_CAUTION"


def test_a_user_with_a_preference_sees_caution():
    # Arrange — a non-medical Preference / Limitation
    profiles = InMemoryProfileRepository()
    profiles.update("user_pref", ProfileUpdate(preferences=["no running"]))
    h = build_harness(profiles=profiles)

    # Act
    data = h.fetch_home("user_pref").json()["data"]

    # Assert
    assert data["readiness"] == "CAUTION"


def test_readiness_is_scoped_to_the_requesting_user():
    # Arrange — one sensitive user shares the app with an unconstrained one
    profiles = InMemoryProfileRepository()
    profiles.update("user_sensitive", ProfileUpdate(sensitive_constraints=["injury"]))
    h = build_harness(profiles=profiles)

    # Act — a different, clean user reads Home
    data = h.fetch_home("user_clean").json()["data"]

    # Assert — the sensitive user's state does not leak across accounts
    assert data["readiness"] == "READY"


def test_home_returns_the_current_protocol_with_hero_backing_data():
    # Arrange — a user who has adopted a Protocol and performed nothing yet
    h = build_harness()
    protocol = h.adopt_protocol("user_active")

    # Act
    data = h.fetch_home("user_active").json()["data"]

    # Assert — Readiness is still present, and the Current Protocol carries the
    # Session Hero's backing data: the Protocol's duration and the Next Session
    # with the prescriptions the modules/sets stats are derived from.
    assert data["readiness"] == "READY"
    current = data["current_protocol"]
    assert current is not None
    assert current["id"] == protocol.id
    assert current["duration_minutes"] == 45
    assert current["completed_count"] == 0
    assert current["next_session"]["week"] == 1
    assert len(current["next_session"]["prescriptions"]) == 2


def test_home_current_protocol_is_null_when_the_user_owns_no_protocol():
    # Arrange — a user with no Protocol at all
    h = build_harness()

    # Act
    data = h.fetch_home("user_no_protocol").json()["data"]

    # Assert — the empty state: Readiness present, no Current Protocol
    assert data["readiness"] == "READY"
    assert data["current_protocol"] is None


def test_home_current_protocol_is_null_once_the_protocol_is_complete():
    # Arrange — the user's only Protocol is fully performed
    h = build_harness()
    protocol = h.adopt_protocol("user_finished")
    for session in protocol.sessions:
        h.perform("user_finished", session.session_id)

    # Act
    data = h.fetch_home("user_finished").json()["data"]

    # Assert — Home does not dead-end on a finished plan
    assert data["current_protocol"] is None


def test_home_never_surfaces_another_users_protocol():
    # Arrange — only another user owns a Protocol
    h = build_harness()
    h.adopt_protocol("user_owner")

    # Act — a different user reads Home
    data = h.fetch_home("user_visitor").json()["data"]

    # Assert — ownership isolation holds end to end
    assert data["current_protocol"] is None


def test_home_carries_the_gamification_block_alongside_readiness():
    # Arrange — a user who has adopted a Protocol and performed its first Session
    h = build_harness()
    protocol = h.adopt_protocol("user_gamified")
    h.perform("user_gamified", protocol.sessions[0].session_id, date.today())

    # Act
    data = h.fetch_home("user_gamified").json()["data"]

    # Assert — the gamification fan-out rides alongside the existing fields, with
    # the full Operator Level shape the LevelBadge renders from
    assert set(data) == {"readiness", "current_protocol", "gamification", "latest_pr"}
    gamification = data["gamification"]
    # One Logged Session with no sets earns a flat SESSION_XP (100).
    assert gamification["xp"] == 100
    assert set(gamification["level"]) == {
        "level",
        "xp_into_level",
        "xp_span_of_level",
        "xp_to_next",
    }
    assert gamification["level"]["level"] == 1
    assert gamification["streak"] == 1


def test_home_gamification_agrees_with_profile_progress_for_the_same_user():
    # Arrange — the same performed history reaches both surfaces
    h = build_harness()
    protocol = h.adopt_protocol("user_parity")
    h.perform("user_parity", protocol.sessions[0].session_id, date.today())

    # Act — read the shared read model directly and the Home fan-out
    from datetime import date as _date

    from app.logbook.profile_progress import profile_progress

    progress = profile_progress("user_parity", logged=h.logged, today=_date.today())
    gamification = h.fetch_home("user_parity").json()["data"]["gamification"]

    # Assert — Home and Profile can never disagree on the same account
    assert gamification["xp"] == progress.xp
    assert gamification["streak"] == progress.streak
    assert gamification["level"]["level"] == progress.level.level


def test_home_gamification_zero_state_for_a_brand_new_user():
    # Arrange — a brand-new user with no logged history
    h = build_harness()

    # Act
    gamification = h.fetch_home("user_fresh").json()["data"]["gamification"]

    # Assert — Level 1, an empty XP bar, and a 0-week streak — never blank
    assert gamification["xp"] == 0
    assert gamification["level"]["level"] == 1
    assert gamification["level"]["xp_into_level"] == 0
    assert gamification["streak"] == 0


def test_home_carries_the_latest_personal_record():
    # Arrange — a user who has performed a Session with an absolute-Load Back Squat set
    # heavy enough to set a Personal Record.
    h = build_harness()
    protocol = h.adopt_protocol("user_pr")
    squat = h.exercise_id("Back Squat")
    h.perform(
        "user_pr",
        protocol.sessions[0].session_id,
        performed_on=date(2026, 7, 10),
        logged_sets=[LoggedSetDraft(exercise_id=squat, reps=1, load=_abs(142.0))],
    )

    # Act
    data = h.fetch_home("user_pr").json()["data"]

    # Assert — the Latest PR rides alongside the existing fields, naming the Exercise,
    # its Estimated 1RM, and the date it was set.
    assert "latest_pr" in data
    assert data["latest_pr"] == {
        "exercise_id": squat,
        "exercise": "Back Squat",
        "estimated_1rm": 142.0,
        "date": "2026-07-10",
        "gain": 0.0,
        "reps": 1,
        "is_bodyweight": False,
        "added_kg": None,
    }


def test_home_latest_pr_is_null_for_a_brand_new_user():
    # Arrange — a fresh account with no logged history
    h = build_harness()

    # Act
    data = h.fetch_home("user_fresh_pr").json()["data"]

    # Assert — the line is hidden, never a fabricated "0 kg"; Home reads fine without it
    assert data["latest_pr"] is None


def test_home_latest_pr_is_null_for_an_absolute_load_less_history():
    # Arrange — a bodyweight-only trainee: reps logged, but no absolute Load, so no set
    # carries a comparable Estimated 1RM and none can set a PR.
    h = build_harness()
    protocol = h.adopt_protocol("user_bw")
    squat = h.exercise_id("Back Squat")
    bodyweight = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()
    h.perform(
        "user_bw",
        protocol.sessions[0].session_id,
        performed_on=date(2026, 7, 10),
        logged_sets=[LoggedSetDraft(exercise_id=squat, reps=10, load=bodyweight)],
    )

    # Act
    data = h.fetch_home("user_bw").json()["data"]

    # Assert — hidden, and Level / Streak still render normally
    assert data["latest_pr"] is None
    assert data["gamification"]["level"]["level"] == 1
    assert data["gamification"]["streak"] >= 0
