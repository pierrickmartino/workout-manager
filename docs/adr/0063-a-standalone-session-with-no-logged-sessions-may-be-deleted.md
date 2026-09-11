# 0063 — A standalone Session with no Logged Sessions may be deleted

A user tidying **My Sessions** wants to throw away a workout they generated or authored
but never did — a mis-generated plan, a duplicate, an experiment. Until now the domain had
**no deletion at all**: a Protocol is *set aside*, never removed (`CONTEXT.md`, §Current
Protocol), and **Remove** withdraws a single Prescription, never a whole Session (ADR-0052).
We add **Delete** (`CONTEXT.md`, §Session Library & Sharing): a user permanently removes one
of their **own standalone Sessions** — but **only when no Logged Session references it**.

This ADR records the decisions that are surprising or hard to reverse. The counter that
surfaces the same fact on My Sessions is the visible half of the guard, not a separate
feature.

**Delete is refused once the Session has been performed.** The load-bearing invariant is
plan/record separation: a performed Session is settled record and is never rewritten or
reordered (ADR-0001/0020). A Logged Session references its prescribing Session by
`session_id`; deleting that Session out from under an intact performance would either orphan
the record or force a cascading record delete, and a record of work the user actually did is
never collateral damage of a plan edit. So Delete is gated on **zero Logged Sessions**: the
moment a Session carries any performance — Completed *or* Incomplete — it is permanent. The
guard is enforced server-side and re-checked at delete time, so a log that lands between the
list read and the click turns the delete into a `409`, never a silent record loss.

**Delete is scoped to standalone Sessions; a Protocol member is never deleted here.** Exactly
as Rename, Favorite, Share, Insert, and Remove (ADR-0051/0052/0057), a Protocol-member
Session lives inside an ordered, partially-performed sequence governed by the tail-only
Deploy invariant (ADR-0020/0021); lifting one Session out of a plan the user is working
through is the Builder's concern, not a library delete. A Protocol is never deleted at all
(`CONTEXT.md`, §Current Protocol), so Delete stays on the user's own standalone Sessions.

**Delete is a hard delete of the plan and its plan-side dependents — no soft-delete, no
archive.** Because a deletable Session carries no record, there is nothing to preserve for
history: the row genuinely ceases to exist, along with its Exercise Prescriptions, its
Favorite marker, any Generation Feedback, and any Share Links. This is deliberately *unlike*
a superseded Protocol, which is *set aside* precisely because its records are intact. An
archived/soft-deleted Session would re-introduce a second "exists but hidden" state the
library would then have to filter everywhere, for no domain gain on a record-free plan.

**The counter counts Logged Sessions, not Logged Sets, and every Completion Outcome.** The
question the user is asking is "have I trained this?", which is a count of *performances* — a
read-time projection over the record (ADR-0018), never a stored ledger. An Incomplete
performance is still logged training (the same basis Streak and XP count on), so it counts;
the counter and the delete guard therefore read the exact same fact, and a Session shows a
count iff it is undeletable.

## Considered options

- **Let Delete reach a performed Session by cascading its Logged Sessions** — rejected: it
  makes a plan edit destroy settled record, the one thing plan/record separation exists to
  prevent. A performed Session's records are removed one at a time through **Log Correction**
  (ADR-0034), a record-side act the user takes deliberately.
- **Soft-delete / archive instead of hard delete** — rejected: a record-free plan has nothing
  worth preserving, and a hidden-but-present state would burden every library read with a
  filter. Reserved-word note: `CONTEXT.md` lists *archive/discard/abandon* on the Protocol
  *Avoid* list; Delete is a different act on a different concept (a removable standalone plan),
  and the word chosen is the plain, honest **Delete**.
- **Let Delete reach Protocol-member Sessions** — rejected for the same reason as Insert and
  Remove: it would duplicate the tail-gated Deploy path outside the Builder and risk touching
  a performed Session.
- **Count Logged Sets, or only Completed Logged Sessions** — rejected: sets over-count a
  single workout, and excluding Incomplete performances would let a Session read "0 logged"
  yet still be undeletable, divorcing the counter from the guard it visualises.

## Consequences

- **A Session-delete seam now exists**, alongside Rename/Favorite/Share on the standalone
  Session and as a per-row action on My Sessions. It is offered only where `logged_count == 0`
  (hidden on My Sessions rows that show the count; shown disabled with a hint on the Session
  detail), and the server is the authority — a race is a `409`, not a lost record.
- **`logged_count` is a read-time projection carried on both Session reads** (the My Sessions
  list row and the Session detail), computed from the record like XP and Streak — no stored
  counter, no write hook (ADR-0018).
- **Delete removes only plan-side rows.** With no Logged Session in play, deletion touches the
  Session, its Prescriptions, its Favorite marker, its Generation Feedback, and its Share
  Links, children-first so a foreign-key-enforcing database accepts it. The cascade is one
  atomic transaction — the child cleanups flush and the terminal Session delete commits once
  (all repositories in a request share a session) — so a mid-cascade failure rolls back whole
  rather than leaving a half-deleted Session. Every other user's
  **Redeemed** copy is an independent Session and is untouched (the copy model, ADR-0057);
  outstanding Share Links to the deleted Session simply stop resolving.
- **Delete raises no cache-bypass question** (ADR-0003): it serves no generation, so the
  Sensitive-Constraint posture is not engaged.
