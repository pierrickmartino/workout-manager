---
status: proposed
---

# 0020 — The Protocol Builder is a manual mutation model over the un-performed tail

Until now a Protocol could be created **only** by Adopt (a deep copy of an AI
generation, ADR-0003) and changed **only** by Substitution or Regeneration; ADR-0001
fixed it as a fully-enumerated, self-paced sequence generated up front, deliberately
avoiding calendar reshuffling. F4 introduces the app's **first manual authoring /
mutation model** — a user editing the plan itself — so this ADR records how that is
done without reopening the reconciliation problems ADR-0001 closed or corrupting the
record/plan split. It **amends ADR-0001**.

**The builder edits an existing adopted Protocol, and its shape is editable.** The
user can grow/shrink the number of weeks and the per-week session count, add and
remove Sessions, and author Exercise Prescriptions by hand. Blank-slate authoring of
a brand-new Protocol is **not** in scope for v1 — it is a larger surface that partly
duplicates generation, and "create empty + apply the same edits" can layer on later
over exactly these primitives.

**Editing only ever reaches the un-performed tail.** A Session that has an advancing
Logged Session (ADR-0013) is settled **record** and is never rewritten, reordered, or
deleted; only Sessions with no performance behind them are mutated. This is the
central safety rule: it confines the "reshuffle" ADR-0001 avoided to Sessions that no
record depends on, so Logged Sessions, Personal Records (ADR-0010), and the
Progression overlay (ADR-0004) can never be orphaned by an edit. New Session slots
created by growing the shape are **empty skeletons** the user fills from the catalog —
never faked content.

**Edits stage client-side and commit atomically with `DEPLOY`.** Mirroring the
ephemeral-client posture of the Live Session (ADR-0012), the whole draft lives in the
builder; nothing touches the live Protocol until `DEPLOY`, which sends the desired
un-performed tail and the server **replaces that tail in place** — performed
`session_id`s are preserved untouched, and only un-performed Sessions are
deleted/inserted. `DEPLOY` is the single **validation gate**: it rejects empty
Sessions (an empty Session would otherwise surface as the Next Session and launch an
empty Live Session), Prescriptions with no valid catalog Exercise, `sets < 1`, or an
empty rep target; load stays optional (a qualitative/absent Load is legitimate). This
keeps Home and Live pointed at the last deployed state throughout a multi-step edit,
and gives `DEPLOY PROTOCOL` an honest meaning — promote a validated plan — rather than
a per-keystroke write.

**Two smaller calls fall out of this.** Hand-set loads stay **Progression-adjustable**
(no pin flag): a manually entered load is simply the base the ADR-0004 overlay nudges
from, exactly like an AI-set one, so the edit demonstrably drives the number and the
app's core auto-adjust value survives on hand-built Sessions. And `sessions_per_week`
becomes a **soft default / header value, not a rigid invariant** — the positional
matrix renders the *actual* per-week Session count, which ADR-0001 already blesses
(deload weeks legitimately differ). A frequency change therefore applies to
un-performed/new weeks; frozen performed weeks keep their real counts, sidestepping the
incoherence of "re-slicing" weeks that have already been trained.

## Considered options

- **Immediate per-mutation writes** (like Substitute/Regenerate) — rejected: a
  half-built empty Session would leak straight into Home's Next Session and Live, and a
  multi-step reshape would have no atomic commit point.
- **Config-immutable, prescription-only editing** — rejected: the shape (weeks /
  frequency) was explicitly wanted as editable; confining edits to Prescriptions inside
  a fixed structure was too narrow.
- **Editing performed Sessions too** — rejected: it rewrites the record and would
  orphan the read-time PR/Progression engines that key off it.

## Consequences

- This is the first write-mutation feature beyond generate-and-adopt; it adds a
  Protocol `name` field, a prescription-CRUD / tail-`DEPLOY` endpoint, and a net-new
  exercise-search endpoint (see ADR-0021).
- The **frozen-prefix invariant must be server-enforced**, not merely respected by the
  client — a deploy payload that tries to alter a performed Session is rejected.
- ADR-0001's "fixed / generated up front / no reshuffling" is relaxed for the
  un-performed tail only; the frozen performed prefix is what preserves the
  plan-vs-record split it was protecting.
