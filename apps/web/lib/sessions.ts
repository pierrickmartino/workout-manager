import { auth } from "@clerk/nextjs/server";

import type { GenerateSessionInput, WorkoutSession } from "./sessions-types";

// Re-export the server-free constants/types so existing server-side callers can
// keep importing them from "@/lib/sessions". Client Components must import them
// directly from "@/lib/sessions-types" to avoid pulling this server-only module
// (and its `server-only` dependency) into the browser bundle.
export * from "./sessions-types";

// Server-side data access for standalone Session generation. The Clerk JWT is
// attached here and never reaches the browser; the FastAPI backend verifies it
// via JWKS, then runs the AI generation path (ADR-0006).
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

export async function generateSession(
  input: GenerateSessionInput,
): Promise<Envelope<WorkoutSession>> {
  const response = await fetch(`${API_URL}/api/sessions/generate`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<WorkoutSession>;
}

export async function fetchSession(
  id: number,
): Promise<Envelope<WorkoutSession>> {
  const response = await fetch(`${API_URL}/api/sessions/${id}`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<WorkoutSession>;
}
