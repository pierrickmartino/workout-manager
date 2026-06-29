"""Generation Cache (Slice 6, ADR-0003).

The behaviors that matter, asserted through the cache's public interface:

- the coarse key *collides* for equivalent inputs and *separates* for materially
  different ones, so equivalent requests reuse one artifact;
- continuous profile values (exact age/weight/height) are excluded from the key,
  so they never fracture reuse;
- any Sensitive Constraint forces a hard ``Bypass`` — the headline safety gate —
  and such a request is never served, nor stored under, a shared key.

Exercised with an in-memory store so the tests stay offline and fast.
"""

from __future__ import annotations

from app.generation.cache import (
    CacheRequest,
    CacheStatus,
    GenerationCache,
    InMemoryCacheStore,
    RedisCacheStore,
    derive_key,
)
from app.generation.schema import (
    GeneratedExercisePrescription,
    GeneratedProgram,
    GeneratedProgramSession,
)


def _cache() -> GenerationCache:
    return GenerationCache(InMemoryCacheStore())


def _request(**overrides) -> CacheRequest:
    base = dict(
        training_type="strength",
        objective="gain muscle mass",
        fitness_level=5,
        sessions_per_week=3,
        weeks=8,
        duration_minutes=45,
        equipment=["barbell", "rack"],
    )
    base.update(overrides)
    return CacheRequest(**base)


def _artifact(load: str = "60% 1RM") -> GeneratedProgram:
    return GeneratedProgram(
        sessions=[
            GeneratedProgramSession(
                week=1,
                day=1,
                prescriptions=[
                    GeneratedExercisePrescription(
                        exercise_name="Back Squat", sets=5, reps="5",
                        recommended_load=load,
                    )
                ],
            )
        ]
    )


def test_store_then_lookup_returns_the_artifact_as_a_hit():
    # Arrange — an empty cache misses, then we store the freshly generated artifact
    cache = _cache()
    request = _request()
    miss = cache.lookup(request)

    # Act — store under the miss's key, then look up the equivalent request again
    cache.store(miss.key, _artifact("60% 1RM"))
    hit = cache.lookup(_request())

    # Assert — first call missed, second is served the stored artifact
    assert miss.status is CacheStatus.MISS
    assert miss.artifact is None
    assert hit.status is CacheStatus.HIT
    assert hit.artifact == _artifact("60% 1RM")


def test_equivalent_inputs_collide_on_one_cached_artifact():
    # Arrange — store under one request, then look up an equivalent one whose
    # equipment is reordered/recased and whose excluded continuous values differ
    cache = _cache()
    cache.store(cache.lookup(_request()).key, _artifact())

    equivalent = _request(
        equipment=["RACK", "Barbell"],  # reordered + recased
        age=22,
        weight_kg=70.0,
        height_cm=175.0,
    )

    # Act
    result = cache.lookup(equivalent)

    # Assert — same coarse request, so the second user reuses the artifact
    assert result.status is CacheStatus.HIT
    assert result.artifact == _artifact()


def test_continuous_values_are_excluded_from_the_key():
    # Arrange — two requests differing ONLY in exact age/weight/height
    light = _request(weight_kg=60.0, age=25, height_cm=165.0)
    heavy = _request(weight_kg=95.0, age=40, height_cm=190.0)

    # Act / Assert — the excluded values never move the key
    assert derive_key(light) == derive_key(heavy)


def test_same_level_bucket_shares_a_key_across_exact_levels():
    # Arrange — levels 4 and 7 both fall in the "intermediate" band
    low_intermediate = _request(fitness_level=4)
    high_intermediate = _request(fitness_level=7)

    # Act / Assert — bucketed, so the exact level within a band does not split
    assert derive_key(low_intermediate) == derive_key(high_intermediate)


def test_different_level_buckets_separate():
    # Arrange — beginner (2) vs intermediate (5) vs advanced (9)
    keys = {
        derive_key(_request(fitness_level=2)),
        derive_key(_request(fitness_level=5)),
        derive_key(_request(fitness_level=9)),
    }

    # Assert — three distinct buckets, three distinct keys
    assert len(keys) == 3


def test_materially_different_inputs_separate():
    # Arrange — a baseline request and several with one material field changed
    base = derive_key(_request())
    variants = [
        _request(objective="weight loss"),
        _request(training_type="calisthenics"),
        _request(weeks=12),
        _request(sessions_per_week=4),
        _request(duration_minutes=60),
        _request(equipment=["barbell"]),  # a different equipment SET
        _request(preferences=["no running"]),  # different constraint signature
    ]

    # Act / Assert — every material difference produces a distinct key, and a
    # changed request misses against the cached baseline
    cache = _cache()
    cache.store(base, _artifact())
    for variant in variants:
        assert derive_key(variant) != base
        assert cache.lookup(variant).status is CacheStatus.MISS


def test_sensitive_constraint_forces_a_bypass():
    # Arrange — a request identical to a cached one, but flagged with an injury
    cache = _cache()
    shared = _request()
    cache.store(cache.lookup(shared).key, _artifact())

    sensitive = _request(sensitive_constraints=["injury"])

    # Act — the headline safety gate
    result = cache.lookup(sensitive)

    # Assert — never served the shared artifact, and no shared key to store under
    assert result.status is CacheStatus.BYPASS
    assert result.key is None
    assert result.artifact is None


def test_every_sensitive_constraint_type_bypasses():
    # Arrange / Act / Assert — each recognized sensitive type triggers a bypass,
    # even when every other parameter matches a cached, shareable request
    cache = _cache()
    for constraint in ("injury", "rehabilitation", "postpartum", "flagged_medical"):
        request = _request(sensitive_constraints=[constraint])
        assert cache.lookup(request).status is CacheStatus.BYPASS


def test_non_sensitive_preference_does_not_bypass():
    # Arrange — a plain Preference/Limitation ("no running") is not a Sensitive
    # Constraint: it steers selection via the key, but never forces a bypass
    cache = _cache()
    request = _request(preferences=["no running"])

    # Act
    result = cache.lookup(request)

    # Assert — a normal miss with a usable key, not a bypass
    assert result.status is CacheStatus.MISS
    assert result.key is not None


class _FakeRedis:
    """Mimics redis-py: ``set`` stores the value, ``get`` returns it as bytes."""

    def __init__(self) -> None:
        self._values: dict[str, bytes] = {}

    def get(self, key: str):
        return self._values.get(key)

    def set(self, key: str, value) -> None:
        self._values[key] = value.encode("utf-8") if isinstance(value, str) else value


def test_redis_backed_cache_round_trips_through_byte_values():
    # Arrange — a Redis-backed cache; real Redis returns stored values as bytes
    cache = GenerationCache(RedisCacheStore(_FakeRedis()))
    request = _request()
    miss = cache.lookup(request)

    # Act — store, then look the equivalent request up again
    cache.store(miss.key, _artifact("70% 1RM"))
    hit = cache.lookup(_request())

    # Assert — bytes from the store are decoded and parsed back into the artifact
    assert miss.status is CacheStatus.MISS
    assert hit.status is CacheStatus.HIT
    assert hit.artifact == _artifact("70% 1RM")
