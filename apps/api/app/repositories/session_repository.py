"""Repository for user-owned WorkoutSessions and their Exercise Prescriptions.

Writes take a ``SessionDraft`` (the training parameters plus an ordered list of
``PrescriptionDraft``, each referencing a catalog Exercise by id). Reads return a
``SessionView`` — the session joined to its ordered prescriptions and each
prescription's catalog Exercise — so consumers never touch the ORM. Reads are
scoped to the owning user: a Session belongs to one user and is never served to
another. SQLModel-backed and in-memory implementations honor the same contract."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from typing import Protocol

from sqlmodel import Session, select

from app.db.models import Exercise, ExercisePrescription, WorkoutSession
from app.domain.superset import MIN_SUPERSET_MEMBERS
from app.repositories.exercise_repository import ExerciseRepository


@dataclass(frozen=True)
class PrescriptionDraft:
    """One Exercise Prescription to persist, referencing a catalog Exercise.

    ``superset_group``/``round_rest_seconds`` overlay Supersets (ADR-0023): both
    ``None`` for a flat, solo Prescription; members of one Superset share the group
    tag and carry the group-owned round-rest denormalized onto each member."""

    exercise_id: int
    sets: int
    reps: str
    rest_seconds: int | None = None
    tempo: str | None = None
    recommended_load: dict | None = None
    # Typed Prescribed Quantity (ADR-0050): a stored ``Quantity`` dict, ``None`` for a
    # prescription that carries no typed amount yet. Additive and carried through create,
    # Duplicate, and Regeneration so a backfilled cardio target survives a copy.
    prescribed_quantity: dict | None = None
    superset_group: str | None = None
    round_rest_seconds: int | None = None


@dataclass(frozen=True)
class SessionDraft:
    """A standalone Session to persist: parameters plus ordered prescriptions."""

    training_type: str
    duration_minutes: int
    prescriptions: list[PrescriptionDraft] = field(default_factory=list)
    # Session Provenance (ADR-0040): how this plan came to exist — ``ai_generated``
    # (the generation pipeline) or ``user_authored`` (a Hand-Authored Session, built by
    # hand with no AI). Defaults to ``ai_generated`` so every existing generation path is
    # unchanged; the Hand-Authored create path stamps ``user_authored``. See
    # ``app.domain.session_provenance.SessionProvenance``.
    provenance: str = "ai_generated"
    # Operational AI-usage lineage (ADR-0039, #274): the trace id of the Generation
    # Call that produced this standalone Session, stamped at creation. ``None`` when no
    # monitoring backend was configured.
    trace_id: str | None = None


@dataclass(frozen=True)
class PrescriptionView:
    """A prescription joined to its catalog Exercise, ready to serialize."""

    position: int
    sets: int
    reps: str
    rest_seconds: int | None
    tempo: str | None
    recommended_load: dict | None
    # Typed Prescribed Quantity (ADR-0050): the stored ``Quantity`` dict, ``None`` when the
    # prescription has no typed amount. Surfaced on the read so the session-detail response
    # carries it to the web client.
    prescribed_quantity: dict | None
    superset_group: str | None
    round_rest_seconds: int | None
    exercise_id: int
    exercise_name: str
    exercise_description: str | None
    targeted_muscles: list[str]
    required_equipment: list[str]
    provenance: str


@dataclass(frozen=True)
class SessionView:
    """A standalone Session with its ordered, exercise-joined prescriptions."""

    id: int
    clerk_user_id: str
    training_type: str
    duration_minutes: int
    prescriptions: list[PrescriptionView]
    has_been_regenerated: bool = False
    # Session Provenance (ADR-0040): ``ai_generated`` | ``user_authored``. Defaults to
    # ``ai_generated`` — every path that builds a Session today is AI. See
    # ``app.domain.session_provenance.SessionProvenance``.
    provenance: str = "ai_generated"
    # Whether this Session belongs to a Protocol (it carries a ``protocol_id``) rather
    # than standing alone. The Session view uses it to withhold the Duplicate control on a
    # Protocol member — lifting one workout out of a plan the user is working through has
    # no value there (Q2); Duplicate stays on standalone Sessions and the endpoint is
    # unchanged. A read-time fact off the linkage, never a stored flag.
    is_protocol_member: bool = False


class SessionRepository(Protocol):
    def create(self, clerk_user_id: str, draft: SessionDraft) -> SessionView:
        """Persist ``draft`` as a Session owned by ``clerk_user_id`` and return
        the stored Session joined to its prescriptions and exercises."""
        ...

    def get(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        """Return the owner's Session by id, or ``None`` if it is missing or
        owned by another user."""
        ...

    def duplicate(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        """Deep-copy the owner's Session into a new **standalone** Session (Duplicate,
        ADR-0043).

        Carries the source's training parameters, Session Provenance, ``trace_id``
        lineage, and name (``title``) verbatim, plus every Exercise Prescription with
        its sets/reps/rest/tempo/Load and Superset grouping — but **no Logged Sessions**
        and **no Protocol position** (``protocol_id``/week/day/position are dropped), so
        the copy stands alone. The copy is a distinct Session with a **fresh regeneration
        budget** (``has_been_regenerated`` starts ``False``). The source is read, never
        mutated. Returns the new Session, or ``None`` if the source is missing or owned
        by another user — Duplicate only ever copies the owner's own plan."""
        ...

    def trace_id(self, session_id: int, clerk_user_id: str) -> str | None:
        """Return the owner's Session's AI-usage trace-id lineage (ADR-0039, #274).

        Operator-only, deliberately kept off ``SessionView`` so it never reaches the
        PWA; the seam a later Generation-Feedback push reads. ``None`` when the Session
        is missing/unowned or carries no trace id."""
        ...

    def regenerate(
        self,
        session_id: int,
        clerk_user_id: str,
        *,
        keep_positions: Sequence[int],
        replacements: list[PrescriptionDraft],
        trace_id: str | None = None,
    ) -> SessionView | None:
        """Replace the owner's Session prescriptions, keeping those at
        ``keep_positions`` (in their original order) and appending ``replacements``
        after them, then re-number positions and mark the Session regenerated.

        ``trace_id`` re-stamps the Session with the regeneration call's lineage
        (ADR-0039, #274), so post-regeneration feedback maps to the regeneration rather
        than the superseded call. Returns the updated Session, or ``None`` if it is
        missing or owned by another user — regeneration only ever mutates the owner's
        own copy.
        """
        ...

    def substitute_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
        new_exercise_id: int,
    ) -> SessionView | None:
        """Swap the Exercise referenced by the prescription at ``position`` for
        ``new_exercise_id``, leaving the sets/reps/rest/tempo/load and every other
        prescription untouched.

        This is the Substitution write: it is unlimited and never sets the
        regeneration guard (distinct from Regeneration). Returns the updated
        Session, or ``None`` if the Session is missing/unowned or has no
        prescription at ``position`` — it only ever mutates the owner's own copy.
        """
        ...

    def append_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        prescription: PrescriptionDraft,
    ) -> SessionView | None:
        """Append one Exercise Prescription at the end of the owner's Session (Insert,
        ADR-0051).

        The prescription lands after every existing one, at the next position; nothing
        else is touched — existing prescriptions keep their order, and the Session's
        Provenance and regeneration guard are left exactly as they were (a hand-added
        movement is an edit, not a re-origination). Returns the updated Session, or
        ``None`` if it is missing or owned by another user — Insert only ever edits the
        owner's own copy. The standalone-only and validation guards live in the service.
        """
        ...

    def remove_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
    ) -> SessionView | None:
        """Withdraw the Exercise Prescription at ``position`` from the owner's Session
        (Remove, ADR-0052).

        The surviving prescriptions are re-numbered into a contiguous ``0..n-1`` run, and
        any Superset group left with a single survivor is dissolved to a valid solo
        prescription (its ``superset_group``/``round_rest_seconds`` cleared) — a lone
        tagged member is not a Superset (ADR-0023). The Session's Provenance and
        regeneration guard are left exactly as they were (removing a movement is an edit,
        not a re-origination). Returns the updated Session, or ``None`` if the Session is
        missing/unowned or has no prescription at ``position`` — Remove only ever edits
        the owner's own copy. The standalone-only and empty-guard live in the service.
        """
        ...


def _draft_from(prescription: ExercisePrescription) -> PrescriptionDraft:
    return PrescriptionDraft(
        exercise_id=prescription.exercise_id,
        sets=prescription.sets,
        reps=prescription.reps,
        rest_seconds=prescription.rest_seconds,
        tempo=prescription.tempo,
        recommended_load=prescription.recommended_load,
        prescribed_quantity=prescription.prescribed_quantity,
        superset_group=prescription.superset_group,
        round_rest_seconds=prescription.round_rest_seconds,
    )


def _regenerated_drafts(
    current: list[ExercisePrescription],
    keep_positions: Sequence[int],
    replacements: list[PrescriptionDraft],
) -> list[PrescriptionDraft]:
    """Kept prescriptions (original order) followed by the replacements."""

    keep = set(keep_positions)
    kept = [
        _draft_from(p)
        for p in sorted(current, key=lambda p: p.position)
        if p.position in keep
    ]
    return kept + list(replacements)


def _removed_drafts(
    current: list[ExercisePrescription], position: int
) -> list[PrescriptionDraft]:
    """Surviving prescriptions after removing the one at ``position`` (Remove, ADR-0052),
    ordered by position with any Superset group left with a single survivor dissolved to
    a solo prescription. ``_add_prescriptions`` re-numbers the result to a contiguous
    ``0..n-1`` run on write, so a removed middle position leaves no gap."""

    survivors = [
        p for p in sorted(current, key=lambda p: p.position) if p.position != position
    ]
    group_counts: dict[str, int] = {}
    for prescription in survivors:
        if prescription.superset_group is not None:
            group_counts[prescription.superset_group] = (
                group_counts.get(prescription.superset_group, 0) + 1
            )

    drafts: list[PrescriptionDraft] = []
    for prescription in survivors:
        draft = _draft_from(prescription)
        # A group left with a single survivor is no longer a Superset (ADR-0023): dissolve
        # it to a valid solo prescription rather than persist a lone tagged member (Q5).
        if (
            prescription.superset_group is not None
            and group_counts[prescription.superset_group] < MIN_SUPERSET_MEMBERS
        ):
            draft = replace(draft, superset_group=None, round_rest_seconds=None)
        drafts.append(draft)
    return drafts


def _prescription_model(
    session_id: int, position: int, draft: PrescriptionDraft
) -> ExercisePrescription:
    """Build one persistable prescription row at ``position`` from a draft — the single
    field mapping shared by the full-list create and the single-row Insert append."""

    return ExercisePrescription(
        session_id=session_id,
        exercise_id=draft.exercise_id,
        position=position,
        sets=draft.sets,
        reps=draft.reps,
        rest_seconds=draft.rest_seconds,
        tempo=draft.tempo,
        recommended_load=draft.recommended_load,
        prescribed_quantity=draft.prescribed_quantity,
        superset_group=draft.superset_group,
        round_rest_seconds=draft.round_rest_seconds,
    )


def _prescription_view(
    prescription: ExercisePrescription, exercise: Exercise
) -> PrescriptionView:
    return PrescriptionView(
        position=prescription.position,
        sets=prescription.sets,
        reps=prescription.reps,
        rest_seconds=prescription.rest_seconds,
        tempo=prescription.tempo,
        recommended_load=prescription.recommended_load,
        prescribed_quantity=prescription.prescribed_quantity,
        superset_group=prescription.superset_group,
        round_rest_seconds=prescription.round_rest_seconds,
        exercise_id=exercise.id,
        exercise_name=exercise.name,
        exercise_description=exercise.description,
        targeted_muscles=list(exercise.targeted_muscles),
        required_equipment=list(exercise.required_equipment),
        provenance=exercise.provenance,
    )


class SqlSessionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _view(self, workout: WorkoutSession) -> SessionView:
        prescriptions = self._session.exec(
            select(ExercisePrescription)
            .where(ExercisePrescription.session_id == workout.id)
            .order_by(ExercisePrescription.position)
        ).all()
        views = [
            _prescription_view(p, self._session.get(Exercise, p.exercise_id))
            for p in prescriptions
        ]
        return SessionView(
            id=workout.id,
            clerk_user_id=workout.clerk_user_id,
            training_type=workout.training_type,
            duration_minutes=workout.duration_minutes,
            prescriptions=views,
            has_been_regenerated=workout.has_been_regenerated,
            provenance=workout.provenance,
            is_protocol_member=workout.protocol_id is not None,
        )

    def _add_prescriptions(
        self, session_id: int, prescriptions: list[PrescriptionDraft]
    ) -> None:
        for position, prescription in enumerate(prescriptions):
            self._session.add(
                _prescription_model(session_id, position, prescription)
            )

    def create(self, clerk_user_id: str, draft: SessionDraft) -> SessionView:
        workout = WorkoutSession(
            clerk_user_id=clerk_user_id,
            training_type=draft.training_type,
            duration_minutes=draft.duration_minutes,
            provenance=draft.provenance,
            trace_id=draft.trace_id,
        )
        self._session.add(workout)
        self._session.commit()
        self._session.refresh(workout)

        self._add_prescriptions(workout.id, draft.prescriptions)
        self._session.commit()
        return self._view(workout)

    def get(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None
        return self._view(workout)

    def duplicate(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        source = self._session.get(WorkoutSession, session_id)
        if source is None or source.clerk_user_id != clerk_user_id:
            return None

        prescriptions = self._session.exec(
            select(ExercisePrescription)
            .where(ExercisePrescription.session_id == session_id)
            .order_by(ExercisePrescription.position)
        ).all()

        # A standalone copy: Provenance, lineage and name carried verbatim; Protocol
        # linkage and the regeneration guard deliberately not copied (ADR-0043).
        copy = WorkoutSession(
            clerk_user_id=clerk_user_id,
            training_type=source.training_type,
            duration_minutes=source.duration_minutes,
            provenance=source.provenance,
            trace_id=source.trace_id,
            title=source.title,
        )
        self._session.add(copy)
        self._session.commit()
        self._session.refresh(copy)

        self._add_prescriptions(copy.id, [_draft_from(p) for p in prescriptions])
        self._session.commit()
        return self._view(copy)

    def trace_id(self, session_id: int, clerk_user_id: str) -> str | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None
        return workout.trace_id

    def regenerate(
        self,
        session_id: int,
        clerk_user_id: str,
        *,
        keep_positions: Sequence[int],
        replacements: list[PrescriptionDraft],
        trace_id: str | None = None,
    ) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._session.exec(
            select(ExercisePrescription).where(
                ExercisePrescription.session_id == session_id
            )
        ).all()
        new_drafts = _regenerated_drafts(list(current), keep_positions, replacements)

        for prescription in current:
            self._session.delete(prescription)
        self._session.commit()

        self._add_prescriptions(session_id, new_drafts)
        workout.has_been_regenerated = True
        # Re-stamp the Session's lineage with the regeneration call (#274).
        workout.trace_id = trace_id
        self._session.add(workout)
        self._session.commit()
        self._session.refresh(workout)
        return self._view(workout)

    def substitute_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
        new_exercise_id: int,
    ) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        prescription = self._session.exec(
            select(ExercisePrescription).where(
                ExercisePrescription.session_id == session_id,
                ExercisePrescription.position == position,
            )
        ).first()
        if prescription is None:
            return None

        prescription.exercise_id = new_exercise_id
        self._session.add(prescription)
        self._session.commit()
        return self._view(workout)

    def append_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        prescription: PrescriptionDraft,
    ) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._session.exec(
            select(ExercisePrescription).where(
                ExercisePrescription.session_id == session_id
            )
        ).all()
        next_position = max((p.position for p in current), default=-1) + 1
        self._session.add(
            _prescription_model(session_id, next_position, prescription)
        )
        self._session.commit()
        return self._view(workout)

    def remove_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
    ) -> SessionView | None:
        workout = self._session.get(WorkoutSession, session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._session.exec(
            select(ExercisePrescription).where(
                ExercisePrescription.session_id == session_id
            )
        ).all()
        if not any(p.position == position for p in current):
            return None

        # Compute the survivors (dissolving any lone Superset member) before touching the
        # rows, then rewrite the list — the same delete-all/re-add shape ``regenerate``
        # uses, so ``_add_prescriptions`` re-numbers the survivors to a contiguous run.
        survivors = _removed_drafts(list(current), position)
        for prescription in current:
            self._session.delete(prescription)
        self._session.commit()

        self._add_prescriptions(session_id, survivors)
        self._session.commit()
        return self._view(workout)


class InMemorySessionRepository:
    def __init__(self, exercises: ExerciseRepository) -> None:
        self._exercises = exercises
        self._sessions: dict[int, WorkoutSession] = {}
        self._prescriptions: dict[int, list[ExercisePrescription]] = {}
        self._next_id = 1

    def _view(self, workout: WorkoutSession) -> SessionView:
        prescriptions = self._prescriptions.get(workout.id, [])
        views = [
            _prescription_view(p, self._exercises.get(p.exercise_id))
            for p in sorted(prescriptions, key=lambda p: p.position)
        ]
        return SessionView(
            id=workout.id,
            clerk_user_id=workout.clerk_user_id,
            training_type=workout.training_type,
            duration_minutes=workout.duration_minutes,
            prescriptions=views,
            has_been_regenerated=workout.has_been_regenerated,
            provenance=workout.provenance,
            is_protocol_member=workout.protocol_id is not None,
        )

    def _materialize(
        self, session_id: int, prescriptions: list[PrescriptionDraft]
    ) -> list[ExercisePrescription]:
        return [
            ExercisePrescription(
                id=position + 1,
                session_id=session_id,
                exercise_id=prescription.exercise_id,
                position=position,
                sets=prescription.sets,
                reps=prescription.reps,
                rest_seconds=prescription.rest_seconds,
                tempo=prescription.tempo,
                recommended_load=prescription.recommended_load,
                prescribed_quantity=prescription.prescribed_quantity,
                superset_group=prescription.superset_group,
                round_rest_seconds=prescription.round_rest_seconds,
            )
            for position, prescription in enumerate(prescriptions)
        ]

    def create(self, clerk_user_id: str, draft: SessionDraft) -> SessionView:
        workout = WorkoutSession(
            id=self._next_id,
            clerk_user_id=clerk_user_id,
            training_type=draft.training_type,
            duration_minutes=draft.duration_minutes,
            provenance=draft.provenance,
            trace_id=draft.trace_id,
        )
        self._next_id += 1
        self._sessions[workout.id] = workout
        self._prescriptions[workout.id] = self._materialize(
            workout.id, draft.prescriptions
        )
        return self._view(workout)

    def get(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None
        return self._view(workout)

    def duplicate(self, session_id: int, clerk_user_id: str) -> SessionView | None:
        source = self._sessions.get(session_id)
        if source is None or source.clerk_user_id != clerk_user_id:
            return None

        prescriptions = sorted(
            self._prescriptions.get(session_id, []), key=lambda p: p.position
        )
        # A standalone copy: Provenance, lineage and name carried verbatim; Protocol
        # linkage and the regeneration guard deliberately not copied (ADR-0043).
        copy = WorkoutSession(
            id=self._next_id,
            clerk_user_id=clerk_user_id,
            training_type=source.training_type,
            duration_minutes=source.duration_minutes,
            provenance=source.provenance,
            trace_id=source.trace_id,
            title=source.title,
        )
        self._next_id += 1
        self._sessions[copy.id] = copy
        self._prescriptions[copy.id] = self._materialize(
            copy.id, [_draft_from(p) for p in prescriptions]
        )
        return self._view(copy)

    def trace_id(self, session_id: int, clerk_user_id: str) -> str | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None
        return workout.trace_id

    def regenerate(
        self,
        session_id: int,
        clerk_user_id: str,
        *,
        keep_positions: Sequence[int],
        replacements: list[PrescriptionDraft],
        trace_id: str | None = None,
    ) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._prescriptions.get(session_id, [])
        new_drafts = _regenerated_drafts(current, keep_positions, replacements)
        self._prescriptions[session_id] = self._materialize(session_id, new_drafts)
        workout.has_been_regenerated = True
        # Re-stamp the Session's lineage with the regeneration call (#274).
        workout.trace_id = trace_id
        return self._view(workout)

    def substitute_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
        new_exercise_id: int,
    ) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._prescriptions.get(session_id, [])
        if not any(p.position == position for p in current):
            return None

        # Rebuild the list with only the targeted prescription's Exercise swapped;
        # everything else (sets/reps/load) and the regeneration guard are preserved.
        self._prescriptions[session_id] = [
            ExercisePrescription(
                id=p.id,
                session_id=p.session_id,
                exercise_id=new_exercise_id if p.position == position else p.exercise_id,
                position=p.position,
                sets=p.sets,
                reps=p.reps,
                rest_seconds=p.rest_seconds,
                tempo=p.tempo,
                recommended_load=p.recommended_load,
                prescribed_quantity=p.prescribed_quantity,
                superset_group=p.superset_group,
                round_rest_seconds=p.round_rest_seconds,
            )
            for p in current
        ]
        return self._view(workout)

    def append_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        prescription: PrescriptionDraft,
    ) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._prescriptions.get(session_id, [])
        next_position = max((p.position for p in current), default=-1) + 1
        appended = _prescription_model(session_id, next_position, prescription)
        appended.id = len(current) + 1
        self._prescriptions[session_id] = [*current, appended]
        return self._view(workout)

    def remove_prescription(
        self,
        session_id: int,
        clerk_user_id: str,
        position: int,
    ) -> SessionView | None:
        workout = self._sessions.get(session_id)
        if workout is None or workout.clerk_user_id != clerk_user_id:
            return None

        current = self._prescriptions.get(session_id, [])
        if not any(p.position == position for p in current):
            return None

        # Rebuild the list from the survivors (with any lone Superset member dissolved);
        # ``_materialize`` re-numbers them to a contiguous ``0..n-1`` run.
        survivors = _removed_drafts(current, position)
        self._prescriptions[session_id] = self._materialize(session_id, survivors)
        return self._view(workout)


__all__ = [
    "PrescriptionDraft",
    "SessionDraft",
    "PrescriptionView",
    "SessionView",
    "SessionRepository",
    "SqlSessionRepository",
    "InMemorySessionRepository",
]
