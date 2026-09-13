# 07 — Guarded hard delete (retire-then-delete)

**What to build:** An admin permanently removes a Catalog Exercise — but only when it is
**both Retired and wholly unreferenced** (no Exercise Prescription, Logged Set, or
Relationship points at it), the retire-then-delete rule of ADR-0076. Any other attempt is
refused so a live plan or settled record can never be corrupted, and the editor shows
Delete disabled with the reason why. The deletion is audited (the trail survives the
deleted row).

**Blocked by:** 06 — Retire / un-retire and discovery enforcement; 03 — Precautions, Provenance control, and the admin audit trail.

**Status:** ready-for-agent

- [ ] A pure, unit-tested guard permits hard delete iff the Exercise is Retired and has zero references.
- [ ] An admin-gated delete endpoint removes the Exercise (204) only when the guard passes, and writes an audit record that survives the deleted row.
- [ ] A delete of a referenced Exercise, or one not yet Retired, is refused with 409 and changes nothing.
- [ ] The editor's Delete control is disabled until the Exercise is Retired and unreferenced, with the blocking reason shown; the enablement predicate lives in `lib/` with tests.
- [ ] A missing Exercise returns 404; non-admins are rejected.
