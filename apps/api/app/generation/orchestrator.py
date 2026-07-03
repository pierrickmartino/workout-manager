"""The Generation Orchestrator: tie the Generation Cache to the job queue.

Generation is moved off the HTTP request path (ADR-0005). ``submit`` is the
single front door for a Protocol request and makes the cache decision once:

- **hit** → Adopt the shared artifact immediately and return the user-owned
  Protocol; no job is enqueued (the common, instant case the cache exists for);
- **miss** → enqueue a job carrying the miss's key so the worker stores the
  artifact, and return a handle without any synchronous AI call;
- **bypass** (any Sensitive Constraint) → enqueue a job with *no* key, so the
  worker generates fresh and never stores under a shared key.

The worker runs ``run_generation`` and Adopts; the PWA polls ``get_state`` for
the handle until the adopted Protocol id is available.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.adoption.service import adopt
from app.generation.cache import CacheRequest, CacheStatus, GenerationCache
from app.generation.job_queue import JobQueue, JobState
from app.generation.protocol_generator import ProtocolGenerationRequest
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.protocol_repository import ProtocolRepository, ProtocolView


@dataclass(frozen=True)
class GenerationOutcome:
    """The result of ``submit``.

    A cache hit returns ``protocol`` (Adopted inline, ``job_id`` is ``None``); a
    miss or bypass returns a ``job_id`` to poll (``protocol`` is ``None``). Exactly
    one of the two is populated.
    """

    job_id: str | None = None
    protocol: ProtocolView | None = None


class GenerationOrchestrator:
    """Front door for Protocol generation: Adopt-on-hit, enqueue-on-miss/bypass."""

    def __init__(
        self,
        *,
        cache: GenerationCache,
        queue: JobQueue,
        exercises: ExerciseRepository,
        protocols: ProtocolRepository,
    ) -> None:
        self._cache = cache
        self._queue = queue
        self._exercises = exercises
        self._protocols = protocols

    def submit(
        self,
        request: ProtocolGenerationRequest,
        clerk_user_id: str,
        cache_request: CacheRequest,
    ) -> GenerationOutcome:
        """Resolve ``request`` against the cache, then Adopt or enqueue."""

        result = self._cache.lookup(cache_request)
        if result.status is CacheStatus.HIT:
            protocol = adopt(
                result.artifact,
                clerk_user_id,
                request,
                exercises=self._exercises,
                protocols=self._protocols,
            )
            return GenerationOutcome(protocol=protocol)

        # A miss carries its key (the worker stores); a bypass carries none.
        cache_key = result.key if result.status is CacheStatus.MISS else None
        job_id = self._queue.enqueue(request, clerk_user_id, cache_key)
        return GenerationOutcome(job_id=job_id)

    def job_state(self, job_id: str) -> JobState | None:
        """Poll a previously enqueued job by its handle."""

        return self._queue.get_state(job_id)


__all__ = ["GenerationOrchestrator", "GenerationOutcome"]
