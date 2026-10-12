"""Behavior of the Curated Protocol endpoints (issue #684, ADR-0130).

``GET /api/curated-protocols`` lists the released Curated Protocols, ``POST
/api/curated-protocols/{identifier}/preview`` shows the plan the user's choices would write
(issue #685), and ``POST /api/curated-protocols/{identifier}/adopt`` turns one into the user's
own Protocol. Driven end
to end over HTTP against a throwaway SQLite database (so the adopted plan is read back through
the real Protocol, Session, Home and index endpoints), with an injected registry that releases
the real beginner content (it ships unreleased) and the curated Catalog seeded as the migration
seeds it. Nothing here may call the LLM: the generation dependencies are wired to fail."""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, func, select

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.curated.beginner_linear import BEGINNER_LINEAR
from app.curated.model import CoachSignOff
from app.curated.registry import CuratedRegistry, get_curated_registry
from app.curated.seed import seed_curated_exercises
from app.db.models import ExercisePrescription, Protocol, WorkoutSession
from app.db.session import get_session
from app.domain.load import LoadKind, ParsedLoad
from app.main import create_app
from app.repositories.deps import (
    get_generation_orchestrator,
    get_protocol_generator,
    get_session_generator,
)
from app.repositories.exercise_repository import SqlExerciseRepository
from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSetDraft,
    SqlLoggedSessionRepository,
)
from tests.conftest import ISSUER, SigningContext, make_signing_context
from tests.quantities import reps_quantity

USER = "user_curated"
SIGN_OFF = CoachSignOff(
    reviewer="Test Coach", credential="Test credential", signed_on=date(2026, 10, 1)
)
RELEASED = replace(BEGINNER_LINEAR, released=True, coach_sign_off=SIGN_OFF)
UNRELEASED = replace(
    BEGINNER_LINEAR, identifier="unreleased-curated-protocol", name="Unreleased Curated Protocol"
)
STARTING_WEIGHTS = {"squat": 60, "bench": 40, "press": 30, "deadlift": 80}
BODYWEIGHT = ParsedLoad(kind=LoadKind.BODYWEIGHT, text="bodyweight").to_dict()


def _absolute(kg: float) -> dict:
    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _no_llm():
    raise AssertionError("Adopting a Curated Protocol must never reach generation.")


@dataclass(frozen=True)
class _Harness:
    client: TestClient
    ctx: SigningContext
    engine: object

    def auth(self, sub: str = USER) -> dict:
        return {"Authorization": f"Bearer {self.ctx.mint(sub=sub)}"}

    def get(self, path: str, sub: str = USER):
        return self.client.get(path, headers=self.auth(sub))

    def list(self, sub: str = USER):
        return self.get("/api/curated-protocols", sub)

    def adopt(self, identifier: str = RELEASED.identifier, sub: str = USER, **body):
        payload = {"weeks": 4, "starting_weights_kg": STARTING_WEIGHTS, **body}
        return self.client.post(
            f"/api/curated-protocols/{identifier}/adopt",
            json=payload,
            headers=self.auth(sub),
        )

    def preview(self, identifier: str = RELEASED.identifier, sub: str = USER, **body):
        payload = {"weeks": 4, "starting_weights_kg": STARTING_WEIGHTS, **body}
        return self.client.post(
            f"/api/curated-protocols/{identifier}/preview",
            json=payload,
            headers=self.auth(sub),
        )

    def adopted(self, response, sub: str = USER) -> dict:
        protocol_id = response.json()["data"]["protocol_id"]
        return self.get(f"/api/protocols/{protocol_id}", sub).json()["data"]

    def log_sets(self, sub: str, *sets: tuple[str, dict, int]) -> None:
        """Record one plan-less Logged Session of ``(exercise name, load, reps)`` sets."""

        with Session(self.engine) as session:
            exercises = SqlExerciseRepository(session)
            SqlLoggedSessionRepository(session).create(
                sub,
                LoggedSessionDraft(
                    session_id=None,
                    performed_on=date(2026, 9, 1),
                    training_type="strength",
                    logged_sets=[
                        LoggedSetDraft(
                            exercise_id=exercises.find_by_name(name).id,
                            quantity=reps_quantity(reps),
                            load=load,
                            body_weight_kg=80,
                        )
                        for name, load, reps in sets
                    ],
                ),
            )

    def catalog_names(self) -> list[str]:
        with Session(self.engine) as session:
            return sorted(e.name for e in SqlExerciseRepository(session).list_all())

    def row_counts(self) -> dict[str, int]:
        """Rows in every table an adopt writes. Read straight off the database, because
        "nothing was persisted" has no other witness."""

        with Session(self.engine) as session:
            return {
                table.__name__: session.exec(
                    select(func.count()).select_from(table)
                ).one()
                for table in (Protocol, WorkoutSession, ExercisePrescription)
            }


def build_harness(*curated_protocols) -> _Harness:
    ctx = make_signing_context()
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed_curated_exercises(SqlExerciseRepository(session))
    registry = CuratedRegistry(curated_protocols or (RELEASED, UNRELEASED))

    def _session():
        with Session(engine) as session:
            yield session

    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_curated_registry] = lambda: registry
    for generation in (
        get_generation_orchestrator,
        get_protocol_generator,
        get_session_generator,
    ):
        app.dependency_overrides[generation] = _no_llm
    return _Harness(TestClient(app), ctx, engine)


# --- List -------------------------------------------------------------------------------


def test_list_returns_only_released_curated_protocols_in_the_envelope():
    # Arrange
    h = build_harness()

    # Act
    response = h.list()

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["error"] is None
    assert [row["identifier"] for row in body["data"]] == [
        "beginner-linear-progression"
    ]


def test_a_list_row_describes_the_curated_protocol_and_its_main_lifts():
    # Arrange
    h = build_harness(RELEASED)

    # Act
    row = h.list().json()["data"][0]

    # Assert
    assert row == {
        "identifier": "beginner-linear-progression",
        "version": 1,
        "name": "Beginner linear progression",
        "description": RELEASED.description,
        "training_type": "strength",
        "sessions_per_week": 3,
        "min_weeks": 4,
        "max_weeks": 12,
        "required_equipment": ["barbell", "rack", "bench", "dumbbell"],
        "main_lifts": [
            {
                "key": "squat",
                "exercise_name": "Barbell Back Squat",
                "default_starting_weight_kg": 20,
                "starting_weight_prefill": {"kg": 20, "source": "default"},
            },
            {
                "key": "bench",
                "exercise_name": "Barbell Bench Press",
                "default_starting_weight_kg": 20,
                "starting_weight_prefill": {"kg": 20, "source": "default"},
            },
            {
                "key": "press",
                "exercise_name": "Barbell Overhead Press",
                "default_starting_weight_kg": 20,
                "starting_weight_prefill": {"kg": 20, "source": "default"},
            },
            {
                "key": "deadlift",
                "exercise_name": "Barbell Deadlift",
                "default_starting_weight_kg": 40,
                "starting_weight_prefill": {"kg": 40, "source": "default"},
            },
        ],
    }


def test_a_users_estimated_1rm_prefills_their_starting_weight_from_records():
    # Arrange — 100 kg × 5 squat (Est. 1RM 116.7 → 70% → 80 kg) and a bodyweight-only
    # bench, which must not count; another user's history must not leak in
    h = build_harness(RELEASED)
    h.log_sets(
        USER,
        ("Barbell Back Squat", _absolute(100), 5),
        ("Barbell Bench Press", BODYWEIGHT, 5),
    )
    h.log_sets("user_other", ("Barbell Overhead Press", _absolute(60), 1))

    # Act
    lifts = {
        lift["key"]: lift["starting_weight_prefill"]
        for lift in h.list().json()["data"][0]["main_lifts"]
    }

    # Assert
    assert lifts == {
        "squat": {"kg": 80, "source": "records"},
        "bench": {"kg": 20, "source": "default"},
        "press": {"kg": 20, "source": "default"},
        "deadlift": {"kg": 40, "source": "default"},
    }


def test_list_requires_authentication():
    # Arrange
    h = build_harness()

    # Act
    response = h.client.get("/api/curated-protocols")

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


# --- Adopt ------------------------------------------------------------------------------


def test_adopt_persists_length_times_sessions_per_week_curated_sessions():
    # Arrange
    h = build_harness()

    # Act
    response = h.adopt(weeks=5)

    # Assert
    assert response.status_code == 201
    body = response.json()
    assert body["success"] is True
    protocol = h.adopted(response)
    assert protocol["weeks"] == 5
    assert len(protocol["sessions"]) == 15
    assert [(s["week"], s["day"]) for s in protocol["sessions"][:4]] == [
        (1, 1),
        (1, 2),
        (1, 3),
        (2, 1),
    ]


def test_main_lifts_carry_absolute_loads_from_the_inputs_on_greyskull():
    # Arrange
    h = build_harness()

    # Act
    protocol = h.adopted(h.adopt())

    # Assert
    main_lifts = {
        p["exercise_name"]: p
        for session in protocol["sessions"]
        for p in session["prescriptions"]
        if p["exercise_name"].startswith("Barbell")
    }
    assert {name: p["recommended_load"] for name, p in main_lifts.items()} == {
        "Barbell Back Squat": {"kind": "absolute", "text": "60 kg", "kg": 60},
        "Barbell Bench Press": {"kind": "absolute", "text": "40 kg", "kg": 40},
        "Barbell Overhead Press": {"kind": "absolute", "text": "30 kg", "kg": 30},
        "Barbell Deadlift": {"kind": "absolute", "text": "80 kg", "kg": 80},
    }
    assert {p["scheme"] for p in main_lifts.values()} == {"greyskull"}


def test_accessories_carry_qualitative_loads_and_no_load_is_a_percentage():
    # Arrange
    h = build_harness()

    # Act
    protocol = h.adopted(h.adopt())

    # Assert
    loads = [
        p["recommended_load"]
        for session in protocol["sessions"]
        for p in session["prescriptions"]
    ]
    assert {"kind": "qualitative", "text": "moderate"} in loads
    assert all(load["kind"] != "percent_1rm" for load in loads)
    assert all(
        p["scheme"] is not None
        for session in protocol["sessions"]
        for p in session["prescriptions"]
    )


def test_every_adopted_session_is_curated():
    # Arrange
    h = build_harness()

    # Act
    protocol = h.adopted(h.adopt())

    # Assert
    provenances = {
        h.get(f"/api/sessions/{s['session_id']}").json()["data"]["provenance"]
        for s in protocol["sessions"]
    }
    assert provenances == {"curated"}


def test_the_adopted_protocol_is_named_after_the_curated_protocol():
    # Arrange
    h = build_harness()

    # Act
    protocol = h.adopted(h.adopt())

    # Assert
    assert protocol["label"] == "Beginner linear progression"


def test_adopting_makes_it_current_and_sets_the_prior_current_protocol_aside():
    # Arrange
    h = build_harness()
    first = h.adopt().json()["data"]["protocol_id"]

    # Act
    second = h.adopt().json()["data"]["protocol_id"]

    # Assert
    assert h.get("/api/home").json()["data"]["current_protocol"]["id"] == second
    index = h.get("/api/protocols").json()["data"]
    assert {row["id"]: row["status"] for row in index} == {
        second: "current",
        first: "set_aside",
    }


def test_adopting_creates_no_catalog_exercise():
    # Arrange
    h = build_harness()
    before = h.catalog_names()

    # Act
    response = h.adopt()

    # Assert
    assert response.status_code == 201
    assert h.catalog_names() == before


def _assert_rejected_and_nothing_persisted(h, response, code):
    assert response.status_code == 422
    body = response.json()
    assert body["success"] is False
    assert code in [error["code"] for error in body["errors"]]
    assert h.get("/api/protocols").json()["data"] == []


def test_adopt_rejects_a_length_outside_the_curated_protocols_bounds():
    # Arrange
    h = build_harness()

    # Act
    too_short = h.adopt(weeks=3)
    too_long = h.adopt(weeks=13)

    # Assert
    _assert_rejected_and_nothing_persisted(h, too_short, "weeks_out_of_range")
    _assert_rejected_and_nothing_persisted(h, too_long, "weeks_out_of_range")


def test_adopt_rejects_a_missing_main_lift():
    # Arrange
    h = build_harness()
    weights = {key: kg for key, kg in STARTING_WEIGHTS.items() if key != "deadlift"}

    # Act
    response = h.adopt(starting_weights_kg=weights)

    # Assert
    _assert_rejected_and_nothing_persisted(h, response, "missing_starting_weight")
    assert response.json()["errors"][0]["main_lift"] == "deadlift"


def test_adopt_rejects_a_non_positive_starting_weight():
    # Arrange
    h = build_harness()

    # Act
    zero = h.adopt(starting_weights_kg={**STARTING_WEIGHTS, "squat": 0})
    negative = h.adopt(starting_weights_kg={**STARTING_WEIGHTS, "bench": -20})

    # Assert
    _assert_rejected_and_nothing_persisted(h, zero, "invalid_starting_weight")
    _assert_rejected_and_nothing_persisted(h, negative, "invalid_starting_weight")


def test_adopt_rejects_a_weight_for_a_lift_the_curated_protocol_does_not_have():
    # Arrange
    h = build_harness()

    # Act
    response = h.adopt(starting_weights_kg={**STARTING_WEIGHTS, "curl": 10})

    # Assert
    _assert_rejected_and_nothing_persisted(h, response, "unknown_main_lift")


def test_adopt_rejects_a_malformed_body_in_the_envelope():
    # Arrange
    h = build_harness()

    # Act
    response = h.adopt(starting_weights_kg={**STARTING_WEIGHTS, "squat": "heavy"})

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False
    assert h.get("/api/protocols").json()["data"] == []


def test_an_unreleased_curated_protocol_cannot_be_adopted():
    # Arrange
    h = build_harness()

    # Act
    response = h.adopt(identifier=UNRELEASED.identifier)

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False
    assert h.get("/api/protocols").json()["data"] == []


def test_an_unknown_curated_protocol_is_404():
    # Arrange
    h = build_harness()

    # Act
    response = h.adopt(identifier="no-such-curated-protocol")

    # Assert
    assert response.status_code == 404


def test_adopt_requires_authentication():
    # Arrange
    h = build_harness()

    # Act
    response = h.client.post(
        f"/api/curated-protocols/{RELEASED.identifier}/adopt",
        json={"weeks": 4, "starting_weights_kg": STARTING_WEIGHTS},
    )

    # Assert
    assert response.status_code == 401


def test_an_un_started_adopted_curated_protocol_can_be_deleted():
    # Arrange
    h = build_harness()
    protocol_id = h.adopt().json()["data"]["protocol_id"]

    # Act
    response = h.client.delete(f"/api/protocols/{protocol_id}", headers=h.auth())

    # Assert
    assert response.status_code == 200
    assert h.get("/api/protocols").json()["data"] == []


def test_a_builder_deploy_keeps_the_rewritten_tail_curated():
    # Arrange — the user edits the whole (un-performed) plan in the Builder
    h = build_harness()
    protocol = h.adopted(h.adopt())
    sessions = [
        {
            "session_id": s["session_id"],
            "week": s["week"],
            "day": s["day"],
            "prescriptions": [
                {"exercise_id": p["exercise_id"], "sets": p["sets"], "reps": p["reps"]}
                for p in s["prescriptions"]
            ],
        }
        for s in protocol["sessions"]
    ]

    # Act
    response = h.client.post(
        f"/api/protocols/{protocol['id']}/deploy",
        json={"weeks": 4, "sessions_per_week": 3, "sessions": sessions},
        headers=h.auth(),
    )

    # Assert
    assert response.status_code == 200
    deployed = h.get(f"/api/protocols/{protocol['id']}").json()["data"]
    provenances = {
        h.get(f"/api/sessions/{s['session_id']}").json()["data"]["provenance"]
        for s in deployed["sessions"]
    }
    assert provenances == {"curated"}


# --- Preview ----------------------------------------------------------------------------

PLAN_FIELDS = (
    "exercise_name",
    "sets",
    "reps",
    "rest_seconds",
    "recommended_load",
    "prescribed_quantity",
    "scheme",
)


def _plan_of(sessions) -> list:
    return [
        (
            s["week"],
            s["day"],
            s["title"],
            [{field: p[field] for field in PLAN_FIELDS} for p in s["prescriptions"]],
        )
        for s in sessions
    ]


def test_preview_returns_the_enumerated_plan_in_the_envelope():
    # Arrange
    h = build_harness()

    # Act
    response = h.preview(weeks=5)

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    plan = body["data"]
    assert plan["identifier"] == "beginner-linear-progression"
    assert plan["version"] == 1
    assert plan["weeks"] == 5
    assert plan["sessions_per_week"] == 3
    assert len(plan["sessions"]) == 15
    assert [(s["week"], s["day"]) for s in plan["sessions"][:4]] == [
        (1, 1),
        (1, 2),
        (1, 3),
        (2, 1),
    ]
    squat = next(
        p
        for p in plan["sessions"][0]["prescriptions"]
        if p["exercise_name"] == "Barbell Back Squat"
    )
    assert squat["recommended_load"] == {"kind": "absolute", "text": "60 kg", "kg": 60}
    assert squat["scheme"] == "greyskull"


def test_preview_equals_what_adopt_then_persists():
    # Arrange
    h = build_harness()
    weights = {"squat": 62.5, "bench": 42.5, "press": 27.5, "deadlift": 90}

    # Act
    previewed = h.preview(weeks=6, starting_weights_kg=weights).json()["data"]
    adopted = h.adopted(h.adopt(weeks=6, starting_weights_kg=weights))

    # Assert
    assert _plan_of(previewed["sessions"]) == _plan_of(adopted["sessions"])


def test_preview_persists_nothing_and_leaves_the_current_protocol_current():
    # Arrange
    h = build_harness()
    current = h.adopt().json()["data"]["protocol_id"]
    counts = h.row_counts()

    # Act
    response = h.preview(weeks=12)

    # Assert
    assert response.status_code == 200
    assert h.row_counts() == counts
    assert h.get("/api/home").json()["data"]["current_protocol"]["id"] == current
    assert [row["id"] for row in h.get("/api/protocols").json()["data"]] == [current]


def test_preview_creates_no_catalog_exercise():
    # Arrange
    h = build_harness()
    before = h.catalog_names()

    # Act
    response = h.preview()

    # Assert
    assert response.status_code == 200
    assert h.catalog_names() == before


def _rejection(response) -> tuple:
    body = response.json()
    return response.status_code, body["success"], body["error"], body["errors"]


def test_preview_rejects_invalid_choices_with_the_same_errors_as_adopt():
    # Arrange
    h = build_harness()
    invalid = [
        {"weeks": 3},
        {"weeks": 13},
        {"starting_weights_kg": {"squat": 60, "bench": 40, "press": 30}},
        {"starting_weights_kg": {**STARTING_WEIGHTS, "squat": 0}},
        {"starting_weights_kg": {**STARTING_WEIGHTS, "bench": -20}},
        {"starting_weights_kg": {**STARTING_WEIGHTS, "curl": 10}},
    ]

    for body in invalid:
        # Act
        previewed = h.preview(**body)
        adopted = h.adopt(**body)

        # Assert
        assert previewed.status_code == 422, body
        assert _rejection(previewed) == _rejection(adopted)
    assert h.row_counts() == {
        "Protocol": 0,
        "WorkoutSession": 0,
        "ExercisePrescription": 0,
    }


def test_preview_rejects_a_malformed_body_in_the_envelope():
    # Arrange
    h = build_harness()

    # Act
    response = h.preview(starting_weights_kg={**STARTING_WEIGHTS, "squat": "heavy"})

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_an_unreleased_curated_protocol_cannot_be_previewed():
    # Arrange
    h = build_harness()

    # Act
    unreleased = h.preview(identifier=UNRELEASED.identifier)
    unknown = h.preview(identifier="no-such-curated-protocol")

    # Assert
    assert unreleased.status_code == 404
    assert unreleased.json()["success"] is False
    assert unknown.status_code == 404


def test_preview_requires_authentication():
    # Arrange
    h = build_harness()

    # Act
    response = h.client.post(
        f"/api/curated-protocols/{RELEASED.identifier}/preview",
        json={"weeks": 4, "starting_weights_kg": STARTING_WEIGHTS},
    )

    # Assert
    assert response.status_code == 401
