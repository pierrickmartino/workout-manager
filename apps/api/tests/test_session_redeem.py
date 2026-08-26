"""Redeem: the cross-user deep-copy of a shared Session into a new one the redeemer owns
(ADR-0057). The copy keeps the source's prescriptions, Supersets, Session Provenance,
trace_id lineage and Session Name verbatim, **preserves the Author** as the original
creator, transfers **ownership** to the redeemer, and carries no records and no Protocol
position — so it stands alone with a fresh regeneration budget. The source is read, never
mutated; the two copies are thereafter independent.

Exercised through the repository's public interface over both the in-memory fake and the
real SQLModel implementation (the cross-user read/copy seam), plus ``get_shared`` — the
one deliberately un-owner-scoped read the preview path uses.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date

import pytest
from sqlmodel import Session, SQLModel
from tests.conftest import make_fk_engine

from app.db.models import WorkoutSession
from app.domain.exercise import Provenance
from app.repositories.exercise_repository import (
    InMemoryExerciseRepository,
    SqlExerciseRepository,
)
from app.repositories.logged_session_repository import (
    InMemoryLoggedSessionRepository,
    LoggedSessionDraft,
    LoggedSetDraft,
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


def _draft(exercises) -> SessionDraft:
    squat = exercises.find_or_create(
        "Back Squat", provenance=Provenance.AI_GENERATED, targeted_muscles=["quads"]
    )
    press = exercises.find_or_create("Overhead Press", provenance=Provenance.AI_GENERATED)
    return SessionDraft(
        training_type="strength",
        duration_minutes=45,
        prescriptions=[
            PrescriptionDraft(
                exercise_id=squat.id,
                sets=5,
                reps="5",
                rest_seconds=120,
                tempo="3-1-1",
                recommended_load="70% 1RM",
                superset_group="A",
                round_rest_seconds=90,
            ),
            PrescriptionDraft(
                exercise_id=press.id,
                sets=3,
                reps="8-12",
                superset_group="A",
                round_rest_seconds=90,
            ),
        ],
    )


def test_redeem_copies_prescriptions_faithfully_in_order(repos):
    session_repo, exercises = repos
    source = session_repo.create("sharer", _draft(exercises))

    copy = session_repo.redeem(source.id, "recipient")

    assert copy is not None
    assert [p.exercise_name for p in copy.prescriptions] == [
        "Back Squat",
        "Overhead Press",
    ]
    first = copy.prescriptions[0]
    assert first.sets == 5 and first.reps == "5"
    assert first.rest_seconds == 120 and first.tempo == "3-1-1"
    assert first.recommended_load == "70% 1RM"
    # Supersets copied full-fidelity (ADR-0057 reuses Duplicate's deep-copy).
    assert [p.superset_group for p in copy.prescriptions] == ["A", "A"]
    assert [p.round_rest_seconds for p in copy.prescriptions] == [90, 90]
    assert [p.position for p in copy.prescriptions] == [0, 1]


def test_redeem_transfers_ownership_to_the_redeemer(repos):
    session_repo, exercises = repos
    source = session_repo.create("sharer", _draft(exercises))

    copy = session_repo.redeem(source.id, "recipient")

    # The recipient owns the copy; the sharer cannot see it, the recipient cannot see the source.
    assert copy.clerk_user_id == "recipient"
    assert session_repo.get(copy.id, "recipient") is not None
    assert session_repo.get(copy.id, "sharer") is None
    assert session_repo.get(source.id, "recipient") is None


def test_redeem_preserves_the_author(repos):
    # The source Author is the sharer (created it); after Redeem the copy still credits them,
    # never the recipient — Author is immutable origin (ADR-0057: Author diverges from Owner).
    session_repo, exercises = repos
    source = session_repo.create("sharer", _draft(exercises))

    copy = session_repo.redeem(source.id, "recipient")

    assert copy.author_clerk_user_id == "sharer"
    assert copy.author_clerk_user_id != copy.clerk_user_id


def test_redeem_carries_the_session_name_verbatim(repos):
    session_repo, exercises = repos
    source = session_repo.create("sharer", _draft(exercises))
    session_repo.set_name(source.id, "sharer", "Sharer's Leg Day")

    copy = session_repo.redeem(source.id, "recipient")

    assert copy.name == "Sharer's Leg Day"


def test_redeem_carries_provenance_and_trace_id(repos):
    session_repo, exercises = repos
    source = session_repo.create(
        "sharer", replace(_draft(exercises), trace_id="trace-orig")
    )

    copy = session_repo.redeem(source.id, "recipient")

    assert copy.provenance == "ai_generated"
    assert session_repo.trace_id(copy.id, "recipient") == "trace-orig"


def test_redeem_of_user_authored_stays_user_authored(repos):
    session_repo, exercises = repos
    source = session_repo.create(
        "sharer", replace(_draft(exercises), provenance="user_authored")
    )

    copy = session_repo.redeem(source.id, "recipient")

    assert copy.provenance == "user_authored"


def test_redeem_starts_un_favorited_for_the_new_owner(repos):
    # Favorite is per-owner and per-copy: a redeemed copy has no marker (CONTEXT: Favorite).
    session_repo, exercises = repos
    source = session_repo.create("sharer", _draft(exercises))
    session_repo.set_favorite(source.id, "sharer", True)

    copy = session_repo.redeem(source.id, "recipient")

    assert copy.is_favorite is False


def test_redeem_starts_with_a_fresh_regeneration_budget(repos):
    session_repo, exercises = repos
    source = session_repo.create("sharer", _draft(exercises))

    copy = session_repo.redeem(source.id, "recipient")

    assert copy.has_been_regenerated is False


def test_redeem_carries_no_logged_sessions(repos):
    # Redeem copies the plan, never the record: the copy is born with an empty logbook.
    session_repo, exercises = repos
    source = session_repo.create("sharer", _draft(exercises))
    logs = InMemoryLoggedSessionRepository(session_repo, exercises)
    squat_id = source.prescriptions[0].exercise_id
    logs.create(
        "sharer",
        LoggedSessionDraft(
            session_id=source.id,
            performed_on=date(2026, 8, 1),
            training_type="strength",
            logged_sets=[LoggedSetDraft(exercise_id=squat_id)],
        ),
    )

    copy = session_repo.redeem(source.id, "recipient")

    # No Logged Session for the recipient at all (the sharer's log is not copied or transferred).
    assert logs.list_for_user("recipient") == []


def test_each_redeem_is_a_fresh_distinct_copy(repos):
    # Redeeming twice yields distinct copies (CONTEXT: Share Link — each Redeem one fresh copy).
    session_repo, exercises = repos
    source = session_repo.create("sharer", _draft(exercises))

    first = session_repo.redeem(source.id, "recipient")
    second = session_repo.redeem(source.id, "recipient")

    assert first.id != second.id
    assert session_repo.get(first.id, "recipient") is not None
    assert session_repo.get(second.id, "recipient") is not None


def test_redeeming_ones_own_link_yields_a_distinct_copy(repos):
    # A user may redeem their own link; the copy is a distinct Session, like a Duplicate.
    session_repo, exercises = repos
    source = session_repo.create("sharer", _draft(exercises))

    copy = session_repo.redeem(source.id, "sharer")

    assert copy.id != source.id
    assert copy.clerk_user_id == "sharer"


def test_redeem_reflects_the_redeem_time_state_of_the_source(repos):
    # The copy is taken at redeem time, so a pre-redeem edit by the sharer flows through
    # (ADR-0057) — but a copy already taken is independent of later edits.
    session_repo, exercises = repos
    source = session_repo.create("sharer", _draft(exercises))

    before = session_repo.redeem(source.id, "recipient")
    # The sharer removes a movement, then a second redeem is taken.
    session_repo.remove_prescription(source.id, "sharer", 1)
    after = session_repo.redeem(source.id, "recipient")

    assert len(before.prescriptions) == 2  # the earlier copy is untouched by the later edit
    assert len(after.prescriptions) == 1  # the later copy reflects the redeem-time source


def test_redeem_leaves_the_source_untouched(repos):
    session_repo, exercises = repos
    source = session_repo.create("sharer", _draft(exercises))

    session_repo.redeem(source.id, "recipient")

    refetched = session_repo.get(source.id, "sharer")
    assert [p.exercise_name for p in refetched.prescriptions] == [
        "Back Squat",
        "Overhead Press",
    ]


def test_redeem_returns_none_for_an_unknown_source(repos):
    session_repo, _ = repos
    assert session_repo.redeem(987654, "recipient") is None


def test_get_shared_reads_any_owners_session(repos):
    # The un-owner-scoped preview read: a non-owner resolves the plan (name/type/author),
    # where the owner-scoped ``get`` would refuse them (ADR-0057).
    session_repo, exercises = repos
    source = session_repo.create("sharer", _draft(exercises))

    shared = session_repo.get_shared(source.id)

    assert shared is not None
    assert shared.training_type == "strength"
    assert shared.author_clerk_user_id == "sharer"
    assert session_repo.get(source.id, "recipient") is None  # owner-scoped read still refuses


def test_get_shared_is_none_for_an_unknown_session(repos):
    session_repo, _ = repos
    assert session_repo.get_shared(987654) is None
