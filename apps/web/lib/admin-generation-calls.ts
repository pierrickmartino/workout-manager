import "server-only";

import { apiGet, type Envelope } from "./api";
import type { GenerationCallRow } from "./admin-generation-calls-view";
import type { GenerationCallDetail } from "./admin-generation-call-detail-view";

// Server-side data access for the admin AI audit log (issue #730, ADR-0135). The endpoint is
// gated by `require_admin` on the backend; the transport seam (lib/api.ts) attaches the Clerk
// JWT, which never reaches the browser, so this is called only from a server component.
// Re-export the server-free view-model so server callers can import it from one place.
export * from "./admin-generation-calls-view";
export * from "./admin-generation-call-detail-view";

// The newest recorded Generation Calls inside the 3-day window, metadata only, newest first.
export async function fetchGenerationCalls(): Promise<Envelope<GenerationCallRow[]>> {
  return apiGet("/api/admin/generation-calls");
}

// One call in full (issue #731): both prompts, the output or the failure, the schema and the
// token budget. An unknown id and one past the 3-day window are both a not-found envelope.
export async function fetchGenerationCall(
  id: number,
): Promise<Envelope<GenerationCallDetail>> {
  return apiGet(`/api/admin/generation-calls/${id}`);
}
