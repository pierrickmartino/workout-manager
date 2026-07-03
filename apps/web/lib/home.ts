import { auth } from "@clerk/nextjs/server";

import type { HomeData } from "./home-types";

// Re-export the server-free types so server-side callers can import them from
// "@/lib/home". Client Components must import them directly from
// "@/lib/home-types" to avoid pulling this server-only module into the bundle.
export * from "./home-types";

// Server-side data access for the Home screen's aggregated read. The Clerk JWT is
// attached here and never reaches the browser; the FastAPI backend verifies it via
// JWKS and computes Readiness server-side (ADR-0008).
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

export async function fetchHome(): Promise<Envelope<HomeData>> {
  const response = await fetch(`${API_URL}/api/home`, {
    headers: await authHeaders(),
    cache: "no-store",
  });
  return (await response.json()) as Envelope<HomeData>;
}
