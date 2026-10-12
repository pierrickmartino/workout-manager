import { apiGet, apiSend, type Envelope } from "./api";

import type { CuratedPreviewResponse } from "./curated-plan-preview";
import type {
  AdoptCuratedProtocolRequest,
  AdoptCuratedProtocolResponse,
  CuratedProtocolSummary,
} from "./curated-protocol-view";

// Server-side data access for Curated Protocols (issue #684, ADR-0130). The transport seam
// attaches the Clerk JWT, which never reaches the browser. Client Components import the types
// from "@/lib/curated-protocol-view", never this module.

// The released Curated Protocols, in authored order.
export async function fetchCuratedProtocols(): Promise<Envelope<CuratedProtocolSummary[]>> {
  return apiGet("/api/curated-protocols");
}

// The fully enumerated plan adopting with these choices would write (issue #685). It takes the
// adopt body, is refused exactly as adopt is (`404`, `422`), and persists nothing.
export async function previewCuratedProtocol(
  identifier: string,
  request: AdoptCuratedProtocolRequest,
): Promise<Envelope<CuratedPreviewResponse>> {
  return apiSend(
    `/api/curated-protocols/${encodeURIComponent(identifier)}/preview`,
    "POST",
    request,
  );
}

// Adopt one as the user's own Protocol: Current, or set aside for a user with a Sensitive
// Constraint, which `set_aside` says (issue #687). The server recomputes the whole plan from the
// length and starting weights; a `404` (unknown or unreleased) or `422` (rejected choices) comes
// back as a non-2xx envelope whose `error` says why, and nothing is persisted.
export async function adoptCuratedProtocol(
  identifier: string,
  request: AdoptCuratedProtocolRequest,
): Promise<Envelope<AdoptCuratedProtocolResponse>> {
  return apiSend(
    `/api/curated-protocols/${encodeURIComponent(identifier)}/adopt`,
    "POST",
    request,
  );
}
