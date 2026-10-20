"""Behavior of the Avatar unlock rule over HTTP (issue #748, ADR-0136).

An Avatar unlocks at an **Operator Level**, computed read-time from the user's Logged
Sessions through the shared gamification projection — never a stored ledger
(ADR-0018/0019). ``PUT /api/appearance`` checks it only when a new Avatar is chosen, so
one already chosen is kept when the level later drops. ``GET /api/avatars`` serves the
picker the catalog with each entry's lock state beside the user's Operator Level.

Every Avatar shipped so far is free, so the lock tests extend the catalog with one
locked entry. XP arithmetic (``domain/experience.py``): a Logged Session earns 100 XP
plus 10 per attempted set, and Level 2 starts at 400 XP, so four one-set sessions
(440 XP) reach it and three (330 XP) do not."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import get_jwks
from app.config import Settings, get_settings
from app.domain import avatars
from app.domain.avatars import AVATAR_CATALOG, Avatar
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

LOCKED = Avatar(id="barbarian", name="Barbarian", unlock_level=2)
SESSIONS_TO_LEVEL_2 = 4


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


@pytest.fixture()
def world() -> World:
    return World()


@pytest.fixture()
def with_locked_avatar(monkeypatch):
    """The shipped catalog plus one Avatar that unlocks at Operator Level 2."""

    monkeypatch.setattr(avatars, "AVATAR_CATALOG", (*AVATAR_CATALOG, LOCKED))


# ── PUT /api/appearance: the save-time level check ──────────────────────────


def test_put_refuses_an_avatar_above_the_users_operator_level(
    world, with_locked_avatar
):
    # Arrange — three sessions: 330 XP, still Level 1
    world.choose("user_low", "dwarf-lifter")
    world.perform("user_low", SESSIONS_TO_LEVEL_2 - 1)

    # Act
    response = world.choose("user_low", LOCKED.id)

    # Assert — refused in the error envelope, and the previous Avatar stands
    assert response.status_code == 403
    assert response.json()["success"] is False
    assert response.json()["error"]
    assert world.current_avatar("user_low") == "dwarf-lifter"


def test_put_saves_the_avatar_once_logged_history_reaches_its_level(
    world, with_locked_avatar
):
    # Arrange — four sessions: 440 XP, Level 2
    world.perform("user_climb", SESSIONS_TO_LEVEL_2)

    # Act
    response = world.choose("user_climb", LOCKED.id)

    # Assert
    assert response.status_code == 200
    assert world.current_avatar("user_climb") == LOCKED.id


def test_a_chosen_avatar_is_kept_after_the_level_drops_below_it(
    world, with_locked_avatar
):
    # Arrange — reach Level 2, choose the locked Avatar, then delete a session
    session_ids = world.perform("user_drop", SESSIONS_TO_LEVEL_2)
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


def test_put_reads_logged_sessions_only_when_choosing_an_avatar(world):
    # Act — a save that leaves the Avatar out
    world.client.put(
        "/api/appearance", headers=world.auth("user_cheap"), json={"mode": "light"}
    )
    reads_without_avatar = world.logged.history_reads
    world.choose("user_cheap", "elf-ranger")

    # Assert — only the Avatar save paid for the history read
    assert reads_without_avatar == 0
    assert world.logged.history_reads == 1


def test_put_requires_authentication(world):
    response = world.client.put("/api/appearance", json={"avatar": "novice"})

    assert response.status_code == 401
    assert response.json()["success"] is False


# ── GET /api/avatars: the picker's catalog ───────────────────────────────────


def test_get_avatars_reports_the_operator_level_and_each_lock_state(
    world, with_locked_avatar
):
    # Arrange — three sessions: Level 1
    world.perform("user_picker", SESSIONS_TO_LEVEL_2 - 1)

    # Act
    response = world.client.get("/api/avatars", headers=world.auth("user_picker"))

    # Assert — the catalog in order, in the standard envelope, each entry's progress
    # the user's level held at its unlock level
    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["data"] == {
        "operator_level": 1,
        "avatars": [
            {
                "id": "novice",
                "name": "Novice",
                "unlock_level": 1,
                "unlocked": True,
                "current_level": 1,
            },
            {
                "id": "dwarf-lifter",
                "name": "Dwarf Lifter",
                "unlock_level": 1,
                "unlocked": True,
                "current_level": 1,
            },
            {
                "id": "elf-ranger",
                "name": "Elf Ranger",
                "unlock_level": 1,
                "unlocked": True,
                "current_level": 1,
            },
            {
                "id": "barbarian",
                "name": "Barbarian",
                "unlock_level": 2,
                "unlocked": False,
                "current_level": 1,
            },
        ],
    }


def test_get_avatars_unlocks_an_avatar_once_the_level_reaches_it(
    world, with_locked_avatar
):
    # Arrange — four sessions: Level 2
    world.perform("user_lvl2", SESSIONS_TO_LEVEL_2)

    # Act
    response = world.client.get("/api/avatars", headers=world.auth("user_lvl2"))

    # Assert
    data = response.json()["data"]
    assert data["operator_level"] == 2
    assert data["avatars"][-1] == {
        "id": "barbarian",
        "name": "Barbarian",
        "unlock_level": 2,
        "unlocked": True,
        "current_level": 2,
    }


def test_get_avatars_requires_authentication(world):
    response = world.client.get("/api/avatars")

    assert response.status_code == 401
    assert response.json()["success"] is False
