"""Generation Cache: reuse a generated artifact for an equivalent request (ADR-0003).

Generation is expensive, so a Generated Program is cached behind a deliberately
*coarse* key and reused across users — except where caution forbids it. This
module owns three responsibilities behind one small interface:

- **Coarse keying.** ``derive_key`` reduces a request to a normalized tuple
  (training type, objective, Fitness Level *bucket*, sessions/week, weeks,
  session duration, sorted equipment set, constraint signature) and hashes it.
  Continuous profile values (exact age/height/weight) personalize generation but
  are deliberately *excluded* from the key, so they never fracture reuse.
- **The safety bypass.** Any Sensitive Constraint makes ``lookup`` return
  ``Bypass`` — never a shared artifact, never stored under a shared key.
- **Lookup / store.** ``lookup`` returns ``Hit | Miss | Bypass``; the
  orchestration path Adopts on a hit and stores on a non-bypass miss.

The byte store is abstracted behind ``CacheStore`` (Redis in production, an
in-memory fake in tests) so the keying logic is unit-testable without I/O.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Protocol

from app.domain.fitness_profile import SENSITIVE_CONSTRAINT_TYPES
from app.generation.schema import GeneratedProgram

KEY_PREFIX = "genprog"

# Fitness Level (1–10) bucketing — the key coarsens an exact level to a band so
# nearby abilities share one cached Program (ADR-0003).
INTERMEDIATE_MIN_LEVEL = 4
ADVANCED_MIN_LEVEL = 8


class CacheStatus(str, Enum):
    """The outcome of a cache ``lookup``."""

    HIT = "hit"
    MISS = "miss"
    BYPASS = "bypass"


@dataclass(frozen=True)
class CacheRequest:
    """The inputs a cache decision is derived from.

    The coarse fields form the key; ``sensitive_constraints`` drive the safety
    bypass; ``preferences`` form the constraint signature. The continuous values
    (``age``, ``weight_kg``, ``height_cm``) are carried for documentation and to
    make their *exclusion* explicit — they never enter the key.
    """

    training_type: str
    objective: str
    fitness_level: int
    sessions_per_week: int
    weeks: int
    duration_minutes: int
    equipment: list[str] = field(default_factory=list)
    preferences: list[str] = field(default_factory=list)
    sensitive_constraints: list[str] = field(default_factory=list)
    # Deliberately excluded from the key (ADR-0003):
    age: int | None = None
    weight_kg: float | None = None
    height_cm: float | None = None


@dataclass(frozen=True)
class CacheResult:
    """A lookup outcome: a status, the key it resolved to, and any hit artifact.

    On ``BYPASS`` the key is ``None`` — a sensitive request is never stored under,
    or served from, a shared key. On ``HIT`` the ``artifact`` is populated.
    """

    status: CacheStatus
    key: str | None = None
    artifact: GeneratedProgram | None = None


class CacheStore(Protocol):
    """A minimal string key/value store (Redis in production)."""

    def get(self, key: str) -> str | None: ...

    def set(self, key: str, value: str) -> None: ...


class InMemoryCacheStore:
    """A dict-backed ``CacheStore`` for tests and local wiring."""

    def __init__(self) -> None:
        self._values: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self._values.get(key)

    def set(self, key: str, value: str) -> None:
        self._values[key] = value


class RedisCacheStore:
    """A Redis-backed ``CacheStore`` (the production cache, ADR-0003)."""

    def __init__(self, client) -> None:
        self._client = client

    def get(self, key: str) -> str | None:
        raw = self._client.get(key)
        if raw is None:
            return None
        return raw.decode("utf-8") if isinstance(raw, (bytes, bytearray)) else raw

    def set(self, key: str, value: str) -> None:
        self._client.set(key, value)


def _level_bucket(level: int) -> str:
    """Coarsen an exact Fitness Level (1–10) into a band for the key."""

    if level >= ADVANCED_MIN_LEVEL:
        return "advanced"
    if level >= INTERMEDIATE_MIN_LEVEL:
        return "intermediate"
    return "beginner"


def _normalized_set(values: list[str]) -> list[str]:
    """Lowercase, strip, de-duplicate and sort, so order/case never split a key."""

    return sorted({value.strip().lower() for value in values if value.strip()})


def derive_key(request: CacheRequest) -> str:
    """Reduce ``request`` to its coarse, normalized cache key.

    Equivalent coarse inputs hash to the same key; materially different ones
    separate. Continuous values are not referenced here at all.
    """

    payload = {
        "training_type": request.training_type.strip().lower(),
        "objective": request.objective.strip().lower(),
        "level_bucket": _level_bucket(request.fitness_level),
        "sessions_per_week": request.sessions_per_week,
        "weeks": request.weeks,
        "duration_minutes": request.duration_minutes,
        "equipment": _normalized_set(request.equipment),
        "constraint_signature": _normalized_set(request.preferences),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"{KEY_PREFIX}:{digest}"


def _is_sensitive(request: CacheRequest) -> bool:
    return any(
        constraint in SENSITIVE_CONSTRAINT_TYPES
        for constraint in request.sensitive_constraints
    )


class GenerationCache:
    """Coarse-keyed reuse of Generated Programs with a hard safety bypass."""

    def __init__(self, store: CacheStore) -> None:
        self._store = store

    def lookup(self, request: CacheRequest) -> CacheResult:
        """Resolve ``request`` to ``Hit``, ``Miss`` or ``Bypass``."""

        if _is_sensitive(request):
            return CacheResult(status=CacheStatus.BYPASS)

        key = derive_key(request)
        raw = self._store.get(key)
        if raw is None:
            return CacheResult(status=CacheStatus.MISS, key=key)

        artifact = GeneratedProgram.model_validate_json(raw)
        return CacheResult(status=CacheStatus.HIT, key=key, artifact=artifact)

    def store(self, key: str, artifact: GeneratedProgram) -> None:
        """Persist a generated ``artifact`` under ``key`` (a non-bypass miss)."""

        self._store.set(key, artifact.model_dump_json())


__all__ = [
    "CacheRequest",
    "CacheResult",
    "CacheStatus",
    "CacheStore",
    "InMemoryCacheStore",
    "RedisCacheStore",
    "GenerationCache",
    "derive_key",
]
