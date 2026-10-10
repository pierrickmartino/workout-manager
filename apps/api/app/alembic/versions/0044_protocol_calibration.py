"""add the Calibration offset to the Protocol (ADR-0111)

Gives ``protocol`` a nullable ``calibration`` integer column holding the user's standing
**Calibration** — the *relative offset* from the Protocol's authored values that re-pitches
its un-performed tail (GLOSSARY: Calibration). Clamped −3…+3 by
``app.domain.calibration.clamp_calibration`` at the write boundary; the column itself stays a
plain integer so a future change to the clamp needs no migration.

Nullable and **not** backfilled: an existing Protocol has never been calibrated, and ``NULL``
reads as 0 — "as authored" — through ``app.domain.calibration``'s own default, the same
no-backfill pattern as the Protocol's ``name`` (0016) and a Session's ``name`` (0030).

It stores the user's *intent*, not the result: the resolved Load / Quantity / sets / rest /
Target Effort are **materialised** onto the un-performed Prescription rows (ADR-0111), so this
column is what the ±3 clamp clamps, what a second nudge stacks onto, and what the later
Fitness Level fold reads. A stored user *choice*, the same species as a Prescription's
``scheme`` (0035) or a Session's ``favorite`` (0032) — not a derived ledger, which ADR-0018
forbids.

Revision ID: 0044_protocol_calibration
Revises: 0043_exercise_image_upload
Create Date: 2026-10-02
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0044_protocol_calibration"
down_revision: str | None = "0043_exercise_image_upload"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "protocol",
        sa.Column("calibration", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("protocol", "calibration")
