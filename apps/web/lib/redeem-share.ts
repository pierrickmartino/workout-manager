import type { Envelope } from "./api";
import { resolveAuthorCredit } from "./session-author.ts";
import type { RedeemCaveat, SharePreview, WorkoutSession } from "./sessions-types";

// The honest fallback when a Redeem fails without a backend-supplied reason.
export const REDEEM_FALLBACK_ERROR = "Could not redeem this share link.";

// The frontend fallback caveat text (ADR-0058), used only if a flagged redeem somehow arrives
// without the backend's message. The safety hold keys on `applies` alone, so a constrained
// redeemer is never silently redirected into the plan even if the message is missing.
export const RECEIVED_SHARE_CAVEAT_FALLBACK =
  "This session was built for another user and isn't tailored to your constraints.";

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

// The "no caveat" default an unconstrained (or caveat-less) redeem collapses to, so the caller
// never has to reason about an absent `caveat` field — it is always a resolved decision.
const NO_CAVEAT: RedeemCaveat = { applies: false, message: null };

// The thin result the redeem server action acts on: on success, the new copy's id, the href to
// land the recipient on (their own Session, never the source), and the ADR-0058 Received-Share
// caveat; on failure, an honest error. A discriminated union so the caller cannot read `href`
// off a failure. Mirrors `toDuplicateResult`, plus the caveat.
export type RedeemResult =
  | { ok: true; sessionId: number; href: string; caveat: RedeemCaveat }
  | { ok: false; error: string };

// Interpret the backend's redeem envelope. On success, point at the recipient's new standalone
// copy and carry the Received-Share caveat (ADR-0058) — flagged when the redeemer has a Sensitive
// Constraint, so the recipient UI can surface the "built for another user" notice; on failure — a
// revoked/unknown link (404), or a malformed success with no data — surface the backend error or
// the generic fallback. A missing `caveat` collapses to the no-caveat default.
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
    caveat: envelope.data.caveat ?? NO_CAVEAT,
  };
}

// How a successful Redeem lands the recipient (ADR-0058). An unflagged redeem redirects straight
// to the saved copy; a flagged one (a redeemer with a Sensitive Constraint) is *held* so the
// caveat can be shown prominently, with the same href to open the copy deliberately — a received
// Share never auto-enters the active flow. A discriminated union so a caller cannot read the
// caveat message off a redirect landing.
export type RedeemLanding =
  | { kind: "redirect"; href: string }
  | { kind: "caveat"; message: string; href: string };

// Decide the landing from a successful redeem result. Keyed on `caveat.applies` **alone** — the
// safety hold must never depend on the message being non-empty, or a flagged redeem with a missing
// message would slip through to an auto-redirect (the exact silent auto-promotion ADR-0058
// forbids). The message falls back to the canonical wording if the backend omitted it.
export function redeemLanding(
  result: Extract<RedeemResult, { ok: true }>,
): RedeemLanding {
  if (result.caveat.applies) {
    return {
      kind: "caveat",
      message: result.caveat.message ?? RECEIVED_SHARE_CAVEAT_FALLBACK,
      href: result.href,
    };
  }
  return { kind: "redirect", href: result.href };
}
