"""give a Logged Set a typed Effort and a Prescription a Target Effort (ADR-0066)

Adds an additive, nullable JSON ``effort`` column to the **record** (``logged_set``) and a
matching ``target_effort`` column to the **plan** (``exercise_prescription``) — the
persistence spine of the typed Effort value (#450). Each holds a ``{scale, value}`` value
(``app.domain.effort.Effort``): RPE (0–10, half-steps) or RIR (integer 0–5).

Purely additive and back-compatible. The record keeps its existing ``perceived_difficulty``
int, which is read as an ``rpe``-scale Effort (ADR-0066), so **no backfill** is needed — a
returning user's rows read NULL for ``effort`` and step exactly as before. New writes
dual-write: they populate ``effort`` and mirror an RPE value into ``perceived_difficulty``.
Target Effort is unset (NULL) on every existing Prescription and is descriptive only in v1
(it feeds no Progression). The downgrade drops both columns, losing nothing — the base
reps/load/quantity and ``perceived_difficulty`` columns are separate and untouched.

Revision ID: 0039_effort
Revises: 0038_set_type
Create Date: 2026-09-03
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0039_effort"
down_revision: str | None = "0038_set_type"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PLAN_TABLE = "exercise_prescription"
_RECORD_TABLE = "logged_set"


def upgrade() -> None:
    # Additive, nullable typed Effort on both sides of the plan/record split: NULL means
    # "unset". The record keeps ``perceived_difficulty`` (read as rpe-scale Effort), so no
    # existing row shifts and no backfill is required.
    with op.batch_alter_table(_PLAN_TABLE) as batch:
        batch.add_column(sa.Column("target_effort", sa.JSON(), nullable=True))
    with op.batch_alter_table(_RECORD_TABLE) as batch:
        batch.add_column(sa.Column("effort", sa.JSON(), nullable=True))


def downgrade() -> None:
    # Purely additive: drop the typed Effort from both tables. The base
    # reps/load/quantity and ``perceived_difficulty`` columns are separate and untouched.
    with op.batch_alter_table(_RECORD_TABLE) as batch:
        batch.drop_column("effort")
    with op.batch_alter_table(_PLAN_TABLE) as batch:
        batch.drop_column("target_effort")
