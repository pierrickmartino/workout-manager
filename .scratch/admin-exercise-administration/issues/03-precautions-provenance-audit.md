# 03 — Precautions, Provenance control, and the admin audit trail

**What to build:** In the editor, an admin writes the curator-only **precautions** for an
Exercise, and deliberately sets its **Provenance** — promoting a reviewed movement to
`curated`, or correcting/demoting one. Setting Provenance is its own explicit action,
never a side effect of editing other fields (ADR-0075). Every Provenance change is written
to a new append-only admin audit trail recording who changed it, when, and old→new — the
first consumer of that trail, which retire/delete (tickets 06/07) will also use.

**Blocked by:** 02 — Edit an Exercise's descriptive fields.

**Status:** ready-for-agent

- [ ] An admin-gated endpoint sets precautions; the text is HTML-escaped at the write boundary.
- [ ] A separate admin-gated endpoint sets Provenance to any valid tier (promote/correct/demote); an invalid value is rejected with 422.
- [ ] A Provenance change writes an audit record (actor, timestamp, old→new); editing other fields does not.
- [ ] The new audit trail is append-only and readable by an admin for a given Exercise.
- [ ] The editor exposes a precautions field and a distinct Provenance control (not mixed into the descriptive-field save).
- [ ] No automated path (Enrichment, generation, Substitution) changes Provenance — a regression covers this.
- [ ] Uses the envelope and repository pattern; non-admins are rejected.
