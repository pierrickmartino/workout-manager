# 0125 — A set-aside Protocol can be switched back to, and an un-started one deleted (amends ADR-0037)

**Status:** accepted

ADR-0037 let a user move on from a Protocol by generating a new one, which supersedes the old
one and sets it aside for good. It turned down a delete button and put off an index. In use,
that one-way door is the problem. Users can't see the Protocols they own, can't go back to one
they set aside, and can't get rid of one they adopted by mistake. Generating has to warn whenever
the Current Protocol has performed Sessions, so trying a new plan feels like abandoning the old
one.

**We keep ADR-0037's core point: deleting a *performed* Protocol is the trap.** Its Sessions are
referenced by settled Logged Sessions, and those are the read-time source of XP, Personal
Records, Streak, Achievements and History (ADR-0018/0020/0034). Nothing here touches a record.

**We reverse three things in ADR-0037:**

- **The one-way door.** A set-aside Protocol can be **Switched** to, which makes it Current
  again. To express that, a Protocol stores `made_current_at`, a user *choice* of the same kind
  as Favorite or Calibration, not a derived ledger (ADR-0018). Adopting sets it, Switch sets
  it, and nothing else writes it. The **Current Protocol** is the user's unfinished Protocol
  with the latest `made_current_at`, ties broken by the higher id. Generation still supersedes
  through this rule, because adopting stamps the new Protocol. Selection keeps the ADR-0030
  shape: a pure projection over one already-loaded Logged history.
- **The absent index.** A Protocols screen lists every owned Protocol as Current, Set aside or
  Finished.
- **"Never deleted."** A Protocol is deleted only when it is **un-started**: no Logged Session
  of any Completion Outcome references any of its Sessions. That is the same zero-records gate
  ADR-0063 applies to a standalone Session, re-checked inside the delete so that a log arriving
  at the same moment produces a `409`, never lost records. A Finished Protocol, or one with
  only an Incomplete log, is never deletable.

Because superseding can now be undone, the generate-time confirmation goes away. A short,
non-blocking note says where the old Protocol went.

## Considered options

- **Re-select by `created_at`, with a separate "pinned" flag**: rejected. Two orderings would
  have to agree on which Protocol is Current, and "pinned but finished" becomes a state to
  explain. One stored timestamp ordered explicitly expresses Adopt, Switch and the finish
  fall-back with a single rule.
- **Soft-delete or archive**: rejected for the same reason as ADR-0063. A record-free plan has
  nothing to preserve, and an "exists but hidden" state would have to be filtered everywhere.
- **Change the repository's list order to `made_current_at`**: rejected. Its other callers,
  such as the data export, would be quietly re-ordered. Selection and the index sort
  explicitly instead.

## Consequences

- The migration backfills `made_current_at` from `created_at`. Until now each Protocol was made
  Current exactly once, at adoption, so every existing user's Current Protocol is unchanged.
- `made_current_at` only orders Protocols. It is never shown as a date or schedule and never
  feeds Readiness or Streak (ADR-0001).
- The Live Session stays client-side (ADR-0012), so the "finish or resume your Live Session
  first" block on Switch and Delete lives in the web view-model. The server can't see it.
- Delivered in slices (#634): the selection rule and this record first, with no visible change;
  then the index, Switch and removal of the generate confirmation; then Delete.
- Generation lands on the adopted Protocol at `?set_aside=<id>` when a Current Protocol was
  superseded (#640). The detail page re-reads that Protocol, owner-scoped, and shows the note
  only while it is not Current, so a revisited address never names a Protocol the user has
  since Switched back to (`lib/protocol-supersede.ts`).
- **Out of scope:** running a Finished Protocol again, deleting a Protocol that has any Logged
  Session, and server-side awareness of the Live Session.
