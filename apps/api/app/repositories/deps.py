"""Dependency providers for repositories.

Routes depend on these so the concrete storage implementation can be swapped
(e.g. an in-memory fake in tests) without touching handler code."""

from __future__ import annotations

import anthropic
from fastapi import Depends
from sqlmodel import Session

from app.config import Settings, get_settings
from app.db.session import get_session
from app.generation.generator import AnthropicSessionGenerator, SessionGenerator
from app.generation.program_generator import (
    AnthropicProgramGenerator,
    ProgramGenerator,
)
from app.generation.regenerator import (
    AnthropicSessionRegenerator,
    SessionRegenerator,
)
from app.generation.substitute_generator import (
    AnthropicSubstituteGenerator,
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
from app.repositories.program_repository import (
    ProgramRepository,
    SqlProgramRepository,
)
from app.repositories.logged_session_repository import (
    LoggedSessionRepository,
    SqlLoggedSessionRepository,
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


def get_program_repository(
    session: Session = Depends(get_session),
) -> ProgramRepository:
    return SqlProgramRepository(session)


def get_session_generator(
    settings: Settings = Depends(get_settings),
) -> SessionGenerator:
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return AnthropicSessionGenerator(client)


def get_program_generator(
    settings: Settings = Depends(get_settings),
) -> ProgramGenerator:
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return AnthropicProgramGenerator(client)


def get_generation_feedback_repository(
    session: Session = Depends(get_session),
) -> GenerationFeedbackRepository:
    return SqlGenerationFeedbackRepository(session)


def get_session_regenerator(
    settings: Settings = Depends(get_settings),
) -> SessionRegenerator:
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return AnthropicSessionRegenerator(client)


def get_substitute_generator(
    settings: Settings = Depends(get_settings),
) -> SubstituteGenerator:
    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return AnthropicSubstituteGenerator(client)
