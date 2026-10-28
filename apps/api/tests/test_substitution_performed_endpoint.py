"""Substitution refuses a performed Protocol Session (#787, ADR-0020, ADR-0143).

A Protocol Session with a Logged Session behind it is settled history: only the
un-performed tail of a Protocol is edited, so the Substitute endpoint answers 409 and
persists nothing. An un-performed Protocol Session and a standalone Session (logged or
not) substitute exactly as before. Driven through the existing Substitution endpoint
seam: in-memory repositories and a fake generator."""

from __future__ import annotations

from datetime import date

from app.generation.schema import GeneratedSubstitute
from app.generation.substitute_generator import SubstituteRequest
from app.repositories.deps import (
    get_logged_session_repository,
    get_session_repository,
)
from app.repositories.logged_session_repository import (
    LoggedSessionDraft,
    LoggedSetDraft,
)
from tests.test_substitution_endpoint import _auth, _create_session, build_client

OWNER = "user_performed"


class RecordingSubstituteGenerator:
    """Returns a fixed AI substitute and records every request it is asked for."""

    def __init__(self) -> None:
        self.requests: list[SubstituteRequest] = []

    def generate(self, request: SubstituteRequest) -> GeneratedSubstitute:
        self.requests.append(request)
        return GeneratedSubstitute(
            exercise_name="Wall Sit",
            targeted_muscles=["quads"],
            required_equipment=[],
        )


class Harness:
    def __init__(self) -> None:
        self.generator = RecordingSubstituteGenerator()
        self.client, self.ctx, self.exercises, _ = build_client(self.generator)
        overrides = self.client.app.dependency_overrides
        self.sessions = overrides[get_session_repository]()
        self.logged = overrides[get_logged_session_repository]()
        self.headers = _auth(self.ctx, OWNER)

    def session(self, *, protocol_id: int | None = None) -> dict:
        session = _create_session(self.client, self.headers)
        if protocol_id is not None:
            self.sessions._sessions[session["id"]].protocol_id = protocol_id
        return session

    def log(self, session: dict, *, completion_outcome: str = "completed") -> None:
        self.logged.create(
            OWNER,
            LoggedSessionDraft(
                session_id=session["id"],
                performed_on=date(2026, 1, 1),
                training_type="strength",
                completion_outcome=completion_outcome,
                logged_sets=[
                    LoggedSetDraft(exercise_id=session["prescriptions"][0]["exercise_id"])
                ],
            ),
        )

    def substitute(self, session: dict):
        return self.client.post(
            f"/api/sessions/{session['id']}/prescriptions/0/substitute",
            headers=self.headers,
        )

    def read(self, session: dict) -> dict:
        return self.client.get(
            f"/api/sessions/{session['id']}", headers=self.headers
        ).json()["data"]


def test_substitute_on_a_performed_protocol_session_is_refused_with_409():
    # Arrange
    harness = Harness()
    session = harness.session(protocol_id=7)
    harness.log(session)
    catalog_before = len(harness.exercises.list_all())

    # Act
    response = harness.substitute(session)

    # Assert — the standard error envelope, and nothing persisted
    assert response.status_code == 409
    body = response.json()
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]
    assert harness.generator.requests == []
    assert len(harness.exercises.list_all()) == catalog_before
    after = harness.read(session)
    assert after["prescriptions"][0]["exercise_name"] == "Back Squat"


def test_substitute_refuses_a_protocol_session_with_only_an_incomplete_log():
    # Arrange — any Logged Session makes it record, even one that did not advance
    harness = Harness()
    session = harness.session(protocol_id=7)
    harness.log(session, completion_outcome="incomplete")

    # Act
    response = harness.substitute(session)

    # Assert
    assert response.status_code == 409
    assert harness.generator.requests == []


def test_substitute_on_an_unperformed_protocol_session_swaps_as_before():
    # Arrange
    harness = Harness()
    session = harness.session(protocol_id=7)

    # Act
    response = harness.substitute(session)

    # Assert
    assert response.status_code == 200
    assert response.json()["data"]["prescriptions"][0]["exercise_name"] == "Wall Sit"
    assert len(harness.generator.requests) == 1


def test_substitute_on_a_logged_standalone_session_swaps_as_before():
    # Arrange — a standalone plan edit only reaches future performances
    harness = Harness()
    session = harness.session()
    harness.log(session)

    # Act
    response = harness.substitute(session)

    # Assert
    assert response.status_code == 200
    assert response.json()["data"]["prescriptions"][0]["exercise_name"] == "Wall Sit"
    assert len(harness.generator.requests) == 1
