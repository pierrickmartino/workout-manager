# 0045 — The static Log form derives the Completion Outcome from per-set entry

**Status:** accepted

The static "Log this session" form (`LogSessionForm`) used to declare the Completion
Outcome (ADR-0013) as **always `completed`**, because it recorded one flattened row per
Exercise Prescription and had no per-set signal to derive from. That same one-row-per-exercise
shape silently dropped the prescribed **set count** and every **Superset** when logging — the
defect a user hit as "I duplicate a session and lose my sets and supersets" (the loss was in
the log form, not in Duplicate, which copies both faithfully).

Rebuilding the form to per-set fidelity — one editable row per prescribed set, each with a
**Done** toggle (Model B) — gives it the per-set signal it previously lacked, so it now
**derives** the Completion Outcome instead of hardcoding it: a set is *attempted* when its Done
toggle is checked (even at 0 reps — a set ground out to failure is still attempted, per
CONTEXT 'Completion Outcome'), and the Session is **Incomplete** when any prescribed set was
left un-attempted, else **Completed**. The derived verdict is shown live before submit ("Will
log as: Incomplete — 2 prescribed sets skipped"), never a silent change.

This **does not reverse ADR-0013** — it fulfils it. ADR-0013 rejected a *server*-derived
outcome (a server sees only logged sets, so it would punish honest under-logging) and made the
outcome **client-declared**. This derivation is entirely **client-side**: the form computes the
outcome from what the user marked done and posts it, exactly the client-declared verdict
ADR-0013 chose. What changes is only the static form's shortcut — always `completed` — now that
it has honest per-set state to declare from.

## Considered options

- **Keep declaring `completed`** — rejected: with per-set Done toggles the form can now tell a
  partial session from a full one, so always-`completed` would knowingly mis-advance a Protocol
  (only a Completed log advances it, ADR-0013) on a session the user marked partial.
- **Derive the outcome on the server** from logged rows — rejected for the same reason ADR-0013
  rejected it: the server cannot distinguish "skipped" from "did it but didn't log it", so it
  would mark honest under-loggers Incomplete. Keeping derivation client-side preserves the
  client-declared contract.
- **Hard-block submitting an Incomplete log** — rejected: a genuinely partial session is a valid
  thing to record. The live indicator makes the consequence visible (Q11) without preventing it.

## Consequences

- **Supersets and set counts survive logging.** The rebuilt form renders every prescribed set
  and shows the cosmetic Superset badge. Supersets remain a *plan* overlay only — a Logged Set
  still carries no grouping (the record model is unchanged).
- **A partial static log can now leave a Protocol un-advanced**, where before it always advanced
  it. This is the intended honesty; the "Will log as…" indicator discloses it at submit time.
- **The outcome stays client-declared**, so the trust model (self-reported reps/load/RPE, and
  now attempted/skipped) is unchanged from ADR-0013.
