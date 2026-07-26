import { apiGet, apiSend, type Envelope } from "./api";

import type { LoggedSession, LogAdhocInput, LogSessionInput } from "./logs-types";

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

// Record a plan-less performance (ADR-0031) — an ad-hoc log with no Session behind
// it. Posts to `/api/logs` (no Session id in the path); the backend funnels it into
// the same logging service as the plan-backed route, snapshots the Performed Body
// Weight, and rejects a boundary violation (a stray Session id or Completion Outcome)
// with `422`.
export async function logAdhocSession(
  input: LogAdhocInput,
): Promise<Envelope<LoggedSession>> {
  return apiSend("/api/logs", "POST", input);
}

export async function fetchHistory(): Promise<Envelope<LoggedSession[]>> {
  return apiGet("/api/logs");
}
