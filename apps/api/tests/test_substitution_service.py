"""The Substitution flow: resolve lookup-first, swap the Exercise on the user's
own Session copy, fall back to AI only when no catalog link fits.

A Substitution is unlimited and distinct from Regeneration (CONTEXT.md): it swaps
one Exercise Prescription's Exercise — keeping its sets/reps — and never consumes
the once-per-Session regeneration guard. Resolution is filtered by the user's
equipment and constraints; when none of the typed catalog relationships fit, an
AI-generated substitute is created, stored as ``ai_generated``, and swapped in.
Exercised with in-memory repositories and a fake generator so the flow runs
offline and deterministically."""

from __future__ import annotations

import pytest

from app.domain.exercise import Provenance
from app.domain.substitution import RelationKind
from app.generation.schema import GeneratedSubstitute
from app.generation.substitute_generator import SubstituteRequest
from app.repositories.exercise_relationship_repository import (
    InMemoryExerciseRelationshipRepository,
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
from app.substitution.service import (
    PrescriptionNotFound,
    SessionNotFound,
    substitute_exercise,
)


class FakeSubstituteGenerator:
    def __init__(self, *, result=None, error=None):
        self._result = result
        self._error = error
        self.calls = 0
        self.last_request: SubstituteRequest | None = None

    def generate(self, request: SubstituteRequest) -> GeneratedSubstitute:
        self.calls += 1
        self.last_request = request
        if self._error is not None:
            raise self._error
        return self._result


def _fallback_substitute() -> GeneratedSubstitute:
    return GeneratedSubstitute(
        exercise_name="Wall Sit",
        exercise_description="Isometric quad hold.",
        instructions="Sit against a wall.",
        difficulty=2,
        targeted_muscles=["quads"],
        required_equipment=[],
        precautions=["stop if knee pain"],
    )


def _build():
    exercises = InMemoryExerciseRepository()
    relationships = InMemoryExerciseRelationshipRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    profiles = InMemoryProfileRepository()
    return exercises, relationships, sessions, profiles


def _seed_session(exercises, sessions, user="user_a"):
    squat = exercises.find_or_create("Back Squat", provenance=Provenance.CURATED)
    press = exercises.find_or_create("Overhead Press", provenance=Provenance.CURATED)
    created = sessions.create(
        user,
        SessionDraft(
            training_type="strength",
            duration_minutes=45,
            prescriptions=[
                PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5"),
                PrescriptionDraft(exercise_id=press.id, sets=3, reps="8-12"),
            ],
        ),
    )
    return created, squat, press


def test_resolves_a_catalog_substitute_and_swaps_it_in_without_calling_ai():
    # Arrange — a box-squat Variation that needs no equipment fits the user
    exercises, relationships, sessions, profiles = _build()
    created, squat, _ = _seed_session(exercises, sessions)
    box = exercises.find_or_create("Box Squat", provenance=Provenance.CURATED)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    generator = FakeSubstituteGenerator()  # must not be called

    # Act — substitute the first prescription (the squat)
    view = substitute_exercise(
        created.id,
        "user_a",
        position=0,
        relationships=relationships,
        exercises=exercises,
        sessions=sessions,
        profiles=profiles,
        generator=generator,
    )

    # Assert — the catalog Variation is swapped in; sets/reps preserved; no AI
    swapped = view.prescriptions[0]
    assert swapped.exercise_name == "Box Squat"
    assert swapped.sets == 5 and swapped.reps == "5"
    assert generator.calls == 0


def test_falls_back_to_ai_when_no_catalog_link_fits_and_stores_it_as_ai_generated():
    # Arrange — no relationships at all, so lookup-first finds nothing
    exercises, relationships, sessions, profiles = _build()
    created, squat, _ = _seed_session(exercises, sessions)
    generator = FakeSubstituteGenerator(result=_fallback_substitute())

    # Act
    view = substitute_exercise(
        created.id,
        "user_a",
        position=0,
        relationships=relationships,
        exercises=exercises,
        sessions=sessions,
        profiles=profiles,
        generator=generator,
    )

    # Assert — the AI-invented movement is swapped in and entered the catalog as
    # ai_generated, with its sets/reps preserved
    swapped = view.prescriptions[0]
    assert generator.calls == 1
    assert swapped.exercise_name == "Wall Sit"
    assert swapped.provenance == "ai_generated"
    assert swapped.sets == 5 and swapped.reps == "5"


def test_substitution_is_unlimited_and_never_consumes_the_regeneration_guard():
    # Arrange — two catalog Variations of the squat to swap between
    exercises, relationships, sessions, profiles = _build()
    created, squat, _ = _seed_session(exercises, sessions)
    box = exercises.find_or_create("Box Squat", provenance=Provenance.CURATED)
    tempo = exercises.find_or_create("Tempo Squat", provenance=Provenance.CURATED)
    relationships.add(squat.id, box.id, RelationKind.VARIATION)
    relationships.add(box.id, tempo.id, RelationKind.VARIATION)

    def swap():
        return substitute_exercise(
            created.id,
            "user_a",
            position=0,
            relationships=relationships,
            exercises=exercises,
            sessions=sessions,
            profiles=profiles,
            generator=FakeSubstituteGenerator(),
        )

    # Act — substitute twice in a row
    first = swap()
    assert first.has_been_regenerated is False
    second = swap()

    # Assert — both swaps succeed and the regeneration guard stays clear
    assert second.prescriptions[0].exercise_name == "Tempo Squat"
    assert second.has_been_regenerated is False


def test_a_catalog_link_the_user_cannot_equip_falls_back_to_ai():
    # Arrange — the only Alternative needs a barbell the user does not own
    exercises, relationships, sessions, profiles = _build()
    created, squat, _ = _seed_session(exercises, sessions)
    profiles.update("user_a", ProfileUpdate(default_equipment=["dumbbell"]))
    barbell_lift = exercises.find_or_create(
        "Barbell Lunge",
        provenance=Provenance.CURATED,
        required_equipment=["barbell"],
    )
    relationships.add(squat.id, barbell_lift.id, RelationKind.ALTERNATIVE)
    generator = FakeSubstituteGenerator(result=_fallback_substitute())

    # Act
    view = substitute_exercise(
        created.id,
        "user_a",
        position=0,
        relationships=relationships,
        exercises=exercises,
        sessions=sessions,
        profiles=profiles,
        generator=generator,
    )

    # Assert — the unequippable link is skipped and AI fallback runs, carrying
    # the user's equipment through to the request
    assert generator.calls == 1
    assert "dumbbell" in generator.last_request.available_equipment
    assert view.prescriptions[0].exercise_name == "Wall Sit"


def test_a_link_contraindicated_by_a_user_constraint_falls_back_to_ai():
    # Arrange — the candidate's precaution is exactly a user constraint
    exercises, relationships, sessions, profiles = _build()
    created, squat, _ = _seed_session(exercises, sessions)
    profiles.update("user_a", ProfileUpdate(preferences=["no jumping"]))
    jumping = exercises.find_or_create(
        "Jump Squat", provenance=Provenance.CURATED, precautions=["no jumping"]
    )
    relationships.add(squat.id, jumping.id, RelationKind.VARIATION)
    generator = FakeSubstituteGenerator(result=_fallback_substitute())

    # Act
    view = substitute_exercise(
        created.id,
        "user_a",
        position=0,
        relationships=relationships,
        exercises=exercises,
        sessions=sessions,
        profiles=profiles,
        generator=generator,
    )

    # Assert — the contraindicated link is ruled out, AI fallback serves instead
    assert generator.calls == 1
    assert view.prescriptions[0].exercise_name == "Wall Sit"


def test_substituting_in_an_unowned_session_is_not_found():
    exercises, relationships, sessions, profiles = _build()
    created, _, _ = _seed_session(exercises, sessions, user="owner")

    with pytest.raises(SessionNotFound):
        substitute_exercise(
            created.id,
            "intruder",
            position=0,
            relationships=relationships,
            exercises=exercises,
            sessions=sessions,
            profiles=profiles,
            generator=FakeSubstituteGenerator(),
        )


def test_substituting_an_absent_position_is_a_prescription_not_found():
    exercises, relationships, sessions, profiles = _build()
    created, _, _ = _seed_session(exercises, sessions)

    with pytest.raises(PrescriptionNotFound):
        substitute_exercise(
            created.id,
            "user_a",
            position=99,
            relationships=relationships,
            exercises=exercises,
            sessions=sessions,
            profiles=profiles,
            generator=FakeSubstituteGenerator(),
        )
