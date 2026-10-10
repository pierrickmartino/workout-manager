# 0089 — A completed Live Set is reopenable, and the current-set pointer is forward-only

**Status:** accepted

Until now a set completed during a Live Session was frozen. `liveSessionReducer` had
exactly one editing event — `COMPLETE_SET` — and no reverse: a set's `status` went
`pending → completed` and nothing moved it back. The freeze was enforced twice over, in
the engine (which never revisited a completed row) and in the UI (`SetRow` disabled every
input and dropped both buttons). A user who tapped Complete on the wrong row, or entered
60 kg having lifted 70, had no recourse until the performance was over — and then only
through **Log Correction** (ADR-0034), which is a server-side write against settled
record. The everyday mid-workout mistake had the heaviest possible remedy.

We introduce **Reopen** (GLOSSARY.md): a completed set returns to un-attempted, keeping the
reps, Load and Effort already entered, so the user corrects them and completes it again.
It is available on any completed set at any point before the finish, because until the
finish nothing has left the device — the whole Live Session is a draft (ADR-0012). It is
one new reducer event, `REOPEN_SET`, and no new state: a reopened set is simply `pending`
again, so the persisted slot's shape is untouched and a performance started on an older
build needs no migration.

**Reopen is the only correction act; there is no edit-in-place.** A second act that
amended a completed set's values while leaving it `completed` would have served the
wrong-weight case more directly, but it would mean two events that can each change a
recorded set, two affordances on the row, and two answers to every question below
(does *this* one move the pointer? start a rest? count as activity?). Reopening and
re-completing reaches the same end state through the path that already exists and is
already tested. The cost is that correcting a value passes through an un-attempted state,
which momentarily drops progress and flips the Completion Outcome to Incomplete — both
read-time projections (ADR-0013), both true while it holds.

**The current-set pointer becomes forward-only.** This is the change that makes reopen
safe, and it is a real behaviour change beyond it. `COMPLETE_SET` used to recompute the
pointer as `firstPendingIndex` — a scan from index 0 — which reaches *backwards*. Under
that rule, reopening set 2 while the user stands at set 5 would drag the pointer, and with
it the unit indicator (`3 of 6`), the rest cue, the "Next up" line and its jump control,
back to a part of the workout the user has physically left. The same rule already misfired
on **Skip**: `ADVANCE` nudged the pointer past a skipped set, and the next completion
snapped it back onto the set the user had deliberately chosen not to do. Both are now one
rule — `nextPendingFrom(sets, from)`, the earliest pending set *at or after* where the
pointer already is — and one invariant: **the pointer never moves backwards during a
performance.** `REOPEN_SET` does not touch it at all.

**A reopen counts as activity.** `lastActivityAt` does double duty (ADR-0014): it is the
30-minute idle clock *and* the end of the recorded Session Duration. A reopen moves it, so
a user who is actively correcting a session cannot have it auto-ended as Incomplete
underneath them. The price is that reopening the last set and then walking away extends
the recorded duration by the correction time — bounded, and corrected the moment the set
is re-completed.

**A re-completion starts no rest.** The screen auto-starts a rest countdown on completion;
it now does so only when the completed set is the one the pointer sits on. Correcting a set
finished ten minutes ago is a record edit, not the end of physical work, so it starts no
countdown and leaves a running one alone.

**The finish gains a non-blocking advisory.** The finish mapper writes one Logged Set per
*completed* set, so anything still pending is dropped. Reopen makes that easy to hit —
reopen a set, get distracted, tap Finish, and real entered numbers vanish — but the hazard
predates it: a Skip has always dropped a set just as quietly. So once at least one set is
completed and any set is still un-attempted, a line above Finish names the count and the
outcome that follows. It informs rather than confirms: stopping early is legitimate, and a
modal on the way out would tax it. The "at least one completed" condition is not
cosmetic — on arrival every set is pending, so an unconditional line would shout at the
one moment it means nothing, and with no completed set the wording would be false:
`mapFinishToLog` returns null, so such a finish records *nothing* rather than an
Incomplete Logged Session. That pre-existing quiet path is unchanged here.

## Considered options

- **A strict last-action undo (LIFO).** Rejected: it cannot reach the case that motivates
  the feature — noticing on set 4 that set 2 is wrong — and "the last set" is ambiguous
  inside a Superset, whose members interleave.
- **Amend-in-place alongside reopen.** Rejected as above: two mutating events and two
  affordances to answer the same questions, for an end state reopen already reaches.
- **Keep `firstPendingIndex` and special-case reopen.** Rejected: it leaves the skip
  misfire in place and replaces one stated invariant with two exceptions.
- **Reset a reopened row to the plan's pre-fill** instead of retaining what was entered.
  Rejected: it makes the common one-digit correction a full re-entry and discards
  information the user just gave us.
- **A `wasCompleted` marker** to style a reopened row, or to warn only about reopened sets
  at the finish. Rejected: it is a third set state the model does not have, carried through
  the slot and hydration for presentation. The advisory covers the practical risk without
  it, for skipped and reopened sets alike.
- **A confirmation dialog on Reopen.** Rejected: the act *is* an undo and re-completing
  restores the prior state exactly (asserted by test), so a dialog is friction on the
  recovery path.
- **A server-persisted in-progress set, correctable via the API.** Rejected — that is
  ADR-0012's rejected Active Session, reopened for no new reason.
- **Undoing the finish itself.** Out of scope: a finish is an immediately real Logged
  Session via an idempotent outbox (ADR-0060), so "undo" there means deleting a server
  record — which is Log Correction's job (ADR-0034).

## Consequences

- `REOPEN_SET` is refused unless the target set is `completed` and the performance is
  `in_progress`: a finished performance's correction path is Log Correction, never a
  reopen. The Reopen control is also disabled while a finish is in flight, since the
  outbox has already taken the sets.
- The pointer can now run off the end of the set list while sets remain pending *behind*
  it (reopened or skipped). The screen then prompts Finish, with the advisory naming what
  will not be recorded — honest, if less hand-holding than a pointer that chases every
  gap.
- Nothing on screen distinguishes a reopened set from one never attempted: a reopened set
  *is* pending. Accepted, per the rejected `wasCompleted` marker above.
- Because the control lives on the row, a fully-completed unit's collapse hides it: once
  every set is attempted, every unit is collapsed (none holds the pointer), so reopening
  the set you just finished costs one tap to re-expand the unit first. Measured, not
  assumed — it is the pre-existing collapse behaviour, and the alternative (a control on
  the collapsed summary) would name no particular set.
- `SetRow` is keyed on `status` so a reopen remounts it, re-seeding its inputs from the
  retained record values — the row's edit state is local `useState` seeded at mount and
  does not re-seed on a prop change.
- No backend change: no route, no schema, no migration. The slot's shape and its
  deserialization guard are unchanged, asserted by a round-trip test rather than assumed.
