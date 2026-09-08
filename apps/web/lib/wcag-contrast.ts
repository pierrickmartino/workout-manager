// Pure WCAG 2.x contrast math — the objective half of the Contrast Floor invariant
// (ADR-0070). No DOM, no I/O: a hex pair in, a ratio out, so the Skin token guard
// (lib/skin-contrast.test.ts) and any future caller share one audited implementation
// rather than re-deriving the sRGB luminance formula.

// WCAG AA minimum contrast for normal-size text. The Text Ramp's smallest labels
// (7–11px) never reach the "large text" cutoff (24px / 18.66px bold), so this is the
// floor every rung must clear — there is no lighter bar for small type.
export const WCAG_AA_NORMAL = 4.5;

// One sRGB channel (0–255) to its linearised value, per the WCAG relative-luminance
// definition (the 0.03928 knee splits the linear toe from the 2.4-gamma curve).
function linearizeChannel(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

// Parse a `#rrggbb` (or `#rgb`) string to its three 0–255 channels. Throws on any
// malformed input rather than silently scoring garbage — the guard feeds it token
// values straight from globals.css, so a typo there should fail loudly.
export function hexToRgb(hex: string): readonly [number, number, number] {
  const cleaned = hex.trim().replace(/^#/, "");
  const full =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`not a 6-digit hex colour: ${hex}`);
  }
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ] as const;
}

// Relative luminance (0 = black, 1 = white) of an opaque sRGB colour.
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * linearizeChannel(r) +
    0.7152 * linearizeChannel(g) +
    0.0722 * linearizeChannel(b)
  );
}

// The WCAG contrast ratio between two opaque colours, in the range [1, 21].
// Symmetric in its arguments (foreground/background order does not matter).
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}
