import type { Envelope } from "./api";
import type { WorkoutSession } from "./sessions-types";

// The honest fallback when the duplicate fails without a backend-supplied reason, so
// the user never sees a blank error.
export const DUPLICATE_FALLBACK_ERROR = "Could not duplicate this session.";

// The thin result the duplicate server action acts on: either the new standalone
// copy's id and the href to navigate to, or an error to surface. A discriminated union
// so the caller cannot read `href` off a failure.
export type DuplicateResult =
  | { ok: true; sessionId: number; href: string }
  | { ok: false; error: string };

// Interpret the backend's duplicate envelope. On success, point at the new copy (never
// the source); on failure — or a malformed success with no data — surface the backend
// error or the generic fallback. Pure and server-free (types are erased), so the
// redirect target and the error copy are unit-testable without the transport seam.
export function toDuplicateResult(
  envelope: Envelope<WorkoutSession>,
): DuplicateResult {
  if (!envelope.success || !envelope.data) {
    return { ok: false, error: envelope.error ?? DUPLICATE_FALLBACK_ERROR };
  }
  return {
    ok: true,
    sessionId: envelope.data.id,
    href: `/sessions/${envelope.data.id}`,
  };
}
