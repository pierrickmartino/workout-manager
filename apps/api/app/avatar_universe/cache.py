"""A short-TTL, read-through cache for the global Avatar Universe (ADR-0137).

``GET /api/avatar-universe`` is read by the web layer on every render (the header draws
the user's Avatar in it), so it is served from an in-process single-slot cache exactly
like the Active Skin's (ADR-0048): publishing invalidates it in the publishing worker,
and the TTL bounds how long any other worker can serve the previous universe."""

from __future__ import annotations

from app.active_skin.cache import DEFAULT_TTL_SECONDS, ActiveSkinCache


class AvatarUniverseCache(ActiveSkinCache):
    """The same single-slot TTL cache as the Active Skin's, holding the universe id.

    A named subclass rather than a second ``ActiveSkinCache`` instance, so a dependency
    override or a reader can never mix up the two settings' caches."""


__all__ = ["AvatarUniverseCache", "DEFAULT_TTL_SECONDS"]
