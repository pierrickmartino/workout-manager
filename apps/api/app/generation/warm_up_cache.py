"""Warm-up Suggestion cache: reuse a generated warm-up for equivalent muscles and kit
(ADR-0003, ADR-0144).

``WarmUpCache.suggestion_for`` is a read-through over the shared ``CacheStore``. It owns
three rules behind that one call:

- **Coarse keying.** The key is the sorted muscle set (the targeted muscles, plus the names
  of working movements with no muscle data) and the sorted equipment set. The muscles' weight
  order personalizes the prompt but is deliberately dropped from the key, so the same muscles
  share one suggestion however a Session orders them.
- **The safety bypass.** A request carrying any Sensitive Constraint never reads and never
  writes the cache: it is always generated fresh with the constraint in the prompt. A safety
  rule, not an optimization.
- **Regenerate** skips the read and asks the generator again. Only a cache *miss* is stored,
  so a stored suggestion is immutable — never overwritten, and never mutated by a caller,
  who receives a fresh validated copy (adopt-by-copy).

What is stored is the validated generator output, before catalog resolution, so each
request still resolves its drills against the live catalog."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable, Iterable

from app.generation.cache import CacheStore
from app.generation.schema import GeneratedWarmUp
from app.generation.warm_up_generator import WarmUpRequest

KEY_PREFIX = "genwarmup"


def _normalized_set(values: Iterable[str]) -> list[str]:
    return sorted({value.strip().lower() for value in values if value.strip()})


def derive_warm_up_key(request: WarmUpRequest) -> str:
    """Reduce ``request`` to its coarse key: the sorted muscle set and equipment set."""

    derived = request.derived
    payload = {
        "muscles": _normalized_set([*derived.muscle_names, *derived.unmapped_exercises]),
        "equipment": _normalized_set(derived.equipment),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"{KEY_PREFIX}:{digest}"


class WarmUpCache:
    """Coarse-keyed reuse of generated Warm-up Suggestions with a hard safety bypass."""

    def __init__(self, store: CacheStore) -> None:
        self._store = store

    def suggestion_for(
        self,
        request: WarmUpRequest,
        generate: Callable[[WarmUpRequest], GeneratedWarmUp],
        *,
        regenerate: bool = False,
    ) -> GeneratedWarmUp:
        """Serve ``request`` from the cache, or ``generate`` it (and store it on a plain miss).

        ``generate`` must raise for any suggestion that must not be served, so a refused
        suggestion is never stored.

        A Sensitive Constraint bypasses the cache in both directions; ``regenerate`` skips
        the read and leaves the stored suggestion untouched."""

        if request.derived.has_sensitive_constraint or regenerate:
            return generate(request)

        key = derive_warm_up_key(request)
        raw = self._store.get(key)
        if raw is not None:
            return GeneratedWarmUp.model_validate_json(raw)

        generated = generate(request)
        self._store.set(key, generated.model_dump_json())
        return generated


__all__ = ["KEY_PREFIX", "WarmUpCache", "derive_warm_up_key"]
