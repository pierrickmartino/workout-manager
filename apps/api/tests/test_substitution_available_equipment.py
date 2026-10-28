"""Available Equipment per Substitution (#789, ADR-0143).

The Substitute request may state the equipment the user has for this one action. Omitted, the
Default Equipment applies; an explicit empty list means bodyweight only (ADR-0038); a value
outside the curated Equipment vocabulary is a validation error (ADR-0077). The Fitness Profile
is never written by Substitution."""

from __future__ import annotations

from app.domain.exercise import Provenance
from app.domain.substitution import RelationKind
from app.generation.schema import GeneratedSubstitute
from app.generation.substitute_generator import SubstituteRequest
from tests.test_substitution_endpoint import _auth, _create_session, build_client


class RecordingSubstituteGenerator:
    """A fake AI fallback that records every request it receives."""

    def __init__(self):
        self.requests: list[SubstituteRequest] = []

    def generate(self, request: SubstituteRequest) -> GeneratedSubstitute:
        self.requests.append(request)
        return GeneratedSubstitute(
            exercise_name="Wall Sit",
            targeted_muscles=["quads"],
            required_equipment=[],
        )


def _arrange(sub, default_equipment):
    generator = RecordingSubstituteGenerator()
    client, ctx, exercises, relationships = build_client(substitute_generator=generator)
    headers = _auth(ctx, sub)
    client.put(
        "/api/profile", headers=headers, json={"default_equipment": default_equipment}
    )
    session = _create_session(client, headers)
    return client, headers, session, generator, exercises, relationships


def _substitute(client, headers, session, body=None):
    return client.post(
        f"/api/sessions/{session['id']}/prescriptions/0/substitute",
        headers=headers,
        json=body,
    )


def _profile_equipment(client, headers):
    return client.get("/api/profile", headers=headers).json()["data"]["default_equipment"]


def test_omitted_equipment_sends_the_default_equipment_to_the_ai_fallback():
    client, headers, session, generator, _, _ = _arrange("eq_omit", ["barbell"])

    response = _substitute(client, headers, session)

    assert response.status_code == 200
    assert generator.requests[0].available_equipment == ("barbell",)


def test_explicit_equipment_replaces_the_default_for_the_ai_fallback():
    client, headers, session, generator, _, _ = _arrange("eq_explicit", ["barbell"])

    response = _substitute(
        client, headers, session, {"available_equipment": ["dumbbell", "bench"]}
    )

    assert response.status_code == 200
    assert generator.requests[0].available_equipment == ("bench", "dumbbell")
    assert _profile_equipment(client, headers) == ["barbell"]


def test_empty_equipment_means_bodyweight_only():
    client, headers, session, generator, _, _ = _arrange("eq_empty", ["barbell"])

    response = _substitute(client, headers, session, {"available_equipment": []})

    assert response.status_code == 200
    assert generator.requests[0].available_equipment == ()
    assert _profile_equipment(client, headers) == ["barbell"]


def test_equipment_outside_the_curated_vocabulary_is_a_validation_error():
    client, headers, session, generator, _, _ = _arrange("eq_invalid", ["barbell"])

    response = _substitute(
        client, headers, session, {"available_equipment": ["hoverboard"]}
    )

    assert response.status_code == 422
    assert generator.requests == []
    assert _profile_equipment(client, headers) == ["barbell"]


def test_catalog_candidates_are_filtered_by_the_chosen_equipment():
    # Arrange — the Default Equipment covers a barbell Variation, but today only dumbbells
    client, headers, session, generator, exercises, relationships = _arrange(
        "eq_catalog", ["barbell"]
    )
    squat_id = session["prescriptions"][0]["exercise_id"]
    front = exercises.find_or_create(
        "Front Squat", provenance=Provenance.CURATED, required_equipment=["barbell"]
    )
    goblet = exercises.find_or_create(
        "Goblet Squat", provenance=Provenance.CURATED, required_equipment=["Dumbbells"]
    )
    relationships.add(squat_id, front.id, RelationKind.VARIATION)
    relationships.add(squat_id, goblet.id, RelationKind.ALTERNATIVE)

    # Act
    response = _substitute(
        client, headers, session, {"available_equipment": ["dumbbell"]}
    )

    # Assert — the dumbbell Alternative wins; the barbell Variation is ruled out
    assert response.status_code == 200
    assert response.json()["data"]["prescriptions"][0]["exercise_name"] == "Goblet Squat"
    assert generator.requests == []


def test_constraints_still_filter_candidates_with_explicit_equipment():
    # Arrange — a dumbbell Variation the user's Sensitive Constraint rules out
    client, headers, session, generator, exercises, relationships = _arrange(
        "eq_constraint", ["barbell"]
    )
    client.put(
        "/api/profile",
        headers=headers,
        json={"default_equipment": ["barbell"], "sensitive_constraints": ["injury"]},
    )
    squat_id = session["prescriptions"][0]["exercise_id"]
    jump = exercises.find_or_create(
        "Dumbbell Jump Squat",
        provenance=Provenance.CURATED,
        required_equipment=["dumbbell"],
        precautions=["injury"],
    )
    relationships.add(squat_id, jump.id, RelationKind.VARIATION)

    # Act
    response = _substitute(
        client, headers, session, {"available_equipment": ["dumbbell"]}
    )

    # Assert — ruled out, so the AI fallback runs with the constraint and the chosen equipment
    assert response.status_code == 200
    assert response.json()["data"]["prescriptions"][0]["exercise_name"] == "Wall Sit"
    assert generator.requests[0].available_equipment == ("dumbbell",)
    assert "injury" in generator.requests[0].constraints


def test_bodyweight_only_still_resolves_a_catalog_movement_tagged_bodyweight():
    # Arrange — a Variation whose catalog row names "bodyweight" as its equipment
    client, headers, session, generator, exercises, relationships = _arrange(
        "eq_bodyweight", ["barbell"]
    )
    squat_id = session["prescriptions"][0]["exercise_id"]
    air = exercises.find_or_create(
        "Air Squat", provenance=Provenance.CURATED, required_equipment=["bodyweight"]
    )
    relationships.add(squat_id, air.id, RelationKind.VARIATION)

    # Act
    response = _substitute(client, headers, session, {"available_equipment": []})

    # Assert — bodyweight needs no equipment, so the catalog Variation is served without AI
    assert response.status_code == 200
    assert response.json()["data"]["prescriptions"][0]["exercise_name"] == "Air Squat"
    assert generator.requests == []
