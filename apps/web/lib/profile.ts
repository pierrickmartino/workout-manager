import { auth } from "@clerk/nextjs/server";

import type { Profile, ProfileInput } from "./profile-types";

// Re-export the server-free constants/types so existing server-side callers can
// keep importing them from "@/lib/profile". Client Components must import them
// directly from "@/lib/profile-types" to avoid pulling this server-only module
// (and its `server-only` dependency) into the browser bundle.
export * from "./profile-types";

// Server-side data access for the Fitness Profile. The Clerk JWT is attached
// here and never reaches the browser; the FastAPI backend verifies it via JWKS.
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

export async function fetchProfile(): Promise<Envelope<Profile>> {
  const response = await fetch(`${API_URL}/api/profile`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<Profile>;
}

export async function saveProfile(
  input: ProfileInput,
): Promise<Envelope<Profile>> {
  const response = await fetch(`${API_URL}/api/profile`, {
    method: "PUT",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<Profile>;
}
