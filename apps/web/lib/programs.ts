import { auth } from "@clerk/nextjs/server";

import type { ProgramProgress } from "./programs-types";

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
