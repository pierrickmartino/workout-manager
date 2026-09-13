# Spec — Admin Exercise Administration

> **Triage:** `ready-for-agent` · **Branch:** `claude/hello-opus-lnhnvf`
> **Decisions:** ADR-0075 (Provenance is a deliberate admin-mutable act), ADR-0076
> (Catalog Retire + guarded hard delete), CONTEXT.md `Retire` term. Respects ADR-0002,
> ADR-0041, ADR-0046, ADR-0063, ADR-0069, ADR-0071.
>
> _Publishing note: the project issue tracker was unavailable when this was written
> (GitHub connector 403); this file is the interim home. Re-publish to the tracker with
> the `ready-for-agent` label once the connector is restored._

## Problem Statement

The shared **Catalog** fills up over time with AI-invented (`ai_generated`) and
user-typed (`user_entered`) Exercises that no human has reviewed. Today an admin has no
way to act on any single Exercise: they can only trigger a bulk Enrichment backfill and
read an aggregate catalog-health readout. They cannot fix a wrong description, add the
curator-only precautions or an Exercise **Image**, confer or revoke the `curated` trust
tier, wire up **Variation** / **Alternative** relationships, or get a junk or unsafe
movement out of users' way. In an injury/rehab/postpartum-cautious domain, having no
per-Exercise curator controls is a safety and quality gap.

## Solution

Give the `role=admin` operator full administration of individual Catalog Exercises,
delivered as a backend API and an `/admin` frontend surface:

- **Browse** the whole Catalog as an ops view — every **Provenance**, every **Catalog
  Completeness** tier (including **Stub**s and **Retired** Exercises), with the internal
  completeness signal shown (it stays hidden on the user-facing catalog).
- **Edit** an Exercise's descriptive fields, its **Primary/Secondary** muscle-emphasis
  split, its **precautions**, and its **Exercise Image** (a real upload — curator-only).
- **Set Provenance** deliberately — promote a reviewed movement to `curated`, or
  correct/demote — as an explicit, audited act (never a side effect of other edits).
- **Manage relationships** — list, add, and remove **Variation** / **Alternative** links.
- **Enrich** — surface the existing backfill + catalog-health controls in the new UI and
  trigger Enrichment for a single **Stub** on demand.
- **Retire / un-retire** an Exercise (a reversible tombstone that hides it from discovery
  while keeping it resolvable), and **hard-delete** one only when it is both Retired and
  wholly unreferenced.

Every consequential act (Provenance change, retire, un-retire, hard delete) is recorded
in an append-only admin audit trail.

## User Stories

1. As an admin, I want to open an admin exercise browser, so that I can see and act on the whole Catalog in one place.
2. As an admin, I want the browser to list every Exercise regardless of Provenance, so that unreviewed `ai_generated` and `user_entered` movements are visible to me.
3. As an admin, I want the browser to include **Stub** Exercises, so that I can find name-only movements that still need content.
4. As an admin, I want each row to show its **Catalog Completeness** tier (Stub / Listable / Enriched), so that I can prioritise which movements to enrich — a signal deliberately hidden from ordinary users.
5. As an admin, I want to filter the browser by Provenance, so that I can review only AI-invented movements.
6. As an admin, I want to filter by Completeness tier, so that I can work through all the Stubs.
7. As an admin, I want to filter by active vs Retired, so that I can find movements I previously retired.
8. As an admin, I want to search the browser by name, so that I can jump straight to a movement I know exists.
9. As an admin, I want to open an editor for one Exercise, so that I can change its details.
10. As an admin, I want to edit an Exercise's description, so that a wrong or empty description can be corrected.
11. As an admin, I want to edit an Exercise's **Execution Steps**, so that the how-to instructions are accurate.
12. As an admin, I want to edit an Exercise's targeted muscles and required equipment, so that generation and discovery use correct data.
13. As an admin, I want to set the **Primary/Secondary** muscle-emphasis split, so that the Enriched tier and Muscle Group roll-ups are right.
14. As an admin, I want to edit an Exercise's difficulty, so that it reflects reality.
15. As an admin, I want to fix an Exercise's display name, so that spelling and casing can be corrected.
16. As an admin, I want a rename that would collide with another Exercise's normalized name to be rejected with a clear conflict, so that I never silently merge two distinct movements.
17. As an admin, I want to write an Exercise's **precautions**, so that safety notes exist — a curator-only field the Enrichment AI is forbidden to fabricate.
18. As an admin, I want precautions to be stored safely (escaped), so that free text cannot inject markup.
19. As an admin, I want to upload an **Exercise Image**, so that Exercise Detail can show a correct, curated illustration.
20. As an admin, I want image uploads restricted to safe image types and a sane size, so that bad or oversized files are refused.
21. As an admin, I want to replace an existing image, so that I can correct a wrong illustration.
22. As an admin, I want to remove an image, so that a wrong picture can be taken down without leaving a broken one.
23. As any signed-in user, I want an Exercise's uploaded image to render on Exercise Detail, so that the curated picture is visible where it always was.
24. As an admin, I want to promote an Exercise's Provenance to `curated`, so that a movement I have reviewed is marked human-trusted.
25. As an admin, I want to correct or demote Provenance, so that a wrongly-trusted or unsafe movement loses its `curated` badge.
26. As an admin, I want Provenance changes to be a deliberate, separate action, so that trust is never conferred as an accidental by-product of editing other fields.
27. As an admin, I want every Provenance change recorded with who/when/old→new, so that conferring trust is auditable in a safety-cautious domain.
28. As an admin, I want to see an Exercise's existing Variation and Alternative relationships (both directions), so that I understand what Substitution will offer.
29. As an admin, I want to add a Variation or Alternative link, so that Substitution has good lookup-first candidates.
30. As an admin, I want to remove a relationship, so that a wrong or misleading link is gone.
31. As an admin, I want self-links and duplicate links rejected, so that the relationship graph stays clean.
32. As an admin, I want to trigger Enrichment for a single Stub on demand, so that I can fill one movement I'm looking at without running the whole backfill.
33. As an admin, I want the existing bulk Enrichment backfill and catalog-health readout available from the new admin exercise area, so that per-Exercise and corpus-wide tools live together.
34. As an admin, I want to Retire an Exercise, so that a junk, duplicate, or unsafe movement disappears from users' discovery.
35. As an admin, I want a Retired Exercise to vanish from Browse the Catalog, the Library pick widget, equipment facets, Substitution candidates, and Exercise Detail's variation/alternative lists, so that users never encounter it.
36. As an admin, I want Retiring an Exercise to leave every existing Exercise Prescription, Logged Set, and Relationship intact, so that no user's plan or settled record breaks.
37. As an admin, I want a Retired Exercise excluded from the Enrichment scan, so that no LLM effort is spent on a hidden movement.
38. As an admin, I want to un-Retire an Exercise, so that a movement I hid by mistake returns cleanly to discovery.
39. As an admin, I want a Retired Exercise to still show up in my admin browser, so that I can find and un-Retire it.
40. As an admin, I want an AI- or user-generated movement whose name matches a Retired one to reuse the existing row without un-Retiring it, so that the model re-inventing a name cannot undo my decision.
41. As an admin, I want to hard-delete an Exercise that is Retired and wholly unreferenced, so that a genuine mistake can be removed permanently.
42. As an admin, I want a hard delete refused when the Exercise is still referenced by any Prescription, Logged Set, or Relationship, so that I can never corrupt a plan or record.
43. As an admin, I want a hard delete refused unless the Exercise has been Retired first, so that permanent removal is always a deliberate two-step act.
44. As an admin, I want retire, un-retire, and hard delete recorded in the audit trail, so that destructive acts are traceable.
45. As an admin, I want the editor to disable Delete (with the reason shown) until the Exercise is Retired and unreferenced, so that I understand why I can't delete yet.
46. As a non-admin user, I want all of these write endpoints to reject me, so that only operators can change the shared Catalog.
47. As a user with a Sensitive Constraint, I want retirement and curation to change nothing about the safety cache bypass, so that fresh generation still applies to me.
48. As a user, I want generation and Substitution to keep working unchanged, so that admin activity never degrades my experience.

## Implementation Decisions

- **Authorization reuses the one operator gate.** Every write and the admin browser feed
  sit behind the existing `require_admin` dependency (ADR-0046); the frontend reuses the
  existing server-side admin gate and `notFound()` pattern (ADR-0071). No new role tier,
  no roles table — "admin" stays the single Clerk `role=admin` claim. Server actions do
  not re-check; the backend is the sole authority.
- **New schema (one migration, `down_revision` = the current head).**
  - A `retired` boolean on the Exercise, defaulting false; backfilled false for existing rows.
  - An **Exercise Image** store holding uploaded bytes + content-type + size + uploader +
    timestamp, one image per Exercise, kept out of the wide Exercise row. The legacy
    nullable image URL/asset-key field remains and still serves curated external
    references; the served image is chosen upload-first, else the legacy URL.
  - An append-only **exercise admin audit** record: exercise reference, actor, action
    (`provenance_change` | `retire` | `unretire` | `hard_delete`), a JSON detail
    (e.g. old→new Provenance, or the deleted movement's normalized name), and a timestamp.
    A hard-delete audit row survives the deleted Exercise (no enforced FK back to it).
- **Repository pattern extended, not bypassed.** The Exercise repository gains immutable
  writers — a partial `update` (returns a fresh Exercise; a rename whose normalized name
  collides with a *different* Exercise raises a typed conflict → HTTP 409), a deliberate
  Provenance setter, a precautions setter, retire / un-retire, a guarded hard delete, and
  a reference counter (Prescriptions + Logged Sets + Relationships). Discovery reads
  (`search`, `browse`, `browse_all`, and the equipment-facet consumer of `list_all`) gain
  an `include_retired` flag defaulting to exclude; the admin browser passes it true. A new
  admin-browse read returns filtered, paged rows carrying the computed Completeness tier.
  New small repositories back the Exercise Image store and the audit trail. The
  relationship repository gains list-both-directions and remove, and `add` rejects
  self-links and duplicate `(from, to, kind)`.
- **Pure domain helpers.** The hard-delete guard (`retired ∧ zero-references`) and image
  validation (allowed content-types + a max-size constant) are pure functions in the
  domain layer, consumed by the routes. Provenance accepts any member value (no gate);
  Catalog Completeness computation is unchanged.
- **API contract (all admin-gated unless noted; standard `{success,data,error}` envelope;
  literal paths declared before the `/{id}` path).**
  - Admin browser feed: paged, filterable by name query, Provenance, Completeness tier,
    and retired/active; rows include the Completeness tier and retired flag.
  - Partial edit of descriptive fields + emphasis → 200; 409 on name collision; 422 on
    invalid input; 404 if absent.
  - Set Provenance → 200 + audit; set precautions (escaped) → 200.
  - Retire / un-retire → 200 + audit.
  - Hard delete → 204 + audit; **409** when not (Retired ∧ unreferenced).
  - Image upload (multipart) → 200 with the served URL; **415** wrong type; **413** too
    large. Image delete → 204. Image fetch is readable by **any signed-in user** (it feeds
    Exercise Detail); every other route is operator-only.
  - Relationships: list → 200; add → 201 (409 duplicate, 422 self-link); remove → 204.
  - Single-Stub enrich → 202 (reuses the existing Enrichment machinery).
- **Retire enforcement lives in the repository reads**, so the existing user-facing catalog
  browse, facets, taxonomy, Exercise-Detail variation sublist, and Substitution candidate
  build all stop surfacing Retired Exercises automatically, while fetch-by-id still resolves
  a Retired Exercise for existing references.
- **Generation / Substitution unchanged beyond reuse-but-keep-retired.** The existing
  find-or-create-by-normalized-name already reuses a matching row; because it applies no
  status predicate it binds to a Retired row without un-retiring it.
- **Image upload path.** Storage is the app's own database (no object store, no new
  secret). The web app forwards the uploaded file as multipart to the API with the Clerk
  JWT via a single new upload helper in the existing server-only transport seam; the rest
  of that seam stays JSON. Exercise Detail's existing plain-`<img>` component points at the
  image-fetch endpoint when an upload exists, else the legacy URL (no `next/image`, no
  remote-host config change).
- **Frontend surface.** An admin catalog **browser** page (search + the three filters,
  rows linking to the editor, Completeness tier shown) and an admin **editor** page
  (descriptive fields, emphasis, precautions, image upload/preview/remove, Provenance
  control, relationship add/remove, single-Stub enrich, retire/un-retire, guarded delete
  with a confirm and a disabled-reason). A card on the existing `/admin` home links to the
  browser. Frontend logic (row view-model, filter predicate, delete-enablement predicate,
  image-src resolution) lives in the web `lib/` layer with co-located tests; components
  stay thin. The admin-claim constants stay in lockstep with the backend config, per the
  existing note.

## Testing Decisions

- **What makes a good test here:** assert observable behavior at the seam — the HTTP
  response and envelope, what each discovery surface returns, the audit record produced,
  the rendered view-model — never repository internals, private fields, or ORM state.
  AAA structure, behavior-describing names, ≥80% coverage.
- **Seam 1 — the HTTP route boundary (primary).** Exercise the whole backend through the
  FastAPI endpoints using the existing offline `TestClient` harness (SQLite / in-memory
  repositories, injected admin JWT). Prior art: the existing admin-auth test and the
  exercise-route tests. Coverage: the auth matrix (unauthenticated / non-operator /
  operator) on every admin route; partial edit happy-path + 409 name collision + 422;
  Provenance change writes an audit row; retiring hides the Exercise from the user-facing
  browse, facets, and Substitution candidates while fetch-by-id still resolves it;
  un-retire restores it; the hard-delete guard returns 409 until the Exercise is Retired
  and unreferenced, then 204 and an audit row; image upload 200 / 415 / 413, and image
  fetch readable by a normal user; relationship list / add / remove with self-link and
  duplicate guards; single-Stub enrich accepted; and a regression that generation /
  Substitution over a name matching a Retired row keeps it Retired.
- **Seam 2 — the web view-model (`lib/`).** Test the pure mapping/predicate logic with the
  project's `node --test` runner, matching the existing co-located `lib/*.test.ts` prior
  art: the admin-row view-model (tier + retired badge), the filter predicate, the
  delete-enablement predicate (Retired ∧ unreferenced), and image-src resolution
  (uploaded vs legacy URL).
- **Pure domain helpers** (hard-delete guard truth table, image validation boundaries) are
  tested directly as unit tests in the domain layer — the repo treats domain logic as the
  natural home for exhaustive, I/O-free unit tests.
- **Terminology guard:** `Retire` is additive, so nothing is removed from the banned-terms
  registry; the change must not introduce any banned regression.

## Out of Scope

- Creating a brand-new Exercise from scratch in the admin UI.
- Merging two duplicate Catalog Exercises (re-pointing every reference).
- Per-field edit history / full change log (only the four consequential acts are audited).
- Object-storage / CDN image backend and user-facing image uploads (still deferred,
  ADR-0041); admin upload is stored in the app database.
- Any new role tier or per-user permission model beyond the existing `role=admin` claim.
- Changes to how Substitution or generation *select* movements, beyond honoring the
  Retired filter and the reuse-but-keep-retired rule.

## Further Notes

- The two ADRs (0075, 0076) carry the "why" and the rejected alternatives; this spec is the
  "what". CONTEXT.md now defines **Retire** and records the Provenance and Catalog revisions.
- Delivery order: schema + backend first (test-first, red→green), then the web surface.
  Conventional commits on the feature branch; no PR unless explicitly requested; the
  `REVIEW.md` checklist is run before hand-off.
