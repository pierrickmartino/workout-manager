"""add a nullable-unique idempotency key to Logged Sessions (ADR-0060, issue #410)

Gives ``logged_session`` a nullable ``idempotency_key`` column — the client-minted UUID
that identifies one **finish**, so a write retried after a dropped connection dedupes to a
single Logged Session instead of duplicating it (ADR-0060, the server half of the
offline-resilient finish). The create path upsert-returns on this key: a key already
present returns the existing record; otherwise it inserts.

Additive and **nullable-unique**. The uniqueness is a UNIQUE *index* rather than a table
constraint precisely so it permits **multiple NULLs** — both SQLite and Postgres treat NULL
as distinct in a unique index — so every historical row (which has no key) is untouched and
a keyless request (the static form) still inserts freely. Only a *present* key is globally
unique, which is what makes the retry safe.

No backfill: existing rows keep a NULL key. The downgrade drops the index and the column,
so the schema is reversible.

Revision ID: 0037_logged_session_idempotency_key
Revises: 0036_retire_pin
Create Date: 2026-09-02
"""
from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision: str = "0037_logged_session_idempotency_key"
down_revision: str | None = "0036_retire_pin"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TABLE = "logged_session"
_COLUMN = "idempotency_key"
_INDEX = "ix_logged_session_idempotency_key"


def upgrade() -> None:
    op.add_column(
        _TABLE,
        sa.Column(_COLUMN, sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    # A UNIQUE index (not a table constraint) so multiple NULLs are permitted: a present
    # key is globally unique — the dedupe identity — while every keyless row stays free.
    op.create_index(_INDEX, _TABLE, [_COLUMN], unique=True)


def downgrade() -> None:
    op.drop_index(_INDEX, table_name=_TABLE)
    op.drop_column(_TABLE, _COLUMN)
