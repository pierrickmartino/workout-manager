import { auth } from "@clerk/nextjs/server";

import type {
  GenerateProtocolInput,
  ProtocolJob,
  ProtocolProgress,
} from "./protocols-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/protocols". Client Components must import them directly from
// "@/lib/protocols-types" to avoid pulling this server-only module into the bundle.
export * from "./protocols-types";

// Server-side data access for the Protocol view. The Clerk JWT is attached here
// and never reaches the browser; the FastAPI backend verifies it via JWKS, joins
// the Protocol to its self-paced position, and progresses upcoming loads (ADR-0004).
const API_URL = process.env.API_URL ?? "http://localhost:8000";

interface Envelope<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { getToken } = await auth();
  const token = await getToken();
  return { Authorization: `Bearer ${token}` };
}

export async function fetchProtocol(
  id: number,
): Promise<Envelope<ProtocolProgress>> {
  const response = await fetch(`${API_URL}/api/protocols/${id}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<ProtocolProgress>;
}

// Submit a Protocol generation. Generation runs off the request path: the backend
// returns a job handle to poll (cache miss/bypass) or, on a cache hit, the adopted
// Protocol id inline — neither blocks on the long AI call.
export async function startProtocolGeneration(
  input: GenerateProtocolInput,
): Promise<Envelope<ProtocolJob>> {
  const response = await fetch(`${API_URL}/api/protocols/generate`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<ProtocolJob>;
}

// Poll a generation job by its handle. The adopted `protocol_id` appears once the
// worker has completed; the owner-guarded Protocol fetch then returns the Protocol.
export async function fetchProtocolJob(
  jobId: string,
): Promise<Envelope<ProtocolJob>> {
  const response = await fetch(`${API_URL}/api/protocols/jobs/${jobId}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<ProtocolJob>;
}
