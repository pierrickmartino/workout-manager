"""The Redeem copy rule (ADR-0057, CONTEXT.md § Session Library & Sharing → Redeem).

**Redeem** is the cross-user cousin of **Duplicate** (ADR-0043): it deep-copies a
shared standalone Session into a new one owned by the **redeemer**. This module is the
pure, I/O-free statement of that copy's Session-level attributes, so the repository's
cross-user copy and its test share one definition of the invariant instead of each
re-deriving it.

The two deltas from Duplicate are encoded here:

* the new **Owner** is the redeemer (``clerk_user_id``), because ownership transfers on
  Redeem; and
* the **Author** is *preserved* as the original creator (immutable origin), never
  re-attributed to the redeemer — the same non-re-attribution as Session Provenance and
  the ``trace_id`` lineage, which also carry forward unchanged, along with the Session
  Name (verbatim).

What the copy drops is *not* represented here at all, because it is dropped by
construction rather than by rule: a redeemed copy is always a **standalone** plan with
an **empty logbook** (no Protocol position, no Logged Sessions) and starts
**un-favorited** for its new owner (Favorite is per-owner and lives in its own store).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class SharedSessionSource:
    """The source Session's attributes a Redeem copy reads from (redeem-time snapshot).

    Only the fields that flow into the copy's Session row: the training parameters, the
    immutable-origin axes (Session Provenance, ``trace_id`` lineage, Author), and the
    user-given Session Name. Prescriptions are copied separately by the repository; the
    Protocol position and records are dropped by construction and so are absent here.
    """

    training_type: str
    duration_minutes: int
    provenance: str
    name: str | None
    author_clerk_user_id: str | None
    trace_id: str | None = None


@dataclass(frozen=True)
class RedeemedSessionCopy:
    """The Session-row attributes of a redeemed copy — a new value, never a mutation."""

    clerk_user_id: str
    training_type: str
    duration_minutes: int
    provenance: str
    name: str | None
    author_clerk_user_id: str | None
    trace_id: str | None


def redeem_copy(
    source: SharedSessionSource, redeemer_clerk_user_id: str
) -> RedeemedSessionCopy:
    """Compute the redeemed copy's Session attributes from ``source`` (ADR-0057).

    New **Owner** is ``redeemer_clerk_user_id``; the **Author**, **Session Name**,
    **Session Provenance**, and ``trace_id`` **lineage** are carried forward unchanged.
    Pure — returns a fresh immutable value and never touches the source.
    """

    return RedeemedSessionCopy(
        clerk_user_id=redeemer_clerk_user_id,
        training_type=source.training_type,
        duration_minutes=source.duration_minutes,
        provenance=source.provenance,
        name=source.name,
        author_clerk_user_id=source.author_clerk_user_id,
        trace_id=source.trace_id,
    )


__all__ = ["SharedSessionSource", "RedeemedSessionCopy", "redeem_copy"]
