import { collectClassStrings, parseClassToken } from "./motion-policy.ts";
import {
  compositeTint, CONTRAST_FLOOR, SURFACES, TEXT_TOKENS,
  type Surface, type TokenBlock,
} from "./skin-contrast-matrix.ts";
import { contrastRatio } from "./wcag-contrast.ts";

// ADR-0083: a call-site fade cannot take text below the Contrast Floor.
// ADR-0081 guarantees the *tokens* clear the floor; a fade applied where the
// token is used composites it back toward its surface and can undo that. Two
// spellings do it — `text-cyan/80` and a same-string `opacity-70` — and this
// module treats them as one rule, because which one an author reaches for is a
// habit, not a decision.
//
// Given one file's text it returns the fades it declares; measuring them against
// the Skins and walking the tree are the caller's job (see the test), which
// keeps this module pure.
//
// Scope, deliberately: the faded foreground is measured against the bare Skin
// surfaces, ignoring any tint the element paints behind itself. Element
// backgrounds are `accent-tint-policy.ts`'s subject — an undeclared `bg-cyan/15`
// is a *pairing* question for ADR-0081's composite registry, not an alpha
// question (ADR-0086) — and guessing at them here would make this module wrong
// in a way nobody could see.
// Ancestor fades stay out too: `opacity-70` on a card whose text colour lives on
// a descendant is not decidable from one class string, and ADR-0083 names the
// two such sites rather than implying they are covered.

export interface FadeExemption {
  readonly file: string;
  readonly utility: string;
  readonly reason: string;
}

// Deliberately empty. An entry here asserts that some text may render below the
// Contrast Floor, which needs a reason a reviewer can weigh — so the reason is a
// required field, not a comment. Note what is *not* an entry: `disabled:` fades
// are exempt by rule below, and the two disabled pagers that prompted #566 were
// fixed rather than exempted, because a `<span>` is not the "inactive user
// interface component" WCAG 1.4.3 exempts.
export const FADE_EXEMPTIONS: readonly FadeExemption[] = [];

// A fade declared at one call site: which text token, and how much of it survives.
export interface CallSiteFade {
  readonly file: string;
  readonly line: number;
  readonly token: string;
  readonly alpha: number;
  // The utilities that produced it, in source order, for the failure message.
  readonly utilities: readonly string[];
}

export type FadeFailure =
  | { readonly kind: "below-floor"; readonly variant: string; readonly surface: Surface; readonly ratio: number }
  | { readonly kind: "unknown-token" }
  | { readonly kind: "unreadable-alpha"; readonly raw: string };

export interface FadeViolation {
  readonly fade: CallSiteFade;
  readonly failure: FadeFailure;
}

const KNOWN_TEXT_TOKENS: ReadonlySet<string> = new Set<string>([...TEXT_TOKENS, "on-accent"]);

// `text-` is overloaded: size, alignment and wrapping share the prefix with
// colour. These are the non-colour forms, so anything else is treated as a
// colour and must be classified — an unknown `text-foo/50` fails closed rather
// than being waved through as typography.
const NON_COLOUR_TEXT = /^(xs|sm|base|lg|xl|[2-9]xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|\[.*])$/;

// `disabled:` compiles to `:disabled`, which matches only form controls — so a
// fade behind it really does sit on an inactive user interface component, the
// claim WCAG 1.4.3 exempts. This is a rule, not an allowlist: it holds for every
// such fade rather than for the ones someone remembered to register. It is also
// precisely the claim that fails for a faded `<span>`, which is why #566 fixed
// the two pagers instead of exempting them.
const INACTIVE_VARIANTS = new Set(["disabled", "group-disabled", "peer-disabled"]);

// Tailwind writes an alpha as `/80`, `/[0.42]` or `/[42%]`. Anything else is
// unreadable rather than absent, and unreadable fails closed.
export function parseAlpha(raw: string): number | null {
  const percent = /^(\d{1,3})$/.exec(raw);
  if (percent) return Number(percent[1]) / 100;
  const arbitrary = /^\[(\d*\.?\d+)(%?)]$/.exec(raw);
  if (arbitrary) return Number(arbitrary[1]) / (arbitrary[2] ? 100 : 1);
  return null;
}

interface ColourUtility { readonly token: string; readonly alpha: number | null; readonly raw: string }

// The colour a `text-*` utility sets, or null when it is typography. `alpha` is
// null only when it was written but could not be read.
export function readTextColour(utility: string): ColourUtility | null {
  if (!utility.startsWith("text-")) return null;
  const body = utility.slice("text-".length);
  const slash = body.indexOf("/");
  const token = slash < 0 ? body : body.slice(0, slash);
  if (slash < 0) return NON_COLOUR_TEXT.test(token) ? null : { token, alpha: 1, raw: "" };
  const raw = body.slice(slash + 1);
  return { token, alpha: parseAlpha(raw), raw };
}

// The opacity a same-element `opacity-*` utility applies, or null when unreadable.
export function readOpacity(utility: string): { readonly alpha: number | null; readonly raw: string } | null {
  if (!utility.startsWith("opacity-")) return null;
  const raw = utility.slice("opacity-".length);
  return { alpha: parseAlpha(raw), raw };
}

export function findCallSiteFades(source: string, file: string): readonly CallSiteFade[] {
  const fades: CallSiteFade[] = [];
  for (const { text, line } of collectClassStrings(source, file)) {
    const tokens = text.split(/\s+/).filter(Boolean).map(parseClassToken)
      .filter((token) => !token.variants.some((variant) => INACTIVE_VARIANTS.has(variant)));
    const opacity = tokens.map((token) => ({ token, read: readOpacity(token.utility) }))
      .find(({ read }) => read !== null && read.alpha !== 1);
    for (const { variants, utility } of tokens) {
      const colour = readTextColour(utility);
      if (colour === null) continue;
      // A hover-only fade still renders on hover, so variants do not excuse it;
      // only the inactive-control variants filtered above do.
      void variants;
      const opacityAlpha = opacity?.read?.alpha ?? 1;
      const unreadable = colour.alpha === null ? colour.raw : opacity?.read?.alpha === null ? opacity.read.raw : null;
      const alpha = unreadable !== null ? Number.NaN : (colour.alpha ?? 1) * opacityAlpha;
      if (unreadable === null && alpha === 1) continue;
      fades.push({
        file, line, token: colour.token, alpha,
        utilities: opacity ? [utility, opacity.token.utility] : [utility],
      });
    }
  }
  return fades;
}

// Measures one fade against every Skin variant, binding on the worst surface.
// Source cannot say which surface an element sits on, so all three are checked
// and the worst decides — fail-closed by construction, and stricter than any one
// layout, which is the right direction for a floor.
export function measureFade(fade: CallSiteFade, blocks: readonly TokenBlock[]): FadeFailure | null {
  if (Number.isNaN(fade.alpha)) {
    const raw = fade.utilities.map((utility) => utility.split("/")[1] ?? utility).join(" ");
    return { kind: "unreadable-alpha", raw };
  }
  if (!KNOWN_TEXT_TOKENS.has(fade.token)) return { kind: "unknown-token" };
  let worst: FadeFailure | null = null;
  for (const block of blocks) {
    const tint = block.colors.get(fade.token);
    if (!tint) return { kind: "unknown-token" };
    for (const surface of SURFACES) {
      const bg = block.colors.get(surface);
      if (!bg) return { kind: "unknown-token" };
      const ratio = contrastRatio(compositeTint(tint, bg, fade.alpha), bg);
      if (ratio >= CONTRAST_FLOOR) continue;
      if (worst === null || (worst.kind === "below-floor" && ratio < worst.ratio)) {
        worst = { kind: "below-floor", variant: `${block.skin} ${block.mode}`, surface, ratio };
      }
    }
  }
  return worst;
}

export function findFadedTextViolations(
  source: string, file: string, blocks: readonly TokenBlock[],
): readonly FadeViolation[] {
  return findCallSiteFades(source, file)
    .filter((fade) => !FADE_EXEMPTIONS.some((exemption) =>
      exemption.file === fade.file && fade.utilities.includes(exemption.utility)))
    .flatMap((fade) => {
      const failure = measureFade(fade, blocks);
      return failure === null ? [] : [{ fade, failure }];
    });
}

export function formatFadeViolations(violations: readonly FadeViolation[]): string {
  return violations.map(({ fade, failure }) => {
    const where = `${fade.file}:${fade.line} — ${fade.utilities.join(" + ")}`;
    if (failure.kind === "unknown-token") {
      return `${where} fades --color-${fade.token}, which is not a classified text token`;
    }
    if (failure.kind === "unreadable-alpha") {
      return `${where} has an alpha this rule cannot read (${failure.raw})`;
    }
    return `${where} renders at ${failure.ratio.toFixed(2)}:1 on ${failure.surface} in ${failure.variant}`
      + `, below the ${CONTRAST_FLOOR}:1 Contrast Floor`;
  }).join("\n");
}
