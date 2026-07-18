import { apiGet, apiSend, type Envelope } from "./api";

import type { Profile, ProfileInput } from "./profile-types";

// Re-export the server-free constants/types so existing server-side callers can
// keep importing them from "@/lib/profile". Client Components must import them
// directly from "@/lib/profile-types" to avoid pulling this server-only module
// (and its `server-only` dependency) into the browser bundle.
export * from "./profile-types";

// Server-side data access for the Fitness Profile. The transport seam (lib/api.ts)
// attaches the Clerk JWT — it never reaches the browser; the FastAPI backend
// verifies it via JWKS.
export async function fetchProfile(): Promise<Envelope<Profile>> {
  return apiGet("/api/profile");
}

export async function saveProfile(
  input: ProfileInput,
): Promise<Envelope<Profile>> {
  return apiSend("/api/profile", "PUT", input);
}
