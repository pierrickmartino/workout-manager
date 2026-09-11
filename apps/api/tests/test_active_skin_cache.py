"""Behavior of the Active Skin read-through cache (ADR-0048).

The Active Skin read sits on *every* render, so it is cached server-side with a
short TTL rather than hitting the store each time; publishing invalidates it so a
new Active Skin propagates on users' next navigation, and the TTL bounds staleness
even across worker processes a single invalidate can't reach. The cache is pure of
wall-clock time — the clock is injected — so expiry is tested without sleeping."""

from __future__ import annotations

from app.active_skin.cache import ActiveSkinCache


class _Loader:
    """A recording loader: counts calls and returns a scripted sequence."""

    def __init__(self, values: list[str]) -> None:
        self._values = list(values)
        self.calls = 0

    def __call__(self) -> str:
        self.calls += 1
        # Repeat the last value once the script is exhausted.
        index = min(self.calls - 1, len(self._values) - 1)
        return self._values[index]


def test_first_read_loads_and_returns_from_the_source():
    # Arrange
    loader = _Loader(["pulse"])
    cache = ActiveSkinCache(ttl_seconds=30, clock=lambda: 0.0)

    # Act
    value = cache.get(loader)

    # Assert — a miss loads through to the source exactly once
    assert value == "pulse"
    assert loader.calls == 1


def test_second_read_within_ttl_is_served_from_cache():
    # Arrange — the source would return a different value on a second load
    loader = _Loader(["pulse", "aurora"])
    now = {"t": 0.0}
    cache = ActiveSkinCache(ttl_seconds=30, clock=lambda: now["t"])
    cache.get(loader)

    # Act — read again a moment later, still inside the TTL
    now["t"] = 29.0
    value = cache.get(loader)

    # Assert — the loader is not called again; the cached value is returned
    assert value == "pulse"
    assert loader.calls == 1


def test_read_after_ttl_expiry_reloads_from_the_source():
    # Arrange
    loader = _Loader(["pulse", "aurora"])
    now = {"t": 0.0}
    cache = ActiveSkinCache(ttl_seconds=30, clock=lambda: now["t"])
    cache.get(loader)

    # Act — read again past the TTL
    now["t"] = 31.0
    value = cache.get(loader)

    # Assert — the entry aged out, so the source is consulted again
    assert value == "aurora"
    assert loader.calls == 2


def test_invalidate_forces_the_next_read_to_reload():
    # Arrange — a value is cached and still fresh
    loader = _Loader(["pulse", "aurora"])
    cache = ActiveSkinCache(ttl_seconds=30, clock=lambda: 0.0)
    cache.get(loader)

    # Act — a publish invalidates, then a read happens at the same instant
    cache.invalidate()
    value = cache.get(loader)

    # Assert — invalidation beats the TTL: the new Active Skin is loaded now
    assert value == "aurora"
    assert loader.calls == 2


def test_ttl_boundary_is_exclusive_of_the_expiry_instant():
    # Arrange
    loader = _Loader(["pulse", "aurora"])
    now = {"t": 0.0}
    cache = ActiveSkinCache(ttl_seconds=30, clock=lambda: now["t"])
    cache.get(loader)

    # Act — exactly at the TTL boundary the entry is considered expired
    now["t"] = 30.0
    value = cache.get(loader)

    # Assert
    assert value == "aurora"
    assert loader.calls == 2
