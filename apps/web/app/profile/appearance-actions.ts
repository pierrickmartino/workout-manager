"use server";

import { revalidatePath } from "next/cache";

import {
  saveAppearanceMode,
  saveAvatar,
  saveKeepScreenAwake,
  saveWeightUnit,
} from "@/lib/appearance";
import type { Mode } from "@/lib/theme";
import type { WeightUnit } from "@/lib/weight-unit";

// The thin server action behind the Profile Appearance picker. It persists the
// chosen Mode via PUT /api/appearance and then revalidates the root layout, which
// reads the Mode server-side (lib/appearance.resolveUserMode) — so the new Mode is
// applied on the very next render without a full reload. The backend is the real
// validation boundary; an unknown Mode is rejected there and surfaces as an error.
export interface AppearanceActionResult {
  error: string | null;
}

const AVATAR_SAVE_ERROR = "Your Avatar wasn’t saved, so your previous one is still in place. Try again.";

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

// The thin server action behind the Profile Keep Screen Awake toggle. It persists
// the choice via PUT /api/appearance (the same Interface Preference store as Mode,
// ADR-0055) and returns whether it stuck; the toggle is optimistic and reverts on an
// error. Unlike Mode, Keep Screen Awake stamps nothing on the layout — it is read at
// Live Session time (ADR-0055) — so the whole-layout revalidation Mode needs is
// unwarranted; we revalidate just the Profile route so a soft navigation back to it
// re-reads the now-persisted value rather than serving the stale cached prop.
export async function updateKeepScreenAwake(
  keepScreenAwake: boolean,
): Promise<AppearanceActionResult> {
  const result = await saveKeepScreenAwake(keepScreenAwake);
  if (!result.success) {
    return { error: result.error ?? "Could not save your Keep Screen Awake setting." };
  }

  revalidatePath("/profile");
  return { error: null };
}

// The thin server action behind the Profile Weight Unit toggle. It persists the
// choice via PUT /api/appearance (the same Interface Preference store as Mode and
// Keep Screen Awake, ADR-0055). Like Keep Screen Awake, Weight Unit stamps nothing
// on the layout — it steers how a Load is entered and displayed, read at that
// boundary — so the whole-layout revalidation Mode needs is unwarranted; we
// revalidate just the Profile route so a soft navigation back to it re-reads the
// now-persisted value rather than serving the stale cached prop. The backend is the
// real validation boundary; an unknown unit is rejected there and surfaces as an error.
export async function updateWeightUnit(
  weightUnit: WeightUnit,
): Promise<AppearanceActionResult> {
  const result = await saveWeightUnit(weightUnit);
  if (!result.success) {
    return { error: result.error ?? "Could not save your Weight Unit setting." };
  }

  revalidatePath("/profile");
  return { error: null };
}

// The thin server action behind the Avatar picker (ADR-0136). It persists the chosen Avatar
// via PUT /api/appearance, which judges it against the Operator Level at save time, then
// revalidates the root layout: the header renders the Avatar from the layout's Interface
// Preference read, so the new one shows on the very next render. A refusal or transport
// failure is reported in one plain sentence rather than the backend's validation message.
export async function updateAvatar(avatarId: string): Promise<AppearanceActionResult> {
  const result = await saveAvatar(avatarId);
  if (!result.success) {
    return { error: AVATAR_SAVE_ERROR };
  }

  revalidatePath("/", "layout");
  return { error: null };
}
