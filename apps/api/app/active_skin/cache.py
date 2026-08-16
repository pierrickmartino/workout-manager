"""A short-TTL, read-through cache for the global Active Skin (ADR-0048).

``GET /api/active-skin`` is read by the web layer on *every* render, so hitting
the store each time would put the Active Skin lookup on the hot path of every
page load. This cache holds the value in-process for a short TTL; publishing
(``PUT``) calls ``invalidate`` so a new Active Skin is served immediately in the
publishing worker, and the TTL bounds staleness in any *other* worker process a
single in-process invalidate can't reach — propagation lands on users' next
navigation, no websocket/push layer (ADR-0048).

The clock is injected so expiry is unit-testable without sleeping; ``monotonic``
is used in production so the cache is immune to wall-clock jumps."""

from __future__ import annotations

import time
from typing import Callable

# The Active Skin changes rarely (an admin publish) and reads are frequent, so a
# short TTL keeps the store off the hot path while bounding how stale any worker's
# view can get before it re-reads.
DEFAULT_TTL_SECONDS: float = 30.0


class ActiveSkinCache:
    """An in-process read-through cache of the single Active Skin id.

    Not keyed — there is exactly one Active Skin app-wide — so this is a single
    slot with an expiry. Deliberately simple and not thread-safe beyond the GIL's
    guarantees on the individual attribute assignments: a rare torn read merely
    re-loads, which is harmless for a value that is only ever a valid catalog id."""

    def __init__(
        self,
        ttl_seconds: float = DEFAULT_TTL_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._ttl = ttl_seconds
        self._clock = clock
        self._value: str | None = None
        self._expires_at: float = 0.0

    def get(self, loader: Callable[[], str]) -> str:
        """Return the cached Active Skin, loading through ``loader`` on miss/expiry.

        The entry is fresh while ``now < expiry``; at or past the expiry instant it
        is reloaded (the TTL boundary is exclusive)."""

        now = self._clock()
        if self._value is not None and now < self._expires_at:
            return self._value

        value = loader()
        self._value = value
        self._expires_at = now + self._ttl
        return value

    def invalidate(self) -> None:
        """Drop the cached value so the next ``get`` reloads from the source.

        Called on publish so the new Active Skin is served immediately in this
        worker rather than waiting out the TTL."""

        self._value = None
        self._expires_at = 0.0


__all__ = ["ActiveSkinCache", "DEFAULT_TTL_SECONDS"]
