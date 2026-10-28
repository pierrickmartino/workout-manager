"""Adding a Warm-up Suggestion to a Session, end to end (ADR-0143, #780).

``PUT /api/sessions/{id}/warm-up`` takes the previewed drills and puts them at the front of
the owner's un-performed Session as one-set Exercise Prescriptions with the **warm-up** Set
Type, renumbering the rest contiguously. It works on a standalone Session and — the narrow
ADR-0143 exception to Deploy — on one Protocol-member Session. A performed Session (any
Logged Session references it) is ``409``; another user's Session is ``404``. Session
Provenance is unchanged. Real JWKS verification; in-memory repositories."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.generation.cache import InMemoryCacheStore
from app.generation.warm_up_cache import WarmUpCache
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_llm_client,
    get_logged_session_repository,
    get_profile_repository,
    get_session_repository,
    get_warm_up_cache,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.prescription_mapping import PrescriptionDraft
from app.repositories.profile_repository import InMemoryProfileRepository, ProfileUpdate
from app.repositories.session_repository import InMemorySessionRepository, SessionDraft
from tests.conftest import ISSUER, make_signing_context
from tests.fake_llm import FakeStructuredLLM
from tests.test_warm_up_suggestion_endpoint import _suggestion_json

OWNER = "user_a"
STRANGER = "user_b"


class Harness:
    def __init__(self) -> None:
        self.ctx = make_signing_context()
        self.exercises = InMemoryExerciseRepository()
        self.profiles = InMemoryProfileRepository()
        self.sessions = InMemorySessionRepository(self.exercises, self.profiles)
        self.logged = InMemoryLoggedSessionRepository(self.sessions, self.exercises)
        self.llm = FakeStructuredLLM(text=_suggestion_json())
        app = create_app()
        app.dependency_overrides[get_jwks] = lambda: self.ctx.jwks
        app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
        app.dependency_overrides[get_exercise_repository] = lambda: self.exercises
        app.dependency_overrides[get_session_repository] = lambda: self.sessions
        app.dependency_overrides[get_profile_repository] = lambda: self.profiles
        app.dependency_overrides[get_logged_session_repository] = lambda: self.logged
        app.dependency_overrides[get_llm_client] = lambda: self.llm
        cache_store = InMemoryCacheStore()
        app.dependency_overrides[get_warm_up_cache] = lambda: WarmUpCache(cache_store)
        self.client = TestClient(app)

    def headers(self, sub: str) -> dict:
        return {"Authorization": f"Bearer {self.ctx.mint(sub=sub)}"}

    def exercise(self, name: str) -> int:
        return self.exercises.find_or_create(name, provenance=Provenance.CURATED).id

    def session(self, owner: str = OWNER, *, protocol_id: int | None = None) -> int:
        drafts = [
            PrescriptionDraft(exercise_id=self.exercise("Back Squat"), sets=5, reps="5"),
            PrescriptionDraft(exercise_id=self.exercise("Romanian Deadlift"), sets=3, reps="8"),
        ]
        view = self.sessions.create(
            owner,
            SessionDraft(
                training_type="strength",
                duration_minutes=45,
                prescriptions=drafts,
                provenance="ai_generated",
            ),
        )
        if protocol_id is not None:
            self.sessions._sessions[view.id].protocol_id = protocol_id
        return view.id

    def log(self, session_id: int, owner: str = OWNER) -> None:
        self.logged.create(
            owner,
            LoggedSessionDraft(
                session_id=session_id,
                performed_on=date(2026, 1, 1),
                training_type="strength",
                completion_outcome="incomplete",
                logged_sets=[LoggedSetDraft(exercise_id=self.exercise("Back Squat"))],
            ),
        )

    def drill(self, name: str, **overrides) -> dict:
        drill = {
            "exercise_id": self.exercise(name),
            "exercise_name": name,
            "sets": 1,
            "reps": "10",
            "prescribed_quantity": {"kind": "repetitions", "text": "10", "count": 10},
            "recommended_load": {"kind": "bodyweight", "text": "bodyweight"},
            "rest_seconds": 10,
            "set_type": "warm_up",
        }
        return {**drill, **overrides}

    def apply(self, session_id: int, drills: list[dict], sub: str = OWNER):
        return self.client.put(
            f"/api/sessions/{session_id}/warm-up",
            headers=self.headers(sub),
            json={"drills": drills},
        )

    def read(self, session_id: int, sub: str = OWNER) -> dict:
        return self.client.get(f"/api/sessions/{session_id}", headers=self.headers(sub)).json()[
            "data"
        ]


def _rows(session: dict) -> list[tuple[int, str, str | None]]:
    return [
        (p["position"], p["exercise_name"], p["set_type"]) for p in session["prescriptions"]
    ]


def test_apply_adds_the_drills_at_the_front_as_warm_up_prescriptions():
    # Arrange
    harness = Harness()
    session_id = harness.session()
    drills = [harness.drill("Glute Bridge"), harness.drill("Hip Circle")]

    # Act
    response = harness.apply(session_id, drills)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert _rows(body["data"]) == [
        (0, "Glute Bridge", "warm_up"),
        (1, "Hip Circle", "warm_up"),
        (2, "Back Squat", None),
        (3, "Romanian Deadlift", None),
    ]
    assert _rows(harness.read(session_id)) == _rows(body["data"])


def test_each_drill_is_one_set_with_its_quantity_load_and_rest():
    # Arrange
    harness = Harness()
    session_id = harness.session()
    timed = harness.drill(
        "Band Pull-Apart",
        reps="30s",
        sets=3,
        prescribed_quantity={"kind": "duration", "text": "30s", "seconds": 30},
        recommended_load={"kind": "qualitative", "text": "light band"},
        rest_seconds=0,
    )

    # Act
    response = harness.apply(session_id, [timed])

    # Assert
    added = response.json()["data"]["prescriptions"][0]
    assert added["sets"] == 1
    assert added["reps"] == "30s"
    assert added["prescribed_quantity"]["kind"] == "duration"
    assert added["prescribed_quantity"]["seconds"] == 30
    assert added["recommended_load"] == {"kind": "qualitative", "text": "light band"}
    assert added["rest_seconds"] == 0
    assert added["section"] == "warm_up"


def test_a_protocol_member_session_accepts_a_warm_up_and_only_it_changes():
    # Arrange
    harness = Harness()
    target = harness.session(protocol_id=7)
    sibling = harness.session(protocol_id=7)
    sibling_before = harness.read(sibling)

    # Act
    response = harness.apply(target, [harness.drill("Glute Bridge")])

    # Assert
    assert response.status_code == 200
    assert _rows(harness.read(target))[0] == (0, "Glute Bridge", "warm_up")
    assert harness.read(sibling) == sibling_before


def test_a_performed_session_is_refused_and_left_unchanged():
    # Arrange
    harness = Harness()
    session_id = harness.session(protocol_id=7)
    harness.log(session_id)
    before = harness.read(session_id)

    # Act
    response = harness.apply(session_id, [harness.drill("Glute Bridge")])

    # Assert
    assert response.status_code == 409
    assert response.json()["success"] is False
    assert response.json()["error"]
    assert harness.read(session_id) == before


def test_another_users_session_is_refused_and_left_unchanged():
    # Arrange
    harness = Harness()
    session_id = harness.session(owner=OWNER)
    before = harness.read(session_id)

    # Act
    response = harness.apply(session_id, [harness.drill("Glute Bridge")], sub=STRANGER)

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False
    assert harness.read(session_id) == before


def test_session_provenance_is_unchanged():
    # Arrange
    harness = Harness()
    session_id = harness.session()

    # Act
    applied = harness.apply(session_id, [harness.drill("Glute Bridge")]).json()["data"]

    # Assert
    assert applied["provenance"] == "ai_generated"
    assert harness.read(session_id)["provenance"] == "ai_generated"


def test_a_drill_outside_the_catalog_is_refused_and_nothing_changes():
    # Arrange
    harness = Harness()
    session_id = harness.session()
    before = harness.read(session_id)
    ghost = harness.drill("Glute Bridge", exercise_id=9999)

    # Act
    response = harness.apply(session_id, [ghost])

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False
    assert harness.read(session_id) == before


def test_a_drill_with_a_kg_load_long_rest_or_no_amount_is_refused():
    # Arrange
    harness = Harness()
    session_id = harness.session()
    invalid = [
        harness.drill("Glute Bridge", recommended_load={"kind": "absolute", "text": "20kg"}),
        harness.drill("Glute Bridge", rest_seconds=60),
        harness.drill("Glute Bridge", prescribed_quantity={"kind": "repetitions", "text": "x"}),
        harness.drill("Glute Bridge", recommended_load={"kind": "qualitative", "text": " "}),
    ]

    # Act
    statuses = [harness.apply(session_id, [drill]).status_code for drill in invalid]

    # Assert
    assert statuses == [422, 422, 422, 422]
    assert len(harness.read(session_id)["prescriptions"]) == 2


def test_no_drills_is_refused():
    harness = Harness()
    session_id = harness.session()

    response = harness.apply(session_id, [])

    assert response.status_code == 422


def test_the_previewed_drills_can_be_added_verbatim():
    # Arrange — the drills come straight from the suggestion endpoint.
    harness = Harness()
    session_id = harness.session()
    harness.profiles.update(OWNER, ProfileUpdate(default_equipment=["resistance band"]))
    suggestion = harness.client.post(
        f"/api/sessions/{session_id}/warm-up-suggestion",
        headers=harness.headers(OWNER),
        json={},
    ).json()["data"]

    # Act
    response = harness.apply(session_id, suggestion["drills"])

    # Assert
    assert response.status_code == 200
    names = [p["exercise_name"] for p in response.json()["data"]["prescriptions"]]
    assert names == [
        *(drill["exercise_name"] for drill in suggestion["drills"]),
        "Back Squat",
        "Romanian Deadlift",
    ]
