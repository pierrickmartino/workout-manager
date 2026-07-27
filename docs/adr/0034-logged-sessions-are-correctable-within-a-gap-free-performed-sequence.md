# 0034 — Logged Sessions are correctable, within a gap-free performed sequence

**Status:** proposed

Until now the record side was append-only: `log_session` could `create` a Logged
Session but nothing could edit or delete one, even though four read-model modules
(`gamification.py`, `strength_analytics.py`, `records.py`, `profile_progress.py`) and
ADR-0018 already promise that "a corrected, back-dated, or deleted log simply
recomputes it." F introduces **Log Correction** (CONTEXT.md) — the first act that
mutates the *record* rather than the plan — via `PUT /api/logs/{id}` and
`DELETE /api/logs/{id}`, both funnelling through one service that reuses the
catalog-validity guard and the plan-backed/plan-less boundary rule (read off the
existing record, not the URL — so unlike create, ADR-0031, edit needs no route split).
This ADR records the two non-obvious choices that make correction safe.

**Performed Body Weight is carried forward from the record, never re-read from the
Profile.** At create, the snapshotted mass comes from `Profile.weight_kg` — honest,
because you log right after training. At edit that assumption is gone: correcting a
three-month-old log today would re-read *today's* mass and silently overwrite the
Performed Body Weight, making a settled bodyweight Personal Record drift — the exact
dishonesty ADR-0026 snapshotted the mass to prevent. So the edit service reuses the
mass already on the record (uniform across a performance — "one performance, one
mass") and applies it to every set in the replacement, including newly added ones; it
ignores any body weight the client sends. A record logged with no mass on file stays
`None` (record-ineligible), the same honest silence ADR-0026 chose over guessing.

**Correction preserves a gap-free performed sequence by construction.** Protocol
advancement is a read-time projection: `_advancing_sessions` (ADR-0013/0030) is a *set*
of Session ids with a Completed log, and Next Session is the first position not in that
set. Flipping a mid-Protocol log to Incomplete, or deleting it, removes its Session from
the set — punching a *hole*. Advancement self-heals (Next Session simply becomes that
Session again), but `reenumerate_tail` (ADR-0020) assumes the performed Sessions are a
contiguous prefix it passes through byte-for-byte; a later DEPLOY over a holed set would
place a performed Session at a new position — **reordering settled record**, which
ADR-0020 forbids. Rather than teach the Builder to fold around holes, Log Correction
**refuses the operations that create one**: an outcome→Incomplete or a delete is rejected
(`409`) iff a later-positioned Session in the same Protocol is currently performed
("undo those first" — tail-first correction). Every other correction — fixing sets,
load, reps, date, or duration; and *any* edit or delete of a plan-less, standalone, or
last-performed log — is allowed, since none can leave a gap. This keeps the "settled
record is never reordered" invariant true without new Builder machinery, and does not
falsify the "deleted log simply recomputes" language: that describes projection
behaviour for a *permitted* correction, not a promise that every deletion is permitted.

## Considered options

- **Re-snapshot body weight from the current Profile on edit** — rejected: it is the
  obvious "consistency with create" a future reader would reach for, and it silently
  evaporates a bodyweight PR the moment an old log is touched (ADR-0026's drift).
- **Harden `reenumerate_tail` to fold around a non-contiguous performed set** — rejected
  for this slice: it is a distinct Builder seam with its own validation and tests, and
  folding it in blurs two concerns and balloons the change.
- **Allow the hole and accept the Builder reorder** — rejected: it violates ADR-0020's
  "a performed Session is never reordered."
- **Block all edits of a mid-Protocol performed log** — rejected: it strands the everyday
  "I entered 60 kg, meant 70 kg" correction that motivates the feature; only the two
  hole-creating operations need refusing.
- **Version records / keep an audit trail** — rejected (YAGNI): nothing in the codebase
  versions records, and the read-time projections make a destructive correction
  self-consistent. Correction is destructive.

## Consequences

- The record side gains its first update/delete path; `LoggedSessionRepository` grows
  `update`/`delete` behind its interface, and one shared edit service enforces ownership
  (`404`), the boundary rule, catalog validity, and mass carry-forward.
- The contiguity refusal is a **server-enforced** gate, not merely a client courtesy — a
  DEPLOY-side test should assert a non-contiguous performed set can never arise, so the
  Builder's contiguous-prefix assumption stays sound.
- `training_type` stays derived from the Session on a plan-backed correction (the
  request's is ignored, as at create); `session_id` is immutable — a mis-parented log is
  deleted and re-logged, never re-pointed.
- XP, Personal Records, Streak, Achievements, and advancement need no correction-specific
  code: as read-time projections they recompute from the corrected record for free.
