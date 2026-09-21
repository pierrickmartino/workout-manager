"""The AuditTrail seam: record-iff-changed wiring over the append-only repository.

Where ``test_exercise_audit`` pins the pure decision, these pin the composition — that a no-op
decision writes *zero* rows and a real change writes *one*, that the Retire direction reaches
the stored row's action, and that a hard delete always records with the deleted name. Run
against the in-memory audit repository, so the whole seam is exercised offline through its own
interface — no routes, no database."""

from __future__ import annotations

from app.domain.exercise_audit import AuditAction
from app.repositories.exercise_audit_repository import (
    InMemoryExerciseAuditRepository,
)
from app.repositories.exercise_audit_trail import AuditTrail


def _trail():
    repository = InMemoryExerciseAuditRepository()
    return AuditTrail(repository), repository


def test_a_real_provenance_change_appends_one_row():
    trail, repository = _trail()

    record = trail.record_provenance_change(
        1, "user_curator", before="ai_generated", after="curated"
    )

    assert record is not None
    assert record.actor == "user_curator"
    rows = repository.list_for(1)
    assert len(rows) == 1
    assert rows[0].action == AuditAction.PROVENANCE_CHANGE.value
    assert rows[0].detail == {"from": "ai_generated", "to": "curated"}


def test_reaffirming_provenance_appends_nothing():
    trail, repository = _trail()

    record = trail.record_provenance_change(
        1, "user_curator", before="curated", after="curated"
    )

    assert record is None
    assert repository.list_for(1) == []


def test_retire_then_unretire_records_both_directions():
    trail, repository = _trail()

    trail.record_retire_transition(
        1, "user_admin", before_retired=False, after_retired=True
    )
    trail.record_retire_transition(
        1, "user_admin", before_retired=True, after_retired=False
    )

    actions = [row.action for row in repository.list_for(1)]
    # The repository lists newest first: un-retire, then retire.
    assert actions == [AuditAction.UNRETIRE.value, AuditAction.RETIRE.value]


def test_a_no_op_retire_flip_appends_nothing():
    trail, repository = _trail()

    assert (
        trail.record_retire_transition(
            1, "user_admin", before_retired=True, after_retired=True
        )
        is None
    )
    assert repository.list_for(1) == []


def test_hard_delete_always_records_with_the_name():
    trail, repository = _trail()

    record = trail.record_delete(7, "user_admin", normalized_name="walking lunge")

    assert record.action == AuditAction.HARD_DELETE.value
    assert record.detail == {"name": "walking lunge"}
    assert len(repository.list_for(7)) == 1
