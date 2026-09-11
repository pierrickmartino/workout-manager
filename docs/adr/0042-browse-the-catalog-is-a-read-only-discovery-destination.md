# 0042 — Browse the Catalog is a read-only discovery destination

Until now the shared Exercise **Catalog** was only reachable *inside* an
add-to-plan flow: the `ExerciseLibrary` picker (ADR-0021) searches it by name so a
user building a Protocol or hand-authoring a Session can pick a movement. There was
no entry point to simply *browse* the Catalog and **discover** movements a user
doesn't already know to search for. `GET /api/exercises` required a name query — "a
blank query matches nothing" — and matched name substring only, with no way to list
or filter the corpus. This ADR adds **Browse the Catalog**: a first-class,
**read-only** discovery destination at `/exercises`, reached from the TRAIN hub.

## Considered options

- **A new "add from Catalog" surface (rejected for v1).** Letting a browsed Exercise
  be added straight into a plan reopens the whole "add to *which* Session, via
  **Deploy**, touching only the un-performed tail" machinery (ADR-0020/0021). The
  picker already covers add-during-build, so discovery and plan-editing stay separate
  acts. Browse is read-only; it links out to the existing Exercise Detail
  (`/exercises/{id}`), from which "Add to Protocol" already exists.
- **A second browse endpoint (rejected).** Keeping `search` untouched and adding
  `GET /api/exercises/browse` would split one catalog read across two contracts. We
  instead **extend `GET /api/exercises`**: a blank query now means "list the whole
  Catalog," with optional `muscle_group` / `equipment` / `difficulty` filters. The
  picker is unaffected — it only ever sends a non-blank query.
- **Show only a trustworthy/complete subset (rejected).** Hiding Stubs would make
  discovery tidier, but the product decision is to show the **whole** Catalog. Trust
  and completeness are surfaced (badges) and used to *order*, never to hide.

## Consequences

- **Blank query = list all.** `GET /api/exercises` with no `query` now returns the
  whole Catalog (subject to filters), paginated in the standard envelope. A non-blank
  query still substring-matches by normalized name. The repository's older `search`
  method (blank → empty) stays for its existing callers/tests; the route now goes
  through the new `browse`.
- **Filtering lives in the repository; the Muscle-Group roll-up stays a pure domain
  function.** `browse` loads candidate rows (all, or name-matched) and applies a
  **pure** predicate (`app/domain/exercise_browse.py`) for the three facets, then
  ranks and slices — so pagination is correct over the *filtered* set. The curated
  six-bucket Muscle-Group mapping is reused from `app/domain/muscle_groups.py`
  (`classify`), never re-implemented in SQL. Both the SQL and in-memory repositories
  share one `_browse_page` helper, exactly as they already share `_page`.
- **Facets.** **Muscle Group** filters by the curated six buckets (Legs/Chest/Back/
  Shoulders/Arms/Core), multi-select, OR-within-facet, **Unclassified excluded** (it
  is never a coverage target, ADR-0025). **Equipment** multi-select over the Catalog's
  known `required_equipment` values (options served by `GET /api/exercises/facets`),
  with a client-side "my equipment" shortcut seeded from Default Equipment but **no
  default filter**. **Difficulty** as three coarse bands over the stored 1–10
  (Beginner 1–3 / Intermediate 4–7 / Advanced 8–10). Facets combine with **AND**;
  name search is AND'd on top.
- **"Show everything" is true for the unfiltered view.** A Stub is name-only, so it
  carries no muscle, equipment, or difficulty and is naturally excluded the moment any
  facet is active. This is intended: browse raw and Stubs appear (badged); filter and
  the view narrows to movements with that content.
- **Default order: curated → completeness → name.** The unfiltered list leads with
  trustworthy, complete movements — Provenance rank (curated < ai < user), then
  Catalog Completeness (Enriched < Listable < Stub), then normalized name — so Stubs
  sink to the bottom without being hidden. Provenance and Completeness badges are
  reused exactly as the picker and Exercise Detail render them.
- **Usage markers are read-time projections, strictly descriptive.** Each browse row
  carries a lightweight **TRAINED / NEW** marker and a relative "last performed"
  recency, computed read-time from the user's Logged Sets (`last_performed`,
  `app/domain/exercise_usage.py`) — never a stored column, consistent with the
  read-time-projection invariant (ADR-0018/0019). Served by `GET
  /api/exercises/usage` as a per-user `{exercise_id: last_performed_on}` map so the
  Catalog read itself stays user-agnostic and the picker's per-keystroke cost is
  unchanged. Reading a **record's** date is honest under the self-paced, calendar-free
  model (ADR-0001): ADR-0001 forbids dated *plans*, not reading when a performance
  happened. The marker is **descriptive only** — no "overdue" styling, no call to
  train a gap — the same discipline as Muscle Group Coverage (ADR-0025).
- **Navigation.** A new `/exercises` index page under the TRAIN section (the tab
  already lights up for `/exercises`), reached from a "Browse the catalog" entry on
  the TRAIN hub. No fifth tab. A Home affordance is deferred.
