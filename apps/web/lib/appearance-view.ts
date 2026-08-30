import type { Mode, Skin } from "./theme";
import type { WeightUnit } from "./weight-unit";

// The pure, per-role view-model for the Profile Appearance section. *Everyone* gets
// the same three Mode options (CONTEXT "Mode"). An **admin** additionally gets the
// fixed Skin catalog with preview/publish state (CONTEXT "Skin" / "Active Skin");
// an ordinary user never sees it. Keeping this decision logic pure and server-free
// means it is unit-testable without a browser and the picker/publisher components
// stay thin (prior art: apps/web/lib/achievements-view.ts).

// ── Mode slice (everyone) ────────────────────────────────────────────────────

// One Mode the picker can offer: the stored `value`, the human `label`, and a
// short `caption` clarifying what it does (notably that System follows the OS).
export interface AppearanceModeOption {
  value: Mode;
  label: string;
  caption: string;
  selected: boolean;
}

// The fixed catalog of Modes in display order. Declared once so the picker order
// and the view-model can never drift; the `value`s are exactly the backend's
// closed `Mode` enum (light | dark | system).
export const MODE_OPTIONS = [
  { value: "light", label: "Light", caption: "Bright surface" },
  { value: "dark", label: "Dark", caption: "Low-glare, the original look" },
  { value: "system", label: "System", caption: "Follow your device" },
] as const satisfies readonly Omit<AppearanceModeOption, "selected">[];

// Map the user's current Mode to the picker's options, marking exactly the current
// one as `selected`. Pure: same input, same output, no I/O.
export function buildModeOptions(currentMode: Mode): AppearanceModeOption[] {
  return MODE_OPTIONS.map((option) => ({
    ...option,
    selected: option.value === currentMode,
  }));
}

// ── Keep Screen Awake slice (everyone) ───────────────────────────────────────

// The user's Keep Screen Awake control: whether the preference is `enabled`, plus
// the human `label` and a short `caption`. CONTEXT "Keep Screen Awake" — the user's
// Interface Preference for holding the device screen on while a Live Session is
// underway. The copy names the *preference*, never the browser wake-lock API that
// backs it (a term CONTEXT tells us to avoid for the user-facing choice).
export interface AppearanceKeepAwakeControl {
  enabled: boolean;
  label: string;
  caption: string;
}

// The Keep Screen Awake copy, authored once so the toggle and its tests can never
// drift on the user-facing wording.
export const KEEP_SCREEN_AWAKE_COPY = {
  label: "Keep Screen Awake",
  caption: "Hold the screen on during a Live Session",
} as const satisfies Omit<AppearanceKeepAwakeControl, "enabled">;

// Map the user's stored Keep Screen Awake preference to the toggle's view-model,
// marking it `enabled` exactly when the preference is on. Pure: same input, same
// output, no I/O — so the toggle component stays a thin shell (mirrors
// `buildModeOptions`).
export function buildKeepScreenAwakeControl(
  keepScreenAwake: boolean,
): AppearanceKeepAwakeControl {
  return { ...KEEP_SCREEN_AWAKE_COPY, enabled: keepScreenAwake };
}

// ── Weight Unit slice (everyone) ─────────────────────────────────────────────

// One Weight Unit the toggle can offer: the stored `value`, its human `label`, and
// whether it is the currently `selected` unit.
export interface WeightUnitOption {
  value: WeightUnit;
  label: string;
  selected: boolean;
}

// The user's Weight Unit control: the human `label` and `caption` plus the two
// unit `options`. CONTEXT "Weight Unit" — the user's Interface Preference for the
// unit a Load and Performed Body Weight are entered and displayed in. It steers
// display only; storage stays canonical kilograms, so the choice never reaches
// generation or the cache key.
export interface AppearanceWeightUnitControl {
  label: string;
  caption: string;
  options: WeightUnitOption[];
}

// The fixed catalog of Weight Units in display order (kg first — the default).
// Declared once so the toggle order and the view-model can never drift; the
// `value`s are exactly the backend's closed `WeightUnit` enum (kg | lb).
export const WEIGHT_UNIT_OPTIONS = [
  { value: "kg", label: "kg" },
  { value: "lb", label: "lb" },
] as const satisfies readonly Omit<WeightUnitOption, "selected">[];

// The Weight Unit copy, authored once so the toggle and its tests can never drift on
// the user-facing wording.
export const WEIGHT_UNIT_COPY = {
  label: "Weight Unit",
  caption: "Enter and display weights in your unit",
} as const satisfies Omit<AppearanceWeightUnitControl, "options">;

// Map the user's stored Weight Unit to the toggle's view-model, marking exactly the
// current unit as `selected`. Pure: same input, same output, no I/O — so the toggle
// component stays a thin shell (mirrors `buildModeOptions`).
export function buildWeightUnitControl(
  currentUnit: WeightUnit,
): AppearanceWeightUnitControl {
  return {
    ...WEIGHT_UNIT_COPY,
    options: WEIGHT_UNIT_OPTIONS.map((option) => ({
      ...option,
      selected: option.value === currentUnit,
    })),
  };
}

// ── Skin slice (admins only) ─────────────────────────────────────────────────

// One Skin the admin can review: its `value` (catalog id), the human `label` and
// `caption`, whether it is the published `isActive` Skin (what every user sees),
// and whether it is the admin's current unpublished `isPreviewing` selection.
export interface AppearanceSkinOption {
  value: Skin;
  label: string;
  caption: string;
  isActive: boolean;
  isPreviewing: boolean;
}

// The admin's Skin control: the catalog options plus the state the preview/publish
// affordances key off. `isPreviewing` (and thus `canPublish`/`canCancel`) is true
// exactly when the admin is trying a Skin that isn't the published Active one.
export interface AppearanceSkinControl {
  options: AppearanceSkinOption[];
  activeSkin: Skin;
  previewSkin: Skin;
  isPreviewing: boolean;
  canPublish: boolean;
  canCancel: boolean;
}

// The display catalog of Skins in order. Kept in lockstep with the canonical
// `KNOWN_SKINS` id list from lib/theme (a drift is caught by a unit test), so this
// is the one place a Skin's human copy is authored while the id set stays single-
// sourced. A Skin is a full visual identity — colour, typography, and shape
// (ADR-0050); the token *values* live in globals.css (colour under
// `[data-skin][data-mode]`, fonts and radii under `html[data-skin]`).
export const SKIN_OPTIONS = [
  {
    value: "pulse",
    label: "PULSE",
    caption: "Tactical command center — Space Grotesk, the original",
  },
  {
    value: "aurora",
    label: "Aurora",
    caption: "Luminous colour, humanist type, rounded",
  },
  {
    value: "vercel",
    label: "Vercel",
    caption: "Minimal true-black, Geist type, sharp corners",
  },
] as const satisfies readonly Omit<
  AppearanceSkinOption,
  "isActive" | "isPreviewing"
>[];

// Build the admin Skin control from the published Active Skin and the admin's
// current (client-side) preview selection. When `previewSkin` equals `activeSkin`
// nothing is being previewed, so publish/cancel are inert; otherwise the previewed
// Skin is flagged distinctly from the Active one and can be published or cancelled.
// Pure: same inputs, same output, no I/O.
export function buildSkinControl(
  activeSkin: Skin,
  previewSkin: Skin,
): AppearanceSkinControl {
  const isPreviewing = previewSkin !== activeSkin;
  return {
    options: SKIN_OPTIONS.map((option) => ({
      ...option,
      isActive: option.value === activeSkin,
      // A Skin only reads as "previewing" while it differs from the Active one, so
      // the published Skin is never simultaneously badged Active and Previewing.
      isPreviewing: isPreviewing && option.value === previewSkin,
    })),
    activeSkin,
    previewSkin,
    isPreviewing,
    canPublish: isPreviewing,
    canCancel: isPreviewing,
  };
}

// ── Per-role composition ─────────────────────────────────────────────────────

// Everything the Appearance section needs. `skinControl` is `null` for a non-admin
// — the Skin catalog is not theirs to see — and populated for an admin.
export interface AppearanceView {
  modeOptions: AppearanceModeOption[];
  skinControl: AppearanceSkinControl | null;
}

// The inputs the per-role view is built from: the user's Mode (everyone), their
// admin status, the published Active Skin, and — while an admin is trying one — the
// current preview selection (defaulting to `activeSkin`, i.e. no preview pending).
// `activeSkin` is always supplied by the caller: the fallback-to-default lives in
// the server read (`resolveActiveSkin`), not in this pure composition.
export interface AppearanceViewInput {
  mode: Mode;
  isAdmin: boolean;
  activeSkin: Skin;
  previewSkin?: Skin;
}

// The single per-role mapper: Mode options for everyone; the Skin control only for
// an admin (else `null`). Pure and server-free, so it is safe to call from either a
// Server or Client Component and is unit-tested over its inputs/outputs.
export function buildAppearanceView({
  mode,
  isAdmin,
  activeSkin,
  previewSkin = activeSkin,
}: AppearanceViewInput): AppearanceView {
  return {
    modeOptions: buildModeOptions(mode),
    skinControl: isAdmin ? buildSkinControl(activeSkin, previewSkin) : null,
  };
}
