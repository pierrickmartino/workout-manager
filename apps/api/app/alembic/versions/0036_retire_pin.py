"""retire Pin: migrate Pinned Targets to Static, drop the pinned_reps column (ADR-0064)

The *contract* step that finishes Pin's retirement (#434), now that the Progression
Scheme registry and its **Static** scheme fully subsume it (ADR-0064, supersedes
ADR-0053). This replaces the Pin rep-target migration's role (0028).

Data migration, then column drop. Each Prescription still carrying a Pinned Target
(a non-NULL, non-blank ``pinned_reps``) is migrated to preserve the user's intent
*exactly*: its base ``reps`` becomes the pinned value (their banked target holds) and
its ``scheme`` becomes ``static`` (nothing auto-steps it) — which is what the Pin did,
and better, since Static holds every future occurrence rather than freezing one. An
unpinned Prescription (NULL/blank ``pinned_reps``) is untouched and keeps its null
scheme (the default Double Progression). The now-dead ``pinned_reps`` column is then
dropped: no model, repository, serializer, or overlay reads it any more.

The downgrade re-adds the additive, nullable ``pinned_reps`` column (all NULL). The
data step is intentionally **not** reversed: once Pin is retired a ``static`` scheme is
a first-class user choice (#432) indistinguishable from one migrated from a Pin, so
re-deriving a Pinned Target from it would wrongly re-pin genuinely-Static movements.
The column is restored so the schema is reversible; the historical Pin values are not.

Revision ID: 0036_retire_pin
Revises: 0035_prescription_scheme
Create Date: 2026-09-02
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0036_retire_pin"
down_revision: str | None = "0035_prescription_scheme"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "exercise_prescription"


def upgrade() -> None:
    # 1) Preserve intent: a pinned movement's banked target becomes its base reps, and its
    #    scheme becomes Static so nothing auto-steps it — exactly what the Pin did. A blank
    #    marker was treated as un-pinned (the web trimmed it), so TRIM(...) <> '' excludes it.
    op.execute(
        sa.text(
            f"UPDATE {_TABLE} "
            "SET reps = pinned_reps, scheme = 'static' "
            "WHERE pinned_reps IS NOT NULL AND TRIM(pinned_reps) <> ''"
        )
    )

    # 2) Drop the now-dead column: no read path references it after the scheme registry.
    with op.batch_alter_table(_TABLE) as batch:
        batch.drop_column("pinned_reps")


def downgrade() -> None:
    # Restore the additive, nullable column so the schema is reversible. The data step is not
    # reversed (see the module docstring): a ``static`` scheme is now a first-class choice and
    # cannot be distinguished from one migrated from a Pin, so the column comes back all NULL.
    with op.batch_alter_table(_TABLE) as batch:
        batch.add_column(sa.Column("pinned_reps", sa.String(), nullable=True))
