"""The harder-Variation offer end to end (#202): real JWKS verification, the
repositories, the substitution service, and the response envelope wired through
FastAPI.

At the top of a pure-bodyweight rep range, ``GET
/api/sessions/{id}/prescriptions/{pos}/harder-variation`` offers the next harder
Variation; the client accepts by POSTing that ``exercise_id`` back as
``target_exercise_id`` to ``/substitute``. Repositories are injected via dependency
overrides so the flow runs offline and deterministically."""

from __future__ import annotations

from datetime import date

from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.exercise import Provenance
from app.domain.load import parse_load
from app.domain.substitution import RelationKind
from app.generation.schema import GeneratedSubstitute
from app.generation.substitute_generator import SubstituteRequest
from app.main import create_app
from app.repositories.deps import (
    get_exercise_relationship_repository,
    get_exercise_repository,
    get_logged_session_repository,
    get_profile_repository,
    get_session_repository,
    get_substitute_generator,
)
from app.repositories.exercise_relationship_repository import (
    InMemoryExerciseRelationshipRepository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.profile_repository import InMemoryProfileRepository
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
)
from tests.conftest import ISSUER, make_signing_context
from tests.quantities import reps_quantity


class FakeSubstituteGenerator:
    def generate(
        self, request: SubstituteRequest
    ) -> GeneratedSubstitute:  # pragma: no cover - must not run
        raise AssertionError("catalog lookup should serve the harder Variation")


def _build():
    ctx = make_signing_context()
    exercises = InMemoryExerciseRepository()
    relationships = InMemoryExerciseRelationshipRepository(exercises)
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    profiles = InMemoryProfileRepository()
    app = create_app()
    app.dependency_overrides[get_jwks] = lambda: ctx.jwks
    app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
    app.dependency_overrides[get_exercise_repository] = lambda: exercises
    app.dependency_overrides[get_exercise_relationship_repository] = (
        lambda: relationships
    )
    app.dependency_overrides[get_session_repository] = lambda: sessions
    app.dependency_overrides[get_logged_session_repository] = lambda: logged
    app.dependency_overrides[get_profile_repository] = lambda: profiles
    app.dependency_overrides[get_substitute_generator] = (
        lambda: FakeSubstituteGenerator()
    )
    return TestClient(app), ctx, exercises, relationships, sessions, logged


def _auth(ctx, sub):
    return {"Authorization": f"Bearer {ctx.mint(sub=sub)}"}


def _seed_bodyweight_ceiling(
    exercises,
    sessions,
    logged,
    user,
    *,
    scheme=None,
    perceived_difficulty=6,
    performances=1,
):
    """A pull-up at its 5-rep ceiling, hit easily at low effort — the strong signal
    that earns the harder-Variation offer. Returns the created Session and the
    pull-up Exercise so a test can link (or withhold) a harder Variation.

    ``scheme``, ``perceived_difficulty`` and ``performances`` let a test move the
    Prescription off the default scheme and shape the record that scheme reads."""

    pullup = exercises.find_or_create(
        "Pull-Up", provenance=Provenance.CURATED, difficulty=5
    )
    created = sessions.create(
        user,
        SessionDraft(
            training_type="strength",
            duration_minutes=30,
            prescriptions=[
                PrescriptionDraft(
                    exercise_id=pullup.id,
                    sets=3,
                    reps="5",
                    recommended_load=parse_load("bodyweight").to_dict(),
                    scheme=scheme,
                )
            ],
        ),
    )
    for day in range(performances):
        logged.create(
            user,
            LoggedSessionDraft(
                session_id=created.id,
                performed_on=date(2026, 7, 20 + day),
                completion_outcome="completed",
                logged_sets=[
                    LoggedSetDraft(
                        exercise_id=pullup.id,
                        quantity=reps_quantity(5),
                        load=parse_load("bodyweight").to_dict(),
                        perceived_difficulty=perceived_difficulty,
                    )
                    for _ in range(3)
                ],
            ),
        )
    return created, pullup


def _link_archer(exercises, relationships, pullup):
    archer = exercises.find_or_create(
        "Archer Pull-Up", provenance=Provenance.CURATED, difficulty=7
    )
    relationships.add(pullup.id, archer.id, RelationKind.VARIATION)
    return archer


def test_harder_variation_requires_authentication():
    client, *_ = _build()
    response = client.get("/api/sessions/1/prescriptions/0/harder-variation")
    assert response.status_code == 401


def test_offers_the_next_harder_variation_at_the_ceiling():
    # Arrange — a pull-up at its ceiling with an archer-pull-up Variation on file
    client, ctx, exercises, relationships, sessions, logged = _build()
    user = "user_a"
    created, pullup = _seed_bodyweight_ceiling(exercises, sessions, logged, user)
    archer = exercises.find_or_create(
        "Archer Pull-Up", provenance=Provenance.CURATED, difficulty=7
    )
    relationships.add(pullup.id, archer.id, RelationKind.VARIATION)

    # Act — read the offer, then accept it by posting the target back
    offer = client.get(
        f"/api/sessions/{created.id}/prescriptions/0/harder-variation",
        headers=_auth(ctx, user),
    )
    accepted = client.post(
        f"/api/sessions/{created.id}/prescriptions/0/substitute",
        headers=_auth(ctx, user),
        json={"target_exercise_id": archer.id},
    )

    # Assert — the offer names the harder Variation, and accepting advances the plan
    assert offer.status_code == 200
    assert offer.json()["data"]["suggested_variation"] == {
        "exercise_id": archer.id,
        "name": "Archer Pull-Up",
    }
    assert accepted.status_code == 200
    swapped = accepted.json()["data"]["prescriptions"][0]
    assert swapped["exercise_name"] == "Archer Pull-Up"
    assert swapped["sets"] == 3 and swapped["reps"] == "5"


def test_no_offer_when_the_catalog_has_no_harder_variation():
    # Arrange — at the ceiling, but nothing harder is linked
    client, ctx, exercises, relationships, sessions, logged = _build()
    user = "user_b"
    created, _ = _seed_bodyweight_ceiling(exercises, sessions, logged, user)

    # Act
    offer = client.get(
        f"/api/sessions/{created.id}/prescriptions/0/harder-variation",
        headers=_auth(ctx, user),
    )

    # Assert — the offer holds at the ceiling: nothing to advance to
    assert offer.status_code == 200
    assert offer.json()["data"]["suggested_variation"] is None


# --- The offer follows the Prescription's Progression Scheme (ADR-0064) ----------


def test_no_offer_for_a_static_prescription_at_the_ceiling():
    # Arrange — the strong ceiling signal Double Progression offers on, but the user
    # has set the movement Static: nothing in the record moves it, the offer included
    client, ctx, exercises, relationships, sessions, logged = _build()
    user = "user_static"
    created, pullup = _seed_bodyweight_ceiling(
        exercises, sessions, logged, user, scheme="static"
    )
    _link_archer(exercises, relationships, pullup)

    # Act
    single = client.get(
        f"/api/sessions/{created.id}/prescriptions/0/harder-variation",
        headers=_auth(ctx, user),
    )
    batch = client.get(
        f"/api/sessions/{created.id}/harder-variations", headers=_auth(ctx, user)
    )

    # Assert
    assert single.status_code == 200
    assert single.json()["data"]["suggested_variation"] is None
    assert batch.json()["data"]["offers"] == [
        {"position": 0, "suggested_variation": None}
    ]


def test_session_count_offers_once_its_exposures_ramp_to_the_ceiling():
    # Arrange — three hard (RPE 9) performances: Double Progression's effort gate
    # would hold, but Session-Count steps on the exposure tally alone, and its step
    # at the rep ceiling is the offer
    client, ctx, exercises, relationships, sessions, logged = _build()
    user = "user_session_count"
    created, pullup = _seed_bodyweight_ceiling(
        exercises,
        sessions,
        logged,
        user,
        scheme="session_count",
        perceived_difficulty=9,
        performances=3,
    )
    archer = _link_archer(exercises, relationships, pullup)

    # Act
    offer = client.get(
        f"/api/sessions/{created.id}/prescriptions/0/harder-variation",
        headers=_auth(ctx, user),
    )

    # Assert
    assert offer.status_code == 200
    assert offer.json()["data"]["suggested_variation"] == {
        "exercise_id": archer.id,
        "name": "Archer Pull-Up",
    }


# --- The batch read (audit V-5): every Prescription's offer in one request -------


def test_batch_harder_variations_requires_authentication():
    client, *_ = _build()
    response = client.get("/api/sessions/1/harder-variations")
    assert response.status_code == 401


def test_batch_returns_one_offer_per_position_in_session_order():
    # Arrange — a pull-up at its ceiling (with a harder Variation) followed by a
    # squat that has never been performed, so only the first earns an offer
    client, ctx, exercises, relationships, sessions, logged = _build()
    user = "user_c"
    created, pullup = _seed_bodyweight_ceiling(exercises, sessions, logged, user)
    archer = exercises.find_or_create(
        "Archer Pull-Up", provenance=Provenance.CURATED, difficulty=7
    )
    relationships.add(pullup.id, archer.id, RelationKind.VARIATION)
    squat = exercises.find_or_create("Air Squat", provenance=Provenance.CURATED)
    sessions.append_prescription(
        created.id,
        user,
        PrescriptionDraft(
            exercise_id=squat.id,
            sets=3,
            reps="15",
            recommended_load=parse_load("bodyweight").to_dict(),
        ),
    )

    # Act
    response = client.get(
        f"/api/sessions/{created.id}/harder-variations", headers=_auth(ctx, user)
    )

    # Assert — the batch matches what each per-position read would say
    assert response.status_code == 200
    assert response.json()["data"]["offers"] == [
        {
            "position": 0,
            "suggested_variation": {"exercise_id": archer.id, "name": "Archer Pull-Up"},
        },
        {"position": 1, "suggested_variation": None},
    ]


def test_batch_returns_404_for_another_users_session():
    # Arrange
    client, ctx, exercises, _, sessions, logged = _build()
    created, _ = _seed_bodyweight_ceiling(exercises, sessions, logged, "owner")

    # Act
    response = client.get(
        f"/api/sessions/{created.id}/harder-variations",
        headers=_auth(ctx, "intruder"),
    )

    # Assert
    assert response.status_code == 404


def test_batch_reads_the_logged_history_once_for_the_whole_session():
    # Arrange — a three-movement Session, counting Logged Session reads
    client, ctx, exercises, _, sessions, logged = _build()
    user = "user_d"
    created, pullup = _seed_bodyweight_ceiling(exercises, sessions, logged, user)
    for _ in range(2):
        sessions.append_prescription(
            created.id,
            user,
            PrescriptionDraft(exercise_id=pullup.id, sets=3, reps="5"),
        )
    reads = []
    original = logged.list_for_user
    logged.list_for_user = lambda *args, **kwargs: (
        reads.append(args) or original(*args, **kwargs)
    )

    # Act
    response = client.get(
        f"/api/sessions/{created.id}/harder-variations", headers=_auth(ctx, user)
    )

    # Assert — three offers from a single history read, not one read per movement
    assert response.status_code == 200
    assert len(response.json()["data"]["offers"]) == 3
    assert len(reads) == 1
