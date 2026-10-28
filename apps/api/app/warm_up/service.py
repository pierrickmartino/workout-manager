"""The Warm-up Suggestion flow: preview AI warm-up drills for one Session (ADR-0143).

``suggest_warm_up`` reads the owner's Session and Profile, derives the generator input
through the pure ``derive_warm_up_input``, offers the catalog drills that fit the equipment,
and asks the ``WarmUpGenerator`` for 4–6 drills. Every drill is resolved to a catalog
Exercise — an existing one by name, otherwise a new ``ai_generated`` entry with its targeted
muscles, following the Substitution path — so a drill added later is always loggable.

It **never changes the Session**: the result is a preview the user may Add, Discard or
Regenerate. Each returned drill already carries the one-set warm-up prescription shape
(Quantity, typed Load, rest, ``warm_up`` Set Type) the apply step copies verbatim."""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.equipment import normalize_stored_equipment
from app.domain.exercise import Provenance
from app.domain.set_type import SetType
from app.domain.warm_up import (
    DRILL_SETS,
    candidate_drills,
    derive_warm_up_input,
    drill_load,
    drill_quantity,
    fits_equipment,
    leading_warm_up_length,
)
from app.generation.llm.port import GenerationError
from app.generation.schema import GeneratedWarmUp, GeneratedWarmUpDrill
from app.generation.warm_up_cache import WarmUpCache
from app.generation.warm_up_generator import WarmUpGenerator, WarmUpRequest
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.profile_repository import ProfileRepository
from app.repositories.session_repository import SessionRepository
from app.warm_up.errors import SessionNotFound


@dataclass(frozen=True)
class SuggestedDrill:
    """One drill of the preview, in the Exercise Prescription shape the apply step copies."""

    exercise_id: int
    exercise_name: str
    reps: str
    prescribed_quantity: dict
    recommended_load: dict
    rest_seconds: int
    sets: int = DRILL_SETS
    set_type: str = SetType.WARM_UP.value


@dataclass(frozen=True)
class WarmUpSuggestion:
    drills: tuple[SuggestedDrill, ...]
    estimated_minutes: int
    has_warm_up_section: bool


def _required_equipment(drill: GeneratedWarmUpDrill, exercises: ExerciseRepository) -> list[str]:
    existing = exercises.find_by_name(drill.exercise_name)
    if existing is not None:
        return list(existing.required_equipment)
    return list(drill.required_equipment)


def _check_equipment(
    drills: list[GeneratedWarmUpDrill],
    equipment: tuple[str, ...],
    exercises: ExerciseRepository,
) -> None:
    """Refuse the whole suggestion if any drill needs kit the user lacks — checked before
    anything is written to the catalog."""

    for drill in drills:
        if not fits_equipment(_required_equipment(drill, exercises), equipment):
            raise GenerationError(
                f"warm-up drill {drill.exercise_name!r} needs equipment outside {equipment}"
            )


def _resolve(drill: GeneratedWarmUpDrill, exercises: ExerciseRepository) -> SuggestedDrill:
    exercise = exercises.find_or_create(
        drill.exercise_name,
        provenance=Provenance.AI_GENERATED,
        description=drill.exercise_description,
        targeted_muscles=drill.targeted_muscles,
        required_equipment=normalize_stored_equipment(drill.required_equipment).values,
        instructions=drill.instructions,
    )
    quantity = drill_quantity(drill.quantity_kind, drill.amount)
    return SuggestedDrill(
        exercise_id=exercise.id,
        exercise_name=exercise.name,
        reps=quantity.text,
        prescribed_quantity=quantity.to_dict(),
        recommended_load=drill_load(drill.load_kind, drill.load_text).to_dict(),
        rest_seconds=drill.rest_seconds,
    )


def suggest_warm_up(
    session_id: int,
    clerk_user_id: str,
    *,
    sessions: SessionRepository,
    profiles: ProfileRepository,
    exercises: ExerciseRepository,
    generator: WarmUpGenerator,
    cache: WarmUpCache,
    regenerate: bool = False,
) -> WarmUpSuggestion:
    """Preview a Warm-up Suggestion for the owner's Session (ADR-0143).

    The generated suggestion is served through the coarse-keyed ``WarmUpCache`` (ADR-0003):
    ``regenerate`` skips the cache read, and a Sensitive Constraint bypasses it entirely.

    Raises ``SessionNotFound`` if the user does not own the Session and ``GenerationError``
    when the model output is malformed or asks for equipment the user lacks — in which case
    nothing is written."""

    view = sessions.get(session_id, clerk_user_id)
    if view is None:
        raise SessionNotFound(session_id)

    profile = profiles.get_or_create(clerk_user_id)
    derived = derive_warm_up_input(
        view.prescriptions,
        profile_equipment=profile.default_equipment,
        profile_constraints=profile.sensitive_constraints,
    )
    request = WarmUpRequest(
        derived=derived,
        candidate_drills=candidate_drills(exercises.list_all(), derived.equipment),
    )

    def generate_checked(req: WarmUpRequest) -> GeneratedWarmUp:
        # Checked before the cache stores it, so a refused suggestion is never cached.
        generated = generator.generate(req)
        _check_equipment(generated.drills, req.derived.equipment, exercises)
        return generated

    generated = cache.suggestion_for(request, generate_checked, regenerate=regenerate)
    return WarmUpSuggestion(
        drills=tuple(_resolve(drill, exercises) for drill in generated.drills),
        estimated_minutes=generated.estimated_minutes,
        has_warm_up_section=leading_warm_up_length(view.prescriptions) > 0,
    )


__all__ = [
    "SuggestedDrill",
    "WarmUpSuggestion",
    "suggest_warm_up",
]
