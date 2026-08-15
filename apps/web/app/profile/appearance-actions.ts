"use server";

import { revalidatePath } from "next/cache";

import { saveAppearanceMode } from "@/lib/appearance";
import type { Mode } from "@/lib/theme";

// The thin server action behind the Profile Appearance picker. It persists the
// chosen Mode via PUT /api/appearance and then revalidates the root layout, which
// reads the Mode server-side (lib/appearance.resolveUserMode) — so the new Mode is
// applied on the very next render without a full reload. The backend is the real
// validation boundary; an unknown Mode is rejected there and surfaces as an error.
export interface AppearanceActionResult {
  error: string | null;
}

export async function updateAppearanceMode(
  mode: Mode,
): Promise<AppearanceActionResult> {
  const result = await saveAppearanceMode(mode);
  if (!result.success) {
    return { error: result.error ?? "Could not update your appearance." };
  }

  // Re-render everything under the root layout so the stamped `data-mode` (and
  // thus the whole app's polarity) reflects the new choice immediately.
  revalidatePath("/", "layout");
  return { error: null };
}
