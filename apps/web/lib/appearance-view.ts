import type { Mode, Skin } from "./theme";

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
// sourced. The token *values* live in globals.css under `[data-skin][data-mode]`.
export const SKIN_OPTIONS = [
  {
    value: "pulse",
    label: "PULSE",
    caption: "Tactical command center — the original",
  },
  { value: "aurora", label: "Aurora", caption: "Soft luminous palette" },
  {
    value: "vercel",
    label: "Vercel",
    caption: "Minimal black-and-white, Geist-inspired",
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
