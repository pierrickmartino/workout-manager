# 0076 — Catalog Retire is a reversible tombstone; hard delete is guarded and retire-first

ADR-0002 fixed that catalog **membership is never deleted**: Exercise Prescriptions,
Logged Sets, and Exercise Relationships all reference a catalog Exercise **by id**,
and `PrescriptionView` joins the catalog's fields at read time — so removing a
referenced row would corrupt live plans and *settled records*, which the domain never
rewrites (ADR-0020). But exercise administration needs a way to get a junk, duplicate,
or unsafe movement **out of users' way**. We reconcile the two with two distinct acts.

**Retire** is the primary mechanism: a **reversible soft tombstone** (a `retired`
flag on the Exercise). A Retired Exercise is hidden from every **discovery / candidate**
surface but stays **fully resolvable by id**, so nothing that already references it
breaks. Only an admin retires, and only an admin **un-retires** — retirement is never a
side effect of any other path.

**Hard delete** is the narrow exception: an admin may *permanently* remove an Exercise
**only** when it is genuinely **unreferenced** — no Exercise Prescription, no Logged Set,
no Exercise Relationship points at it — **and only after it has been Retired**
(*retire-then-delete*). This mirrors the Session **Delete** guard, which allows a hard
delete of a plan only when no Logged Session references it (ADR-0063): a referenced
Exercise is settled shared state and is never destroyed. Requiring Retire first makes
destruction a deliberate two-step act rather than a one-click surprise.

## Enforcement — where `retired` is honored

- **Excluded (discovery / candidates):** `search`, `browse`, `browse_all`, the equipment
  **facets** derived from `list_all`, Substitution **candidates** (`substitutes_for`), the
  variations/alternatives sublist on Exercise Detail, and the **Enrichment** scan (no LLM
  spend on a hidden movement).
- **Still resolved (existing references):** `get(id)` — the Exercise Detail route,
  Substitution's read of the currently-prescribed movement, and every Prescription /
  Logged Set reference. A retired Exercise always resolves by id.
- **Visible (ops):** the admin exercise browser and the admin catalog-health readouts show
  retired Exercises so a curator can find and un-retire them.

## The dedup edge case — reuse but keep retired

`normalized_name` is uniquely indexed and `find_or_create` looks up purely by that name
with no status predicate, so the DB **cannot** mint a second row for a name that a retired
row already holds. When generation or substitution emits a movement whose name normalizes to
a retired row, we **reuse the existing row by id without un-retiring it**. The user's plan
resolves the movement fine (references are by id), but it stays absent from discovery, and
**un-retire remains an admin-only act, never an automated resurrection** — so the AI
re-inventing a junk name cannot undo a curator's decision.

## Considered options

- **Hard delete referenced rows (rejected).** Corrupts live plans and settled records
  (ADR-0020) and breaks the read-time catalog join.
- **Resurrect on dedup collision (rejected).** Letting `find_or_create` silently un-retire a
  row would let AI free-text undo curation and re-pollute discovery.
- **Delete without requiring Retire first (rejected).** A one-click permanent delete of an
  "unreferenced" Stub is too easy to fire by mistake; retire-first forces a deliberate,
  reversible pause before the irreversible step.

## Consequences

- **Relaxes ADR-0002's "never deleted".** Membership is now *never deleted while referenced*;
  the only hard delete is of a Retired, unreferenced row.
- **Retire is reversible; delete is not.** Un-retire fully restores discovery. A hard delete
  is final — hence the unreferenced + retired-first guards.
- **New nullable-default column `retired` on `exercise`** (migration `0041`), plus the
  `retired` filter threaded through the discovery repository methods above.
- **Audited.** Retire, un-retire, and hard delete are recorded in the exercise-admin audit
  trail alongside Provenance changes (ADR-0075).
- **A new domain term, `Retire` / `Retired`,** enters `CONTEXT.md` — distinct from **Delete**
  (a standalone Session) and **Remove** (an Exercise Prescription), both already taken.
