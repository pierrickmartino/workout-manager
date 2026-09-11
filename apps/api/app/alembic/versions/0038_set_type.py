"""tag a Prescription and a Logged Set with an optional Set Type (ADR-0065)

Adds an additive, nullable ``set_type`` text column to **both** sides of the plan/record
split — ``exercise_prescription`` (the plan) and ``logged_set`` (the record) — the
persistence spine of the descriptive Set Type annotation (#449). Its value is a member of
the closed ``SetType`` catalog (``warm_up`` / ``working`` / ``drop`` / ``failure`` /
``amrap``); NULL means "unset", which reads as ``working`` (``app.domain.set_type``), so
every existing row behaves exactly as before.

Purely additive: every existing Prescription and Logged Set reads NULL and is unaffected,
so the upgrade needs no backfill and touches no existing data, and the downgrade simply
drops both columns, losing nothing (the base reps/load/quantity columns are separate and
untouched). Set Type is descriptive only in v1 — it feeds no Progression and no analytics
yet — so nothing beyond these two columns changes.

Revision ID: 0038_set_type
Revises: 0037_logged_session_idempotency_key
Create Date: 2026-09-03
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0038_set_type"
down_revision: str | None = "0037_logged_session_idempotency_key"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PLAN_TABLE = "exercise_prescription"
_RECORD_TABLE = "logged_set"


def upgrade() -> None:
    # Additive, nullable annotation on both the plan and the record: NULL means "unset",
    # which resolves to a working set — no existing row shifts.
    with op.batch_alter_table(_PLAN_TABLE) as batch:
        batch.add_column(sa.Column("set_type", sa.String(), nullable=True))
    with op.batch_alter_table(_RECORD_TABLE) as batch:
        batch.add_column(sa.Column("set_type", sa.String(), nullable=True))


def downgrade() -> None:
    # Purely additive: drop the annotation from both tables. The base
    # reps/load/quantity columns are separate and untouched, so nothing is lost.
    with op.batch_alter_table(_RECORD_TABLE) as batch:
        batch.drop_column("set_type")
    with op.batch_alter_table(_PLAN_TABLE) as batch:
        batch.drop_column("set_type")
