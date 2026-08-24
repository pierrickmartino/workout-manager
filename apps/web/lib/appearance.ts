import { cache } from "react";

import { apiGet, apiSend, type Envelope } from "./api";

import { DEFAULT_MODE, type Mode } from "./theme";

// Keep Screen Awake ships **on** (ADR-0055 / CONTEXT "Keep Screen Awake"): the
// backend get-or-defaults to `true`, and this mirrors it for the offline/signed-out
// fallback below so both ends agree on the shipped default.
export const DEFAULT_KEEP_SCREEN_AWAKE = true;

// Server-side data access for the per-user Interface Preference (Mode + Keep
// Screen Awake). The transport seam (lib/api.ts) attaches the Clerk JWT — it never
// reaches the browser; the FastAPI backend verifies it via JWKS and scopes the
// read/write to the owning user. The Interface Preference is stored apart from the
// Fitness Profile (ADR-0047), hence its own data-access module. The physical
// `/api/appearance` path stays even though the concept generalised past appearance
// (ADR-0055).

// The wire shape of GET/PUT /api/appearance's `data`: the stored Mode plus whether
// to Keep Screen Awake during a Live Session (defaults on, ADR-0055).
export interface Appearance {
  mode: Mode;
  keep_screen_awake: boolean;
}

export async function fetchAppearance(): Promise<Envelope<Appearance>> {
  return apiGet("/api/appearance");
}

// Each save sends only its own facet: the backend PUT merges it onto the user's
// current preference, so persisting the Mode never disturbs Keep Screen Awake and
// vice versa (ADR-0055).
export async function saveAppearanceMode(
  mode: Mode,
): Promise<Envelope<Appearance>> {
  return apiSend("/api/appearance", "PUT", { mode });
}

export async function saveKeepScreenAwake(
  keepScreenAwake: boolean,
): Promise<Envelope<Appearance>> {
  return apiSend("/api/appearance", "PUT", { keep_screen_awake: keepScreenAwake });
}

// The shipped Interface Preference for a signed-out visitor or a briefly
// unreachable backend: today's all-dark look with Keep Screen Awake on.
const DEFAULT_APPEARANCE: Appearance = {
  mode: DEFAULT_MODE,
  keep_screen_awake: DEFAULT_KEEP_SCREEN_AWAKE,
};

// Resolve the user's whole Interface Preference (Mode + Keep Screen Awake) for a
// server render. This runs on every request, including for signed-out visitors and
// if the backend is briefly unreachable, so it can never throw: any failure falls
// back to the shipped defaults, preserving today's look rather than crashing the
// shell.
//
// Wrapped in React `cache` so the root layout and the `/profile` page — which render
// within the same server request and both need this preference — share a single
// GET /api/appearance round-trip instead of each issuing their own.
export const resolveAppearance = cache(async (): Promise<Appearance> => {
  try {
    const envelope = await fetchAppearance();
    if (envelope.success && envelope.data) {
      return envelope.data;
    }
  } catch {
    // Signed-out or transport failure — fall through to the defaults below.
  }
  return DEFAULT_APPEARANCE;
});

// Resolve just the Mode to render the app in, for the root layout's first paint.
// Derives from the one cached `resolveAppearance` read, so pairing it with a full
// preference read on the same request stays a single round-trip.
export const resolveUserMode = cache(async (): Promise<Mode> => {
  return (await resolveAppearance()).mode;
});
