import { auth } from "@clerk/nextjs/server";

import type { LoggedSession, LogSessionInput } from "./logs-types";

// Re-export the server-free types so server-side callers can keep importing them
// from "@/lib/logs". Client Components must import them directly from
// "@/lib/logs-types" to avoid pulling this server-only module into the browser.
export * from "./logs-types";

// Server-side data access for session logging. The Clerk JWT is attached here and
// never reaches the browser; the FastAPI backend verifies it via JWKS, enforces
// ownership of the Session being logged, and persists the Logged Session.
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

export async function logSession(
  sessionId: number,
  input: LogSessionInput,
): Promise<Envelope<LoggedSession>> {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/logs`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<LoggedSession>;
}

export async function fetchHistory(): Promise<Envelope<LoggedSession[]>> {
  const response = await fetch(`${API_URL}/api/logs`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<LoggedSession[]>;
}
