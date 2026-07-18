# 0012 — The Live Session is an ephemeral, client-side performance

**Status:** accepted

F2 introduces the **Live Session** — a Session while it is being performed (sets done so far, current set, running elapsed time). We keep this entirely on the client: React state, persisted to `localStorage` for refresh/crash/lock survival, rather than as a server-persisted in-progress entity. Nothing reaches the backend until the user finishes, at which point the existing `POST /api/sessions/{id}/logs` records a Logged Session — now at **per-set** granularity (one Logged Set per completed set, versus the static form's one-per-Exercise collapse). The record model already supports this: `logged_sets` is a flat ordered list keyed by `position`, so no schema change is needed for granularity.

## Considered options

A server-persisted **Active Session** (new table, PATCH-per-set, cross-device resume) was rejected for v1. The plan/record API is already complete, and the honest gym use case — one workout, one sitting, one device — is served by `localStorage` without the cost of a new entity and its lifecycle. Cross-device resume is the one capability this forgoes; it can layer on later behind the same UI.

## Consequences

- No cross-device resume; clearing the browser mid-workout loses an unfinished Live Session (fallback: the static log form).
- At most **one** Live Session exists at a time (single `localStorage` slot); starting another while one is unfinished is blocked, not silently superseded, so real work is never discarded.
- Timers are wall-clock (timestamp-based, compared to `Date.now()`), not tick-counters, because the tab backgrounds when the phone locks.
