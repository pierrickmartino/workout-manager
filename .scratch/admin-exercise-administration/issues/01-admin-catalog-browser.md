# 01 — Admin catalog browser (read-only ops view)

**What to build:** An admin can open an admin exercise browser and see the whole shared
**Catalog** as an ops view — every Exercise regardless of **Provenance**, including
name-only **Stub**s, with each row showing its **Catalog Completeness** tier (Stub /
Listable / Enriched), the internal signal deliberately hidden from the user-facing
catalog. The browser is filterable by Provenance, by Completeness tier, and by a
case-insensitive name search, and each row links toward the (later) editor. Everything is
behind the existing `role=admin` gate; a non-admin gets nothing.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] A new admin-gated browse endpoint returns a paged, filterable list of Catalog Exercises, each carrying its computed Completeness tier and (for later use) its active/retired state.
- [ ] The list includes Stubs and every Provenance — it is not the user-facing, Listable-only catalog.
- [ ] Filters work: by Provenance, by Completeness tier, and by name search; combined filters compose.
- [ ] A non-admin request is rejected (unauthenticated → 401, authenticated non-operator → 403); an operator succeeds.
- [ ] An `/admin/exercises` page renders the browser (server-gated, 404 for non-admins), with rows linking toward the editor.
- [ ] Frontend row view-model, filter predicate, and any sort logic live in the web `lib/` layer with co-located tests; the component stays thin.
- [ ] Uses the standard response envelope and the repository pattern; no direct DB access from the route.
