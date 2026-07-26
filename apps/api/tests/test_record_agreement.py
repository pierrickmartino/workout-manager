"""Cross-surface agreement: a Personal Record means the same thing on every surface.

Personal Records, the Analytics feed, the Exercise Detail header and the **First Record**
Achievement are all read-time projections of the same Logged Sets (ADR-0010/0018), so they
must agree — a set that surfaces as a Personal Record is exactly the set that unlocks the
milestone, and a set that qualifies for neither leaves both empty.

They did not agree. ``logbook/records`` flattened Logged Sets carrying the Performed Body
Weight (ADR-0026) while ``domain/achievements`` re-inlined the same comprehension without
it, so a bodyweight Personal Record showed on Home while the badge stayed locked. These
tests assert the *invariant* rather than either implementation, so they keep holding if the
read models are re-shaped again (ADR-0029).

Exercised through the in-memory Logged-Session repository so the real ``LoggedSessionView``
flows down both paths — offline, no ORM."""

from __future__ import annotations

from tests.quantities import reps_quantity

from datetime import date

from app.domain.achievements import Achievement, evaluate_achievements
from app.domain.exercise import Provenance
from app.domain.load import LoadKind, ParsedLoad
from app.logbook.records import latest_personal_record
from app.repositories.exercise_repository import InMemoryExerciseRepository
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    SessionDraft,
)

PULL_UP = 1
TODAY = date(2026, 7, 19)
PERFORMED_BODY_WEIGHT = 75.0
USER = "user_agreement"


def _bodyweight(added_kg: float | None = None) -> dict:
    """The stored typed-Load dict for a bodyweight movement, optionally weighted."""

    text = "bodyweight" if added_kg is None else f"bodyweight + {added_kg:g} kg"
    return ParsedLoad(kind=LoadKind.BODYWEIGHT, text=text, added_kg=added_kg).to_dict()


def _absolute(kg: float) -> dict:
    """The stored typed-Load dict for an absolute kilogram load."""

    return ParsedLoad(kind=LoadKind.ABSOLUTE, text=f"{kg:g} kg", kg=kg).to_dict()


def _history(*logged_sets: LoggedSetDraft):
    """One Logged Session holding ``logged_sets``, read back as the repository view."""

    exercises = InMemoryExerciseRepository()
    exercises.find_or_create(
        "Pull-Up", provenance=Provenance.CURATED, targeted_muscles=["lats"]
    )
    sessions = InMemorySessionRepository(exercises)
    logged = InMemoryLoggedSessionRepository(sessions, exercises)
    session_view = sessions.create(
        USER,
        SessionDraft(training_type="strength", duration_minutes=40, prescriptions=[]),
    )
    logged.create(
        USER,
        LoggedSessionDraft(
            session_id=session_view.id,
            performed_on=TODAY,
            logged_sets=list(logged_sets),
        ),
    )
    return logged.list_for_user(USER)


def _first_record(history) -> Achievement:
    """The First Record milestone evaluated over ``history``."""

    return next(a for a in evaluate_achievements(history) if a.id == "first-pr")


def test_a_bodyweight_personal_record_also_unlocks_the_first_record_milestone():
    # Arrange — one bodyweight set carrying the Performed Body Weight it was done at,
    # in the trustworthy rep window: enough to resolve an Estimated 1RM (ADR-0026).
    history = _history(
        LoggedSetDraft(
            exercise_id=PULL_UP,
            quantity=reps_quantity(5),
            load=_bodyweight(),
            body_weight_kg=PERFORMED_BODY_WEIGHT,
        )
    )

    # Act
    record = latest_personal_record(history)
    milestone = _first_record(history)

    # Assert — the surfaces agree: the set that is a Personal Record unlocks the badge
    assert record is not None
    assert record.is_bodyweight is True
    assert milestone.unlocked is True
    assert milestone.current == 1
    assert milestone.unlocked_on == record.performed_on


def test_an_absolute_personal_record_also_unlocks_the_first_record_milestone():
    # Arrange — the long-standing absolute-load path, guarded against regression
    history = _history(
        LoggedSetDraft(exercise_id=PULL_UP, quantity=reps_quantity(5), load=_absolute(100.0))
    )

    # Act
    record = latest_personal_record(history)
    milestone = _first_record(history)

    # Assert
    assert record is not None
    assert record.is_bodyweight is False
    assert milestone.unlocked is True


def test_a_bodyweight_set_with_no_performed_body_weight_unlocks_neither():
    # Arrange — no mass on file, so the set scores against nothing and is never guessed
    history = _history(
        LoggedSetDraft(exercise_id=PULL_UP, quantity=reps_quantity(5), load=_bodyweight())
    )

    # Act
    record = latest_personal_record(history)
    milestone = _first_record(history)

    # Assert — the surfaces agree on *absence* too: no fabricated record, no badge
    assert record is None
    assert milestone.unlocked is False
    assert milestone.current == 0


def test_a_qualitative_history_unlocks_neither():
    # Arrange — a qualitative Load carries no comparable figure on either surface
    qualitative = ParsedLoad(kind=LoadKind.QUALITATIVE, text="moderate").to_dict()
    history = _history(
        LoggedSetDraft(
            exercise_id=PULL_UP,
            quantity=reps_quantity(5),
            load=qualitative,
            body_weight_kg=PERFORMED_BODY_WEIGHT,
        )
    )

    # Act / Assert
    assert latest_personal_record(history) is None
    assert _first_record(history).unlocked is False
