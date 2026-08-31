"""``list_standalone`` — the My Sessions library read (issue #397).

Exercised over both the in-memory fake and the real SQLModel implementation, so the
owner-scoping, the standalone-only (``protocol_id IS NULL``) exclusion, the combined
search + favorites filter, and the newest-first pagination hold on the real SQL path —
not only the in-memory fake the endpoint test wires."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

from app.db.models import ExercisePrescription, Protocol, WorkoutSession
from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)
from app.repositories.session_repository import (
    InMemorySessionRepository,
    PrescriptionDraft,
    SessionDraft,
    SqlSessionRepository,
)


@pytest.fixture(params=["in_memory", "sql"])
def repos(request):
    if request.param == "in_memory":
        exercises = InMemoryExerciseRepository()
        yield InMemorySessionRepository(exercises), exercises
        return
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlSessionRepository(session), SqlExerciseRepository(session)


def _create(
    repo, exercises, user, *, training_type="strength", name=None, favorite=False
) -> int:
    """Create one standalone Session for ``user`` (optionally named/favorited) and return
    its id. ``create`` only ever builds standalone Sessions, exactly what the library lists."""

    squat = exercises.find_or_create("Back Squat", provenance=Provenance.AI_GENERATED)
    view = repo.create(
        user,
        SessionDraft(
            training_type=training_type,
            duration_minutes=45,
            prescriptions=[PrescriptionDraft(exercise_id=squat.id, sets=5, reps="5")],
        ),
    )
    if name is not None:
        repo.set_name(view.id, user, name)
    if favorite:
        repo.set_favorite(view.id, user, True)
    return view.id


def _ids(page):
    return [summary.id for summary in page.items]


def test_lists_only_the_owners_sessions(repos):
    # Arrange — two users each own a standalone Session
    repo, exercises = repos
    mine = _create(repo, exercises, "user_a", name="Mine")
    _create(repo, exercises, "user_b", name="Theirs")

    # Act
    page = repo.list_standalone("user_a", limit=50, offset=0)

    # Assert — only the caller's Session, and the total counts only theirs
    assert _ids(page) == [mine]
    assert page.total == 1


def test_excludes_protocol_member_sessions_in_memory():
    # A Protocol-member Session (seeded directly — ``create`` only builds standalone ones)
    # is never listed by the library.
    exercises = InMemoryExerciseRepository()
    repo = InMemorySessionRepository(exercises)
    standalone = _create(repo, exercises, "user_c", name="Standalone")
    repo._sessions[99] = WorkoutSession(
        id=99,
        clerk_user_id="user_c",
        training_type="strength",
        duration_minutes=60,
        provenance="ai_generated",
        protocol_id=7,
    )

    page = repo.list_standalone("user_c", limit=50, offset=0)

    assert _ids(page) == [standalone]
    assert page.total == 1


def test_excludes_protocol_member_sessions_sql():
    # The same exclusion on the SQL path: the ``protocol_id IS NULL`` filter must leave a
    # Protocol-member Session out. A parent Protocol row is present so the FK holds.
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as sql:
        exercises = SqlExerciseRepository(sql)
        repo = SqlSessionRepository(sql)
        standalone = _create(repo, exercises, "user_d", name="Standalone")
        protocol = Protocol(
            clerk_user_id="user_d",
            training_type="strength",
            objective="hypertrophy",
            sessions_per_week=3,
            weeks=4,
            duration_minutes=60,
        )
        sql.add(protocol)
        sql.commit()
        sql.refresh(protocol)
        member = WorkoutSession(
            clerk_user_id="user_d",
            training_type="strength",
            duration_minutes=60,
            provenance="ai_generated",
            protocol_id=protocol.id,
            week=1,
            day=1,
            position=0,
        )
        sql.add(member)
        sql.commit()

        page = repo.list_standalone("user_d", limit=50, offset=0)

        assert _ids(page) == [standalone]
        assert page.total == 1


def test_blank_query_returns_the_full_list(repos):
    repo, exercises = repos
    _create(repo, exercises, "user_e", name="One")
    _create(repo, exercises, "user_e", name="Two")

    page = repo.list_standalone("user_e", query="   ", limit=50, offset=0)

    assert page.total == 2


def test_search_matches_name_and_type_and_fallback(repos):
    repo, exercises = repos
    named = _create(repo, exercises, "user_f", training_type="strength", name="Leg Day")
    _create(repo, exercises, "user_f", training_type="mobility", name="Stretch")

    # Name match (case-insensitive)
    assert _ids(repo.list_standalone("user_f", query="leg", limit=50, offset=0)) == [
        named
    ]
    # Training-type match
    type_ids = _ids(repo.list_standalone("user_f", query="mobil", limit=50, offset=0))
    assert len(type_ids) == 1
    # Fallback-label (creation date) match of the named Session
    row = next(
        s
        for s in repo.list_standalone("user_f", limit=50, offset=0).items
        if s.id == named
    )
    date = row.created_at.date().isoformat()
    assert named in _ids(
        repo.list_standalone("user_f", query=date, limit=50, offset=0)
    )


def test_favorites_only_and_search_combine(repos):
    repo, exercises = repos
    leg_loved = _create(repo, exercises, "user_g", name="Leg Day", favorite=True)
    _create(repo, exercises, "user_g", name="Leg Mobility", favorite=False)
    _create(repo, exercises, "user_g", name="Push Day", favorite=True)

    # Favorites-only narrows to the two Favorites
    assert repo.list_standalone(
        "user_g", favorites_only=True, limit=50, offset=0
    ).total == 2
    # Combined with the search, only the favorited Session that also matches survives
    combined = repo.list_standalone(
        "user_g", query="leg", favorites_only=True, limit=50, offset=0
    )
    assert _ids(combined) == [leg_loved]


def test_results_are_newest_first_and_pagination_counts_all(repos):
    repo, exercises = repos
    first = _create(repo, exercises, "user_h", name="Older")
    second = _create(repo, exercises, "user_h", name="Middle")
    third = _create(repo, exercises, "user_h", name="Newer")

    page = repo.list_standalone("user_h", limit=2, offset=0)

    # Newest first, sliced to the page size, but total counts every match
    assert _ids(page) == [third, second]
    assert page.total == 3
    # The next page carries the remainder
    assert _ids(repo.list_standalone("user_h", limit=2, offset=2)) == [first]


# --- list_standalone_full: the un-paginated, prescription-joined export read (issue #418) ---


def test_list_standalone_full_returns_owned_sessions_with_prescriptions(repos):
    # The Export read returns every owned standalone Session in full — joined to its
    # ordered Prescriptions, unlike the thin summary the library lists.
    repo, exercises = repos
    mine = _create(repo, exercises, "user_full_a", name="Mine")
    also_mine = _create(repo, exercises, "user_full_a", name="Also mine")
    _create(repo, exercises, "user_full_b", name="Theirs")

    full = repo.list_standalone_full("user_full_a")

    assert {view.id for view in full} == {mine, also_mine}
    assert len(full) == 2
    # Every view carries its joined prescriptions (a summary would not).
    assert all(len(view.prescriptions) == 1 for view in full)
    assert all(
        view.prescriptions[0].exercise_name == "Back Squat" for view in full
    )
    # Another user's Session is never returned.
    assert all(view.clerk_user_id == "user_full_a" for view in full)


def test_list_standalone_full_is_empty_for_a_user_with_no_sessions(repos):
    repo, _ = repos
    assert repo.list_standalone_full("user_full_none") == []


def test_list_standalone_full_excludes_protocol_members_in_memory():
    # A Protocol-member Session (seeded directly — ``create`` only builds standalone
    # ones) is never part of the standalone export list; it rides inside its Protocol.
    exercises = InMemoryExerciseRepository()
    repo = InMemorySessionRepository(exercises)
    standalone = _create(repo, exercises, "user_full_c", name="Standalone")
    repo._sessions[99] = WorkoutSession(
        id=99,
        clerk_user_id="user_full_c",
        training_type="strength",
        duration_minutes=60,
        provenance="ai_generated",
        protocol_id=7,
    )

    full = repo.list_standalone_full("user_full_c")

    assert [view.id for view in full] == [standalone]


def test_list_standalone_full_excludes_protocol_members_sql():
    engine = make_fk_engine()
    SQLModel.metadata.create_all(engine)
    with Session(engine) as sql:
        exercises = SqlExerciseRepository(sql)
        repo = SqlSessionRepository(sql)
        standalone = _create(repo, exercises, "user_full_d", name="Standalone")
        protocol = Protocol(
            clerk_user_id="user_full_d",
            training_type="strength",
            objective="hypertrophy",
            sessions_per_week=3,
            weeks=4,
            duration_minutes=60,
        )
        sql.add(protocol)
        sql.commit()
        sql.refresh(protocol)
        member = WorkoutSession(
            clerk_user_id="user_full_d",
            training_type="strength",
            duration_minutes=60,
            provenance="ai_generated",
            protocol_id=protocol.id,
            week=1,
            day=1,
            position=0,
        )
        sql.add(member)
        sql.commit()

        full = repo.list_standalone_full("user_full_d")

        assert [view.id for view in full] == [standalone]
