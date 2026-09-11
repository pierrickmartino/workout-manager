import { apiGet, apiSend, type Envelope } from "./api";

import type {
  LoggedSession,
  LogAdhocInput,
  LogCorrectionInput,
  LogSessionInput,
} from "./logs-types";

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

// Read one of the user's Logged Sessions in full — the record detail (the record side's
// counterpart to `fetchSession`). The backend is owner-scoped: a record that is missing or
// owned by another user comes back `404`, never served. The Clerk JWT is attached
// server-side and never reaches the browser.
export async function fetchLog(logId: number): Promise<Envelope<LoggedSession>> {
  return apiGet(`/api/logs/${logId}`);
}

// Correct a Logged Session's contents after the fact (ADR-0034). PUTs the full-replace
// payload to `/api/logs/{id}`; the backend resolves ownership (`404` when not yours),
// reads the plan-backed/plan-less boundary rule off the record, guards catalog validity
// (`422`), and carries the Performed Body Weight forward. Every read-time projection
// (XP, Personal Records, Streak, Achievements, analytics) recomputes on the next read.
export async function correctSession(
  logId: number,
  input: LogCorrectionInput,
): Promise<Envelope<LoggedSession>> {
  return apiSend(`/api/logs/${logId}`, "PUT", input);
}

// Delete a mis-logged Logged Session (ADR-0034). DELETEs `/api/logs/{id}`; the backend
// resolves ownership (`404` when not yours) and runs the contiguity gate — a delete that
// would leave a gap in the performed sequence is refused with `409`. On success every
// read-time projection recomputes on the next read (a plan-backed delete re-surfaces that
// Session as the Next Session on Home). Returns the deleted id in the standard envelope.
export async function deleteSession(
  logId: number,
): Promise<Envelope<{ id: number }>> {
  return apiSend(`/api/logs/${logId}`, "DELETE");
}
