// Pure image-source resolution and client-side upload validation for the curator-only
// Exercise Image (issue #504, ADR-0041). No server-only or React imports, so it is safe in
// both Server and Client Components and unit-testable with `node --test`.
//
// Two responsibilities: decide which picture the detail/editor shows (uploaded-first, then the
// legacy curated URL, then nothing), and pre-check an upload's type/size so the editor can flag
// an obviously-bad file before the round trip. The backend re-validates and stays the real gate.

// The safe raster types a browser renders without a plugin and that carry no active content —
// the same allow-list the backend `validate_image` enforces (SVG is excluded: it can carry
// script). Kept in lockstep with `app/domain/exercise_image.py`.
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

// 2 MB — the same ceiling the backend enforces. Generous for a photo, small enough that one
// upload never bloats the app database.
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// The structural subset of the Exercise detail the image source is resolved from: the id (to
// build the served URL), whether an uploaded image exists, and the legacy curated URL.
export interface ExerciseImageSource {
  id: number;
  has_image: boolean;
  image: string | null;
}

// The `<img>` src the Exercise Image should point at, or `null` when the movement has no
// picture (the caller then renders nothing — never a broken image). The uploaded image is
// preferred: it is served same-origin by `GET /api/exercises/{id}/image` (proxied to the API
// with the caller's auth). Otherwise the legacy curated URL is used, and a blank legacy value
// counts as no image.
export function resolveExerciseImageSrc(exercise: ExerciseImageSource): string | null {
  if (exercise.has_image) return `/api/exercises/${exercise.id}/image`;
  const legacy = exercise.image?.trim();
  return legacy ? legacy : null;
}

// The bare media type of an upload, lowercased and stripped of any `;`-parameters — the browser
// may send `image/jpeg; charset=binary` or vary the casing, and the media type alone decides.
function normalizeType(type: string): string {
  return type.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

// Validate a selected file's type and size before upload. Returns a user-facing message for the
// first problem (type before size, mirroring the backend's 415-before-413), or `null` when the
// file is acceptable.
export function validateImageUpload(file: { type: string; size: number }): string | null {
  const type = normalizeType(file.type);
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(type)) {
    return "Choose a JPEG, PNG, or WebP image.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Image must be 2 MB or smaller.";
  }
  return null;
}
