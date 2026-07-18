import { apiGet, apiSend, type Envelope } from "./api";

import type { LoggedSession, LogSessionInput } from "./logs-types";

// Re-export the server-free types so server-side callers can keep importing them
// from "@/lib/logs". Client Components must import them directly from
// "@/lib/logs-types" to avoid pulling this server-only module into the browser.
export * from "./logs-types";

// Server-side data access for session logging. The transport seam (lib/api.ts)
// attaches the Clerk JWT — it never reaches the browser; the FastAPI backend verifies
// it via JWKS, enforces ownership of the Session being logged, and persists the Logged
// Session.
export async function logSession(
  sessionId: number,
  input: LogSessionInput,
): Promise<Envelope<LoggedSession>> {
  return apiSend(`/api/sessions/${sessionId}/logs`, "POST", input);
}

export async function fetchHistory(): Promise<Envelope<LoggedSession[]>> {
  return apiGet("/api/logs");
}
