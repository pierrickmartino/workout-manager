# 0080 — Workout form drafts are account-scoped local recovery state

**Status:** accepted

The Hand-Authored Session, plan-less log, and Log Correction forms can contain many
minutes of entered work. A navigation guard prevents an accidental in-app departure, but
cannot survive a reload, closed tab, browser restart, or crash. These forms therefore save
a versioned draft in a dedicated browser-local collection and offer the owner an explicit
choice to **Restore draft** or **Discard draft** on return.

Each entry is keyed by the authenticated Clerk account id plus a stable form identity.
Corrections and Capture include the source Logged Session id in that identity, so drafts
from different records cannot collide. Reads require an exact account-and-form match;
switching accounts never offers another owner's fields. Explicit sign-out clears the draft
collection with the other account-scoped local stores.

Drafts are recovery state, not domain objects. They live under their own `localStorage`
key, separate from the single Live Session slot (ADR-0012/0059) and the IndexedDB finish
outbox (ADR-0060). Stored input is untrusted and shape-checked before it reaches form
state. A malformed or unsupported-version collection is ignored, and unavailable/full
storage never blocks ordinary form use.

A draft is cleared only after the server acknowledges a successful save, or when the user
explicitly discards it. A failed request leaves it intact. The author-and-first-log and
plan-less log paths retain one client-minted idempotency key in the draft, so retrying after
a lost acknowledgement resolves to the original Logged Session rather than adding a
duplicate. Log Correction is already an idempotent full replacement of one record.

## Considered options

- **Automatically restore without asking** — rejected: server data or defaults may have
  changed, and silently replacing the visible form makes stale local input look current.
- **Put drafts in the Live Session slot or finish outbox** — rejected: those stores have
  different lifecycles and meanings. A draft is neither a performance in progress nor a
  submitted record awaiting delivery.
- **Persist drafts on the server** — rejected for this slice: browser-local recovery covers
  the interruption cases without introducing a synchronized cross-device draft entity.
- **Expand recovery to every form immediately** — rejected: the audit hypothesis is not yet
  measured. Start with the three substantial workout-entry journeys and observe whether
  restores are frequent enough to justify broader persistence.

## Consequences

- Recovery works on the same browser profile across reloads and restarts, but not across
  devices or after browser storage is cleared.
- The collection can contain drafts for multiple signed-in accounts during an account
  switch, but the exact-owner read boundary prevents cross-account presentation. Explicit
  sign-out removes all local drafts from that browser profile.
- Future draft schemas must increment the collection version or supply an explicit migration;
  unknown versions fail closed to an empty recovery view.
