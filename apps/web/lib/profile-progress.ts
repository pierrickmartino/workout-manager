import { auth } from "@clerk/nextjs/server";

import type { ProfileProgress } from "./profile-progress-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/profile-progress". Client Components must import them directly from
// "@/lib/profile-progress-types" to avoid pulling this server-only module into the
// browser bundle.
export * from "./profile-progress-types";

// Server-side data access for the Profile view's progress read model. The Clerk JWT
// is attached here and never reaches the browser; the FastAPI backend verifies it via
// JWKS, scopes the read to the owning user, and projects the figures server-side.
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

export async function fetchProfileProgress(): Promise<Envelope<ProfileProgress>> {
  const response = await fetch(`${API_URL}/api/profile/progress`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<ProfileProgress>;
}
