"""How long a recorded ``Generation Call`` is kept (ADR-0135).

The admin AI audit log holds full prompts, which are built from the Fitness Profile and
so carry readable health data (Sensitive Constraints included). Three days is enough to
investigate a user report or an incident and short enough to bound that exposure tightly.

There is no scheduler in the stack, so retention is enforced twice: every record purges
rows older than the cutoff (best-effort), and every read applies the same cutoff, so an
expired row is never served even when a purge failed."""

from __future__ import annotations

from datetime import datetime, timedelta

GENERATION_CALL_RETENTION = timedelta(days=3)


def retention_cutoff(now: datetime) -> datetime:
    """The oldest ``created_at`` still inside the retention window at ``now``."""

    return now - GENERATION_CALL_RETENTION


__all__ = ["GENERATION_CALL_RETENTION", "retention_cutoff"]
