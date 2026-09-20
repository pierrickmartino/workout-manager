"""The pure exercise-admin audit decision (ADR-0075/0076).

These pin the record-iff-changed rule in isolation — no repository, no routes — the locality
the trail lacked when the before/after compare lived inline in three handlers. A Provenance
change or a Retire flip yields an intent only when the state actually moves; a re-affirmed
value yields ``None``. A hard delete always yields an intent, since a terminal act has no
before/after to compare."""

from __future__ import annotations

from app.domain.exercise_audit import (
    AuditAction,
    audit_hard_delete,
    audit_provenance_change,
    audit_retire_transition,
)


def test_provenance_change_to_a_new_tier_yields_an_intent_with_old_to_new():
    intent = audit_provenance_change(before="ai_generated", after="curated")

    assert intent is not None
    assert intent.action == AuditAction.PROVENANCE_CHANGE
    assert intent.detail == {"from": "ai_generated", "to": "curated"}


def test_reaffirming_the_current_provenance_records_nothing():
    assert audit_provenance_change(before="curated", after="curated") is None


def test_retiring_yields_a_retire_intent_with_empty_detail():
    intent = audit_retire_transition(before_retired=False, after_retired=True)

    assert intent is not None
    assert intent.action == AuditAction.RETIRE
    assert intent.detail == {}


def test_unretiring_yields_an_unretire_intent():
    intent = audit_retire_transition(before_retired=True, after_retired=False)

    assert intent is not None
    assert intent.action == AuditAction.UNRETIRE


def test_a_retire_flip_to_the_current_state_records_nothing():
    assert audit_retire_transition(before_retired=False, after_retired=False) is None
    assert audit_retire_transition(before_retired=True, after_retired=True) is None


def test_hard_delete_always_yields_an_intent_carrying_the_name():
    intent = audit_hard_delete(normalized_name="walking lunge")

    assert intent.action == AuditAction.HARD_DELETE
    assert intent.detail == {"name": "walking lunge"}
