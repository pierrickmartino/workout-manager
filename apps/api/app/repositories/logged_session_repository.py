"""Repository for Logged Sessions and their Logged Sets — the *record* side.

Writes take a ``LoggedSessionDraft`` (the performed Session id and date plus an
ordered list of ``LoggedSetDraft``, each referencing a catalog Exercise by id).
Reads return a ``LoggedSessionView`` — the logged session joined to its ordered
sets (each with its Exercise's name) and its own denormalized training type
(ADR-0031) — so consumers never touch the ORM. Reads are scoped to the owning user, and
``list_for_user`` returns the user's history newest-first. SQLModel-backed and
in-memory implementations honor the same contract."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Protocol

from sqlmodel import Session, select

from app.db.models import Exercise, LoggedSession, LoggedSet
from app.repositories.exercise_repository import ExerciseRepository
from app.repositories.session_repository import SessionRepository


@dataclass(frozen=True)
class LoggedSetDraft:
    """One actual set to record, referencing the catalog Exercise performed.

    ``quantity`` is the typed amount axis (ADR-0032) — the ``{kind, text, ...payload}``
    Quantity that replaces the old bare ``reps`` int. ``body_weight_kg`` is the Performed
    Body Weight (ADR-0026) — the performer's mass snapshotted onto the set at the write
    boundary, or ``None`` when no weight is on file (never guessed). Both are raw record
    data, like ``load``."""

    exercise_id: int
    quantity: dict | None = None
    load: dict | None = None
    perceived_difficulty: int | None = None
    # Logged Effort (ADR-0066): the typed ``{scale, value}`` Effort the user actually felt,
    # in either scale (RPE or RIR). New writes dual-write — the log boundary populates this
    # and mirrors an RPE value into ``perceived_difficulty`` above — so the progression gate
    # and any legacy reader both keep working. ``None`` when no effort was recorded.
    effort: dict | None = None
    body_weight_kg: float | None = None
    # Set Type annotation (ADR-0065, #449): the ``SetType`` value tagging what this set
    # *was* (e.g. ``"warm_up"``), or ``None`` for "unset" — which reads as ``working``.
    # Raw record data like ``load``; descriptive only in v1 (feeds no analytics yet) and
    # editable through Log Correction like any other Logged Set field.
    set_type: str | None = None


@dataclass(frozen=True)
class LoggedSessionDraft:
    """A performance to record: which Session (if any), on what date, and the sets done.

    ``session_id`` is the prescribing Session, or ``None`` for a plan-less record
    (ADR-0031). ``training_type`` is always populated on a written record — the service
    copies it from the Session for a plan-backed log and takes it from the request for a
    plan-less one; it defaults to ``""`` only so the many existing test drafts need not
    restate it, never on the production path.

    ``completion_outcome`` is the client-declared Completion Outcome (ADR-0013) —
    ``"completed"`` | ``"incomplete"``, or ``None`` when the record does not declare
    one (e.g. a log-after-the-fact through the static form). ``duration_seconds`` is
    the recorded Session Duration (ADR-0014) — actual training time in whole seconds,
    or ``None`` when unrecorded (the static form measures none).

    ``idempotency_key`` is the client-minted key that makes the write duplicate-proof
    (ADR-0060): a retried finish resends the *same* key, and ``create`` upsert-returns the
    existing record instead of inserting a second one. ``None`` (the default) is a keyless
    write — the static form path — which always inserts, never dedupes."""

    session_id: int | None
    performed_on: date
    training_type: str = ""
    completion_outcome: str | None = None
    duration_seconds: int | None = None
    idempotency_key: str | None = None
    logged_sets: list[LoggedSetDraft] = field(default_factory=list)


@dataclass(frozen=True)
class LoggedSetView:
    """A logged set joined to its catalog Exercise, ready to serialize.

    ``quantity`` is the typed amount axis (ADR-0032); its ``repetitions`` accessor gives
    the rep count the strength/volume read paths read through, or ``None`` for a
    distance or duration amount."""

    position: int
    quantity: dict | None
    load: dict | None
    perceived_difficulty: int | None
    exercise_id: int
    exercise_name: str
    # Logged Effort (ADR-0066): the stored typed ``{scale, value}`` Effort, or ``None`` when
    # none was recorded (a returning user's set falls back to ``perceived_difficulty`` read as
    # RPE). Surfaced on the read so the response echoes the effort in the scale it was logged,
    # and so the progression overlay reads the typed value off this view.
    effort: dict | None = None
    # Performed Body Weight (ADR-0026), carried through so later slices can score a
    # bodyweight set against the mass performed at; ``None`` when none was captured.
    body_weight_kg: float | None = None
    # Set Type annotation (ADR-0065, #449): the stored ``SetType`` value, or ``None`` for
    # "unset" — which the web view-model resolves to no badge (a neutral working set).
    # Surfaced on the read so the logged-session response carries the tag to the client.
    set_type: str | None = None
    # The performed Exercise's free-form targeted muscles, denormalized onto the
    # view so read models (e.g. the Analytics muscle distribution) never touch the
    # ORM — mirrors how ``exercise_name`` is carried here.
    targeted_muscles: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class LoggedSessionView:
    """A Logged Session with its ordered sets and its own training type (ADR-0031).

    ``session_id`` is ``None`` for a plan-less record; ``training_type`` is read off the
    record itself, not joined from a parent Session that may not exist."""

    id: int
    clerk_user_id: str
    session_id: int | None
    training_type: str
    performed_on: date
    logged_sets: list[LoggedSetView]
    # The client-declared Completion Outcome (ADR-0013), or ``None`` when undeclared.
    completion_outcome: str | None = None
    # The recorded Session Duration in whole seconds (ADR-0014), or ``None`` when
    # the performance was not live-tracked and measured no duration.
    duration_seconds: int | None = None


class LoggedSessionRepository(Protocol):
    def create(
        self, clerk_user_id: str, draft: LoggedSessionDraft
    ) -> LoggedSessionView:
        """Persist ``draft`` as a Logged Session owned by ``clerk_user_id`` and
        return it joined to its sets and the prescribing Session's training type.

        Upsert-return on the idempotency key (ADR-0060): when ``draft.idempotency_key``
        is a key this owner has already recorded, return that existing record unchanged
        and insert nothing, so a retried finish yields exactly one Logged Session. A
        keyless draft (``idempotency_key is None``) always inserts a fresh record."""
        ...

    def get(
        self, logged_session_id: int, clerk_user_id: str
    ) -> LoggedSessionView | None:
        """Return the owner's Logged Session by id, or ``None`` if it is missing or
        owned by another user."""
        ...

    def update(
        self, logged_session_id: int, clerk_user_id: str, draft: LoggedSessionDraft
    ) -> LoggedSessionView | None:
        """Apply a Log Correction (ADR-0034): replace the owner's Logged Session's
        editable fields (training type, ``performed_on``, Completion Outcome,
        ``duration_seconds``) and its *entire* set list in place, returning the
        updated view. Returns ``None`` when the record is missing or owned by another
        user. ``session_id`` is immutable — the draft's is ignored, the record keeps
        its own — so a correction can never re-parent a performance."""
        ...

    def delete(self, logged_session_id: int, clerk_user_id: str) -> bool:
        """Apply a Log Correction delete (ADR-0034): remove the owner's Logged Session
        and its Logged Sets. Returns ``True`` when a record was deleted, ``False`` when
        it is missing or owned by another user. Owner-scoped, cascading its sets."""
        ...

    def list_for_user(self, clerk_user_id: str) -> list[LoggedSessionView]:
        """Return the user's Logged Sessions, most recently performed first."""
        ...

    def count_for_session(self, clerk_user_id: str, session_id: int) -> int:
        """The **Logged Count** for one Session (ADR-0063, CONTEXT: Logged Count).

        How many Logged Sessions the owner has recorded against ``session_id`` — counted
        across **every Completion Outcome** (an Incomplete performance is still logged
        training), a read-time projection over the record, never a stored counter. Owner-
        scoped, so another user's performances of the same Session never leak in. This is
        the fact the Delete guard reads: a Session is deletable iff this is zero."""
        ...

    def count_by_session(self, clerk_user_id: str) -> dict[int, int]:
        """The owner's **Logged Count** per Session, in one read (ADR-0063).

        Maps each ``session_id`` the user has performed to how many Logged Sessions they
        recorded against it, so the My Sessions list can badge every row without an N+1
        per-Session count. Plan-less records (``session_id`` is ``None``) carry no Session
        and are excluded; a Session the user has never performed is simply absent from the
        map (the caller reads it as zero)."""
        ...


def _set_view(logged_set: LoggedSet, exercise: Exercise) -> LoggedSetView:
    return LoggedSetView(
        position=logged_set.position,
        quantity=logged_set.quantity,
        load=logged_set.load,
        perceived_difficulty=logged_set.perceived_difficulty,
        exercise_id=exercise.id,
        exercise_name=exercise.name,
        effort=logged_set.effort,
        body_weight_kg=logged_set.body_weight_kg,
        set_type=logged_set.set_type,
        targeted_muscles=list(exercise.targeted_muscles),
    )


class SqlLoggedSessionRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def _view(self, logged: LoggedSession) -> LoggedSessionView:
        sets = self._session.exec(
            select(LoggedSet)
            .where(LoggedSet.logged_session_id == logged.id)
            .order_by(LoggedSet.position)
        ).all()
        views = [_set_view(s, self._session.get(Exercise, s.exercise_id)) for s in sets]
        return LoggedSessionView(
            id=logged.id,
            clerk_user_id=logged.clerk_user_id,
            session_id=logged.session_id,
            training_type=logged.training_type,
            performed_on=logged.performed_on,
            logged_sets=views,
            completion_outcome=logged.completion_outcome,
            duration_seconds=logged.duration_seconds,
        )

    def _existing_by_key(
        self, clerk_user_id: str, idempotency_key: str | None
    ) -> LoggedSession | None:
        """The owner's record already carrying ``idempotency_key`` (ADR-0060), or ``None``.

        Owner-scoped so a retry only ever resolves to the caller's own finish; a keyless
        write (``None``) matches nothing, so it always inserts."""
        if idempotency_key is None:
            return None
        return self._session.exec(
            select(LoggedSession).where(
                LoggedSession.clerk_user_id == clerk_user_id,
                LoggedSession.idempotency_key == idempotency_key,
            )
        ).first()

    def create(
        self, clerk_user_id: str, draft: LoggedSessionDraft
    ) -> LoggedSessionView:
        # Upsert-return (ADR-0060): a repeat of an already-recorded finish returns the
        # existing record and inserts nothing, so a retry never duplicates.
        existing = self._existing_by_key(clerk_user_id, draft.idempotency_key)
        if existing is not None:
            return self._view(existing)

        logged = LoggedSession(
            clerk_user_id=clerk_user_id,
            idempotency_key=draft.idempotency_key,
            session_id=draft.session_id,
            training_type=draft.training_type,
            performed_on=draft.performed_on,
            completion_outcome=draft.completion_outcome,
            duration_seconds=draft.duration_seconds,
        )
        self._session.add(logged)
        self._session.commit()
        self._session.refresh(logged)

        for position, logged_set in enumerate(draft.logged_sets):
            self._session.add(
                LoggedSet(
                    logged_session_id=logged.id,
                    exercise_id=logged_set.exercise_id,
                    position=position,
                    quantity=logged_set.quantity,
                    load=logged_set.load,
                    perceived_difficulty=logged_set.perceived_difficulty,
                    effort=logged_set.effort,
                    body_weight_kg=logged_set.body_weight_kg,
                    set_type=logged_set.set_type,
                )
            )
        self._session.commit()
        return self._view(logged)

    def get(
        self, logged_session_id: int, clerk_user_id: str
    ) -> LoggedSessionView | None:
        logged = self._session.get(LoggedSession, logged_session_id)
        if logged is None or logged.clerk_user_id != clerk_user_id:
            return None
        return self._view(logged)

    def update(
        self, logged_session_id: int, clerk_user_id: str, draft: LoggedSessionDraft
    ) -> LoggedSessionView | None:
        logged = self._session.get(LoggedSession, logged_session_id)
        if logged is None or logged.clerk_user_id != clerk_user_id:
            return None

        # session_id is immutable (ADR-0034): keep the record's own, ignore the draft's.
        logged.training_type = draft.training_type
        logged.performed_on = draft.performed_on
        logged.completion_outcome = draft.completion_outcome
        logged.duration_seconds = draft.duration_seconds
        self._session.add(logged)

        # Full-replace the set list: drop the record's existing sets, then re-insert.
        existing = self._session.exec(
            select(LoggedSet).where(LoggedSet.logged_session_id == logged.id)
        ).all()
        for stale in existing:
            self._session.delete(stale)
        for position, logged_set in enumerate(draft.logged_sets):
            self._session.add(
                LoggedSet(
                    logged_session_id=logged.id,
                    exercise_id=logged_set.exercise_id,
                    position=position,
                    quantity=logged_set.quantity,
                    load=logged_set.load,
                    perceived_difficulty=logged_set.perceived_difficulty,
                    effort=logged_set.effort,
                    body_weight_kg=logged_set.body_weight_kg,
                    set_type=logged_set.set_type,
                )
            )
        self._session.commit()
        self._session.refresh(logged)
        return self._view(logged)

    def delete(self, logged_session_id: int, clerk_user_id: str) -> bool:
        logged = self._session.get(LoggedSession, logged_session_id)
        if logged is None or logged.clerk_user_id != clerk_user_id:
            return False

        # Cascade the Logged Sets, then the record itself, in one transaction. The FK
        # ``logged_set.logged_session_id -> logged_session.id`` has no ORM relationship, so
        # the unit-of-work has no dependency edge forcing child-before-parent delete
        # ordering; without the explicit ``flush`` below it may emit the parent DELETE
        # first and a FK-enforcing database (Postgres) rejects it. Flushing the child
        # deletes sends them ahead of the parent's within the same transaction.
        sets = self._session.exec(
            select(LoggedSet).where(LoggedSet.logged_session_id == logged.id)
        ).all()
        for logged_set in sets:
            self._session.delete(logged_set)
        self._session.flush()
        self._session.delete(logged)
        self._session.commit()
        return True

    def list_for_user(self, clerk_user_id: str) -> list[LoggedSessionView]:
        rows = self._session.exec(
            select(LoggedSession)
            .where(LoggedSession.clerk_user_id == clerk_user_id)
            .order_by(LoggedSession.performed_on.desc(), LoggedSession.id.desc())
        ).all()
        return [self._view(logged) for logged in rows]

    def count_for_session(self, clerk_user_id: str, session_id: int) -> int:
        rows = self._session.exec(
            select(LoggedSession.id).where(
                LoggedSession.clerk_user_id == clerk_user_id,
                LoggedSession.session_id == session_id,
            )
        ).all()
        return len(rows)

    def count_by_session(self, clerk_user_id: str) -> dict[int, int]:
        rows = self._session.exec(
            select(LoggedSession.session_id).where(
                LoggedSession.clerk_user_id == clerk_user_id,
                LoggedSession.session_id.is_not(None),
            )
        ).all()
        counts: dict[int, int] = {}
        for session_id in rows:
            counts[session_id] = counts.get(session_id, 0) + 1
        return counts


class InMemoryLoggedSessionRepository:
    def __init__(
        self, sessions: SessionRepository, exercises: ExerciseRepository
    ) -> None:
        # ``sessions`` is retained for call-site symmetry with the SQL repo's wiring;
        # training type is now read off the record (ADR-0031), so it is no longer
        # consulted to resolve one — only ``exercises`` is needed, to name logged sets.
        self._exercises = exercises
        self._logged: dict[int, LoggedSession] = {}
        self._sets: dict[int, list[LoggedSet]] = {}
        self._next_id = 1

    def _view(self, logged: LoggedSession) -> LoggedSessionView:
        sets = self._sets.get(logged.id, [])
        views = [
            _set_view(s, self._exercises.get(s.exercise_id))
            for s in sorted(sets, key=lambda s: s.position)
        ]
        return LoggedSessionView(
            id=logged.id,
            clerk_user_id=logged.clerk_user_id,
            session_id=logged.session_id,
            training_type=logged.training_type,
            performed_on=logged.performed_on,
            logged_sets=views,
            completion_outcome=logged.completion_outcome,
            duration_seconds=logged.duration_seconds,
        )

    def _existing_by_key(
        self, clerk_user_id: str, idempotency_key: str | None
    ) -> LoggedSession | None:
        """The owner's record already carrying ``idempotency_key`` (ADR-0060), or ``None``.

        Owner-scoped like the SQL repo; a keyless write (``None``) matches nothing."""
        if idempotency_key is None:
            return None
        for logged in self._logged.values():
            if (
                logged.clerk_user_id == clerk_user_id
                and logged.idempotency_key == idempotency_key
            ):
                return logged
        return None

    def create(
        self, clerk_user_id: str, draft: LoggedSessionDraft
    ) -> LoggedSessionView:
        # Upsert-return (ADR-0060): a repeat of an already-recorded finish returns the
        # existing record and inserts nothing, so a retry never duplicates.
        existing = self._existing_by_key(clerk_user_id, draft.idempotency_key)
        if existing is not None:
            return self._view(existing)

        logged = LoggedSession(
            id=self._next_id,
            clerk_user_id=clerk_user_id,
            idempotency_key=draft.idempotency_key,
            session_id=draft.session_id,
            training_type=draft.training_type,
            performed_on=draft.performed_on,
            completion_outcome=draft.completion_outcome,
            duration_seconds=draft.duration_seconds,
        )
        self._next_id += 1
        self._logged[logged.id] = logged
        self._sets[logged.id] = [
            LoggedSet(
                id=position + 1,
                logged_session_id=logged.id,
                exercise_id=logged_set.exercise_id,
                position=position,
                quantity=logged_set.quantity,
                load=logged_set.load,
                perceived_difficulty=logged_set.perceived_difficulty,
                effort=logged_set.effort,
                body_weight_kg=logged_set.body_weight_kg,
                set_type=logged_set.set_type,
            )
            for position, logged_set in enumerate(draft.logged_sets)
        ]
        return self._view(logged)

    def get(
        self, logged_session_id: int, clerk_user_id: str
    ) -> LoggedSessionView | None:
        logged = self._logged.get(logged_session_id)
        if logged is None or logged.clerk_user_id != clerk_user_id:
            return None
        return self._view(logged)

    def update(
        self, logged_session_id: int, clerk_user_id: str, draft: LoggedSessionDraft
    ) -> LoggedSessionView | None:
        logged = self._logged.get(logged_session_id)
        if logged is None or logged.clerk_user_id != clerk_user_id:
            return None

        # session_id is immutable (ADR-0034): keep the record's own, ignore the draft's.
        logged.training_type = draft.training_type
        logged.performed_on = draft.performed_on
        logged.completion_outcome = draft.completion_outcome
        logged.duration_seconds = draft.duration_seconds

        # Full-replace the set list wholesale.
        self._sets[logged.id] = [
            LoggedSet(
                id=position + 1,
                logged_session_id=logged.id,
                exercise_id=logged_set.exercise_id,
                position=position,
                quantity=logged_set.quantity,
                load=logged_set.load,
                perceived_difficulty=logged_set.perceived_difficulty,
                effort=logged_set.effort,
                body_weight_kg=logged_set.body_weight_kg,
                set_type=logged_set.set_type,
            )
            for position, logged_set in enumerate(draft.logged_sets)
        ]
        return self._view(logged)

    def delete(self, logged_session_id: int, clerk_user_id: str) -> bool:
        logged = self._logged.get(logged_session_id)
        if logged is None or logged.clerk_user_id != clerk_user_id:
            return False
        del self._logged[logged_session_id]
        self._sets.pop(logged_session_id, None)
        return True

    def list_for_user(self, clerk_user_id: str) -> list[LoggedSessionView]:
        owned = [
            logged
            for logged in self._logged.values()
            if logged.clerk_user_id == clerk_user_id
        ]
        owned.sort(key=lambda logged: (logged.performed_on, logged.id), reverse=True)
        return [self._view(logged) for logged in owned]

    def count_for_session(self, clerk_user_id: str, session_id: int) -> int:
        return sum(
            1
            for logged in self._logged.values()
            if logged.clerk_user_id == clerk_user_id
            and logged.session_id == session_id
        )

    def count_by_session(self, clerk_user_id: str) -> dict[int, int]:
        counts: dict[int, int] = {}
        for logged in self._logged.values():
            if logged.clerk_user_id != clerk_user_id or logged.session_id is None:
                continue
            counts[logged.session_id] = counts.get(logged.session_id, 0) + 1
        return counts


__all__ = [
    "LoggedSetDraft",
    "LoggedSessionDraft",
    "LoggedSetView",
    "LoggedSessionView",
    "LoggedSessionRepository",
    "SqlLoggedSessionRepository",
    "InMemoryLoggedSessionRepository",
]
