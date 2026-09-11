"""The RQ worker entrypoint for async Protocol generation (Slice 7, ADR-0005).

``run_generation_job`` is the function RQ enqueues and a separate worker process
executes. It runs independently of the HTTP request that enqueued it — so a slow
or dropped mobile connection during a long multi-week generation never loses the
result — constructing its *own* infrastructure (DB session, the Redis-backed
Generation Cache, the LLM transport via the shared factory) and returning the
adopted Protocol id, which RQ stores as the job's result for the PWA to poll.

Run a worker with::

    rq worker generation

This module is an I/O composition root (like ``app.main``); its wiring is
exercised end to end against real infrastructure, not unit tests.
"""

from __future__ import annotations

from dataclasses import asdict

import redis
from sqlmodel import Session

from app.config import get_settings
from app.db.session import get_engine
from app.generation.cache import GenerationCache, RedisCacheStore
from app.generation.exercise_enrichment import enrich_exercise
from app.generation.exercise_enrichment_backfill import backfill_stub_exercises
from app.generation.exercise_enrichment_generator import (
    LlmExerciseEnrichmentGenerator,
)
from app.generation.llm import build_llm_client
from app.generation.protocol_generator import (
    LlmProtocolGenerator,
    ProtocolGenerationRequest,
)
from app.generation.protocol_service import run_generation
from app.repositories.exercise_repository import SqlExerciseRepository
from app.repositories.protocol_repository import SqlProtocolRepository

QUEUE_NAME = "generation"


def request_payload(request: ProtocolGenerationRequest) -> dict:
    """Serialize a generation request to the plain dict enqueued as a job arg."""

    return asdict(request)


def run_generation_job(
    request_data: dict, clerk_user_id: str, cache_key: str | None
) -> int:
    """Execute one enqueued generation and return the adopted Protocol id.

    Raises ``GenerationError`` on malformed output, which RQ records as a failed
    job; the polling endpoint surfaces it as a user-safe failure.
    """

    settings = get_settings()
    request = ProtocolGenerationRequest(**request_data)
    cache = GenerationCache(RedisCacheStore(redis.Redis.from_url(settings.redis_url)))
    llm = build_llm_client(settings)
    generator = LlmProtocolGenerator(llm)
    try:
        with Session(get_engine()) as session:
            view = run_generation(
                request,
                clerk_user_id,
                cache_key,
                cache=cache,
                generator=generator,
                exercises=SqlExerciseRepository(session),
                protocols=SqlProtocolRepository(session),
            )
            return view.id
    finally:
        # Generation is async on a cache miss (ADR-0005): this short-lived job process may
        # exit before the recorder's background batch flushes, so flush before returning —
        # on success and failure alike — or worker-generated calls (the majority) are lost.
        # The flush is best-effort inside the decorator, so it never fails the job.
        llm.flush()


def run_enrichment_job(exercise_id: int) -> None:
    """Enrich one freshly minted Stub Exercise out-of-band (issue #309, ADR-0041).

    Enqueued on a genuine ``POST /api/exercises`` create so the AI fill runs off the
    request path (the create itself stays name-only, ADR-0002). Like
    ``run_generation_job`` it is an I/O composition root: it constructs its own DB
    session and LLM transport, loads the Stub, and runs the shared ``enrich_exercise``
    step — the same step the human-triggered backfill uses (issue #308), so the two
    triggers never drift. The step is idempotent-friendly, so a row already lifted (a
    duplicate enqueue, or a movement no longer a Stub) costs no AI call; a vanished id
    is a no-op. Fire-and-forget: there is no result to return.
    """

    settings = get_settings()
    llm = build_llm_client(settings)
    generator = LlmExerciseEnrichmentGenerator(llm)
    try:
        with Session(get_engine()) as session:
            exercises = SqlExerciseRepository(session)
            exercise = exercises.get(exercise_id)
            if exercise is None:  # the row was deleted before the worker ran
                return
            enrich_exercise(exercise, exercises=exercises, generator=generator)
    finally:
        # Enrichment is async on a create (ADR-0005): this short-lived job process may
        # exit before the recorder's background batch flushes, so flush before
        # returning or the worker-generated call is lost. Best-effort in the decorator,
        # so it never fails the job.
        llm.flush()


def run_backfill_job() -> dict:
    """Run one full Stub-enrichment backfill sweep and return its summary counts.

    The admin-triggered counterpart to the CLI ``main`` (ADR-0046): enqueued by the
    backfill endpoint so the whole-catalog sweep runs off the request path. Like
    ``run_generation_job`` it is an I/O composition root — it constructs its own DB
    session and LLM transport and runs the shared ``backfill_stub_exercises`` pass, the
    same pass the CLI uses (issue #308), so the two triggers never drift. Returns the
    ``EnrichmentSummary`` as a plain dict, which RQ stores as the job result for the
    poll endpoint to read back.
    """

    settings = get_settings()
    llm = build_llm_client(settings)
    generator = LlmExerciseEnrichmentGenerator(llm)
    try:
        with Session(get_engine()) as session:
            summary = backfill_stub_exercises(
                exercises=SqlExerciseRepository(session),
                generator=generator,
            )
            return asdict(summary)
    finally:
        # The backfill is the majority of this job's Generation Calls; flush before
        # returning (success or failure) or the short-lived job process may exit before
        # the recorder's background batch flushes. Best-effort in the decorator, so it
        # never fails the job.
        llm.flush()


__all__ = [
    "run_generation_job",
    "run_enrichment_job",
    "run_backfill_job",
    "request_payload",
    "QUEUE_NAME",
]
