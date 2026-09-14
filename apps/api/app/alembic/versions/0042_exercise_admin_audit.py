"""append-only admin audit trail for catalog Exercise acts (ADR-0075/0076)

Adds the ``exercise_admin_audit`` table — the append-only trail that records a
consequential admin act on one catalog Exercise: who (``actor``, a Clerk sub), when
(``created_at``), what (``action``), and the change itself (``detail`` JSON, e.g.
``{"from": "ai_generated", "to": "curated"}``). Deliberate Provenance change (ADR-0075)
is the first consumer; retire / un-retire / hard delete (ADR-0076) reuse the same trail.

``exercise_id`` is a **plain indexed column, not a foreign key**, on purpose: a future
``hard_delete`` must leave its audit row behind after the Exercise row is gone (with the
deleted movement's identity captured in ``detail``), so the trail outlives the row it
describes. ``created_at`` is indexed so the per-Exercise read can order newest-first cheaply.

There is **no backfill** — the trail is a new capability, so it simply starts empty and
grows from the first admin act. The downgrade drops the table.

Revision ID: 0042_exercise_admin_audit
Revises: 0041_exercise_retired
Create Date: 2026-09-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0042_exercise_admin_audit"
down_revision: str | None = "0041_exercise_retired"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "exercise_admin_audit"


def upgrade() -> None:
    op.create_table(
        _TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        # A plain int, not an FK: the trail must outlive a hard-deleted Exercise row.
        sa.Column("exercise_id", sa.Integer(), nullable=False),
        sa.Column("actor", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_exercise_admin_audit_exercise_id", _TABLE, ["exercise_id"]
    )
    op.create_index(
        "ix_exercise_admin_audit_created_at", _TABLE, ["created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_exercise_admin_audit_created_at", table_name=_TABLE)
    op.drop_index("ix_exercise_admin_audit_exercise_id", table_name=_TABLE)
    op.drop_table(_TABLE)
