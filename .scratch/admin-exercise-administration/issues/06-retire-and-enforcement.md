# 06 — Retire / un-retire and discovery enforcement

**What to build:** An admin **Retires** an Exercise — a reversible tombstone (ADR-0076)
that hides it from every discovery/candidate surface (Browse the Catalog, the Library pick
widget, equipment facets, Substitution candidates, the Exercise-Detail variation/
alternative sublist, and the Enrichment scan) while it stays fully resolvable by id, so no
existing Exercise Prescription, Logged Set, or Relationship breaks. The admin can
**un-Retire** for a clean restore. The admin browser gains an active/Retired filter, and a
Retired Exercise still appears there. A generated or user-typed movement whose name matches
a Retired one reuses that row **without** un-retiring it. Retire and un-retire are audited.

**Blocked by:** 01 — Admin catalog browser; 03 — Precautions, Provenance control, and the admin audit trail (shares the audit trail).

**Status:** ready-for-agent

- [ ] A `retired` flag is added to the Exercise (migration chains onto the current head at merge time), defaulting to not-retired for existing rows.
- [ ] Admin-gated retire and un-retire endpoints flip the flag and write an audit record; both are reversible.
- [ ] A Retired Exercise disappears from catalog browse/search, equipment facets, the taxonomy, Substitution candidates, and the Exercise-Detail variation/alternative sublist.
- [ ] A Retired Exercise is excluded from the Enrichment scan.
- [ ] Fetch-by-id still resolves a Retired Exercise, and existing Prescriptions/Logged Sets/Relationships are untouched.
- [ ] Generation/Substitution reusing a movement whose normalized name matches a Retired row binds to it without un-retiring — covered by a regression.
- [ ] The admin browser's active/Retired filter works and Retired Exercises remain visible to the admin.
- [ ] The editor offers Retire / un-Retire; non-admins are rejected.
