"""Behavior of the Protocol endpoints end to end under async generation (Slice 7).

A generate request no longer blocks on the AI: a cache **miss** returns a job
handle (``202``) and a worker completes the generation independently, so a dropped
mobile connection never loses the result; the PWA polls ``/protocols/jobs/{id}``
until the adopted Protocol id appears. A cache **hit** still returns instantly
(``200``) with the Protocol id and no job. The AI generator, repositories, cache
and queue are injected via dependency overrides so the tests run offline; the
in-memory queue's ``work()`` stands in for the out-of-process RQ worker.
"""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.generation.generator import GenerationError
from app.generation.job_queue import InMemoryJobQueue
from app.generation.orchestrator import GenerationOrchestrator
from app.generation.protocol_generator import ProtocolGenerationRequest
from app.generation.protocol_service import run_generation
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProtocol,
    GeneratedProtocolSession,
)
from app.domain.load import parse_load
from app.generation.cache import GenerationCache, InMemoryCacheStore
from app.main import create_app
from app.repositories.deps import (
    get_exercise_repository,
    get_generation_orchestrator,
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


class FakeProtocolGenerator:
    def __init__(self, *, result=None, error=None):
        self._result = result
        self._error = error
        self.calls = 0

    def generate(self, request: ProtocolGenerationRequest) -> GeneratedProtocol:
        self.calls += 1
        if self._error is not None:
            raise self._error
        return self._result


def _default_protocol() -> GeneratedProtocol:
    return GeneratedProtocol(
        sessions=[
            GeneratedProtocolSession(
                week=week,
                day=1,
                title=f"Week {week} Push",
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Back Squat",
                        targeted_muscles=["quads"],
                        required_equipment=["barbell"],
                        sets=5,
                        reps="5",
                        recommended_load=f"{55 + week * 5}% 1RM",
                    )
                ],
            )
            for week in (1, 2)
        ]
    )


class _Harness:
    """The wired app plus handles the tests drive: the queue (worker) and the
    counting generator."""

    def __init__(self, client, ctx, queue, generator, logged):
        self.client = client
        self.ctx = ctx
        self.queue = queue
        self.generator = generator
        self.logged = logged

    def auth(self, sub):
        return {"Authorization": f"Bearer {self.ctx.mint(sub=sub)}"}

    def submit(self, sub, **overrides):
        return self.client.post(
            "/api/protocols/generate", headers=self.auth(sub), json=_body(**overrides)
        )

    def poll(self, sub, job_id):
        return self.client.get(
            f"/api/protocols/jobs/{job_id}", headers=self.auth(sub)
        )

    def generate_protocol_id(self, sub, **overrides) -> int:
        """Run a full generate, following the async path to the adopted id."""

        data = self.submit(sub, **overrides).json()["data"]
        if data["protocol_id"] is not None:  # cache hit — instant
            return data["protocol_id"]
        self.queue.work()  # the out-of-process worker runs
        job = self.poll(sub, data["job_id"]).json()["data"]
        assert job["status"] == "complete"
        return job["protocol_id"]

    def fetch_protocol(self, sub, protocol_id):
        return self.client.get(
            f"/api/protocols/{protocol_id}", headers=self.auth(sub)
        )


def build_harness(generator=None, ctx=None, profiles=None, cache=None) -> _Harness:
    ctx = ctx or make_signing_context()
    exercises = InMemoryExerciseRepository()
    protocols = InMemoryProtocolRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    generator = generator or FakeProtocolGenerator(result=_default_protocol())
    profiles = profiles or InMemoryProfileRepository()
    cache = cache or GenerationCache(InMemoryCacheStore())

    def runner(request, clerk_user_id, cache_key):
        view = run_generation(
            request,
            clerk_user_id,
            cache_key,
            cache=cache,
            generator=generator,
            exercises=exercises,
            protocols=protocols,
        )
        return view.id

    queue = InMemoryJobQueue(runner)
    orchestrator = GenerationOrchestrator(
        cache=cache, queue=queue, exercises=exercises, protocols=protocols
    )

    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_protocol_repository] = lambda: protocols
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    app.dependency_overrides[get_generation_orchestrator] = lambda: orchestrator
    return _Harness(TestClient(app), ctx, queue, generator, logged)


def _body(**overrides):
    body = {
        "training_type": "strength",
        "objective": "gain muscle mass",
        "sessions_per_week": 1,
        "duration_minutes": 45,
        "weeks": 2,
        "equipment": ["barbell"],
    }
    body.update(overrides)
    return body


def test_generate_requires_authentication():
    h = build_harness()
    response = h.client.post("/api/protocols/generate", json=_body())
    assert response.status_code == 401
    assert response.json()["success"] is False


def test_generate_rejects_zero_weeks():
    h = build_harness()
    response = h.submit("user_badreq", weeks=0)
    assert response.status_code == 422
    assert response.json()["success"] is False


def test_cache_miss_enqueues_a_job_that_completes_to_a_protocol():
    # Arrange
    h = build_harness()

    # Act — submit returns a handle immediately, without generating inline
    submitted = h.submit("user_gen")

    # Assert — accepted (202), a pending job, no Protocol yet, no AI call yet
    assert submitted.status_code == 202
    data = submitted.json()["data"]
    assert data["status"] == "pending"
    assert data["job_id"]
    assert data["protocol_id"] is None
    assert h.generator.calls == 0

    # Act — the worker runs independently of the original request
    h.queue.work()
    job = h.poll("user_gen", data["job_id"]).json()["data"]

    # Assert — the result is retrievable by the handle alone, and the adopted
    # Protocol is fully enumerated week to week
    assert job["status"] == "complete"
    protocol = h.fetch_protocol("user_gen", job["protocol_id"]).json()["data"]
    assert protocol["weeks"] == 2
    assert [s["week"] for s in protocol["sessions"]] == [1, 2]
    loads = [s["prescriptions"][0]["recommended_load"] for s in protocol["sessions"]]
    assert loads == [parse_load("60% 1RM").to_dict(), parse_load("65% 1RM").to_dict()]


def test_cache_hit_returns_a_protocol_instantly_with_no_job():
    # Arrange — prime the cache with one full generation
    h = build_harness()
    first_id = h.generate_protocol_id("user_one")

    # Act — an equivalent request from a second user
    response = h.submit("user_two")

    # Assert — served from cache: 200, the Protocol id inline, no job, one AI call
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["status"] == "complete"
    assert data["job_id"] is None
    assert data["protocol_id"] is not None
    assert data["protocol_id"] != first_id
    assert h.generator.calls == 1


def test_failed_generation_surfaces_through_the_job_not_the_request():
    # Arrange — an under-enumerated generation fails boundary validation
    h = build_harness(
        generator=FakeProtocolGenerator(error=GenerationError("not enumerated"))
    )

    # Act — the request is still accepted; the failure lands on the job
    submitted = h.submit("user_bad")
    assert submitted.status_code == 202
    job_id = submitted.json()["data"]["job_id"]
    h.queue.work()
    job = h.poll("user_bad", job_id).json()["data"]

    # Assert — polling reports a failed job with a user-safe message
    assert job["status"] == "failed"
    assert job["protocol_id"] is None
    assert job["error"]


def test_unknown_job_returns_404():
    h = build_harness()
    response = h.poll("user_x", "job-does-not-exist")
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_sensitive_user_always_regenerates():
    # Arrange — a user flagged with a Sensitive Constraint
    profiles = InMemoryProfileRepository()
    profiles.update("user_sensitive", ProfileUpdate(sensitive_constraints=["injury"]))
    h = build_harness(profiles=profiles)

    # Act — the sensitive user requests the same parameters twice, each to done
    h.generate_protocol_id("user_sensitive")
    h.generate_protocol_id("user_sensitive")

    # Assert — the cache is bypassed every time: a fresh generation each request
    assert h.generator.calls == 2


class _RecordingProtocolGenerator(FakeProtocolGenerator):
    """A FakeProtocolGenerator that also remembers each request it was handed, so a
    test can assert what the route threaded into generation."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.requests = []

    def generate(self, request: ProtocolGenerationRequest) -> GeneratedProtocol:
        self.requests.append(request)
        return super().generate(request)


def test_generation_for_a_sensitive_user_carries_the_constraint_flag():
    # Arrange — a Sensitive-Constraint user's generation must instruct no Supersets and
    # degrade any that slip through (ADR-0023), so the route threads the derived flag
    # onto the generation request the worker runs.
    profiles = InMemoryProfileRepository()
    profiles.update("user_injured", ProfileUpdate(sensitive_constraints=["injury"]))
    generator = _RecordingProtocolGenerator(result=_default_protocol())
    h = build_harness(generator=generator, profiles=profiles)

    # Act
    h.generate_protocol_id("user_injured")

    # Assert — the request the generator ran carried the safety flag
    assert generator.requests[-1].has_sensitive_constraint is True


def test_generation_for_a_non_sensitive_user_leaves_the_constraint_flag_unset():
    # Arrange — a plain user (no Sensitive Constraint): Supersets stay allowed
    generator = _RecordingProtocolGenerator(result=_default_protocol())
    h = build_harness(generator=generator)

    # Act
    h.generate_protocol_id("user_plain")

    # Assert
    assert generator.requests[-1].has_sensitive_constraint is False


def test_fetched_protocol_surfaces_the_next_un_performed_session():
    # Arrange — a fresh protocol: Week 1 is next
    h = build_harness()
    protocol_id = h.generate_protocol_id("user_next")

    # Act
    fetched = h.fetch_protocol("user_next", protocol_id)

    # Assert
    assert fetched.status_code == 200
    data = fetched.json()["data"]
    assert data["completed_count"] == 0
    assert data["next_session"]["week"] == 1


def test_another_user_cannot_fetch_someone_elses_protocol():
    # Arrange
    h = build_harness()
    protocol_id = h.generate_protocol_id("user_owner")

    # Act
    response = h.fetch_protocol("user_intruder", protocol_id)

    # Assert
    assert response.status_code == 404
    assert response.json()["success"] is False


def test_fetched_protocol_exposes_name_and_derived_label():
    # Arrange — a freshly adopted Protocol is unnamed (F4 Slice 5)
    h = build_harness()
    protocol_id = h.generate_protocol_id("user_label")

    # Act
    data = h.fetch_protocol("user_label", protocol_id).json()["data"]

    # Assert — name is unset and the label falls back to objective · training_type
    assert data["name"] is None
    assert data["label"] == "gain muscle mass · strength"


def _kg_protocol() -> GeneratedProtocol:
    """A two-week protocol whose Back Squat carries an adjustable kg load."""

    return GeneratedProtocol(
        sessions=[
            GeneratedProtocolSession(
                week=week,
                day=1,
                title=f"Week {week}",
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Back Squat",
                        sets=3,
                        reps="5",
                        recommended_load="60 kg",
                    )
                ],
            )
            for week in (1, 2)
        ]
    )


def test_fetched_protocol_shows_progressed_load_for_upcoming_sessions():
    # Arrange — generate a kg-load protocol, then perform Week 1 strongly
    h = build_harness(generator=FakeProtocolGenerator(result=_kg_protocol()))
    protocol_id = h.generate_protocol_id("user_progress")
    created = h.fetch_protocol("user_progress", protocol_id).json()["data"]
    week_one = created["next_session"]
    h.logged.create(
        "user_progress",
        LoggedSessionDraft(
            session_id=week_one["session_id"],
            performed_on=date(2026, 1, 1),
            logged_sets=[
                LoggedSetDraft(
                    exercise_id=week_one["prescriptions"][0]["exercise_id"],
                    reps=5,
                    load=parse_load("60 kg").to_dict(),
                    perceived_difficulty=6,
                )
                for _ in range(3)
            ],
        ),
    )

    # Act
    fetched = h.fetch_protocol("user_progress", protocol_id)

    # Assert — the upcoming Week-2 Session shows the raised recommendation
    data = fetched.json()["data"]
    assert data["next_session"]["week"] == 2
    assert data["next_session"]["prescriptions"][0]["recommended_load"] == parse_load("62.5 kg").to_dict()
