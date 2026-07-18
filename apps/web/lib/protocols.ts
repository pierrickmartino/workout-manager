import { apiGet, apiSend, type Envelope } from "./api";

import type { DeployPayload, SimulatePayload } from "./protocol-builder";
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
