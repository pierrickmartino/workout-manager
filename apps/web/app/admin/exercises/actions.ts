"use server";

import { revalidatePath } from "next/cache";

import {
  deleteAdminExerciseImage,
  setAdminExercisePrecautions,
  setAdminExerciseProvenance,
  updateAdminExercise,
  uploadAdminExerciseImage,
} from "@/lib/admin-exercises";
import type { ExercisePatchPayload } from "@/lib/admin-exercise-editor";
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
