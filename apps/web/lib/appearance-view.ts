import type { Mode } from "./theme";

// The pure view-model for the Profile Appearance section. Everyone — every role —
// gets the same three Mode options (CONTEXT "Mode"); the admin-only Skin catalog
// is a separate slice (#331) and is deliberately not modelled here. Keeping this
// mapping pure and server-free means it is unit-testable without a browser and
// the picker component stays thin (prior art: apps/web/lib/achievements-view.ts).

// One Mode the picker can offer: the stored `value`, the human `label`, and a
// short `caption` clarifying what it does (notably that System follows the OS).
export interface AppearanceModeOption {
  value: Mode;
  label: string;
  caption: string;
  selected: boolean;
}

export interface AppearanceView {
  modeOptions: AppearanceModeOption[];
}

// The fixed catalog of Modes in display order. Declared once so the picker order
// and the view-model can never drift; the `value`s are exactly the backend's
// closed `Mode` enum (light | dark | system).
export const MODE_OPTIONS = [
  { value: "light", label: "Light", caption: "Bright surface" },
  { value: "dark", label: "Dark", caption: "Low-glare, the original look" },
  { value: "system", label: "System", caption: "Follow your device" },
] as const satisfies readonly Omit<AppearanceModeOption, "selected">[];

// Map the user's current Mode to the picker's options, marking exactly the
// current one as `selected`. Pure: same input, same output, no I/O.
export function buildAppearanceView(currentMode: Mode): AppearanceView {
  return {
    modeOptions: MODE_OPTIONS.map((option) => ({
      ...option,
      selected: option.value === currentMode,
    })),
  };
}
