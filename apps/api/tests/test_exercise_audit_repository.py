"""The append-only admin audit-trail repository (issue #503, ADR-0075/0076).

Pins the contract both the SQLModel-backed and in-memory implementations honor: a recorded
act comes back with its actor / action / detail / timestamp; ``list_for`` is scoped to one
Exercise and ordered newest-first; and the trail is append-only — recording never rewrites a
prior row. The two implementations run through the same parametrized cases so they never
drift."""

from __future__ import annotations

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.db.models import ExerciseAdminAudit  # noqa: F401 - ensure table is registered
from app.domain.exercise_audit import AuditAction
from app.repositories.exercise_audit_repository import (
    InMemoryExerciseAuditRepository,
    SqlExerciseAuditRepository,
)


@pytest.fixture()
def sql_repo():
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield SqlExerciseAuditRepository(session)


@pytest.fixture()
def memory_repo():
    return InMemoryExerciseAuditRepository()


@pytest.fixture(params=["sql", "memory"])
def repo(request, sql_repo, memory_repo):
    return sql_repo if request.param == "sql" else memory_repo


def test_record_persists_the_act_and_list_for_reads_it_back(repo):
    repo.record(
        exercise_id=42,
        actor="user_admin",
        action=AuditAction.PROVENANCE_CHANGE,
        detail={"from": "ai_generated", "to": "curated"},
    )

    rows = repo.list_for(42)

    assert len(rows) == 1
    row = rows[0]
    assert row.exercise_id == 42
    assert row.actor == "user_admin"
    assert row.action == AuditAction.PROVENANCE_CHANGE.value
    assert row.detail == {"from": "ai_generated", "to": "curated"}
    assert row.created_at is not None


def test_list_for_is_scoped_to_one_exercise(repo):
    repo.record(
        exercise_id=1,
        actor="user_admin",
        action=AuditAction.PROVENANCE_CHANGE,
        detail={"from": "ai_generated", "to": "curated"},
    )
    repo.record(
        exercise_id=2,
        actor="user_admin",
        action=AuditAction.PROVENANCE_CHANGE,
        detail={"from": "curated", "to": "ai_generated"},
    )

    rows = repo.list_for(1)

    assert [row.exercise_id for row in rows] == [1]


def test_list_for_returns_newest_first(repo):
    repo.record(
        exercise_id=9,
        actor="user_admin",
        action=AuditAction.PROVENANCE_CHANGE,
        detail={"from": "user_entered", "to": "ai_generated"},
    )
    repo.record(
        exercise_id=9,
        actor="user_admin",
        action=AuditAction.PROVENANCE_CHANGE,
        detail={"from": "ai_generated", "to": "curated"},
    )

    rows = repo.list_for(9)

    # Newest first: the second act (→ curated) leads.
    assert [row.detail["to"] for row in rows] == ["curated", "ai_generated"]


def test_list_for_an_exercise_with_no_acts_is_empty(repo):
    assert repo.list_for(999) == []


def test_record_is_append_only(repo):
    repo.record(
        exercise_id=5,
        actor="user_admin",
        action=AuditAction.PROVENANCE_CHANGE,
        detail={"from": "ai_generated", "to": "curated"},
    )
    repo.record(
        exercise_id=5,
        actor="user_other",
        action=AuditAction.PROVENANCE_CHANGE,
        detail={"from": "curated", "to": "ai_generated"},
    )

    rows = repo.list_for(5)

    # Both acts survive; the first is never overwritten by the second.
    assert len(rows) == 2
    assert {row.actor for row in rows} == {"user_admin", "user_other"}
