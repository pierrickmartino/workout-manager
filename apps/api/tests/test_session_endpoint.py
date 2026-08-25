"""Behavior of the Session generation endpoints end to end: real JWKS
verification, the repositories, the generation service, and the response envelope
wired through FastAPI. The AI generator and repositories are injected via
dependency overrides so the tests run offline and deterministically."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.domain.load import parse_load
from app.domain.quantity import quantity_from_text
from app.generation.generator import GenerationError, GenerationRequest
from app.generation.schema import GeneratedExercisePrescription, GeneratedSession
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_profile_repository,
    get_session_generator,
    get_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.profile_repository import (
    InMemoryProfileRepository,
    ProfileUpdate,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
)
from tests.conftest import ISSUER, make_signing_context


class FakeGenerator:
    def __init__(self, *, result=None, error=None):
        self._result = result
        self._error = error

    def generate(self, request: GenerationRequest) -> GeneratedSession:
        if self._error is not None:
            raise self._error
        return self._result


def _default_generation() -> GeneratedSession:
    return GeneratedSession(
        prescriptions=[
            GeneratedExercisePrescription(
                exercise_name="Back Squat",
                exercise_description="Compound lower-body lift.",
                targeted_muscles=["quads"],
                required_equipment=["barbell"],
                sets=5,
                reps="5",
                rest_seconds=120,
                tempo="3-1-1",
                recommended_load="70% 1RM",
            )
        ]
    )


def build_client(generator=None, ctx=None, profiles=None, sessions=None, exercises=None):
    ctx = ctx or make_signing_context()
    exercises = exercises or InMemoryExerciseRepository()
    profiles = profiles or InMemoryProfileRepository()
    # Wire the shared profile store into the session repo so the read resolves the Author's
    # display name (CONTEXT: Author, #395); without it the serializer's generic fallback stands in.
    sessions = sessions or InMemorySessionRepository(exercises, profiles)
    generator = generator or FakeGenerator(result=_default_generation())
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_session_generator] = lambda: generator
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    return TestClient(app), ctx


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _generate_body(**overrides):
    body = {
        "training_type": "strength",
        "duration_minutes": 45,
        "equipment": ["barbell"],
    }
    body.update(overrides)
    return body


def test_generate_requires_authentication():
    # Arrange
    client, _ = build_client()

    # Act
    response = client.post("/api/sessions/generate", json=_generate_body())

    # Assert
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_generate_returns_a_session_with_its_prescriptions():
    # Arrange
    client, ctx = build_client()

    # Act
    response = client.post(
        "/api/sessions/generate",
        headers=_auth(ctx, "user_gen"),
        json=_generate_body(),
    )

    # Assert
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    data = body["data"]
    assert data["training_type"] == "strength"
    assert data["duration_minutes"] == 45
    assert len(data["prescriptions"]) == 1
    prescription = data["prescriptions"][0]
    assert prescription["exercise_name"] == "Back Squat"
    assert prescription["sets"] == 5
    assert prescription["reps"] == "5"
    assert prescription["rest_seconds"] == 120
    assert prescription["tempo"] == "3-1-1"
    assert prescription["recommended_load"] == parse_load("70% 1RM").to_dict()
    assert prescription["provenance"] == "ai_generated"


def test_generated_session_reads_back_ai_generated_provenance():
    # Arrange — the standalone generation path produces the Session
    client, ctx = build_client()
    headers = _auth(ctx, "user_prov")

    # Act — create it, then fetch it back
    created = client.post(
        "/api/sessions/generate", headers=headers, json=_generate_body()
    ).json()["data"]
    fetched = client.get(f"/api/sessions/{created['id']}", headers=headers).json()[
        "data"
    ]

    # Assert — Session Provenance is stamped ai_generated on create and on read (ADR-0040)
    assert created["provenance"] == "ai_generated"
    assert fetched["provenance"] == "ai_generated"


def test_generated_session_credits_its_author_by_display_name():
    # Arrange — the creating user has a Profile display name
    profiles = InMemoryProfileRepository()
    profiles.update("user_author", ProfileUpdate(display_name="Alex Rivera"))
    client, ctx = build_client(profiles=profiles)
    headers = _auth(ctx, "user_author")

    # Act — create, then read it back
    created = client.post(
        "/api/sessions/generate", headers=headers, json=_generate_body()
    ).json()["data"]
    fetched = client.get(f"/api/sessions/{created['id']}", headers=headers).json()["data"]

    # Assert — Author is surfaced on the read: the creator's display name, a distinct axis
    # from Session Provenance (how it was made, not who made it)
    assert fetched["author"] == {"display_name": "Alex Rivera"}
    assert fetched["provenance"] == "ai_generated"


def test_author_display_name_is_null_when_the_creator_has_no_profile_name():
    # Arrange — the creating user has no Profile display name on file
    client, ctx = build_client()
    headers = _auth(ctx, "user_nameless")

    # Act
    created = client.post(
        "/api/sessions/generate", headers=headers, json=_generate_body()
    ).json()["data"]
    fetched = client.get(f"/api/sessions/{created['id']}", headers=headers).json()["data"]

    # Assert — the server surfaces the raw name (null here) without fabricating one; the web
    # mapper resolves the never-blank generic label at render time (its own unit test)
    assert fetched["author"] == {"display_name": None}


def test_generated_session_can_be_fetched_back_by_its_owner():
    # Arrange
    client, ctx = build_client()
    headers = _auth(ctx, "user_fetch")
    created = client.post(
        "/api/sessions/generate", headers=headers, json=_generate_body()
    ).json()["data"]

    # Act
    fetched = client.get(f"/api/sessions/{created['id']}", headers=headers)

    # Assert
    assert fetched.status_code == 200
    assert fetched.json()["data"]["id"] == created["id"]
    assert len(fetched.json()["data"]["prescriptions"]) == 1


def test_generated_session_is_born_with_a_typed_prescribed_quantity():
    # #344: generation now emits a typed Prescribed Quantity through resolve_prescriptions,
    # so a freshly generated strength Session is born typed (a "5" reps target becomes a
    # repetitions Quantity) rather than reading back null — the plan-side write boundary
    # types it at creation, not only the backfill.
    client, ctx = build_client()
    headers = _auth(ctx, "user_pq_generated")
    created = client.post(
        "/api/sessions/generate", headers=headers, json=_generate_body()
    ).json()["data"]

    fetched = client.get(f"/api/sessions/{created['id']}", headers=headers).json()["data"]

    prescription = fetched["prescriptions"][0]
    assert prescription["prescribed_quantity"] == {
        "kind": "repetitions",
        "text": "5",
        "count": 5,
    }


def test_read_serializes_typed_prescribed_quantity_to_the_client():
    # A prescription carrying a typed Prescribed Quantity (as the backfill produces for a
    # legacy "7 KM" target) surfaces that Quantity verbatim on the session-detail read, so
    # the web client can render the log input by kind (ADR-0050).
    exercises = InMemoryExerciseRepository()
    run = exercises.find_or_create("Outdoor Run", provenance=Provenance.CURATED)
    sessions = InMemorySessionRepository(exercises)
    quantity = quantity_from_text("7 KM")
    sessions.create(
        "user_pq_typed",
        SessionDraft(
            training_type="cardio",
            duration_minutes=40,
            prescriptions=[
                PrescriptionDraft(
                    exercise_id=run.id,
                    sets=1,
                    reps="7 KM",
                    prescribed_quantity=quantity.to_dict(),
                )
            ],
        ),
    )
    client, ctx = build_client(sessions=sessions, exercises=exercises)

    fetched = client.get(
        "/api/sessions/1", headers=_auth(ctx, "user_pq_typed")
    ).json()["data"]

    prescription = fetched["prescriptions"][0]
    assert prescription["prescribed_quantity"] == quantity.to_dict()
    # The free-text target is retained for display alongside the typed Quantity.
    assert prescription["reps"] == "7 KM"


def test_read_serializes_is_protocol_member_false_for_a_standalone_session():
    # A generated Session stands alone, so the read carries is_protocol_member=False and
    # the web Session view keeps the Duplicate control (Q2, ADR-0043 consequence).
    client, ctx = build_client()
    headers = _auth(ctx, "user_flag")
    created = client.post(
        "/api/sessions/generate", headers=headers, json=_generate_body()
    ).json()["data"]

    fetched = client.get(f"/api/sessions/{created['id']}", headers=headers).json()["data"]

    assert fetched["is_protocol_member"] is False


def test_another_user_cannot_fetch_someone_elses_session():
    # Arrange
    client, ctx = build_client()
    created = client.post(
        "/api/sessions/generate",
        headers=_auth(ctx, "user_owner"),
        json=_generate_body(),
    ).json()["data"]

    # Act — a different user requests the same session id
    response = client.get(
        f"/api/sessions/{created['id']}", headers=_auth(ctx, "user_intruder")
    )

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_malformed_generation_returns_502_and_persists_nothing():
    # Arrange — the generator fails the boundary validation
    client, ctx = build_client(
        generator=FakeGenerator(error=GenerationError("unparseable"))
    )
    headers = _auth(ctx, "user_bad")

    # Act
    response = client.post(
        "/api/sessions/generate", headers=headers, json=_generate_body()
    )

    # Assert — surfaced as an upstream error, not a silent persist
    assert response.status_code == 502
    assert response.json()["success"] is False
    # Nothing was stored: the first session id is absent
    assert client.get("/api/sessions/1", headers=headers).status_code == 404


def test_generate_rejects_a_non_positive_duration():
    # Arrange
    client, ctx = build_client()

    # Act
    response = client.post(
        "/api/sessions/generate",
        headers=_auth(ctx, "user_badreq"),
        json=_generate_body(duration_minutes=0),
    )

    # Assert
    assert response.status_code == 422
    assert response.json()["success"] is False


class RecordingGenerator(FakeGenerator):
    """A FakeGenerator that remembers each request, so a test can assert what the
    route threaded into generation."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.requests = []

    def generate(self, request: GenerationRequest) -> GeneratedSession:
        self.requests.append(request)
        return super().generate(request)


def test_generation_for_a_sensitive_user_carries_the_constraint_flag():
    # Arrange — a Sensitive-Constraint user's standalone Session generation must
    # instruct no Supersets and degrade any that slip through (ADR-0023): the route
    # threads the derived flag onto the request.
    profiles = InMemoryProfileRepository()
    profiles.update("user_injured", ProfileUpdate(sensitive_constraints=["injury"]))
    generator = RecordingGenerator(result=_default_generation())
    client, ctx = build_client(generator=generator, profiles=profiles)

    # Act
    response = client.post(
        "/api/sessions/generate",
        headers=_auth(ctx, "user_injured"),
        json=_generate_body(),
    )

    # Assert
    assert response.status_code == 200
    assert generator.requests[-1].has_sensitive_constraint is True


def test_generation_for_a_non_sensitive_user_leaves_the_flag_unset():
    # Arrange — a plain user: Supersets stay allowed
    generator = RecordingGenerator(result=_default_generation())
    client, ctx = build_client(generator=generator)

    # Act
    client.post(
        "/api/sessions/generate",
        headers=_auth(ctx, "user_plain"),
        json=_generate_body(),
    )

    # Assert
    assert generator.requests[-1].has_sensitive_constraint is False


def test_omitted_equipment_falls_back_to_profile_default_equipment():
    # Arrange — a user who saved Default Equipment and omits it on the request
    profiles = InMemoryProfileRepository()
    profiles.update(
        "user_default_kit",
        ProfileUpdate(default_equipment=["dumbbells", "pull-up bar"]),
    )
    generator = RecordingGenerator(result=_default_generation())
    client, ctx = build_client(generator=generator, profiles=profiles)

    # Act — the request states no equipment (null)
    response = client.post(
        "/api/sessions/generate",
        headers=_auth(ctx, "user_default_kit"),
        json=_generate_body(equipment=None),
    )

    # Assert — the generation ran with the saved Default Equipment
    assert response.status_code == 200
    assert generator.requests[-1].equipment == ["dumbbells", "pull-up bar"]


def test_explicit_empty_equipment_is_honored_as_bodyweight_over_the_default():
    # Arrange — a user with saved defaults who clears the field for a bodyweight plan
    profiles = InMemoryProfileRepository()
    profiles.update(
        "user_travelling", ProfileUpdate(default_equipment=["dumbbells"])
    )
    generator = RecordingGenerator(result=_default_generation())
    client, ctx = build_client(generator=generator, profiles=profiles)

    # Act — the request states an empty equipment list
    client.post(
        "/api/sessions/generate",
        headers=_auth(ctx, "user_travelling"),
        json=_generate_body(equipment=[]),
    )

    # Assert — empty is honored (bodyweight only), never a fallback to the Default
    assert generator.requests[-1].equipment == []
