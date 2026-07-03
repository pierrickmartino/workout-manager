"""rename program to protocol

Renames the domain concept Program to Protocol across the schema (issue #45): the
user-owned ``program`` table becomes ``protocol``, its ``ix_program_clerk_user_id``
index becomes ``ix_protocol_clerk_user_id``, and the ``workout_session.program_id``
foreign key (plus its index and constraint) becomes ``protocol_id``. Pure rename,
no behavior change — the app is pre-production with no live data, so this is a
straightforward reversible ``RENAME``. ``downgrade()`` restores the original
``program`` names cleanly.

Revision ID: 0009_rename_program_to_protocol
Revises: 0008_metric_history
Create Date: 2026-07-03
"""
from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0009_rename_program_to_protocol"
down_revision: str | None = "0008_metric_history"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.rename_table("program", "protocol")
    op.drop_index("ix_program_clerk_user_id", table_name="protocol")
    op.create_index(
        "ix_protocol_clerk_user_id", "protocol", ["clerk_user_id"], unique=False
    )

    # batch mode keeps the column rename, index, and FK swap portable across
    # backends (ALTER on PostgreSQL, table-rebuild on SQLite), matching 0005. The
    # new index/FK go in a second pass so they resolve against the renamed column.
    with op.batch_alter_table("workout_session") as batch:
        batch.drop_constraint("fk_workout_session_program_id", type_="foreignkey")
        batch.drop_index("ix_workout_session_program_id")
        batch.alter_column("program_id", new_column_name="protocol_id")

    with op.batch_alter_table("workout_session") as batch:
        batch.create_index(
            "ix_workout_session_protocol_id", ["protocol_id"], unique=False
        )
        batch.create_foreign_key(
            "fk_workout_session_protocol_id",
            "protocol",
            ["protocol_id"],
            ["id"],
        )


def downgrade() -> None:
    op.rename_table("protocol", "program")
    op.drop_index("ix_protocol_clerk_user_id", table_name="program")
    op.create_index(
        "ix_program_clerk_user_id", "program", ["clerk_user_id"], unique=False
    )

    with op.batch_alter_table("workout_session") as batch:
        batch.drop_constraint("fk_workout_session_protocol_id", type_="foreignkey")
        batch.drop_index("ix_workout_session_protocol_id")
        batch.alter_column("protocol_id", new_column_name="program_id")

    with op.batch_alter_table("workout_session") as batch:
        batch.create_index(
            "ix_workout_session_program_id", ["program_id"], unique=False
        )
        batch.create_foreign_key(
            "fk_workout_session_program_id",
            "program",
            ["program_id"],
            ["id"],
        )
