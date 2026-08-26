import type { Envelope } from "./api";
import type { ShareLink } from "./sessions-types";

// The honest fallback when producing a Share Link fails without a backend-supplied reason,
// so the sharer never sees a blank error.
export const SHARE_FALLBACK_ERROR = "Could not create a share link.";

// The recipient path a Share Link token resolves to (ADR-0057). The token is not itself a URL
// (CONTEXT: Share Link — "it is a link, not a share code"); the sharer copies this URL, and the
// recipient opens it to preview and Redeem. Encoded so a url-safe token is still path-safe.
export function shareUrl(token: string, origin: string): string {
  return `${origin}/shared/${encodeURIComponent(token)}`;
}

// The thin result the share server action acts on: either the produced link's token and the
// shareable URL to surface for copying, or an error to show. A discriminated union so the caller
// cannot read `url` off a failure. Pure and server-free (types are erased), so the URL shape and
// the error copy are unit-testable without the transport seam.
export type ShareLinkResult =
  | { ok: true; token: string; url: string }
  | { ok: false; error: string };

// Interpret the backend's create-link envelope into the sharer's result. On success, build the
// shareable URL from the token and the caller-supplied origin; on failure — or a malformed success
// with no data — surface the backend error or the generic fallback.
export function toShareLinkResult(
  envelope: Envelope<ShareLink>,
  origin: string,
): ShareLinkResult {
  if (!envelope.success || !envelope.data) {
    return { ok: false, error: envelope.error ?? SHARE_FALLBACK_ERROR };
  }
  return {
    ok: true,
    token: envelope.data.token,
    url: shareUrl(envelope.data.token, origin),
  };
}
