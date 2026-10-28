"""The Warm-up Suggestion endpoint end to end (ADR-0143, #778).

``POST /api/sessions/{id}/warm-up-suggestion`` derives the muscles and equipment from the
user's own Session and Profile, asks the warm-up generator — the real
``LlmWarmUpGenerator`` behind a fake ``StructuredLLM`` transport — for 4–6 drills, resolves
every drill to a catalog Exercise (catalog-first, ``ai_generated`` otherwise) and returns a
preview. It never changes the Session. Real JWKS verification; in-memory repositories."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.generation.llm.port import GenerationError
from app.generation.monitoring.call import GeneratorKind
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_llm_client,
    get_profile_repository,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.prescription_mapping import PrescriptionDraft
from app.repositories.profile_repository import InMemoryProfileRepository, ProfileUpdate
from app.repositories.session_repository import InMemorySessionRepository, SessionDraft
from tests.conftest import ISSUER, make_signing_context
from tests.fake_llm import FakeStructuredLLM


def _drill(name: str, **overrides) -> dict:
    drill = {
        "exercise_name": name,
        "targeted_muscles": ["glutes"],
        "required_equipment": [],
        "quantity_kind": "repetitions",
        "amount": 10,
        "load_kind": "bodyweight",
        "load_text": None,
        "rest_seconds": 10,
    }
    return {**drill, **overrides}


def _suggestion_json(drills: list[dict] | None = None, minutes: int = 6) -> str:
    return json.dumps(
        {
            "drills": drills
            if drills is not None
            else [
                _drill("Glute Bridge"),
                _drill("Bodyweight Squat Hold", quantity_kind="duration", amount=30),
                _drill("Band Pull-Apart", load_kind="qualitative", load_text="light band",
                       required_equipment=["resistance band"], rest_seconds=0),
                _drill("Hip Circle", amount=8, rest_seconds=15),
            ],
            "estimated_minutes": minutes,
        }
    )


class Harness:
    def __init__(self, *, llm: FakeStructuredLLM | None = None) -> None:
        self.ctx = make_signing_context()
        self.exercises = InMemoryExerciseRepository()
        self.sessions = InMemorySessionRepository(self.exercises)
        self.profiles = InMemoryProfileRepository()
        self.llm = llm or FakeStructuredLLM(text=_suggestion_json())
        app = create_app()
        app.dependency_overrides[get_jwks] = lambda: self.ctx.jwks
        app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
        app.dependency_overrides[get_exercise_repository] = lambda: self.exercises
        app.dependency_overrides[get_session_repository] = lambda: self.sessions
        app.dependency_overrides[get_profile_repository] = lambda: self.profiles
        app.dependency_overrides[get_llm_client] = lambda: self.llm
        self.client = TestClient(app)

    def headers(self, sub: str) -> dict:
        return {"Authorization": f"Bearer {self.ctx.mint(sub=sub)}"}

    def session(self, owner: str, movements: list[tuple[str, list[str], list[str]]],
                *, set_types: dict[int, str] | None = None) -> int:
        """Persist a Session of ``(name, targeted_muscles, required_equipment)`` rows."""

        drafts = []
        for index, (name, muscles, equipment) in enumerate(movements):
            exercise = self.exercises.find_or_create(
                name,
                provenance=Provenance.CURATED,
                targeted_muscles=muscles,
                required_equipment=equipment,
            )
            drafts.append(
                PrescriptionDraft(
                    exercise_id=exercise.id,
                    sets=3,
                    reps="8",
                    set_type=(set_types or {}).get(index),
                )
            )
        view = self.sessions.create(
            owner,
            SessionDraft(training_type="strength", duration_minutes=45, prescriptions=drafts),
        )
        return view.id

    def profile(self, sub: str, *, equipment=(), constraints=()) -> None:
        self.profiles.update(
            sub,
            ProfileUpdate(
                default_equipment=list(equipment),
                sensitive_constraints=list(constraints),
            ),
        )

    def suggest(self, session_id: int, sub: str, body: dict | None = None):
        return self.client.post(
            f"/api/sessions/{session_id}/warm-up-suggestion",
            headers=self.headers(sub),
            json=body if body is not None else {},
        )

    def user_prompt(self, call: int = -1) -> str:
        return self.llm.calls[call]["user"]


_LEG_DAY = [
    ("Back Squat", ["quads", "glutes"], ["barbell", "rack"]),
    ("Romanian Deadlift", ["hamstrings", "glutes"], ["barbell"]),
    ("Leg Curl", ["hamstrings"], ["machine"]),
]


def test_suggestion_returns_drills_minutes_and_the_warm_up_section_flag():
    # Arrange
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session("user_a", _LEG_DAY)

    # Act
    response = harness.suggest(session_id, "user_a")

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["estimated_minutes"] == 6
    assert data["has_warm_up_section"] is False
    names = [drill["exercise_name"] for drill in data["drills"]]
    assert names == ["Glute Bridge", "Bodyweight Squat Hold", "Band Pull-Apart", "Hip Circle"]
    first = data["drills"][0]
    assert first["sets"] == 1
    assert first["set_type"] == "warm_up"
    assert first["reps"] == "10"
    assert first["prescribed_quantity"]["kind"] == "repetitions"
    assert first["prescribed_quantity"]["count"] == 10
    assert first["recommended_load"]["kind"] == "bodyweight"
    assert "kg" not in first["recommended_load"]
    assert first["rest_seconds"] == 10
    assert isinstance(first["exercise_id"], int)


def test_suggestion_never_changes_the_session():
    # Arrange
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session("user_a", _LEG_DAY)
    before = harness.sessions.get(session_id, "user_a")

    # Act
    harness.suggest(session_id, "user_a")

    # Assert
    assert harness.sessions.get(session_id, "user_a").prescriptions == before.prescriptions


def test_suggestion_for_another_users_session_is_refused_without_calling_the_ai():
    # Arrange
    harness = Harness()
    session_id = harness.session("owner", _LEG_DAY)

    # Act
    response = harness.suggest(session_id, "intruder")

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False
    assert harness.llm.calls == []


def test_malformed_llm_output_returns_502_with_the_error_envelope():
    harness = Harness(llm=FakeStructuredLLM(text='{"drills": "nope"}'))
    session_id = harness.session("user_a", _LEG_DAY)

    response = harness.suggest(session_id, "user_a")

    assert response.status_code == 502
    assert response.json() == {
        "success": False,
        "data": None,
        "error": "No warm-up could be suggested. Please try again.",
    }


def test_a_transport_failure_returns_502():
    harness = Harness(llm=FakeStructuredLLM(error=GenerationError("provider down")))
    session_id = harness.session("user_a", _LEG_DAY)

    assert harness.suggest(session_id, "user_a").status_code == 502


def test_too_few_drills_or_an_over_budget_warm_up_is_malformed():
    three = [_drill("Glute Bridge"), _drill("Hip Circle"), _drill("Leg Swing")]
    for text in (_suggestion_json(three), _suggestion_json(minutes=12)):
        harness = Harness(llm=FakeStructuredLLM(text=text))
        harness.profile("user_a", equipment=["resistance band"])
        session_id = harness.session("user_a", _LEG_DAY)

        assert harness.suggest(session_id, "user_a").status_code == 502


def test_a_drill_with_a_kg_load_or_long_rest_is_malformed():
    for bad in ({"load_kind": "absolute", "load_text": "10kg"}, {"rest_seconds": 60}):
        drills = [_drill(f"Drill {i}") for i in range(3)] + [_drill("Bad Drill", **bad)]
        harness = Harness(llm=FakeStructuredLLM(text=_suggestion_json(drills)))
        session_id = harness.session("user_a", _LEG_DAY)

        assert harness.suggest(session_id, "user_a").status_code == 502


def test_a_drill_needing_equipment_the_user_lacks_is_refused_and_nothing_is_saved():
    # Arrange — the default suggestion's band drill, for a user with no band
    harness = Harness()
    session_id = harness.session("user_a", _LEG_DAY)

    # Act
    response = harness.suggest(session_id, "user_a")

    # Assert
    assert response.status_code == 502
    assert harness.exercises.find_by_name("Glute Bridge") is None


def test_each_call_is_logged_under_the_warm_up_generator_kind_for_the_caller():
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session("user_a", _LEG_DAY)

    harness.suggest(session_id, "user_a")

    context = harness.llm.calls[0]["context"]
    assert context.generator_kind is GeneratorKind.WARM_UP
    assert context.clerk_user_id == "user_a"


def test_prompt_lists_muscles_weighted_toward_the_leading_movements_and_the_equipment():
    # Arrange — glutes in the first two lifts outweighs quads (first only) and hamstrings
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session("user_a", _LEG_DAY)

    # Act
    harness.suggest(session_id, "user_a")

    # Assert
    prompt = harness.user_prompt()
    assert "Muscles to prepare, most important first: glutes, quads, hamstrings" in prompt
    assert "Available equipment: barbell, bodyweight, machine, rack, resistance band" in prompt
    assert "4-6 drills" in prompt and "5-8 minutes" in prompt
    assert "Sensitive constraints" not in prompt
    assert "readiness" not in prompt.lower()


def test_prompt_names_movements_that_have_no_muscle_data():
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session(
        "user_a", [("Zercher Carry", [], []), ("Back Squat", ["quads"], ["barbell"])]
    )

    harness.suggest(session_id, "user_a")

    assert "Movements in the session (no muscle data): Zercher Carry" in harness.user_prompt()


def test_prompt_ignores_the_existing_warm_up_when_choosing_muscles():
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session(
        "user_a",
        [("Arm Circle", ["shoulders"], []), ("Back Squat", ["quads"], ["barbell"])],
    )

    harness.suggest(session_id, "user_a")

    assert "most important first: quads\n" in harness.user_prompt()


def test_sensitive_constraints_reach_the_prompt():
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"], constraints=["injury"])
    session_id = harness.session("user_a", _LEG_DAY)

    harness.suggest(session_id, "user_a")

    assert "Sensitive constraints to respect: injury" in harness.user_prompt()


def test_catalog_drills_that_fit_the_equipment_are_offered_and_reused():
    # Arrange — a curated activation drill, and a curated drill needing a sled nobody owns
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    bridge = harness.exercises.find_or_create(
        "Glute Bridge Activation", provenance=Provenance.CURATED
    )
    harness.exercises.find_or_create(
        "Sled Warm-up Push", provenance=Provenance.CURATED, required_equipment=["sled"]
    )
    session_id = harness.session("user_a", _LEG_DAY)
    drills = [_drill("glute bridge activation")] + [
        _drill(f"Hip Circle {i}") for i in range(3)
    ]
    harness.llm = FakeStructuredLLM(text=_suggestion_json(drills))

    # Act
    response = harness.suggest(session_id, "user_a")

    # Assert
    prompt = harness.user_prompt()
    assert "Catalog drills to prefer:" in prompt
    assert "Glute Bridge Activation" in prompt
    assert "Sled Warm-up Push" not in prompt
    first = response.json()["data"]["drills"][0]
    assert first["exercise_id"] == bridge.id
    assert first["exercise_name"] == "Glute Bridge Activation"
    assert harness.exercises.get(bridge.id).provenance == Provenance.CURATED.value


def test_a_drill_not_in_the_catalog_is_saved_as_ai_generated_with_its_muscles():
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session("user_a", _LEG_DAY)

    response = harness.suggest(session_id, "user_a")

    drill = response.json()["data"]["drills"][0]
    saved = harness.exercises.get(drill["exercise_id"])
    assert saved.name == "Glute Bridge"
    assert saved.provenance == Provenance.AI_GENERATED.value
    assert saved.targeted_muscles == ["glutes"]


def test_timed_and_qualitative_drills_keep_their_seconds_and_load_label():
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session("user_a", _LEG_DAY)

    drills = harness.suggest(session_id, "user_a").json()["data"]["drills"]

    hold, band = drills[1], drills[2]
    assert hold["reps"] == "30s"
    assert hold["prescribed_quantity"] == {"kind": "duration", "text": "30s", "seconds": 30.0}
    assert band["recommended_load"] == {"kind": "qualitative", "text": "light band"}
    assert band["rest_seconds"] == 0


def test_a_session_opening_with_a_warm_up_section_is_flagged():
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session(
        "user_a",
        [("Goblet Squat", ["quads"], ["dumbbell"]), ("Back Squat", ["quads"], ["barbell"])],
        set_types={0: "warm_up"},
    )

    data = harness.suggest(session_id, "user_a").json()["data"]

    assert data["has_warm_up_section"] is True


def test_regenerate_asks_the_ai_again():
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session("user_a", _LEG_DAY)

    harness.suggest(session_id, "user_a")
    response = harness.suggest(session_id, "user_a", {"regenerate": True})

    assert response.status_code == 200
    assert len(harness.llm.calls) == 2
