"""The multi-week Program path: AI output → Adoption → user-owned Program.

``generate_program`` orchestrates the full flow (issue Slice 5): call the program
generator for a fully-enumerated Generated Program, then Adopt it by deep copy into
a user-owned, mutable Program whose Sessions reuse the shared Exercise Catalog.
Generation is synchronous and uncached here; the cache and async land in Slices
6–7. A ``GenerationError`` from the generator propagates before anything is
persisted."""

from __future__ import annotations

from app.adoption.service import adopt
from app.generation.program_generator import (
    ProgramGenerationRequest,
    ProgramGenerator,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.program_repository import ProgramRepository, ProgramView


def generate_program(
    request: ProgramGenerationRequest,
    clerk_user_id: str,
    *,
    generator: ProgramGenerator,
    exercises: ExerciseRepository,
    programs: ProgramRepository,
) -> ProgramView:
    """Generate a Program and Adopt it as a user-owned copy.

    Raises ``GenerationError`` (from the generator) on malformed or
    under-enumerated output, in which case nothing is written.
    """

    generated = generator.generate(request)
    return adopt(
        generated,
        clerk_user_id,
        request,
        exercises=exercises,
        programs=programs,
    )


__all__ = ["generate_program"]
