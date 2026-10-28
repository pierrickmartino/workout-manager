"""Adding a Warm-up Suggestion to a Session (ADR-0143, #780).

``apply_warm_up`` puts the accepted drills at the front of the owner's Session as ordinary
one-set Exercise Prescriptions with the **warm-up** Set Type, so the read-time Session
Section projection (ADR-0074) shows them as its leading Warm-up Section. When the Session
already opens with a Warm-up Section (curated, generated, hand-authored or added earlier),
the drills *replace* exactly that leading run (#782); nothing after the first Prescription
outside it is touched. The rest of the plan keeps its order and is renumbered contiguously
behind the drills.

The edit is the narrow ADR-0143 exception to Deploy: it is allowed on a standalone *and* a
Protocol-member Session, but only the caller's own Session, only while it is un-performed
(no Logged Session references it, ADR-0020) and only that one Session. Every guard runs
before the single write. Session Provenance, name and regeneration guard are untouched (the
write goes through ``SessionRepository.replace_plan``), so Generation Feedback and
Regeneration stay available."""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.set_type import SetType
from app.domain.warm_up import (
    DRILL_SETS,
    WarmUpDrill,
    drill_load,
    drill_quantity,
    leading_warm_up_length,
)
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.logged_session_repository import LoggedSessionRepository
from app.repositories.prescription_mapping import PrescriptionDraft, draft_from_view
from app.repositories.session_repository import SessionRepository, SessionView
from app.warm_up.errors import SessionNotFound, SessionPerformed, UnknownDrillExercise


def warm_up_prescription(drill: WarmUpDrill) -> PrescriptionDraft:
    """The one-set warm-up Exercise Prescription a drill becomes."""

    quantity = drill_quantity(drill.quantity_kind, drill.amount)
    return PrescriptionDraft(
        exercise_id=drill.exercise_id,
        sets=DRILL_SETS,
        reps=quantity.text,
        rest_seconds=drill.rest_seconds,
        recommended_load=drill_load(drill.load_kind, drill.load_text).to_dict(),
        prescribed_quantity=quantity.to_dict(),
        set_type=SetType.WARM_UP.value,
    )


def apply_warm_up(
    session_id: int,
    clerk_user_id: str,
    drills: Sequence[WarmUpDrill],
    *,
    sessions: SessionRepository,
    logged: LoggedSessionRepository,
    exercises: ExerciseRepository,
) -> SessionView:
    """Put ``drills`` at the front of the owner's un-performed Session, replacing its
    leading Warm-up Section when it has one, and return it (ADR-0143).

    Raises ``SessionNotFound`` for a missing or another user's Session, ``SessionPerformed``
    when any Logged Session references it, and ``UnknownDrillExercise`` for a drill outside
    the catalog — each before anything is written."""

    session = sessions.get(session_id, clerk_user_id)
    if session is None:
        raise SessionNotFound(session_id)
    if logged.count_for_session(clerk_user_id, session_id) > 0:
        raise SessionPerformed(session_id)
    for drill in drills:
        if exercises.get(drill.exercise_id) is None:
            raise UnknownDrillExercise(drill.exercise_id)

    # Replace (#782): the existing leading Warm-up Section, as the Session Section
    # projection reads it (ADR-0074), gives way to the new drills; nothing after it moves.
    kept_from = leading_warm_up_length(session.prescriptions)
    prescriptions = [
        *(warm_up_prescription(drill) for drill in drills),
        *(draft_from_view(item) for item in session.prescriptions[kept_from:]),
    ]
    updated = sessions.replace_plan(
        session_id,
        clerk_user_id,
        training_type=session.training_type,
        duration_minutes=session.duration_minutes,
        prescriptions=prescriptions,
    )
    if updated is None:  # ownership checked above; defensive only
        raise SessionNotFound(session_id)
    return updated


__all__ = ["apply_warm_up", "warm_up_prescription"]
