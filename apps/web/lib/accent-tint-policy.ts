import { parseAlpha, readTextColour } from "./faded-text-policy.ts";
import { collectClassStrings, parseClassToken, type ClassToken } from "./motion-policy.ts";
import {
  ACCENTS, COMPOSITE_PAIRINGS, fillLabel, type TokenBlock,
} from "./skin-contrast-matrix.ts";

// ADR-0086: an accent tint a component mixes itself is a pairing nobody measured.
// ADR-0081 guarantees the *declared* pairings — five Accents on their own `-dim`
// fills and the on-accent label on the cyan button fill. A call site that writes
// `bg-cyan/15` instead composites its own fill, and cyan text on it measures
// 4.42:1 in Vercel Light. ADR-0083 left this to #567 deliberately: it is a
// pairing question — which text on which tint — not the alpha question that
// module answers about foregrounds.
//
// Two rules, both fail-closed, both decidable from one class string:
//
//   1. Every colour a component names is one the Skins declare. `assertToken-
//      Classification` iterates the tokens a Skin *declares*, so a colour the
//      token system has never heard of — `--color-danger` — reached a component
//      without tripping anything. This closes that from the component side.
//   2. An accent used as a background at a call-site alpha is either a declared
//      pairing with the text beside it, or a registered graphic fill carrying no
//      text at all. A solid token fill is not this rule's business: its value is
//      one ADR-0081 already measures.
//
// Scope, deliberately: translucent chrome — `bg-surface/95`, `bg-base/90`,
// `bg-black/60` — composites against whatever scrolls beneath it and is not
// statically decidable, so it is classified `harness` rather than skipped in
// silence. ADR-0083 draws that boundary and ADR-0086 records these cases.

export type ColourPrefix = (typeof COLOUR_PREFIXES)[number]["prefix"] | "text";

export interface ColourUtility {
  readonly prefix: ColourPrefix;
  readonly token: string;
  // null when no alpha was written, NaN when one was written but is unreadable.
  readonly alpha: number | null;
  readonly raw: string;
}

// Colours that belong to no Skin: CSS keywords and the two absolutes Tailwind
// ships. They are not measurable against a Skin surface and never a Skin's job.
export const UNIVERSAL_COLOURS = ["transparent", "current", "inherit", "black", "white"] as const;

// An accent fill that carries no text at all. Nothing here is measured against
// the Contrast Floor, because the Floor governs text: a swatch with no text in
// it is a graphical object under WCAG 1.4.11. That is a claim about a specific
// call site, so it needs a reason a reviewer can weigh (ADR-0086).
export interface GraphicFill {
  readonly file: string;
  readonly utility: string;
  readonly reason: string;
}

export const GRAPHIC_FILLS: readonly GraphicFill[] = [
  {
    file: "components/pulse/training-heatmap.tsx",
    utility: "bg-cyan/25",
    reason: "Heatmap density cell. The cells are empty spans; each day's fact reaches "
      + "every user as an aria-label, a title and the mirrored caption, never as text "
      + "printed on the shade.",
  },
  {
    file: "components/pulse/training-heatmap.tsx",
    utility: "bg-cyan/50",
    reason: "Heatmap density cell, as bg-cyan/25 above — the ramp's middle step.",
  },
  {
    file: "components/pulse/training-heatmap.tsx",
    utility: "bg-cyan/75",
    reason: "Heatmap density cell, as bg-cyan/25 above — the ramp's top tinted step.",
  },
  {
    file: "components/GenerationProgress.tsx",
    utility: "bg-cyan/40",
    reason: "The indeterminate progress track's segment under prefers-reduced-motion. "
      + "The bar is an empty aria-hidden div; the state it reports is announced by the "
      + "role=\"status\" region above it (ADR-0082).",
  },
];

// Each prefix is overloaded: `border-2` is a width, `border-dashed` a style,
// `border-cyan` a colour. These patterns are the non-colour forms, so anything
// else is treated as a colour and must be declared — fail-closed, as in ADR-0081.
// `text-` is absent: `faded-text-policy.ts` already owns that vocabulary, and
// forking it would let two sweeps disagree about what a text colour is.
const COLOUR_PREFIXES = [
  { prefix: "bg", nonColour: /^(gradient-.+|linear-.+|radial-.+|conic-.+|clip-.+|origin-.+|blend-.+|size-.+|position-.+|repeat.*|no-repeat|cover|contain|auto|fixed|local|scroll|center|top|bottom|left|right|none)$/ },
  { prefix: "border", nonColour: /^([trblxyse](-\d+)?|\d+|solid|dashed|dotted|double|hidden|none|collapse|separate|spacing-.+)$/ },
  // Before `ring`, so `ring-offset-base` is an offset colour and not a ring one.
  { prefix: "ring-offset", nonColour: /^\d+$/ },
  { prefix: "ring", nonColour: /^(\d+|inset)$/ },
  { prefix: "outline", nonColour: /^(\d+|none|hidden|solid|dashed|dotted|double|offset-\d+)$/ },
  { prefix: "divide", nonColour: /^([xy](-\d+|-reverse)?|solid|dashed|dotted|double|hidden|none)$/ },
  { prefix: "shadow", nonColour: /^(\d*(xs|sm|md|lg|xl)|inner|none)$/ },
  { prefix: "stroke", nonColour: /^(\d+|none)$/ },
  { prefix: "fill", nonColour: /^none$/ },
  { prefix: "accent", nonColour: /^auto$/ },
  { prefix: "caret", nonColour: /^$/ },
  { prefix: "decoration", nonColour: /^(\d+|solid|double|dotted|dashed|wavy|from-font|auto)$/ },
  { prefix: "placeholder", nonColour: /^$/ },
  { prefix: "from", nonColour: /^\d+%$/ },
  { prefix: "via", nonColour: /^\d+%$/ },
  { prefix: "to", nonColour: /^\d+%$/ },
] as const;

// An arbitrary value is a raw CSS colour or a raw CSS value; either way it names
// no token, so there is nothing for this rule to check against the Skins.
const ARBITRARY = /^[[(]/;

export function readColourUtility(utility: string): ColourUtility | null {
  const text = readTextColour(utility);
  if (text !== null) {
    return ARBITRARY.test(text.token) ? null
      : { prefix: "text", token: text.token, raw: text.raw,
        alpha: text.raw === "" ? null : text.alpha ?? Number.NaN };
  }
  if (utility.startsWith("text-")) return null;
  for (const { prefix, nonColour } of COLOUR_PREFIXES) {
    if (!utility.startsWith(`${prefix}-`)) continue;
    const body = utility.slice(prefix.length + 1);
    const slash = body.indexOf("/");
    const token = slash < 0 ? body : body.slice(0, slash);
    if (token.length === 0 || nonColour.test(token) || ARBITRARY.test(token)) return null;
    const raw = slash < 0 ? "" : body.slice(slash + 1);
    return { prefix, token, alpha: slash < 0 ? null : parseAlpha(raw) ?? Number.NaN, raw };
  }
  return null;
}

export type BackgroundKind = "opaque" | "accent-tint" | "harness";

// What sits *under* a background decides whether source can measure it. An accent
// at a call-site alpha composites against a Skin surface, which is known. A
// surface or universal colour at a call-site alpha composites against whatever
// scrolls beneath it, which is not — that stays the browser harness's job.
export function classifyBackground(token: string, alpha: number | null): BackgroundKind {
  if (alpha === null) return "opaque";
  return (ACCENTS as readonly string[]).includes(token) ? "accent-tint" : "harness";
}

export interface ColourUse extends ColourUtility {
  readonly file: string;
  readonly line: number;
  readonly utility: string;
  readonly variants: readonly string[];
  // Which class string this came from. A fill pairs only with text in the same
  // one: separate literals are separate elements or exclusive branches — the four
  // `{ text, dot, bar }` strings of a section's colour map are not one element's
  // classes, and `isNext ? "bg-cyan text-on-accent" : "bg-base text-cyan"` never
  // renders both. Grouping by line merged both and invented pairings.
  readonly group: number;
}

export type TintFailure =
  | { readonly kind: "undeclared-colour" }
  | { readonly kind: "unreadable-alpha"; readonly raw: string }
  // Text sits beside the fill, but that pairing is not one the registry declares.
  | { readonly kind: "undeclared-pairing"; readonly text: string }
  // No text sits beside the fill, so it can only arrive from a descendant this
  // rule cannot see. A declared fill or a graphic registration is the way out.
  | { readonly kind: "undeclared-tint" };

export interface TintViolation {
  readonly use: ColourUse;
  readonly failure: TintFailure;
}

export function declaredColourTokens(blocks: readonly TokenBlock[]): ReadonlySet<string> {
  return new Set([
    ...UNIVERSAL_COLOURS,
    ...blocks.flatMap((block) => [...block.colors.keys()]),
  ]);
}

export function findColourUses(source: string, file: string): readonly ColourUse[] {
  return collectClassStrings(source, file).flatMap(({ text, line }, group) =>
    text.split(/\s+/).filter(Boolean).map(parseClassToken).flatMap(({ variants, utility }) => {
      const colour = readColourUtility(utility);
      return colour === null ? [] : [{ ...colour, file, line, utility, variants, group }];
    }));
}

// A bare utility applies in every state, so it renders with anything. Two
// differently-qualified utilities need not ever meet: a disabled control is
// never hovered. Requiring that pairing would be a false failure, and a guard
// that cries wolf teaches people to register exemptions mechanically.
function canRenderTogether(fill: ColourUse, text: ColourUse): boolean {
  const narrower = fill.variants.length >= text.variants.length ? fill : text;
  const wider = narrower === fill ? text : fill;
  return wider.variants.every((variant) => narrower.variants.includes(variant));
}

function isDeclaredPairing(text: string, token: string, alpha: number | undefined): boolean {
  return COMPOSITE_PAIRINGS.some((pairing) =>
    pairing.text === text && pairing.background === token && pairing.alpha === alpha);
}

// A fill token the registry already declares: a `-dim` chip, or the solid accent
// behind the on-accent label. Its *value* is ADR-0081's business — but which text
// sits on it is still this one's, because a `-dim` token is itself a 0x1f tint.
function isDeclaredFillToken(token: string): boolean {
  return COMPOSITE_PAIRINGS.some(({ background, alpha }) => background === token && alpha === undefined);
}

function isRegisteredGraphic(use: ColourUse): boolean {
  return GRAPHIC_FILLS.some(({ file, utility }) => file === use.file && utility === use.utility);
}

function pairableText(fill: ColourUse, sameString: readonly ColourUse[]): readonly ColourUse[] {
  return sameString.filter((use) => use.prefix === "text" && canRenderTogether(fill, use));
}

function undeclaredPairing(
  fill: ColourUse, alpha: number | undefined, texts: readonly ColourUse[],
): TintFailure | null {
  const undeclared = texts.find(({ token }) => !isDeclaredPairing(token, fill.token, alpha));
  return undeclared === undefined ? null : { kind: "undeclared-pairing", text: undeclared.token };
}

export function findAccentTintViolations(
  source: string, file: string, blocks: readonly TokenBlock[],
): readonly TintViolation[] {
  const declared = declaredColourTokens(blocks);
  const uses = findColourUses(source, file);
  return uses.flatMap((use) => {
    if (!declared.has(use.token)) return [{ use, failure: { kind: "undeclared-colour" } as const }];
    if (use.alpha !== null && Number.isNaN(use.alpha)) {
      return [{ use, failure: { kind: "unreadable-alpha", raw: use.raw } as const }];
    }
    if (use.prefix !== "bg" || classifyBackground(use.token, use.alpha) === "harness") return [];
    if (isRegisteredGraphic(use)) return [];
    // A fill and its text pair when they can end up on the same element.
    const texts = pairableText(use, uses.filter((other) => other.group === use.group));
    if (use.alpha === null) {
      // A declared fill token. Its value is measured, so only the text on it is
      // open — and a fill with no text beside it is simply a fill nobody has
      // written text on here.
      const failure = isDeclaredFillToken(use.token) ? undeclaredPairing(use, undefined, texts) : null;
      return failure === null ? [] : [{ use, failure }];
    }
    // A tint the call site mixed itself. With no text beside it this fails closed:
    // text can still reach it from a descendant, which one class string cannot see.
    const failure = texts.length === 0
      ? { kind: "undeclared-tint" } as const
      : undeclaredPairing(use, use.alpha, texts);
    return failure === null ? [] : [{ use, failure }];
  });
}

export function formatTintViolations(violations: readonly TintViolation[]): string {
  return violations.map(({ use, failure }) => {
    const where = `${use.file}:${use.line} — ${use.utility}`;
    if (failure.kind === "undeclared-colour") {
      return `${where} names --color-${use.token}, which no Skin declares`;
    }
    if (failure.kind === "unreadable-alpha") {
      return `${where} has an alpha this rule cannot read (${failure.raw})`;
    }
    if (failure.kind === "undeclared-tint") {
      return `${where} mixes a tint no declared pairing covers, and text can reach it from a`
        + ` descendant. Use a declared fill, or register it as a graphic that carries no text`;
    }
    const fill = fillLabel({ background: use.token, alpha: use.alpha ?? undefined });
    return `${where} paints text-${failure.text} on ${fill}, which is not a declared pairing`;
  }).join("\n");
}
