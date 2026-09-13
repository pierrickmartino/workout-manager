# Spec — Admin Exercise Administration

**Status:** draft for sign-off · **Branch:** `claude/hello-opus-lnhnvf`
**Decisions:** ADR-0075 (Provenance mutability), ADR-0076 (Retire / guarded delete),
CONTEXT.md (`Retire` term). Builds on ADR-0002, ADR-0041, ADR-0046, ADR-0069, ADR-0071.

## 1. Goal & scope

Give the `role=admin` operator full administration of the shared Exercise **Catalog**.

**In scope**
- Edit an Exercise's descriptive fields (description, Execution Steps/instructions,
  targeted muscles, difficulty, required equipment) and the muscle-emphasis split.
- Write the **curator-only** fields: precautions and the Exercise **Image** (real upload).
- Set **Provenance** deliberately (promote/correct/demote) — audited.
- Manage **Variation / Alternative** relationships (list + add + remove).
- **Enrichment**: surface existing controls in the new UI + a per-Exercise "enrich now".
- **Retire / un-retire** and guarded **hard delete** (retire-then-delete).
- Minimal **audit** of provenance changes and retire/delete.
- Admin **catalog browser** (all provenance/completeness, incl. Stubs and retired).

**Out of scope (v1):** create-from-scratch, merge duplicate Exercises, per-field edit
history, object-storage image backend, any new role tier.

**Authorization:** every write and the admin browser feed sit behind `require_admin`
(ADR-0046). No new role concept. Frontend gate = existing `resolveIsAdmin()`; the
backend is the sole authority (server actions do not re-check).

## 2. Data model & migration `0041_admin_exercise_admin`

`down_revision = "0040_note"`.

1. **`exercise.retired`** — `bool NOT NULL DEFAULT false`. Add a column; existing rows
   backfill to `false`.
2. **`exercise_image`** table — uploaded image bytes kept out of the wide `exercise` row:
   - `exercise_id` (PK, FK→`exercise.id`, one image per Exercise)
   - `content_type` (`text`, one of `image/jpeg|png|webp`)
   - `bytes` (`LargeBinary`)
   - `byte_size` (`int`), `uploaded_by` (`text`, clerk sub), `uploaded_at` (`datetime`)
   - The existing nullable `exercise.image` **URL/asset-key stays** and continues to serve
     curated external references; the served image URL is chosen image-row-first, else the
     legacy `image` string. (No migration of existing values.)
3. **`exercise_admin_audit`** table — append-only:
   - `id` (PK), `exercise_id` (FK→`exercise.id`, indexed), `actor` (clerk sub),
     `action` (`provenance_change|retire|unretire|hard_delete`), `detail` (`JSON`, e.g.
     `{"from":"ai_generated","to":"curated"}`), `created_at` (`datetime`, indexed).
   - `hard_delete` rows keep `exercise_id` as a plain int (no FK enforcement post-delete)
     plus the deleted Exercise's normalized name in `detail`, so the trail survives the row.

## 3. Domain (`app/domain/exercise.py`)

Pure helpers, unit-tested, no I/O:
- `can_hard_delete(is_retired: bool, reference_count: int) -> bool` — true iff retired and
  zero references.
- `next_provenance(...)` is trivial (any→any) so no gate function; validation is "value is a
  member of `Provenance`".
- Image validation: `validate_image(content_type, byte_size)` → allowed types +
  `MAX_IMAGE_BYTES` (constant, 2 MB). Rejects otherwise.
- No change to `catalog_completeness` / `completeness_breakdown`.

## 4. Repositories

### `ExerciseRepository` (+ in-memory impl, both kept in lockstep)
New/changed methods — all **immutable** (return a fresh `Exercise`, never mutate in place):
- `update(id, patch: ExercisePatch) -> Exercise` — partial write of descriptive fields.
  Renaming recomputes `normalized_name`; if that collides with **another** row → raise a
  typed `NameCollision` (route → 409). Same-row no-op rename is fine.
- `set_provenance(id, provenance) -> Exercise`.
- `set_precautions(id, list[str]) -> Exercise` (HTML-escaped at the route boundary).
- `retire(id) -> Exercise` / `unretire(id) -> Exercise`.
- `hard_delete(id) -> None` — caller has already checked the guard.
- `reference_count(id) -> int` — counts Prescriptions + Logged Sets + Relationships.
- **Retired filter** threaded through discovery reads: `search`, `browse`, `browse_all`,
  and `list_all` **as consumed by facets**. Add `include_retired: bool = False` param;
  discovery callers pass default (exclude), admin browser passes `True`.
- `list_all` / `list_by_provenance` gain `include_retired` (admin readouts pass `True`);
  the enrichment scan excludes retired.
- Admin browser feed: `admin_browse(filters) -> page` — filter by provenance, completeness
  tier (computed), retired/active, and free-text name; includes the completeness tier in
  each row (the internal signal, hidden from the public catalog).

### `ExerciseRelationshipRepository`
- `list_for(exercise_id) -> list[Relationship]` — both directions, with kind + direction.
- `remove(from_id, to_id, kind) -> None`.
- `add(...)` gains guards: reject self-link (`from == to`) and duplicate `(from,to,kind)`.

### `ExerciseImageRepository` (new)
- `put(exercise_id, content_type, bytes, byte_size, actor) -> None` (upsert, one per Exercise)
- `get(exercise_id) -> ImageRow | None`
- `delete(exercise_id) -> None`

### `ExerciseAuditRepository` (new)
- `record(exercise_id, actor, action, detail) -> None`
- `list_for(exercise_id) -> list[AuditRow]` (admin read; newest first)

DI providers added in `repositories/deps.py`.

## 5. Endpoints (`app/routes/exercises.py`, all `require_admin` unless noted)

All return the standard envelope; literal paths declared **before** `/{exercise_id}`.

| Method & path | Body / params | Success | Errors |
|---|---|---|---|
| `GET /api/admin/exercises` | `q, provenance, completeness, retired, page, limit` | `200` page of admin rows (incl. tier, retired) | — |
| `PATCH /api/exercises/{id}` | descriptive fields + emphasis, partial | `200` updated Exercise | `404`; `409` name collision; `422` validation |
| `PUT /api/exercises/{id}/provenance` | `{provenance}` | `200`; audit `provenance_change` | `404`; `422` bad value |
| `PUT /api/exercises/{id}/precautions` | `{precautions: string[]}` | `200` (escaped) | `404`; `422` |
| `POST /api/exercises/{id}/retire` | — | `200` retired; audit `retire` | `404` |
| `POST /api/exercises/{id}/unretire` | — | `200` active; audit `unretire` | `404` |
| `DELETE /api/exercises/{id}` | — | `204`; audit `hard_delete` | `404`; `409` if not (retired ∧ unreferenced) |
| `POST /api/exercises/{id}/image` | multipart file | `200` served URL | `404`; `415` type; `413` too large |
| `DELETE /api/exercises/{id}/image` | — | `204` | `404` |
| `GET /api/exercises/{id}/image` *(auth: any signed-in user)* | — | `200` bytes + content-type | `404` |
| `GET /api/exercises/{id}/relationships` | — | `200` list both directions | `404` |
| `POST /api/exercises/{id}/relationships` | `{to_id, kind}` | `201` | `404`; `409` dup; `422` self-link |
| `DELETE /api/exercises/{id}/relationships` | `{to_id, kind}` | `204` | `404` |
| `POST /api/exercises/{id}/enrich` | — | `202` job accepted | `404` |

`GET …/image` is readable by any authenticated user (it feeds Exercise Detail); every other
route is `require_admin`. Retire enforcement (ADR-0076) is applied in the repository reads,
so the existing public `GET /api/exercises`, `/facets`, `/taxonomy`, `/{id}` (variations
sublist), and Substitution automatically stop surfacing retired Exercises; `GET /{id}` itself
still resolves a retired Exercise by id.

## 6. Generation / substitution touch-point

No behavior change beyond ADR-0076's reuse-but-keep-retired: `find_or_create` already reuses
by normalized name; because it applies no status predicate it binds to a retired row **without
un-retiring** it. A regression test pins that generation/substitution never flips `retired`.

## 7. Image upload path (web → API)

- **Storage:** Postgres (`exercise_image` table). No object store, no new secret (ADR-choice Q14a).
- **Web:** a new admin **server action** receives the `File`, validates type/size client- and
  server-side, and forwards it as `multipart/form-data` to `POST /api/exercises/{id}/image`
  with the Clerk JWT. This is the one multipart path added to the otherwise-JSON `lib/api.ts`
  (a dedicated `apiUpload` helper, `server-only`).
- **Render:** Exercise Detail's `<ExerciseImage>` points `src` at `GET /api/exercises/{id}/image`
  when an uploaded image exists, else the legacy `image` URL. Still a plain `<img>` (no
  `next/image`, no `remotePatterns` change).

## 8. Frontend (`apps/web`)

- `app/admin/exercises/page.tsx` — **catalog browser** (server component, `require_admin`
  via `resolveIsAdmin`/`notFound()`): search + filters (provenance, completeness tier,
  retired/active), rows link to the editor. Shows the completeness tier — the ops signal
  hidden from the public catalog.
- `app/admin/exercises/[id]/page.tsx` — **editor**: descriptive fields, precautions, emphasis,
  image upload/preview/delete, provenance control, relationship add/remove, enrich-now,
  retire/un-retire, and (guarded) delete with a confirm. Delete disabled unless retired ∧
  unreferenced, with the reason shown.
- `app/admin/exercises/actions.ts` — server actions wrapping each endpoint (incl. the
  multipart image action); unwrap the envelope.
- `apps/web/lib/admin-exercises.ts` (+ `admin-exercises.test.ts`) — view-model mappers,
  filter/sort logic, the delete-enablement predicate. Frontend logic lives here per repo rule.
- A card on `app/admin/page.tsx` linking to the browser.
- Admin constants stay in lockstep with `config.py` (existing `lib/admin.ts` note).

## 9. Testing plan (test-first, ≥80%)

**API / domain**
- `can_hard_delete` truth table; image validation (type, size boundaries).
- Repo (both impls): `update` incl. name-collision→`NameCollision`; `set_provenance`;
  `retire`/`unretire`; `hard_delete`; `reference_count`; discovery reads exclude retired;
  `admin_browse` filters; relationship `list_for`/`remove`/self-link/dup guards; image
  put/get/delete; audit record/list.
- Routes: auth matrix (401/403/200) on every admin route reusing the `require_admin`
  pattern; `PATCH` happy + 409 + 422; provenance change writes audit; retire hides from
  `GET /api/exercises` and `/facets` and substitution candidates but `GET /{id}` still
  resolves; delete guard 409 then 204 after retire; image 200/415/413; `GET /{id}/image`
  readable by a normal user.
- Regression: generation/substitution over a name matching a retired row keeps it retired.

**Web (`node --test` over `lib/*.test.ts`)**
- View-model mapping of an admin row (tier, retired badge); filter predicate; delete-enable
  predicate (retired ∧ unreferenced); image-src resolution (uploaded vs legacy URL).

**Terminology guard:** no banned regressions introduced; `Retire` is additive (no removed
term to register).

## 10. Delivery

Conventional commits on `claude/hello-opus-lnhnvf`; migration + backend first (red→green),
then web. No PR unless requested. `REVIEW.md` checklist run before hand-off.
