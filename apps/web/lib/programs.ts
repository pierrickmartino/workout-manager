import { auth } from "@clerk/nextjs/server";

import type {
  GenerateProgramInput,
  ProgramJob,
  ProgramProgress,
} from "./programs-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/programs". Client Components must import them directly from
// "@/lib/programs-types" to avoid pulling this server-only module into the bundle.
export * from "./programs-types";

// Server-side data access for the Program view. The Clerk JWT is attached here
// and never reaches the browser; the FastAPI backend verifies it via JWKS, joins
// the Program to its self-paced position, and progresses upcoming loads (ADR-0004).
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

export async function fetchProgram(
  id: number,
): Promise<Envelope<ProgramProgress>> {
  const response = await fetch(`${API_URL}/api/programs/${id}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<ProgramProgress>;
}

// Submit a Program generation. Generation runs off the request path: the backend
// returns a job handle to poll (cache miss/bypass) or, on a cache hit, the adopted
// Program id inline — neither blocks on the long AI call.
export async function startProgramGeneration(
  input: GenerateProgramInput,
): Promise<Envelope<ProgramJob>> {
  const response = await fetch(`${API_URL}/api/programs/generate`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<ProgramJob>;
}

// Poll a generation job by its handle. The adopted `program_id` appears once the
// worker has completed; the owner-guarded Program fetch then returns the Program.
export async function fetchProgramJob(
  jobId: string,
): Promise<Envelope<ProgramJob>> {
  const response = await fetch(`${API_URL}/api/programs/jobs/${jobId}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<ProgramJob>;
}
