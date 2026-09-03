"""give a Prescription an Exercise Note and a Logged Set a Set Note (ADR-0065)

Adds an additive, nullable ``note`` text column to **both** sides of the plan/record split —
``exercise_prescription`` (the **Exercise Note**, a plan-side coaching cue) and ``logged_set``
(the **Set Note**, a record-side remark) — the persistence spine of the optional free-text
notes (#451). Each holds an already-sanitized string: the write boundary length-caps and
HTML-escapes the user's text (``app.domain.note.parse_note``) so a stored note is inert
wherever it renders (nonce-CSP DOM-XSS posture, ADR-0036); NULL means "no note".

Purely additive and back-compatible: every existing Prescription and Logged Set reads NULL,
so the upgrade needs no backfill and touches no existing data, and the downgrade simply drops
both columns, losing nothing (the base reps/load/quantity and Set Type / Effort columns are
separate and untouched). There is no Session-level note in v1 (out of scope, ADR-0065).

Revision ID: 0040_note
Revises: 0039_effort
Create Date: 2026-09-03
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0040_note"
down_revision: str | None = "0039_effort"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_PLAN_TABLE = "exercise_prescription"
_RECORD_TABLE = "logged_set"


def upgrade() -> None:
    # Additive, nullable free-text note on both the plan (Exercise Note) and the record (Set
    # Note): NULL means "no note", so no existing row shifts and no backfill is required.
    with op.batch_alter_table(_PLAN_TABLE) as batch:
        batch.add_column(sa.Column("note", sa.String(), nullable=True))
    with op.batch_alter_table(_RECORD_TABLE) as batch:
        batch.add_column(sa.Column("note", sa.String(), nullable=True))


def downgrade() -> None:
    # Purely additive: drop the note from both tables. The base reps/load/quantity and the
    # Set Type / Effort columns are separate and untouched, so nothing is lost.
    with op.batch_alter_table(_RECORD_TABLE) as batch:
        batch.drop_column("note")
    with op.batch_alter_table(_PLAN_TABLE) as batch:
        batch.drop_column("note")
