# 0037 — Moving on from a Protocol is supersede-by-generation, never deletion

A user stuck on a Protocol they no longer want has no visible way to start a fresh
one: `/protocols/new` is reachable only from the dashboard's *empty-state* CTA, so
while a Current Protocol exists the TRAIN tab — which already `match`es `/protocols`
(`tab-bar.tsx`) — cannot start one. The obvious fix, a "delete this Protocol"
button, is a trap: `LoggedSession.session_id` FKs a Protocol's `WorkoutSession`, and
Logged Sessions are the read-time source of XP, Personal Records, Streak,
Achievements, and history, so deleting a Protocol with a performed Session collides
head-on with "a performed Session is settled record, never rewritten"
(ADR-0020/0034).

**We add the entry point, not deletion.** The TRAIN tab becomes a launchpad offering
"Generate a protocol" / "Generate a workout". Generating a new Protocol Adopts it,
and by the Current-Protocol selection rule (ADR-0030) — most-recently-adopted with an
un-performed Session — it *becomes* Current, **superseding** the old one, which is
**set aside**: still owned, records intact, no longer surfaced, and not (in v1)
switched back to. No delete, no cascade, no new invariant — the behaviour falls out
of the selection rule that already exists.

**The supersede is a one-way door, so we guard it.** Setting aside an in-progress
Protocol is irreversible-feeling (no list, no re-select), so generation fires a
one-off confirmation **only when the Current Protocol has a non-empty frozen
performed prefix** (`completed_count > 0`, ADR-0013/0020); it stays silent when
there is nothing settled to lose (a fresh or Incomplete-only Protocol has made zero
forward progress — its Next Session is still Session 1). The guard is client-side at
the moment of generation: superseding writes nothing to the old Protocol, so the
server needs no new enforcement, and the record behind the set-aside Protocol
survives untouched.

## Considered options

- **A "delete Protocol" endpoint + button** — rejected: it is the change a future
  reader will reach for, and it is exactly the one that breaks records. A performed
  Protocol's Sessions are referenced by settled Logged Sessions; removing them forces
  a cascade or orphan-handling decision over the record model that ADR-0020/0034
  deliberately foreclosed. The whole point of recording this ADR is to stop that
  button being added.
- **Warn on every supersede** — rejected: superseding a fresh or Incomplete-only
  Protocol loses nothing (records survive; the plan queue was still at Session 1), so
  a prompt there is noise. The guard keys on the frozen performed prefix, the same
  notion the Builder freezes.
- **A Protocols index + switch-back** — deferred, not chosen: it is a genuinely
  bigger feature (a way to re-select a *non*-most-recent Protocol as Current, which
  the ADR-0030 selection rule cannot express today) and is not needed to unstick the
  user.

## Consequences

- The one-way door is real in v1: once superseded, a Protocol is unreachable from the
  UI. It is not lost — it stays owned with its records intact — but there is no
  screen that lists or reopens it. The in-progress confirmation is the user's only
  warning, which is why it exists.
- **Out of scope (deliberate no-s):** a Protocols index, switching Current back to an
  older Protocol, and deleting an un-started Protocol. Each is additive later; none is
  needed now.
