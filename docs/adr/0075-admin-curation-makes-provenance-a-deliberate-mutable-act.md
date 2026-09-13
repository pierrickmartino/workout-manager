# 0075 — Admin curation makes Provenance a deliberate, mutable act

ADR-0002 and ADR-0041 declared an Exercise's **Provenance** *immutable origin*:
Enrichment fills fields but never promotes trust, so AI-filled content on a
`user_entered` or `ai_generated` movement can never masquerade as human-reviewed.
That guarantee was aimed squarely at the **automated** paths (generation,
substitution, enrichment) — the ones the domain's injury/rehab caution cannot let
silently confer trust.

We are adding **exercise administration** for the `role=admin` operator
(`require_admin`, ADR-0046), and the admin **is** the trusted human the `curated`
tier was invented for. So we relax the invariant for exactly one path: an admin may
**set an Exercise's Provenance deliberately** — promote to `curated` when they have
reviewed it, and correct or demote (`curated → ai_generated`) when they find content
that should not carry human-reviewed trust. Every other rule stands: enrichment,
generation, and substitution **still never touch Provenance**, the write path stays
AI-free (ADR-0002), and "immutable origin" is re-read as **"no *automated* path
mutates Provenance"** rather than "Provenance never changes at all".

The change is a distinct, explicit action — a dedicated `PUT
/api/exercises/{id}/provenance`, never a side effect of editing an Exercise's other
fields — and it is **audited** (who, when, old → new value), because conferring or
revoking trust in a safety-cautious domain must be traceable.

## Considered options

- **Promote-only (rejected).** Allow `→ curated` but never back. Simpler, but a
  curator who can *confer* trust must be able to *revoke* it — a movement mistakenly
  promoted, or later found unsafe, would otherwise be stuck wearing human-reviewed
  trust with no way down.
- **Full curator control (chosen).** The admin may set any Provenance value. The
  audit record, not an artificial one-way ratchet, is what keeps it honest.
- **Keep Provenance strictly immutable, add a parallel "reviewed" flag (rejected).**
  A second trust axis duplicating what `curated` already means — two fields the rest
  of the system would have to reconcile, for no gain over simply letting the curator
  own the one axis.

## Consequences

- **Only the admin act mutates Provenance.** The immutability ADR-0002/0041 promised
  is preserved where it matters: no generation, substitution, or enrichment path
  changes trust. A code reader who expected Provenance to be write-once should look
  here and at the single admin endpoint.
- **Audited.** Provenance changes are recorded in the exercise-admin audit trail
  (see ADR-0076), alongside retire/delete — the two consequential admin acts.
- **No new user-facing surface.** Provenance still renders as it did; only an admin
  can change it, behind `require_admin`.
