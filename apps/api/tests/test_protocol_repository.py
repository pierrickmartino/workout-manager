"""Behavior of the Protocol repository through its public interface, over both the
in-memory fake and the real SQLModel implementation. A Protocol is user-owned and
multi-week; reading it back returns its fully-enumerated Sessions in self-paced
order (by ``position``), each joined to its ordered Exercise Prescriptions and
their catalog Exercises. Reads are owner-scoped — a Protocol is never served to
another user."""

from __future__ import annotations

from dataclasses import replace

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)
from app.repositories.protocol_repository import (
    DeploySessionSpec,
    InMemoryProtocolRepository,
    ProtocolDraft,
    ProtocolSessionDraft,
    ProtocolView,
    SqlProtocolRepository,
)
from app.repositories.session_repository import PrescriptionDraft


def _tail_specs(view: ProtocolView, *, performed: set[int] = frozenset()) -> list:
    """Echo a Protocol's un-performed Sessions as a re-enumerated tail — a no-op
    deploy unless a test edits it. Positions continue after the performed prefix."""

    prefix_len = sum(1 for s in view.sessions if s.session_id in performed)
    specs = []
    for offset, session in enumerate(
        s for s in view.sessions if s.session_id not in performed
    ):
        specs.append(
            DeploySessionSpec(
                position=prefix_len + offset,
                week=session.week,
                day=session.day,
                title=session.title,
                prescriptions=[
                    PrescriptionDraft(
                        exercise_id=p.exercise_id,
                        sets=p.sets,
                        reps=p.reps,
                        rest_seconds=p.rest_seconds,
                        tempo=p.tempo,
                        recommended_load=p.recommended_load,
                    )
                    for p in session.prescriptions
                ],
            )
        )
    return specs


@pytest.fixture(params=["in_memory", "sql"])
def repos(request):
    if request.param == "in_memory":
        exercises = InMemoryExerciseRepository()
        yield InMemoryProtocolRepository(exercises), exercises
        return
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlProtocolRepository(session), SqlExerciseRepository(session)


def _two_week_draft(exercises) -> ProtocolDraft:
    squat = exercises.find_or_create(
        "Back Squat", provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    )
    press = exercises.find_or_create("Overhead Press", provenance=Provenance.AI_GENERATED)
    sessions = []
    for week in (1, 2):
        sessions.append(
            ProtocolSessionDraft(
                week=week,
                day=1,
                title=f"Week {week} Push",
                prescriptions=[
                    PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5"),
                    PrescriptionDraft(exercise_id=press.id, sets=3, reps="8-12"),
                ],
            )
        )
    return ProtocolDraft(
        training_type="strength",
        objective="gain muscle mass",
        sessions_per_week=1,
        weeks=2,
        duration_minutes=45,
        sessions=sessions,
    )


def test_create_persists_a_user_owned_protocol(repos):
    # Arrange
    protocol_repo, exercises = repos

    # Act
    view = protocol_repo.create("user_owner", _two_week_draft(exercises))

    # Assert
    assert view.id is not None
    assert view.clerk_user_id == "user_owner"
    assert view.training_type == "strength"
    assert view.objective == "gain muscle mass"
    assert view.weeks == 2


def test_protocol_enumerates_every_week_in_position_order(repos):
    # Arrange
    protocol_repo, exercises = repos

    # Act
    view = protocol_repo.create("user_weeks", _two_week_draft(exercises))

    # Assert — two distinct weekly Sessions, ordered by position
    assert [s.position for s in view.sessions] == [0, 1]
    assert [s.week for s in view.sessions] == [1, 2]
    assert view.sessions[0].title == "Week 1 Push"


def test_protocol_sessions_carry_their_prescriptions_joined_to_exercises(repos):
    # Arrange
    protocol_repo, exercises = repos

    # Act
    view = protocol_repo.create("user_pres", _two_week_draft(exercises))

    # Assert — each Session reuses the shared catalog Exercises in order
    first = view.sessions[0]
    assert [p.exercise_name for p in first.prescriptions] == [
        "Back Squat",
        "Overhead Press",
    ]
    assert first.prescriptions[0].targeted_muscles == ["quads"]


def test_each_protocol_session_has_a_distinct_underlying_session_id(repos):
    # Arrange — Week-1 and Week-2 are genuinely distinct Sessions (ADR-0001)
    protocol_repo, exercises = repos

    # Act
    view = protocol_repo.create("user_ids", _two_week_draft(exercises))

    # Assert
    ids = [s.session_id for s in view.sessions]
    assert len(set(ids)) == len(ids)


def test_get_returns_the_protocol_for_its_owner(repos):
    # Arrange
    protocol_repo, exercises = repos
    created = protocol_repo.create("user_a", _two_week_draft(exercises))

    # Act
    fetched = protocol_repo.get(created.id, "user_a")

    # Assert
    assert fetched is not None
    assert fetched.id == created.id
    assert len(fetched.sessions) == 2


def test_get_does_not_leak_another_users_protocol(repos):
    # Arrange
    protocol_repo, exercises = repos
    created = protocol_repo.create("user_owner", _two_week_draft(exercises))

    # Act
    fetched = protocol_repo.get(created.id, "user_intruder")

    # Assert
    assert fetched is None


def test_get_returns_none_for_an_unknown_protocol(repos):
    # Arrange
    protocol_repo, _ = repos

    # Assert
    assert protocol_repo.get(987654, "user_any") is None


def test_list_for_user_orders_protocols_most_recently_adopted_first(repos):
    # Arrange — the same user adopts two Protocols in sequence
    protocol_repo, exercises = repos
    first = protocol_repo.create("user_seq", _two_week_draft(exercises))
    second = protocol_repo.create("user_seq", _two_week_draft(exercises))

    # Act
    listed = protocol_repo.list_for_user("user_seq")

    # Assert — the most-recently-adopted Protocol comes first
    assert [p.id for p in listed] == [second.id, first.id]


def test_list_for_user_never_returns_another_users_protocols(repos):
    # Arrange — two users each own a Protocol
    protocol_repo, exercises = repos
    mine = protocol_repo.create("user_mine", _two_week_draft(exercises))
    protocol_repo.create("user_other", _two_week_draft(exercises))

    # Act
    listed = protocol_repo.list_for_user("user_mine")

    # Assert — only the owner's Protocol is returned
    assert [p.id for p in listed] == [mine.id]


def test_list_for_user_is_empty_when_the_user_owns_no_protocol(repos):
    # Arrange
    protocol_repo, _ = repos

    # Assert
    assert protocol_repo.list_for_user("user_none") == []


def test_a_freshly_adopted_protocol_has_no_name(repos):
    # Arrange / Act — a Protocol is born unnamed (F4 Slice 5); the derived label
    # covers the display until the user sets one.
    protocol_repo, exercises = repos
    view = protocol_repo.create("user_unnamed", _two_week_draft(exercises))

    # Assert
    assert view.name is None


def test_create_persists_an_explicit_name(repos):
    # Arrange — a draft carrying a name
    protocol_repo, exercises = repos
    draft = _two_week_draft(exercises)
    named = replace(draft, name="Summer Cut")

    # Act
    view = protocol_repo.create("user_named", named)

    # Assert — the name is stored and read back
    assert view.name == "Summer Cut"
    assert protocol_repo.get(view.id, "user_named").name == "Summer Cut"


def test_deploy_tail_sets_the_protocol_name(repos):
    # Arrange — an unnamed Protocol
    protocol_repo, exercises = repos
    created = protocol_repo.create("user_deploy", _two_week_draft(exercises))
    assert created.name is None

    # Act — a deploy carries the name through the same tail-replace write (ADR-0020)
    updated = protocol_repo.deploy_tail(
        created.id,
        "user_deploy",
        performed_session_ids=set(),
        tail=_tail_specs(created),
        weeks=created.weeks,
        sessions_per_week=created.sessions_per_week,
        name="My Plan",
    )

    # Assert — the name persists alongside the (unchanged) tail
    assert updated.name == "My Plan"
    assert protocol_repo.get(created.id, "user_deploy").name == "My Plan"


def test_deploy_tail_can_clear_the_protocol_name(repos):
    # Arrange — a named Protocol
    protocol_repo, exercises = repos
    created = protocol_repo.create(
        "user_clear", replace(_two_week_draft(exercises), name="Old Name")
    )

    # Act — the user clears the name (falls back to the derived label)
    updated = protocol_repo.deploy_tail(
        created.id,
        "user_clear",
        performed_session_ids=set(),
        tail=_tail_specs(created),
        weeks=created.weeks,
        sessions_per_week=created.sessions_per_week,
        name=None,
    )

    # Assert
    assert updated.name is None
    assert protocol_repo.get(created.id, "user_clear").name is None


def test_deploy_tail_adds_a_new_session_and_reshapes_the_week_count(repos):
    # Arrange — a two-week Protocol, nothing performed
    protocol_repo, exercises = repos
    created = protocol_repo.create("user_grow", _two_week_draft(exercises))
    squat_id = created.sessions[0].prescriptions[0].exercise_id

    # Act — append a third Session (a new week) and grow the shape to 3 weeks
    specs = _tail_specs(created)
    specs.append(
        DeploySessionSpec(
            position=len(specs),
            week=3,
            day=1,
            title=None,
            prescriptions=[PrescriptionDraft(exercise_id=squat_id, sets=3, reps="5")],
        )
    )
    updated = protocol_repo.deploy_tail(
        created.id,
        "user_grow",
        performed_session_ids=set(),
        tail=specs,
        weeks=3,
        sessions_per_week=1,
    )

    # Assert — the Protocol now has three Sessions in contiguous positions and weeks=3
    assert updated.weeks == 3
    assert [s.position for s in updated.sessions] == [0, 1, 2]
    assert [s.week for s in updated.sessions] == [1, 2, 3]


def test_deploy_tail_removes_an_un_performed_session(repos):
    # Arrange — a two-week Protocol
    protocol_repo, exercises = repos
    created = protocol_repo.create("user_trim", _two_week_draft(exercises))

    # Act — deploy only the first Session (drop the second), shrinking to one week
    specs = _tail_specs(created)[:1]
    updated = protocol_repo.deploy_tail(
        created.id,
        "user_trim",
        performed_session_ids=set(),
        tail=specs,
        weeks=1,
        sessions_per_week=1,
    )

    # Assert — the dropped Session (and its Prescriptions) is gone
    assert len(updated.sessions) == 1
    assert updated.sessions[0].position == 0


def test_deploy_tail_leaves_a_performed_session_untouched(repos):
    # Arrange — a two-week Protocol; treat Session 1 as performed (frozen)
    protocol_repo, exercises = repos
    created = protocol_repo.create("user_freeze", _two_week_draft(exercises))
    frozen = created.sessions[0]
    performed = {frozen.session_id}

    # Act — redeploy only the un-performed tail (Session 2), edited
    specs = _tail_specs(created, performed=performed)
    specs[0] = replace(
        specs[0],
        prescriptions=[
            PrescriptionDraft(
                exercise_id=frozen.prescriptions[0].exercise_id, sets=9, reps="3"
            )
        ],
    )
    updated = protocol_repo.deploy_tail(
        created.id,
        "user_freeze",
        performed_session_ids=performed,
        tail=specs,
        weeks=2,
        sessions_per_week=1,
    )

    # Assert — Session 1 keeps its id, position, and original Prescriptions
    assert updated.sessions[0].session_id == frozen.session_id
    assert updated.sessions[0].position == 0
    assert updated.sessions[0].prescriptions == frozen.prescriptions
    # …and the edited tail landed at position 1
    assert updated.sessions[1].position == 1
    assert updated.sessions[1].prescriptions[0].sets == 9
