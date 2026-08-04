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


__all__ = ["run_generation_job", "request_payload", "QUEUE_NAME"]
