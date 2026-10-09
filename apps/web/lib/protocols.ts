import { apiGet, apiSend, type Envelope } from "./api";

import type { DeployPayload, SimulatePayload } from "./protocol-builder";
import type { ProtocolIndexEntry } from "./protocols-index";
import type {
  BalancePreview,
  GenerateProtocolInput,
  ProtocolJob,
  ProtocolProgress,
} from "./protocols-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/protocols". Client Components must import them directly from
// "@/lib/protocols-types" to avoid pulling this server-only module into the bundle.
export * from "./protocols-types";

// Server-side data access for the Protocol view. The transport seam (lib/api.ts)
// attaches the Clerk JWT — it never reaches the browser; the FastAPI backend verifies
// it via JWKS, joins the Protocol to its self-paced position, and progresses upcoming
// loads (ADR-0004).
export async function fetchProtocol(
  id: number,
): Promise<Envelope<ProtocolProgress>> {
  return apiGet(`/api/protocols/${id}`);
}

// The Protocols index (issue #637): one row per Protocol the user owns, with its status
// (current / set aside / finished) and performed counts. Owner-scoped on the server.
export async function fetchProtocolsIndex(): Promise<Envelope<ProtocolIndexEntry[]>> {
  return apiGet("/api/protocols");
}

// Switch to a set-aside Protocol (issue #638): it becomes the Current Protocol and the
// response is its progressed view. A `404` (not owned / missing) or `409` (Finished) comes
// back as a non-2xx envelope whose `error` says why; nothing is written.
export async function switchToProtocol(
  id: number,
): Promise<Envelope<ProtocolProgress>> {
  return apiSend(`/api/protocols/${id}/switch`, "POST");
}

// Permanently delete an un-started Protocol (issue #639): the Protocol and its plan-side
// dependents go, with no soft-delete. A bodyless DELETE, so the seam sends no `Content-Type`
// (ADR-0022). The backend re-checks the guard authoritatively: `409` when any Logged Session
// references a member Session (a log may have landed since the index was drawn), `404` when
// missing or not owned. On success the envelope carries the deleted id.
export async function deleteProtocol(id: number): Promise<Envelope<{ id: number }>> {
  return apiSend(`/api/protocols/${id}`, "DELETE");
}

// Submit a Protocol generation. Generation runs off the request path: the backend
// returns a job handle to poll (cache miss/bypass) or, on a cache hit, the adopted
// Protocol id inline — neither blocks on the long AI call.
export async function startProtocolGeneration(
  input: GenerateProtocolInput,
): Promise<Envelope<ProtocolJob>> {
  return apiSend("/api/protocols/generate", "POST", input);
}

// Deploy an edited Protocol (ADR-0020): send the desired un-performed tail; the
// backend validates it, atomically replaces that tail in place, and returns the
// progressed Protocol. A rejected draft comes back as a non-2xx envelope whose
// `error` names the first problem — nothing is persisted.
export async function deployProtocol(
  id: number,
  payload: DeployPayload,
): Promise<Envelope<ProtocolProgress>> {
  return apiSend(`/api/protocols/${id}/deploy`, "POST", payload);
}

// Calibrate a Protocol (ADR-0111): re-pitch its un-performed tail to the offset the user
// wants to **stand at**. The target is absolute, not a delta, so the call is idempotent and a
// retry is harmless; an out-of-range value is clamped to the rail server-side and reported
// there rather than rejected. The response is the progressed Protocol — the calibrated plan
// with the Progression overlay already on top — plus the two disclosures the control reads.
export async function calibrateProtocol(
  id: number,
  calibration: number,
): Promise<Envelope<ProtocolProgress>> {
  return apiSend(`/api/protocols/${id}/calibrate`, "POST", { calibration });
}

// Preview an edited Protocol's balance (SIMULATE, ADR-0021): send the whole draft and
// get back per-week Session/Set counts plus the curated Muscle-Group distribution.
// Read-only and non-predictive — nothing is written and no fatigue/recovery/volume
// figure is computed. Ownership is verified server-side (a non-owner gets a 404
// envelope).
export async function simulateProtocol(
  id: number,
  payload: SimulatePayload,
): Promise<Envelope<BalancePreview>> {
  return apiSend(`/api/protocols/${id}/simulate`, "POST", payload);
}

// Poll a generation job by its handle. The adopted `protocol_id` appears once the
// worker has completed; the owner-guarded Protocol fetch then returns the Protocol.
export async function fetchProtocolJob(
  jobId: string,
): Promise<Envelope<ProtocolJob>> {
  return apiGet(`/api/protocols/jobs/${jobId}`);
}
