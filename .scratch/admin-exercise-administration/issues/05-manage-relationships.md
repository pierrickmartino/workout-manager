# 05 — Manage Variation / Alternative relationships

**What to build:** In the editor, an admin sees an Exercise's typed **Variation** and
**Alternative** relationships in both directions, adds a new link, and removes one — the
lookup-first candidates Substitution resolves over. Self-links and duplicate links are
rejected so the relationship graph stays clean.

**Blocked by:** 02 — Edit an Exercise's descriptive fields.

**Status:** ready-for-agent

- [ ] An admin-gated endpoint lists an Exercise's relationships in both directions, showing kind (Variation / Alternative) and direction.
- [ ] An admin-gated add endpoint creates a Variation or Alternative link and returns 201.
- [ ] Adding a self-link is rejected (422); adding a duplicate `(from, to, kind)` is rejected (409).
- [ ] An admin-gated remove endpoint deletes a specified link (by from/to/kind) and returns 204.
- [ ] No automatic reciprocal/inverse link is created.
- [ ] The editor lists relationships and offers add/remove; a missing Exercise returns 404; non-admins are rejected.
- [ ] Uses the envelope and the relationship repository (no direct DB access from the route).
