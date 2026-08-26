import type { Envelope } from "./api";
import { resolveAuthorCredit } from "./session-author.ts";
import type { SharePreview, WorkoutSession } from "./sessions-types";

// The honest fallback when a Redeem fails without a backend-supplied reason.
export const REDEEM_FALLBACK_ERROR = "Could not redeem this share link.";

// The recipient's pre-Redeem display model (ADR-0057). A valid link resolves to the linked
// Session's name, Training Type, and an Author byline; an invalid one (revoked or unknown token,
// or a failed read) collapses to `{ valid: false }` so the page renders a single "no longer
// available" state and never a half-populated card. A discriminated union so the page cannot read
// the descriptive fields off an invalid preview.
export type SharePreviewView =
  | {
      valid: true;
      displayName: string;
      trainingType: string;
      authorByline: string;
    }
  | { valid: false };

// Map the backend's preview envelope onto the display model. The Author byline reuses the same
// generic fallback as the Session view (`session-author`), so an author with no Profile name reads
// "by Anonymous" here exactly as it does on the plan — one fallback, never a fabricated name. A
// failed envelope, or a `valid: false` payload, is treated as an invalid link.
export function toSharePreviewView(
  envelope: Envelope<SharePreview>,
): SharePreviewView {
  const preview = envelope.success ? envelope.data : null;
  if (!preview || !preview.valid) {
    return { valid: false };
  }
  // Reuse the one Author-credit fallback the Session view owns (`session-author`), so an author
  // with no Profile name reads "by Anonymous" here exactly as on the plan — never a forked fallback.
  const { displayName: authorName } = resolveAuthorCredit(preview.author);
  return {
    valid: true,
    // The server already resolves the never-blank name label (name → `training_type · date`).
    displayName: preview.display_name ?? "",
    trainingType: preview.training_type ?? "",
    authorByline: `by ${authorName}`,
  };
}

// The thin result the redeem server action acts on: on success, the new copy's id and the href to
// land the recipient on (their own Session, never the source); on failure, an honest error. A
// discriminated union so the caller cannot read `href` off a failure. Mirrors `toDuplicateResult`.
export type RedeemResult =
  | { ok: true; sessionId: number; href: string }
  | { ok: false; error: string };

// Interpret the backend's redeem envelope. On success, point at the recipient's new standalone
// copy; on failure — a revoked/unknown link (404), or a malformed success with no data — surface
// the backend error or the generic fallback.
export function toRedeemResult(
  envelope: Envelope<WorkoutSession>,
): RedeemResult {
  if (!envelope.success || !envelope.data) {
    return { ok: false, error: envelope.error ?? REDEEM_FALLBACK_ERROR };
  }
  return {
    ok: true,
    sessionId: envelope.data.id,
    href: `/sessions/${envelope.data.id}`,
  };
}
