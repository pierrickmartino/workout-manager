"""Warm-up Suggestions are cached, with the Sensitive Constraint bypass (ADR-0003, ADR-0144, #781).

A suggestion is stored immutably on a coarse key — the sorted muscle set and the sorted
equipment set — so an equivalent request is served without a new AI call. **Regenerate**
skips the cache read. A user with any Sensitive Constraint never reads nor writes the cache:
a safety rule, not an optimization. Exercised through the endpoint with the fake LLM."""

from __future__ import annotations

from app.generation.cache import InMemoryCacheStore
from tests.fake_llm import FakeStructuredLLM
from tests.test_warm_up_suggestion_endpoint import (
    _LEG_DAY,
    Harness,
    _drill,
    _suggestion_json,
)

_OTHER_DRILLS = [_drill(f"Leg Swing {i}") for i in range(4)]
_OTHER_NAMES = [f"Leg Swing {i}" for i in range(4)]


class RecordingCacheStore(InMemoryCacheStore):
    """The in-memory store, also recording every read and write the cache makes."""

    def __init__(self) -> None:
        super().__init__()
        self.reads: list[str] = []
        self.writes: list[tuple[str, str]] = []

    def get(self, key: str) -> str | None:
        self.reads.append(key)
        return super().get(key)

    def set(self, key: str, value: str) -> None:
        self.writes.append((key, value))
        super().set(key, value)


def _recording_harness() -> tuple[Harness, RecordingCacheStore]:
    harness = Harness()
    store = RecordingCacheStore()
    harness.cache_store = store
    return harness, store


def _drill_names(response) -> list[str]:
    return [drill["exercise_name"] for drill in response.json()["data"]["drills"]]


def test_a_second_request_for_the_same_muscles_and_equipment_is_served_from_the_cache():
    # Arrange — two users, two Sessions working the same muscles with the same equipment
    harness = Harness()
    for user in ("user_a", "user_b"):
        harness.profile(user, equipment=["resistance band"])
    first_session = harness.session("user_a", _LEG_DAY)
    second_session = harness.session("user_b", _LEG_DAY)
    first = harness.suggest(first_session, "user_a")

    # Act
    second = harness.suggest(second_session, "user_b")

    # Assert
    assert second.status_code == 200
    assert len(harness.llm.calls) == 1
    assert _drill_names(second) == _drill_names(first)
    assert second.json()["data"]["estimated_minutes"] == 6


def test_the_same_muscles_in_another_order_share_one_cached_suggestion():
    # Arrange — the same muscles and kit, the movements in reverse order
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    harness.suggest(harness.session("user_a", _LEG_DAY), "user_a")

    # Act
    response = harness.suggest(harness.session("user_a", list(reversed(_LEG_DAY))), "user_a")

    # Assert
    assert response.status_code == 200
    assert len(harness.llm.calls) == 1


def test_different_equipment_or_muscles_are_generated_separately():
    # Arrange
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    harness.profile("user_b", equipment=["resistance band", "kettlebell"])
    harness.suggest(harness.session("user_a", _LEG_DAY), "user_a")

    # Act
    harness.suggest(harness.session("user_b", _LEG_DAY), "user_b")
    harness.suggest(harness.session("user_a", _LEG_DAY[:1]), "user_a")

    # Assert
    assert len(harness.llm.calls) == 3


def test_regenerate_skips_the_cache_and_leaves_the_stored_suggestion_untouched():
    # Arrange
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session("user_a", _LEG_DAY)
    first = harness.suggest(session_id, "user_a")
    harness.llm = FakeStructuredLLM(text=_suggestion_json(_OTHER_DRILLS))

    # Act
    regenerated = harness.suggest(session_id, "user_a", {"regenerate": True})
    again = harness.suggest(session_id, "user_a")

    # Assert
    assert len(harness.llm.calls) == 1
    assert _drill_names(regenerated) == _OTHER_NAMES
    assert _drill_names(again) == _drill_names(first)


def test_a_sensitive_constraint_user_is_never_served_a_cached_suggestion():
    # Arrange — a suggestion already cached for these muscles and this kit
    harness, store = _recording_harness()
    harness.profile("user_a", equipment=["resistance band"])
    harness.profile("user_b", equipment=["resistance band"], constraints=["injury"])
    harness.suggest(harness.session("user_a", _LEG_DAY), "user_a")
    harness.llm = FakeStructuredLLM(text=_suggestion_json(_OTHER_DRILLS))
    reads_before = len(store.reads)

    # Act
    response = harness.suggest(harness.session("user_b", _LEG_DAY), "user_b")

    # Assert
    assert len(harness.llm.calls) == 1
    assert "Sensitive constraints to respect: injury" in harness.user_prompt()
    assert _drill_names(response) == _OTHER_NAMES
    assert len(store.reads) == reads_before


def test_a_sensitive_constraint_users_suggestion_is_never_stored_for_others():
    # Arrange — the constrained user asks first
    harness, store = _recording_harness()
    harness.profile("user_a", equipment=["resistance band"], constraints=["postpartum"])
    harness.profile("user_b", equipment=["resistance band"])
    harness.suggest(harness.session("user_a", _LEG_DAY), "user_a")
    assert store.writes == []
    harness.llm = FakeStructuredLLM(text=_suggestion_json(_OTHER_DRILLS))

    # Act
    response = harness.suggest(harness.session("user_b", _LEG_DAY), "user_b")

    # Assert
    assert len(harness.llm.calls) == 1
    assert _drill_names(response) == _OTHER_NAMES


def test_a_sensitive_constraint_user_is_generated_fresh_every_time():
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"], constraints=["rehabilitation"])
    session_id = harness.session("user_a", _LEG_DAY)

    harness.suggest(session_id, "user_a")
    harness.suggest(session_id, "user_a")

    assert len(harness.llm.calls) == 2


def test_a_refused_suggestion_is_never_cached():
    # Arrange — the default suggestion needs a band this user lacks, so it is refused
    harness = Harness()
    session_id = harness.session("user_a", _LEG_DAY)
    harness.suggest(session_id, "user_a")

    # Act
    response = harness.suggest(session_id, "user_a")

    # Assert
    assert response.status_code == 502
    assert len(harness.llm.calls) == 2


def test_serving_or_regenerating_never_changes_the_stored_suggestion():
    # Arrange
    harness, store = _recording_harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session("user_a", _LEG_DAY)
    harness.suggest(session_id, "user_a")
    stored = list(store.writes)

    # Act
    harness.suggest(session_id, "user_a")
    harness.llm = FakeStructuredLLM(text=_suggestion_json(_OTHER_DRILLS))
    harness.suggest(session_id, "user_a", {"regenerate": True})

    # Assert
    assert len(stored) == 1
    assert store.writes == stored


def test_a_cached_suggestion_resolves_to_the_same_catalog_exercises():
    # Arrange — the first request saved the new drills to the catalog
    harness = Harness()
    harness.profile("user_a", equipment=["resistance band"])
    session_id = harness.session("user_a", _LEG_DAY)
    first = harness.suggest(session_id, "user_a").json()["data"]["drills"]
    catalog_size = len(harness.exercises.list_all())

    # Act
    second = harness.suggest(session_id, "user_a").json()["data"]["drills"]

    # Assert — the hit reuses those Exercises rather than creating copies
    assert [d["exercise_id"] for d in second] == [d["exercise_id"] for d in first]
    assert len(harness.exercises.list_all()) == catalog_size
