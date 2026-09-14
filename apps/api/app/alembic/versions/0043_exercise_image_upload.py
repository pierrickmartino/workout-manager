"""a catalog Exercise gains an uploaded Exercise Image (issue #504, ADR-0041)

Adds the ``exercise_image`` table — the bytes of a curator-uploaded illustration for one
movement, kept out of the wide ``exercise`` row so a catalog read never drags a blob along.
``exercise_id`` is the primary key *and* a foreign key to ``exercise.id``: exactly one image
per Exercise (a re-upload upserts the single row) and the image is removed with the Exercise.

The existing nullable ``exercise.image`` string is untouched and keeps serving curated
*external* references (a URL / asset key); the served picture is chosen image-row-first, else
the legacy string. There is no backfill — uploads are a new capability, so the table starts
empty and fills from the first upload. The downgrade drops the table, leaving the catalog and
the legacy ``image`` column intact.

Revision ID: 0043_exercise_image_upload
Revises: 0042_exercise_admin_audit
Create Date: 2026-09-14
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0043_exercise_image_upload"
down_revision: str | None = "0042_exercise_admin_audit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "exercise_image"


def upgrade() -> None:
    op.create_table(
        _TABLE,
        # PK *and* FK: one image per Exercise, removed with the Exercise it illustrates.
        sa.Column(
            "exercise_id",
            sa.Integer(),
            sa.ForeignKey("exercise.id"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("bytes", sa.LargeBinary(), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("uploaded_by", sa.String(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table(_TABLE)
