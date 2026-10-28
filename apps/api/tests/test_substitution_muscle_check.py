"""An AI-invented substitute must train the original's Muscle Groups (ADR-0143, #790).

When no catalog link fits, the AI fallback receives the original Exercise's Primary and
Secondary Muscles, and its output is accepted only if its Primary Muscles cover every
Muscle Group of the original's Primary Muscles. A mismatch is retried once; a second
mismatch fails the Substitution and writes nothing — neither to the shared catalog nor to
the prescription. Catalog-resolved swaps are trusted and never checked. Runs offline with
in-memory repositories and a scripted fake generator."""

from __future__ import annotations

import pytest

from app.domain.exercise import Provenance
from app.domain.substitution import RelationKind
from app.generation.schema import GeneratedSubstitute
from app.generation.substitute_generator import (
    LlmSubstituteGenerator,
    SubstituteRequest,
)
from app.repositories.exercise_relationship_repository import (
    InMemoryExerciseRelationshipRepository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import InMemoryLoggedSessionRepository
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
)
from app.substitution.service import SubstituteMuscleMismatch, substitute_exercise
from tests.fake_llm import FakeStructuredLLM
from tests.test_substitution_endpoint import _auth, _create_session, build_client


class ScriptedSubstituteGenerator:
    """Returns its scripted outputs in order and records every request it receives."""

    def __init__(self, *outputs: GeneratedSubstitute) -> None:
        self._outputs = list(outputs)
        self.requests: list[SubstituteRequest] = []

    def generate(self, request: SubstituteRequest) -> GeneratedSubstitute:
        self.requests.append(request)
        return self._outputs[len(self.requests) - 1]


def _substitute(name: str, primary: list[str]) -> GeneratedSubstitute:
    return GeneratedSubstitute(
        exercise_name=name,
        targeted_muscles=primary,
        primary_muscles=primary,
        required_equipment=[],
    )


BAND_ROW = _substitute("Band Row", ["latissimus dorsi", "rhomboids"])
PUSH_UP = _substitute("Push-up", ["pectoralis major", "triceps"])
BENCH_DIP = _substitute("Bench Dip", ["triceps"])


def _arrange(*, primary=("latissimus dorsi",), secondary=("biceps",), targeted=None):
    exercises = InMemoryExerciseRepository()
    relationships = InMemoryExerciseRelationshipRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    profiles = InMemoryProfileRepository()
    original = exercises.find_or_create(
        "Lat Pulldown",
        provenance=Provenance.CURATED,
        targeted_muscles=list(targeted if targeted is not None else primary + secondary),
        primary_muscles=list(primary),
        secondary_muscles=list(secondary),
        required_equipment=["cable machine"],
    )
    session = sessions.create(
        "user_a",
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[PrescriptionDraft(exercise_id=original.id, sets=3, reps="10")],
        ),
    )
    return session, original, exercises, relationships, sessions, profiles


def _run(session, exercises, relationships, sessions, profiles, generator):
    return substitute_exercise(
        session.id,
        "user_a",
        position=0,
        relationships=relationships,
        exercises=exercises,
        sessions=sessions,
        profiles=profiles,
        generator=generator,
        logged=InMemoryLoggedSessionRepository(sessions, exercises),
    )


def test_the_ai_request_carries_the_originals_primary_and_secondary_muscles():
    # Arrange
    session, _, exercises, relationships, sessions, profiles = _arrange(
        primary=("latissimus dorsi",), secondary=("biceps", "rear deltoids")
    )
    generator = ScriptedSubstituteGenerator(BAND_ROW)

    # Act
    _run(session, exercises, relationships, sessions, profiles, generator)

    # Assert
    request = generator.requests[0]
    assert request.original_primary_muscles == ("latissimus dorsi",)
    assert request.original_secondary_muscles == ("biceps", "rear deltoids")


def test_a_matching_first_output_is_accepted_and_linked_as_an_alternative():
    # Arrange
    session, original, exercises, relationships, sessions, profiles = _arrange()
    generator = ScriptedSubstituteGenerator(BAND_ROW)

    # Act
    view = _run(session, exercises, relationships, sessions, profiles, generator)

    # Assert
    assert len(generator.requests) == 1
    assert view.prescriptions[0].exercise_name == "Band Row"
    links = relationships.substitutes_for(original.id)
    assert [(link.exercise.name, link.kind) for link in links] == [
        ("Band Row", RelationKind.ALTERNATIVE)
    ]


def test_a_mismatching_output_is_retried_once_and_a_matching_retry_is_accepted():
    # Arrange — a push-up does not train the pulldown's Back
    session, original, exercises, relationships, sessions, profiles = _arrange()
    generator = ScriptedSubstituteGenerator(PUSH_UP, BAND_ROW)

    # Act
    view = _run(session, exercises, relationships, sessions, profiles, generator)

    # Assert — the rejected attempt never entered the shared catalog
    assert len(generator.requests) == 2
    assert view.prescriptions[0].exercise_name == "Band Row"
    assert exercises.find_by_name("Push-up") is None
    assert [link.exercise.name for link in relationships.substitutes_for(original.id)] == [
        "Band Row"
    ]


def test_a_second_mismatch_fails_the_substitution_and_writes_nothing():
    # Arrange
    session, original, exercises, relationships, sessions, profiles = _arrange()
    generator = ScriptedSubstituteGenerator(PUSH_UP, BENCH_DIP)

    # Act / Assert
    with pytest.raises(SubstituteMuscleMismatch):
        _run(session, exercises, relationships, sessions, profiles, generator)

    assert len(generator.requests) == 2
    assert exercises.find_by_name("Push-up") is None
    assert exercises.find_by_name("Bench Dip") is None
    assert relationships.substitutes_for(original.id) == []
    unchanged = sessions.get(session.id, "user_a")
    assert unchanged.prescriptions[0].exercise_name == "Lat Pulldown"


def test_the_targeted_union_stands_in_when_the_original_records_no_primary_muscles():
    # Arrange — the original only records a coarse targeted region
    session, _, exercises, relationships, sessions, profiles = _arrange(
        primary=(), secondary=(), targeted=("back",)
    )
    generator = ScriptedSubstituteGenerator(PUSH_UP, BAND_ROW)

    # Act
    view = _run(session, exercises, relationships, sessions, profiles, generator)

    # Assert — the push-up misses Back; the band row covers it
    assert len(generator.requests) == 2
    assert view.prescriptions[0].exercise_name == "Band Row"


def test_a_catalog_resolved_swap_makes_no_generator_call_and_is_not_checked():
    # Arrange — a curated Alternative that trains a different group is still trusted
    session, original, exercises, relationships, sessions, profiles = _arrange()
    curated = exercises.find_or_create(
        "Farmer Carry",
        provenance=Provenance.CURATED,
        primary_muscles=["forearms"],
        targeted_muscles=["forearms"],
    )
    relationships.add(original.id, curated.id, RelationKind.ALTERNATIVE)
    generator = ScriptedSubstituteGenerator()

    # Act
    view = _run(session, exercises, relationships, sessions, profiles, generator)

    # Assert
    assert generator.requests == []
    assert view.prescriptions[0].exercise_name == "Farmer Carry"


PUSH_UP_PAYLOAD = """
{
  "exercise_name": "Push-up",
  "targeted_muscles": ["pectoralis major", "triceps"],
  "primary_muscles": ["pectoralis major", "triceps"],
  "required_equipment": []
}
"""


def test_the_endpoint_reports_a_user_facing_reason_after_two_mismatches():
    # Arrange — the real generator over the LLM port (ADR-0006), faked at the port;
    # the squat the Session generates records Legs as its Primary Muscle Group
    llm = FakeStructuredLLM(text=PUSH_UP_PAYLOAD)
    client, ctx, exercises, relationships = build_client(
        substitute_generator=LlmSubstituteGenerator(llm)
    )
    squat = exercises.find_or_create(
        "Back Squat",
        provenance=Provenance.CURATED,
        targeted_muscles=["quadriceps", "glutes"],
        primary_muscles=["quadriceps", "glutes"],
    )
    headers = _auth(ctx, "user_mismatch")
    session = _create_session(client, headers)

    # Act
    response = client.post(
        f"/api/sessions/{session['id']}/prescriptions/0/substitute",
        headers=headers,
    )

    # Assert — two AI calls, a readable failure, and nothing written
    assert len(llm.calls) == 2
    assert "quadriceps, glutes" in llm.calls[0]["user"]
    assert response.status_code == 502
    body = response.json()
    assert body["success"] is False
    assert "same muscle groups" in body["error"].lower()
    assert exercises.find_by_name("Push-up") is None
    assert relationships.substitutes_for(squat.id) == []
