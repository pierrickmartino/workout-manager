import "server-only";

import { apiGet, apiSend, type Envelope } from "./api";
import type { AdminExerciseRow } from "./admin-exercises-view";
import type { ExercisePatchPayload } from "./admin-exercise-editor";
import type { ExerciseDetail } from "./sessions-types";

// Server-side data access for the admin catalog browser (issue #501, ADR-0075/0076). The
// endpoint is gated by `require_admin` on the backend; the transport seam (lib/api.ts)
// attaches the Clerk JWT, which never reaches the browser — so this is called only from a
// server component, never a Client Component. Re-export the server-free view-model so
// server callers can import it from one place.
export * from "./admin-exercises-view";

// The whole shared Catalog for the ops view — every Provenance and Completeness tier
// (Stubs included) and both retired and active rows, each carrying its computed tier and
// retired state. The catalog is a bounded shared set, so we pull one generous page and the
// client filters/searches it instantly; the backend still owns the filter contract. Sorted
// A→Z by name. Returns the standard paginated envelope.
export async function fetchAdminExercises(): Promise<Envelope<AdminExerciseRow[]>> {
  return apiGet("/api/admin/exercises?limit=500");
}

// Read one Exercise's full detail to seed the editor (issue #502). Reuses the shared
// `GET /api/exercises/{id}` (readable by any signed-in user); the editor page still gates
// on `resolveIsAdmin`, and the write below is admin-only server-side. A retired Exercise
// still resolves by id, so the editor can open it (spec §5).
export async function fetchAdminExercise(
  id: number,
): Promise<Envelope<ExerciseDetail>> {
  return apiGet(`/api/exercises/${id}`);
}

// Apply a partial descriptive edit (issue #502). Sends only the changed fields to the
// admin-gated `PATCH /api/exercises/{id}`; the backend returns the updated Exercise, or an
// error envelope (409 on a name collision, 404 if missing, 422 on invalid input) that the
// server action surfaces to the editor.
export async function updateAdminExercise(
  id: number,
  patch: Partial<ExercisePatchPayload>,
): Promise<Envelope<ExerciseDetail>> {
  return apiSend(`/api/exercises/${id}`, "PATCH", patch);
}
