"""Dependency providers for repositories.

Routes depend on these so the concrete storage implementation can be swapped
(e.g. an in-memory fake in tests) without touching handler code."""

from __future__ import annotations

import redis
from fastapi import Depends
from rq import Queue
from sqlmodel import Session

from app.active_skin.cache import ActiveSkinCache
from app.config import Settings, get_settings
from app.db.session import get_session
from app.generation.cache import GenerationCache, RedisCacheStore
from app.generation.backfill_queue import BackfillQueue, RqBackfillQueue
from app.generation.enrichment_queue import EnrichmentQueue, RqEnrichmentQueue
from app.generation.job_queue import JobQueue, RqJobQueue
from app.generation.llm import build_llm_client
from app.generation.orchestrator import GenerationOrchestrator
from app.generation.worker import QUEUE_NAME
from app.generation.generator import LlmSessionGenerator, SessionGenerator
from app.generation.protocol_generator import (
    LlmProtocolGenerator,
    ProtocolGenerator,
)
from app.generation.regenerator import (
    LlmSessionRegenerator,
    SessionRegenerator,
)
from app.generation.substitute_generator import (
    LlmSubstituteGenerator,
    SubstituteGenerator,
)
from app.repositories.exercise_relationship_repository import (
    ExerciseRelationshipRepository,
    SqlExerciseRelationshipRepository,
)
from app.repositories.exercise_repository import (
    ExerciseRepository,
    SqlExerciseRepository,
)
from app.repositories.generation_feedback_repository import (
    GenerationFeedbackRepository,
    SqlGenerationFeedbackRepository,
)
from app.repositories.protocol_repository import (
    ProtocolRepository,
    SqlProtocolRepository,
)
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    SqlLoggedSessionRepository,
)
from app.repositories.metric_entry_repository import (
    MetricEntryRepository,
    SqlMetricEntryRepository,
)
from app.repositories.active_skin_repository import (
    ActiveSkinRepository,
    SqlActiveSkinRepository,
)
from app.repositories.appearance_preference_repository import (
    AppearancePreferenceRepository,
    SqlAppearancePreferenceRepository,
)
from app.repositories.profile_repository import (
    ProfileRepository,
    SqlProfileRepository,
)
from app.repositories.session_repository import (
    SessionRepository,
    SqlSessionRepository,
)


def get_profile_repository(
    session: Session = Depends(get_session),
) -> ProfileRepository:
    return SqlProfileRepository(session)


def get_appearance_preference_repository(
    session: Session = Depends(get_session),
) -> AppearancePreferenceRepository:
    return SqlAppearancePreferenceRepository(session)


def get_active_skin_repository(
    session: Session = Depends(get_session),
) -> ActiveSkinRepository:
    return SqlActiveSkinRepository(session)


# The Active Skin read-through cache is a *process-wide singleton* (ADR-0048): the
# whole app shares one Active Skin, so the GET path and the PUT path must share one
# cache instance for a publish's invalidate to be seen by subsequent reads in this
# worker. Constructed once at import, not per request. Tests override this provider
# with a fresh cache for isolation, mirroring how they override the repositories.
_active_skin_cache = ActiveSkinCache()


def get_active_skin_cache() -> ActiveSkinCache:
    return _active_skin_cache


def get_exercise_repository(
    session: Session = Depends(get_session),
) -> ExerciseRepository:
    return SqlExerciseRepository(session)


def get_exercise_relationship_repository(
    session: Session = Depends(get_session),
) -> ExerciseRelationshipRepository:
    return SqlExerciseRelationshipRepository(session)


def get_session_repository(
    session: Session = Depends(get_session),
) -> SessionRepository:
    return SqlSessionRepository(session)


def get_logged_session_repository(
    session: Session = Depends(get_session),
) -> LoggedSessionRepository:
    return SqlLoggedSessionRepository(session)


def get_protocol_repository(
    session: Session = Depends(get_session),
) -> ProtocolRepository:
    return SqlProtocolRepository(session)


def get_metric_entry_repository(
    session: Session = Depends(get_session),
) -> MetricEntryRepository:
    return SqlMetricEntryRepository(session)


def get_session_generator(
    settings: Settings = Depends(get_settings),
) -> SessionGenerator:
    return LlmSessionGenerator(build_llm_client(settings))


def get_protocol_generator(
    settings: Settings = Depends(get_settings),
) -> ProtocolGenerator:
    return LlmProtocolGenerator(build_llm_client(settings))


def get_generation_cache(
    settings: Settings = Depends(get_settings),
) -> GenerationCache:
    client = redis.Redis.from_url(settings.redis_url)
    return GenerationCache(RedisCacheStore(client))


def get_job_queue(
    settings: Settings = Depends(get_settings),
) -> JobQueue:
    connection = redis.Redis.from_url(settings.redis_url)
    return RqJobQueue(Queue(QUEUE_NAME, connection=connection))


def get_enrichment_queue(
    settings: Settings = Depends(get_settings),
) -> EnrichmentQueue:
    # The async-on-create Stub-enrichment queue (issue #309) shares the one
    # ``generation`` RQ queue with Protocol generation, so both ride a single Redis
    # (ADR-0005).
    connection = redis.Redis.from_url(settings.redis_url)
    return RqEnrichmentQueue(Queue(QUEUE_NAME, connection=connection))


def get_backfill_queue(
    settings: Settings = Depends(get_settings),
) -> BackfillQueue:
    # The admin-triggered Stub-enrichment backfill (ADR-0046) rides the same one
    # ``generation`` RQ queue as Protocol generation and on-create enrichment, so the
    # whole app shares a single Redis (ADR-0005).
    connection = redis.Redis.from_url(settings.redis_url)
    return RqBackfillQueue(Queue(QUEUE_NAME, connection=connection))


def get_generation_orchestrator(
    cache: GenerationCache = Depends(get_generation_cache),
    queue: JobQueue = Depends(get_job_queue),
    exercises: ExerciseRepository = Depends(get_exercise_repository),
    protocols: ProtocolRepository = Depends(get_protocol_repository),
) -> GenerationOrchestrator:
    return GenerationOrchestrator(
        cache=cache, queue=queue, exercises=exercises, protocols=protocols
    )


def get_generation_feedback_repository(
    session: Session = Depends(get_session),
) -> GenerationFeedbackRepository:
    return SqlGenerationFeedbackRepository(session)


def get_session_regenerator(
    settings: Settings = Depends(get_settings),
) -> SessionRegenerator:
    return LlmSessionRegenerator(build_llm_client(settings))


def get_substitute_generator(
    settings: Settings = Depends(get_settings),
) -> SubstituteGenerator:
    return LlmSubstituteGenerator(build_llm_client(settings))
