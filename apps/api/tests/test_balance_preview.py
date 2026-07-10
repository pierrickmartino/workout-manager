"""Behavior of the Balance Preview module (F4 Builder, Slice 6 — Module C, ADR-0021).

``SIMULATE`` is an **honest, non-predictive** preview of the plan the user has built:
per-week Session/Set counts and the Muscle-Group distribution across the whole edited
Protocol. There is deliberately no fatigue/recovery/volume-projection or 1RM model —
the domain has no honest basis for one — so this module only *counts* and *rolls up*.

The muscle split reuses the curated six-bucket roll-up from ``domain/muscle_groups.py``
(the same one Analytics uses): set-count weighted, each Set split evenly across its
Exercise's distinct groups, percentages summing to 100 with an explicit Unclassified
bucket. Since a draft Prescription references a catalog Exercise only by id, the caller
injects a ``resolve_muscles`` lookup (id → its ``targeted_muscles``) — the module stays
pure, with no catalog import. Prior art: ``test_muscle_groups.py`` (plain stubs, no
mocks)."""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.muscle_groups import MuscleGroup
from app.protocols.balance_preview import build_balance_preview
from app.protocols.deploy_validation import (
    DeployDraft,
    DraftPrescription,
    DraftSession,
)


def _muscles_from(catalog: dict[int, list[str]]):
    """A ``resolve_muscles`` backed by a plain dict; an unknown id trains nothing
    known (empty), mirroring an Exercise with no recorded ``targeted_muscles``."""

    def resolve(exercise_id: int) -> Sequence[str]:
        return catalog.get(exercise_id, [])

    return resolve


def _prescription(exercise_id: int, sets: int) -> DraftPrescription:
    return DraftPrescription(exercise_id=exercise_id, sets=sets, reps="8-12")


def test_per_week_counts_sum_sessions_and_sets_within_each_week():
    # Arrange — week 1 has two Sessions (3+2 and 4 sets), week 2 has one (5 sets)
    draft = DeployDraft(
        weeks=2,
        sessions_per_week=2,
        sessions=[
            DraftSession(
                session_id=1,
                week=1,
                day=1,
                prescriptions=[_prescription(10, 3), _prescription(11, 2)],
            ),
            DraftSession(
                session_id=2,
                week=1,
                day=2,
                prescriptions=[_prescription(12, 4)],
            ),
            DraftSession(
                session_id=3,
                week=2,
                day=1,
                prescriptions=[_prescription(13, 5)],
            ),
        ],
    )

    # Act
    preview = build_balance_preview(draft, resolve_muscles=_muscles_from({}))

    # Assert — one row per week, with session and set totals rolled up
    assert [(w.week, w.session_count, w.set_count) for w in preview.weeks] == [
        (1, 2, 9),
        (2, 1, 5),
    ]


def test_muscle_distribution_is_set_count_weighted_across_the_whole_plan():
    # Arrange — 3 sets of a Legs lift and 1 set of a Chest lift, across two weeks:
    # 3/4 of the Set weight is Legs, 1/4 is Chest.
    draft = DeployDraft(
        weeks=2,
        sessions_per_week=1,
        sessions=[
            DraftSession(
                session_id=1, week=1, day=1, prescriptions=[_prescription(10, 3)]
            ),
            DraftSession(
                session_id=2, week=2, day=1, prescriptions=[_prescription(11, 1)]
            ),
        ],
    )
    catalog = {10: ["quadriceps"], 11: ["chest"]}

    # Act
    preview = build_balance_preview(draft, resolve_muscles=_muscles_from(catalog))

    # Assert — set-count weighted, summing to 100
    assert preview.muscle_distribution == {
        MuscleGroup.LEGS: 75.0,
        MuscleGroup.CHEST: 25.0,
    }


def test_a_set_splits_evenly_across_its_exercises_distinct_groups():
    # Arrange — a single set on an Exercise training two groups gives each a half
    draft = DeployDraft(
        weeks=1,
        sessions_per_week=1,
        sessions=[
            DraftSession(
                session_id=1, week=1, day=1, prescriptions=[_prescription(10, 1)]
            ),
        ],
    )
    catalog = {10: ["chest", "triceps"]}

    # Act
    preview = build_balance_preview(draft, resolve_muscles=_muscles_from(catalog))

    # Assert — half to Chest, half to Arms; still sums to 100
    assert preview.muscle_distribution == {
        MuscleGroup.CHEST: 50.0,
        MuscleGroup.ARMS: 50.0,
    }


def test_an_unmapped_muscle_lands_in_the_unclassified_bucket():
    # Arrange — one set of a Legs lift, one set of an AI-invented muscle
    draft = DeployDraft(
        weeks=1,
        sessions_per_week=1,
        sessions=[
            DraftSession(
                session_id=1,
                week=1,
                day=1,
                prescriptions=[_prescription(10, 1), _prescription(11, 1)],
            ),
        ],
    )
    catalog = {10: ["quadriceps"], 11: ["sternocleidomastoid"]}

    # Act
    preview = build_balance_preview(draft, resolve_muscles=_muscles_from(catalog))

    # Assert — the unknown muscle is shown as Unclassified, never dropped
    assert preview.muscle_distribution == {
        MuscleGroup.LEGS: 50.0,
        MuscleGroup.UNCLASSIFIED: 50.0,
    }


def test_an_empty_draft_previews_nothing_rather_than_erroring():
    # Arrange — a draft with no Sessions (the honest empty state)
    draft = DeployDraft(weeks=1, sessions_per_week=1, sessions=[])

    # Act
    preview = build_balance_preview(draft, resolve_muscles=_muscles_from({}))

    # Assert — no weeks, an empty split; not an error
    assert preview.weeks == []
    assert preview.muscle_distribution == {}
