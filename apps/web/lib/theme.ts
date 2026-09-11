// The theming seam. A rendered Theme is always the composition of the app-wide
// **Active Skin** and one user's **Mode** (CONTEXT "Theme") — never a single
// stored choice. This module owns the one pure mapping from that pair to the
// `data-skin` / `data-mode` attributes the root layout stamps on <html>, which
// `globals.css` keys its token variants off. Keeping it here means the Mode
// slice (#330) and Active Skin slice (#331) both feed the same seam instead of
// each reaching into the layout.
//
// Pure and server-free, so it is safe to call from a Server Component and to
// unit-test without a browser (prior art: apps/web/lib/*.test.ts).

// A named palette family from the fixed, curated catalog (CONTEXT "Skin"). This
// union is the frontend half of the single canonical Skin id list — it mirrors the
// backend catalog in app/domain/skin.py, and the two must not drift on which Skins
// exist. `aurora` is the minimal second seed Skin (ADR-0048 / #331); `vercel` is a
// minimalist, high-contrast palette inspired by Vercel's Geist design language.
export type Skin = "pulse" | "aurora" | "vercel";

// The catalog as a runtime set, so an id arriving from the API (untyped `string`
// on the wire) can be narrowed to a `Skin` before it is stamped. Kept in lockstep
// with the `Skin` union above.
export const KNOWN_SKINS = ["pulse", "aurora", "vercel"] as const;

// Narrow an arbitrary string to a catalog `Skin`. The backend validates a
// published id against its catalog, so the wire value is normally valid; this is a
// defensive boundary check (untrusted external data) so an unexpected value falls
// back to the default rather than stamping a `data-skin` no CSS block matches.
export function isSkin(value: string): value is Skin {
  return (KNOWN_SKINS as readonly string[]).includes(value);
}

// A user's chosen surface polarity (CONTEXT "Mode"). `system` is not a stored
// polarity — it defers to the device's own preference via prefers-color-scheme.
export type Mode = "light" | "dark" | "system";

// The concrete polarity actually stamped as `data-mode`. `system` never appears
// here: it is expressed by the *absence* of the attribute so CSS can decide.
type StampedMode = "light" | "dark";

// The attributes to spread onto <html>. `data-mode` is optional precisely so
// System Mode can omit it and let the prefers-color-scheme fallback resolve.
export interface ThemeAttributes {
  "data-skin": Skin;
  "data-mode"?: StampedMode;
}

// The shipped defaults preserve today's all-dark PULSE look: a user with no
// Appearance Preference yet is Dark (ADR-0047), on the default Active Skin
// (ADR-0048). Existing users are never silently light-flipped on deploy.
export const DEFAULT_SKIN: Skin = "pulse";
export const DEFAULT_MODE: Mode = "dark";

// Map an Active Skin + Mode to the attributes stamped on <html>. Light/Dark are
// stamped explicitly; System is deliberately left unstamped so the CSS
// `prefers-color-scheme` fallback — not the server — chooses the polarity.
export function resolveTheme(activeSkin: Skin, mode: Mode): ThemeAttributes {
  if (mode === "system") {
    return { "data-skin": activeSkin };
  }
  return { "data-skin": activeSkin, "data-mode": mode };
}
