import { cache } from "react";

import { apiGet, apiSend, type Envelope } from "./api";

import { DEFAULT_SKIN, isSkin, type Skin } from "./theme";

// Server-side data access for the global Active Skin (ADR-0048). The transport
// seam (lib/api.ts) attaches the Clerk JWT — it never reaches the browser; the
// FastAPI backend verifies it via JWKS. Unlike the per-user Appearance
// Preference, the Active Skin is a single app-wide value: `GET` is readable by
// any authenticated user (the root layout reads it server-side each render) and
// `PUT` publishes a new one, gated to admins by the backend.

// The wire shape of GET/PUT /api/active-skin's `data`: just the Active Skin id.
// Typed as `string` because the wire carries a bare id; callers narrow it with
// `isSkin` before treating it as a `Skin`.
export interface ActiveSkin {
  skin: string;
}

export async function fetchActiveSkin(): Promise<Envelope<ActiveSkin>> {
  return apiGet("/api/active-skin");
}

// Publish a new Active Skin (admin only — the backend enforces the role gate).
export async function publishActiveSkin(
  skin: Skin,
): Promise<Envelope<ActiveSkin>> {
  return apiSend("/api/active-skin", "PUT", { skin });
}

// Resolve the Active Skin to render the app with, for the root layout's first
// paint. Like `resolveUserMode`, this runs on every request — including for
// signed-out visitors and if the backend is briefly unreachable — so it can never
// throw: any failure, or an id the frontend doesn't recognise, falls back to the
// shipped default (PULSE), preserving today's look rather than crashing the shell.
//
// Wrapped in React `cache` so the layout and any other server component in the
// same request share one GET /api/active-skin round-trip. Cross-request caching
// (the short TTL) lives on the backend, which serves this read from its own cache.
export const resolveActiveSkin = cache(async (): Promise<Skin> => {
  try {
    const envelope = await fetchActiveSkin();
    if (envelope.success && envelope.data && isSkin(envelope.data.skin)) {
      return envelope.data.skin;
    }
  } catch {
    // Signed-out or transport failure — fall through to the default below.
  }
  return DEFAULT_SKIN;
});
