"""Behavior of the Avatar unlock rule over HTTP (issues #748 and #750, ADR-0136).

An Avatar unlocks at an **Operator Level**, computed read-time from the user's Logged
Sessions through the shared gamification projection — never a stored ledger
(ADR-0018/0019). ``PUT /api/appearance`` checks it only when a new Avatar is chosen, so
one already chosen is kept when the level later drops. ``GET /api/avatars`` serves the
picker the catalog with each entry's lock state beside the user's Operator Level.

The lock tests use the Monk, the first earned Avatar. XP arithmetic
(``domain/experience.py``): a Logged Session earns 100 XP plus 10 per attempted set, and
Level 3 starts at 1600 XP, so fifteen one-set sessions (1650 XP) reach it and fourteen
(1540 XP, Level 2) do not."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain.avatars import AVATAR_CATALOG, MONK_UNLOCK_LEVEL, find_avatar
from app.domain.exercise import Provenance
from app.main import create_app
from app.repositories.appearance_preference_repository import (
    InMemoryAppearancePreferenceRepository,
)
from app.repositories.deps import (
    get_appearance_preference_repository,
    get_logged_session_repository,
)
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    SessionDraft,
)
from tests.conftest import ISSUER, make_signing_context
from tests.quantities import reps_quantity

_MONK = find_avatar("monk")
assert _MONK is not None
LOCKED = _MONK
SESSIONS_TO_LEVEL_3 = 15


class CountingLoggedSessionRepository(InMemoryLoggedSessionRepository):
    """The in-memory record, counting how often a route reads the user's history."""

    def __init__(self, *args, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.history_reads = 0

    def list_for_user(self, clerk_user_id: str):
        self.history_reads += 1
        return super().list_for_user(clerk_user_id)


class World:
    def __init__(self) -> None:
        self.ctx = make_signing_context()
        self.exercises = InMemoryExerciseRepository()
        self.squat = self.exercises.find_or_create(
            "Back Squat", provenance=Provenance.CURATED, targeted_muscles=["quadriceps"]
        )
        self.sessions = InMemorySessionRepository(self.exercises)
        self.logged = CountingLoggedSessionRepository(self.sessions, self.exercises)
        self.appearance = InMemoryAppearancePreferenceRepository()
        app = create_app()
        app.dependency_overrides[get_jwks] = lambda: self.ctx.jwks
        app.dependency_overrides[get_settings] = lambda: Settings(clerk_issuer=ISSUER)
        app.dependency_overrides[get_appearance_preference_repository] = (
            lambda: self.appearance
        )
        app.dependency_overrides[get_logged_session_repository] = lambda: self.logged
        self.client = TestClient(app)

    def auth(self, user: str) -> dict:
        return {"Authorization": f"Bearer {self.ctx.mint(sub=user)}"}

    def perform(self, user: str, count: int) -> list[int]:
        """Log ``count`` one-set sessions for ``user``; return their ids."""

        ids = []
        for _ in range(count):
            plan = self.sessions.create(
                user,
                SessionDraft(
                    training_type="strength", duration_minutes=45, prescriptions=[]
                ),
            )
            record = self.logged.create(
                user,
                LoggedSessionDraft(
                    session_id=plan.id,
                    training_type="strength",
                    performed_on=date.today(),
                    logged_sets=[
                        LoggedSetDraft(
                            exercise_id=self.squat.id, quantity=reps_quantity(5)
                        )
                    ],
                ),
            )
            ids.append(record.id)
        return ids

    def choose(self, user: str, avatar: str):
        return self.client.put(
            "/api/appearance", headers=self.auth(user), json={"avatar": avatar}
        )

    def current_avatar(self, user: str) -> str:
        response = self.client.get("/api/appearance", headers=self.auth(user))
        return response.json()["data"]["avatar"]


def avatars_by_id(response) -> dict[str, dict]:
    """The ``GET /api/avatars`` entries in ``response``, keyed by Avatar id."""

    return {entry["id"]: entry for entry in response.json()["data"]["avatars"]}


@pytest.fixture()
def world() -> World:
    return World()


# ── PUT /api/appearance: the save-time level check ──────────────────────────


def test_put_refuses_an_avatar_above_the_users_operator_level(world) -> None:
    # Arrange — fourteen sessions: 1540 XP, still Level 2
    world.choose("user_low", "dwarf-lifter")
    world.perform("user_low", SESSIONS_TO_LEVEL_3 - 1)

    # Act
    response = world.choose("user_low", LOCKED.id)

    # Assert — refused in the error envelope, and the previous Avatar stands
    assert response.status_code == 403
    assert response.json()["success"] is False
    assert response.json()["error"]
    assert world.current_avatar("user_low") == "dwarf-lifter"


def test_put_saves_the_avatar_once_logged_history_reaches_its_level(world) -> None:
    # Arrange — fifteen sessions: 1650 XP, Level 3
    world.perform("user_climb", SESSIONS_TO_LEVEL_3)

    # Act
    response = world.choose("user_climb", LOCKED.id)

    # Assert
    assert response.status_code == 200
    assert world.current_avatar("user_climb") == LOCKED.id


def test_a_chosen_avatar_is_kept_after_the_level_drops_below_it(world) -> None:
    # Arrange — reach Level 3, choose the locked Avatar, then delete a session
    session_ids = world.perform("user_drop", SESSIONS_TO_LEVEL_3)
    world.choose("user_drop", LOCKED.id)
    world.logged.delete(session_ids[0], "user_drop")

    # Act — read back, and save an unrelated facet
    kept = world.current_avatar("user_drop")
    resaved = world.client.put(
        "/api/appearance", headers=world.auth("user_drop"), json={"mode": "light"}
    )

    # Assert — an honest log correction never takes the Avatar away
    assert kept == LOCKED.id
    assert resaved.json()["data"]["avatar"] == LOCKED.id


def test_put_reads_logged_sessions_only_when_choosing_an_avatar(world) -> None:
    # Act — a save that leaves the Avatar out
    world.client.put(
        "/api/appearance", headers=world.auth("user_cheap"), json={"mode": "light"}
    )
    reads_without_avatar = world.logged.history_reads
    world.choose("user_cheap", "elf-ranger")

    # Assert — only the Avatar save paid for the history read
    assert reads_without_avatar == 0
    assert world.logged.history_reads == 1


def test_put_requires_authentication(world) -> None:
    response = world.client.put("/api/appearance", json={"avatar": "novice"})

    assert response.status_code == 401
    assert response.json()["success"] is False


# ── GET /api/avatars: the picker's catalog ───────────────────────────────────


def test_get_avatars_reports_the_operator_level_and_each_lock_state(world) -> None:
    # Arrange — fourteen sessions: Level 2
    world.perform("user_picker", SESSIONS_TO_LEVEL_3 - 1)

    # Act
    response = world.client.get("/api/avatars", headers=world.auth("user_picker"))

    # Assert — the whole catalog in order, in the standard envelope
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"]["operator_level"] == 2
    assert [entry["id"] for entry in body["data"]["avatars"]] == [
        avatar.id for avatar in AVATAR_CATALOG
    ]


def test_get_avatars_reports_progress_toward_a_locked_avatar(world) -> None:
    # Arrange — fourteen sessions: Level 2
    world.perform("user_progress", SESSIONS_TO_LEVEL_3 - 1)

    # Act
    response = world.client.get("/api/avatars", headers=world.auth("user_progress"))

    # Assert — a free Avatar is open, the Monk is locked at "LVL 2 / 3"
    by_id = avatars_by_id(response)
    assert by_id["elf-ranger"] == {
        "id": "elf-ranger",
        "name": "Elf Ranger",
        "unlock_level": 1,
        "unlocked": True,
        "current_level": 1,
    }
    assert by_id["monk"] == {
        "id": "monk",
        "name": "Monk",
        "unlock_level": MONK_UNLOCK_LEVEL,
        "unlocked": False,
        "current_level": 2,
    }


def test_get_avatars_unlocks_an_avatar_once_the_level_reaches_it(world) -> None:
    # Arrange — fifteen sessions: Level 3
    world.perform("user_lvl3", SESSIONS_TO_LEVEL_3)

    # Act
    response = world.client.get("/api/avatars", headers=world.auth("user_lvl3"))

    # Assert
    by_id = avatars_by_id(response)
    assert response.json()["data"]["operator_level"] == 3
    assert by_id["monk"]["unlocked"] is True
    assert by_id["monk"]["current_level"] == MONK_UNLOCK_LEVEL
    assert by_id["barbarian"]["unlocked"] is False


def test_a_kept_avatar_reads_as_locked_again_once_the_level_drops(world) -> None:
    # Arrange — reach Level 3, choose the Monk, then delete a session (Level 2)
    session_ids = world.perform("user_relock", SESSIONS_TO_LEVEL_3)
    world.choose("user_relock", LOCKED.id)
    world.logged.delete(session_ids[0], "user_relock")

    # Act
    chosen = world.current_avatar("user_relock")
    response = world.client.get("/api/avatars", headers=world.auth("user_relock"))

    # Assert — the Avatar stays chosen, while the picker shows it locked for a fresh pick
    assert chosen == LOCKED.id
    assert avatars_by_id(response)[LOCKED.id]["unlocked"] is False


def test_get_avatars_requires_authentication(world) -> None:
    response = world.client.get("/api/avatars")

    assert response.status_code == 401
    assert response.json()["success"] is False
