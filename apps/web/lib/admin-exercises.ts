import "server-only";

import { apiGet, apiSend, apiUpload, type Envelope } from "./api";
import type { AdminExerciseRow } from "./admin-exercises-view";
import type { ExercisePatchPayload } from "./admin-exercise-editor";
import type { AdminAuditEntry } from "./admin-exercise-curation";
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

// Deliberately set an Exercise's Provenance (issue #503, ADR-0075) — a distinct act, never a
// side effect of the descriptive edit. Hits the admin-gated, audited `PUT
// /api/exercises/{id}/provenance`; the backend rejects an invalid tier (422) and writes the
// audit record. Returns the updated Exercise, or an error envelope the action surfaces.
export async function setAdminExerciseProvenance(
  id: number,
  provenance: string,
): Promise<Envelope<ExerciseDetail>> {
  return apiSend(`/api/exercises/${id}/provenance`, "PUT", { provenance });
}

// Write an Exercise's curator-only precautions (issue #503, spec §5). Hits the admin-gated
// `PUT /api/exercises/{id}/precautions`; the backend trims and HTML-escapes each entry at its
// write boundary. The whole list is replaced (an empty list clears it). Returns the updated
// Exercise, or an error envelope.
export async function setAdminExercisePrecautions(
  id: number,
  precautions: string[],
): Promise<Envelope<ExerciseDetail>> {
  return apiSend(`/api/exercises/${id}/precautions`, "PUT", { precautions });
}

// Read an Exercise's append-only admin audit trail (issue #503, ADR-0075), newest first. Hits
// the admin-gated `GET /api/exercises/{id}/audit`; the editor page renders it read-only.
export async function fetchAdminExerciseAudit(
  id: number,
): Promise<Envelope<AdminAuditEntry[]>> {
  return apiGet(`/api/exercises/${id}/audit`);
}

// The served URL the API returns after a successful image upload.
export interface UploadedImage {
  image_url: string;
}

// Upload (or replace) an Exercise's curator-only image (issue #504, ADR-0041). Forwards the
// file as multipart to the admin-gated `POST /api/exercises/{id}/image` via the one `apiUpload`
// helper; the backend validates type/size (415/413) and stores the bytes in the app database.
// Returns the served-URL envelope, or an error envelope the action surfaces.
export async function uploadAdminExerciseImage(
  id: number,
  file: File,
): Promise<Envelope<UploadedImage>> {
  return apiUpload(`/api/exercises/${id}/image`, file);
}

// Remove an Exercise's uploaded image (issue #504). Hits the admin-gated `DELETE
// /api/exercises/{id}/image`; the legacy `image` URL is left untouched. Returns the standard
// envelope carrying the cleared Exercise's id.
export async function deleteAdminExerciseImage(
  id: number,
): Promise<Envelope<{ id: number }>> {
  return apiSend(`/api/exercises/${id}/image`, "DELETE");
}
