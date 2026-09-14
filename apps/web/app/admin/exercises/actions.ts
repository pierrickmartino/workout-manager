"use server";

import { revalidatePath } from "next/cache";

import {
  addAdminExerciseRelationship,
  deleteAdminExercise,
  deleteAdminExerciseImage,
  fetchAdminExerciseRelationships,
  removeAdminExerciseRelationship,
  retireAdminExercise,
  setAdminExercisePrecautions,
  setAdminExerciseProvenance,
  unretireAdminExercise,
  updateAdminExercise,
  uploadAdminExerciseImage,
} from "@/lib/admin-exercises";
import type { ExercisePatchPayload } from "@/lib/admin-exercise-editor";
import {
  filterAddCandidates,
  type ExerciseRelationship,
  type LinkCandidate,
  type RelationshipKind,
} from "@/lib/admin-exercise-relationships";
import { searchExercises } from "@/lib/exercises";
import type { ExerciseDetail } from "@/lib/sessions-types";

// The thin server action behind the admin Exercise editor (issue #502). It exists because
// the `PATCH /api/exercises/{id}` endpoint is admin-gated and JWT-authenticated server-side
// (the token never reaches the browser), so the Client Component drives the write through
// here. The backend enforces `require_admin` and the name-collision rule — this is not a
// place to re-check either — and this unwraps the envelope to a `{ exercise, error }` the
// editor renders, surfacing the 409 collision message straight from `error`.
export interface UpdateExerciseResult {
  exercise: ExerciseDetail | null;
  error: string | null;
}

export async function updateExerciseAction(
  id: number,
  patch: Partial<ExercisePatchPayload>,
): Promise<UpdateExerciseResult> {
  const result = await updateAdminExercise(id, patch);
  if (!result.success || !result.data) {
    return { exercise: null, error: result.error ?? "Could not save the exercise." };
  }

  // A descriptive edit changes the catalog browser row, this editor, and the public
  // Exercise Detail page, so drop their cached renders.
  revalidatePath("/admin/exercises");
  revalidatePath(`/admin/exercises/${id}`);
  revalidatePath(`/exercises/${id}`);
  return { exercise: result.data, error: null };
}

// Drop the cached renders an admin write touches: the catalog browser row, this editor (its
// audit trail changes on a provenance change), and the public Exercise Detail page.
function revalidateExercise(id: number): void {
  revalidatePath("/admin/exercises");
  revalidatePath(`/admin/exercises/${id}`);
  revalidatePath(`/exercises/${id}`);
}

// Deliberately set the Exercise's Provenance (issue #503, ADR-0075). The backend is the gate:
// it enforces `require_admin`, rejects an invalid tier (422), and writes the audit record — this
// only forwards the value and unwraps the envelope. A distinct act from the descriptive save.
export async function setProvenanceAction(
  id: number,
  provenance: string,
): Promise<UpdateExerciseResult> {
  const result = await setAdminExerciseProvenance(id, provenance);
  if (!result.success || !result.data) {
    return {
      exercise: null,
      error: result.error ?? "Could not change the provenance.",
    };
  }
  revalidateExercise(id);
  return { exercise: result.data, error: null };
}

// Retire or un-retire the Exercise (issue #506, ADR-0076) — one control drives both endpoints
// via `nextRetired` (true ⇒ retire, false ⇒ un-retire). The backend is the gate: it enforces
// `require_admin`, hides/restores the movement across every discovery surface, and writes the
// audit record. Retiring changes the catalog browser row (its status), this editor, and the
// public Exercise Detail (it disappears), so their cached renders are dropped.
export async function setRetiredAction(
  id: number,
  nextRetired: boolean,
): Promise<UpdateExerciseResult> {
  const result = nextRetired
    ? await retireAdminExercise(id)
    : await unretireAdminExercise(id);
  if (!result.success || !result.data) {
    return {
      exercise: null,
      error:
        result.error ??
        (nextRetired
          ? "Could not retire the exercise."
          : "Could not un-retire the exercise."),
    };
  }
  revalidateExercise(id);
  return { exercise: result.data, error: null };
}

// The outcome of a guarded hard delete, unwrapped for the editor: `deleted` true when the
// row is gone, or an error message (e.g. the 409 refusal when the guard is unmet).
export interface DeleteExerciseResult {
  deleted: boolean;
  error: string | null;
}

// Permanently delete the Exercise — guarded, retire-then-delete (issue #507, ADR-0076). The
// backend is the authority: it enforces `require_admin`, re-checks the retired ∧ unreferenced
// guard (409 if unmet), writes the `hard_delete` audit record, and removes the row — this only
// forwards the call and unwraps the envelope. On success the row no longer exists, so the
// catalog browser and the (now-gone) public detail page must drop their cached renders; the
// editor route for this id will 404 on next load.
export async function deleteExerciseAction(
  id: number,
): Promise<DeleteExerciseResult> {
  const result = await deleteAdminExercise(id);
  if (!result.success) {
    return { deleted: false, error: result.error ?? "Could not delete the exercise." };
  }
  revalidatePath("/admin/exercises");
  revalidatePath(`/admin/exercises/${id}`);
  revalidatePath(`/exercises/${id}`);
  return { deleted: true, error: null };
}

// The outcome of an image upload/remove, unwrapped for the editor: the served URL on a
// successful upload (`null` after a remove), or an error message.
export interface ImageActionResult {
  imageUrl: string | null;
  error: string | null;
}

// Upload (or replace) the Exercise's curator-only image (issue #504, ADR-0041). The Client
// Component hands the `File` inside a `FormData` (a File can't cross the server-action boundary
// on its own); this forwards it as multipart to the admin-gated endpoint. The backend enforces
// `require_admin` and validates type/size (415/413) — this only unwraps the envelope and drops
// the cached renders so the uploaded image shows on the editor and the public detail page.
export async function uploadImageAction(
  id: number,
  formData: FormData,
): Promise<ImageActionResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { imageUrl: null, error: "Choose an image to upload." };
  }
  const result = await uploadAdminExerciseImage(id, file);
  if (!result.success || !result.data) {
    return { imageUrl: null, error: result.error ?? "Could not upload the image." };
  }
  revalidateExercise(id);
  return { imageUrl: result.data.image_url, error: null };
}

// Remove the Exercise's uploaded image (issue #504). Admin-gated server-side; unwraps the
// envelope and drops the cached renders. The legacy `image` URL is untouched — detail falls
// back to it (or shows nothing) once the uploaded image is gone.
export async function removeImageAction(id: number): Promise<ImageActionResult> {
  const result = await deleteAdminExerciseImage(id);
  if (!result.success) {
    return { imageUrl: null, error: result.error ?? "Could not remove the image." };
  }
  revalidateExercise(id);
  return { imageUrl: null, error: null };
}

// Write the Exercise's curator-only precautions (issue #503, spec §5). The backend trims and
// HTML-escapes each entry at its write boundary; this forwards the plain-text list and unwraps
// the envelope. Separate from the descriptive save and never audited.
export async function setPrecautionsAction(
  id: number,
  precautions: string[],
): Promise<UpdateExerciseResult> {
  const result = await setAdminExercisePrecautions(id, precautions);
  if (!result.success || !result.data) {
    return {
      exercise: null,
      error: result.error ?? "Could not save the precautions.",
    };
  }
  revalidateExercise(id);
  return { exercise: result.data, error: null };
}

// The outcome of a relationship add/remove, unwrapped for the editor: the fresh both-directions
// list on success (so the component re-renders without a full reload), or an error message.
export interface RelationshipActionResult {
  relationships: ExerciseRelationship[] | null;
  error: string | null;
}

// Re-read an Exercise's relationships after a write so the editor shows live state. Best-effort:
// a failed refetch surfaces as an error rather than a stale list.
async function reloadRelationships(id: number): Promise<RelationshipActionResult> {
  const listed = await fetchAdminExerciseRelationships(id);
  if (!listed.success || !listed.data) {
    return {
      relationships: null,
      error: listed.error ?? "Could not reload the relationships.",
    };
  }
  return { relationships: listed.data, error: null };
}

// Add one directed Variation/Alternative link from this Exercise to another (issue #505). The
// backend is the gate: it enforces `require_admin`, rejects a self-link (422) and a duplicate
// (409), and creates no reciprocal link — this only forwards the values and, on success, returns
// the refreshed list. The editor page's cached render is dropped so a reload shows the change.
export async function addRelationshipAction(
  id: number,
  toId: number,
  kind: RelationshipKind,
): Promise<RelationshipActionResult> {
  const result = await addAdminExerciseRelationship(id, toId, kind);
  if (!result.success) {
    return {
      relationships: null,
      error: result.error ?? "Could not add the relationship.",
    };
  }
  revalidateExercise(id);
  return reloadRelationships(id);
}

// Remove one directed link `(fromId → toId, kind)` (issue #505). `fromId` is the `from` end the
// endpoint keys on — this Exercise for an outgoing link, the other movement for an incoming one
// (see `relationshipRemovalTarget`). `viewedId` is the Exercise whose editor is open, whose list
// is reloaded and whose cached render is dropped. The backend delete is idempotent.
export async function removeRelationshipAction(
  viewedId: number,
  fromId: number,
  toId: number,
  kind: RelationshipKind,
): Promise<RelationshipActionResult> {
  const result = await removeAdminExerciseRelationship(fromId, toId, kind);
  if (!result.success) {
    return {
      relationships: null,
      error: result.error ?? "Could not remove the relationship.",
    };
  }
  revalidateExercise(viewedId);
  return reloadRelationships(viewedId);
}

// The outcome of an add-target search, unwrapped for the editor's link picker.
export interface LinkCandidatesResult {
  candidates: LinkCandidate[];
  error: string | null;
}

// Search the catalog for a movement to link to (issue #505). Reuses the shared name-substring
// search (`GET /api/exercises`), then drops the Exercise being edited so a self-link is never
// offered (the backend rejects it 422 regardless). A blank query returns no candidates rather
// than the whole catalog, keeping the picker intentional.
export async function searchLinkCandidatesAction(
  exerciseId: number,
  query: string,
): Promise<LinkCandidatesResult> {
  if (query.trim() === "") {
    return { candidates: [], error: null };
  }
  const result = await searchExercises(query);
  if (!result.success || !result.data) {
    return { candidates: [], error: result.error ?? "Could not search exercises." };
  }
  return {
    candidates: filterAddCandidates(
      exerciseId,
      result.data.map((match) => ({ id: match.id, name: match.name })),
    ),
    error: null,
  };
}
