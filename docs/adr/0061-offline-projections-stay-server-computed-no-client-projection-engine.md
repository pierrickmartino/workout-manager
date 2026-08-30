# 0061 — Offline projections stay server-computed; no client projection engine

**Status:** accepted

**XP**, **Operator Level**, **Streak**, **Achievements**, **Personal Records**, and the
analytics figures are **read-time projections** computed server-side from the record
(ADR-0018/0019). Once a finish can sit in a client outbox before it reaches the server
(ADR-0060), a question follows: should the client **recompute** these figures locally
from the queued record so Home and Analytics update the instant a workout finishes, even
offline? We decide **no** — projections remain server-computed, and a queued-but-unsynced
record is simply **not yet reflected** in them.

- **There is one implementation of each projection, and it is the server's.** These
  figures are honesty-critical: the product's position is that they never drift from what
  the user actually logged. A second, browser-side implementation is precisely the
  divergence risk the single-source design exists to remove — two definitions of "a PR"
  or "the streak" that can disagree across a release or a device.
- **A pending record is surfaced through the sync-state UI, not the projections.** Until
  the outbox entry syncs, the user sees "Saved on this device — sync pending"; their XP
  does not tick up yet. The reassurance that the work is safe comes from the sync state,
  not from an immediately-updated score.
- **The promise of Phase 1 is durability, not offline analytics.** "Your workout is safely
  saved and *will* sync" is the guarantee; "your lifetime stats recompute offline" is not.

## Considered options

- **Recompute projections on the client from the outbox (rejected).** Snappier — the
  just-finished session lands in Home/Analytics instantly. But it duplicates load-bearing
  domain logic (1RM estimation, PR detection, streak/week bucketing, achievement
  predicates) in TypeScript, where it will drift from the Python domain and undermine the
  very honesty the figures promise. The gain (a few seconds/minutes until sync) does not
  justify a parallel projection engine.
- **A partial "optimistic" bump** (e.g. increment XP by the finished session's sets).
  Rejected as the worst of both: it reimplements *some* projection rules approximately, so
  it is both a second implementation *and* a knowingly-wrong one that will disagree with the
  server on refresh.

## Consequences

- **A visible lag between finish and stats is expected, and must be legible.** The
  sync-state UI (offline / saved-locally / syncing / synced / failed) is what explains why a
  finished session is not yet in the XP total — so it is not optional polish; it is the
  honest account of the gap this decision creates.
- **Reversible later, additively.** If real usage shows offline stats matter, a client
  projection engine can be added without unwinding this decision — the record is already
  local. Choosing server-only now avoids building and maintaining that engine before the
  need is proven.
- **No new domain vocabulary.** Because sync stays a transport concern (ADR-0060), this
  decision adds nothing to `CONTEXT.md`; it is about *where* existing projections run, not a
  new concept.
