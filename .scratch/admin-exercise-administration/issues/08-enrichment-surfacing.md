# 08 — Enrichment surfacing and per-Stub enrich-now

**What to build:** An admin triggers **Enrichment** for a single **Stub** directly from its
editor (reusing the existing enrichment machinery), and the existing bulk Enrichment
backfill control and aggregate catalog-health readout are surfaced together inside the
admin exercise area, so per-Exercise and corpus-wide enrichment tools live in one place.

**Blocked by:** 01 — Admin catalog browser; 02 — Edit an Exercise's descriptive fields.

**Status:** ready-for-agent

- [ ] An admin-gated endpoint enqueues Enrichment for a single Exercise and returns 202, reusing the existing out-of-band enrichment path (no new AI on the write path).
- [ ] The editor offers an "enrich now" action for an Exercise and reflects that a job was accepted.
- [ ] The existing bulk backfill trigger and the catalog-health (Completeness breakdown) readout are reachable from the admin exercise area.
- [ ] A missing Exercise returns 404; non-admins are rejected.
- [ ] No change to Provenance results from enrichment (unchanged invariant, covered by existing/added tests).
