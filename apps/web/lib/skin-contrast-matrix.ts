import { contrastRatio, hexToRgb, WCAG_AA_NORMAL } from "./wcag-contrast.ts";

export const CONTRAST_FLOOR = 4.6;

export const TEXT_RUNGS = ["text-primary", "text-secondary", "text-muted"] as const;
export const ACCENTS = ["cyan", "blue", "violet", "magenta", "amber", "green"] as const;
export const TEXT_TOKENS = [...TEXT_RUNGS, ...ACCENTS] as const;
export const SURFACES = ["base", "surface", "elevated"] as const;
export type Surface = (typeof SURFACES)[number];

export interface TokenBlock {
  readonly selector: string;
  readonly skin: string;
  readonly mode: "light" | "dark";
  readonly isSystem: boolean;
  readonly colors: ReadonlyMap<string, string>;
  readonly declaredTokens: readonly string[];
}

// Pairing conventions live in components, not CSS. Extend this declared registry
// when a new text-on-fill convention is introduced. Dim tokens carry their alpha.
export const COMPOSITE_PAIRINGS = [
  { text: "cyan", background: "cyan-dim" },
  { text: "violet", background: "violet-dim" },
  { text: "magenta", background: "magenta-dim" },
  { text: "amber", background: "amber-dim" },
  { text: "green", background: "green-dim" },
  { text: "on-accent", background: "cyan" },
] as const;

// Every colour must be classified. on-accent is text only on its declared fill;
// surfaces, borders and dim fills are not ordinary foreground text.
export const NON_TEXT_TOKENS = [
  ...SURFACES, "border", "border-lite",
  ...COMPOSITE_PAIRINGS.map(({ background }) => background).filter((token) => token.endsWith("-dim")),
] as const;

function assertTokenClassification(block: TokenBlock): void {
  const classified = new Set<string>([
    ...TEXT_TOKENS, ...NON_TEXT_TOKENS,
    ...COMPOSITE_PAIRINGS.map(({ text }) => text),
  ]);
  for (const token of block.colors.keys()) {
    if (!classified.has(token)) {
      throw new Error(`${block.skin} ${block.mode}: unclassified --color-${token}`);
    }
  }
}

interface CssBlock { selector: string; body: string; context: readonly string[] }

function leafBlocks(css: string, context: readonly string[] = []): CssBlock[] {
  let blocks: CssBlock[] = [];
  let start = 0;
  while (start < css.length) {
    const open = css.indexOf("{", start);
    if (open < 0) break;
    let depth = 1;
    let end = open + 1;
    for (; end < css.length && depth; end++) {
      if (css[end] === "{") depth++;
      if (css[end] === "}") depth--;
    }
    if (depth) throw new Error("Unclosed CSS block");
    const selector = css.slice(start, open).trim().split(";").at(-1)!.trim();
    const body = css.slice(open + 1, end - 1);
    blocks = [...blocks, ...(body.includes("{") ? leafBlocks(body, [...context, selector])
      : [{ selector, body, context }])];
    start = end;
  }
  return blocks;
}

// Resolve each authored colour variant, including System light copies. Defaults
// from @theme are inherited just as they are in the browser (notably amber/green).
export function parseColorBlocks(css: string): TokenBlock[] {
  const leaves = leafBlocks(css.replace(/\/\*[\s\S]*?\*\//g, ""));
  for (const { selector, body, context } of leaves) {
    if (!/--color-[\w-]+\s*:/.test(body) || /--color-base\s*:/.test(body)) continue;
    const skin = selector.match(/data-skin="([\w-]+)"/)?.[1] ?? "pulse";
    const mode = selector.match(/data-mode="(light|dark)"/)?.[1]
      ?? (context.some((item) => /prefers-color-scheme:\s*light/.test(item)) ? "light" : "dark");
    throw new Error(`${skin} ${mode}: colour override without --color-base (${selector})`);
  }
  const variants = leaves.filter(({ body }) => /--color-base\s*:/.test(body));
  const declarations = (body: string) => [...body.matchAll(/--color-([\w-]+)\s*:\s*([^;]+);/g)]
    .map((match) => [match[1], match[2].trim()] as const);
  const defaults = declarations(variants.find(({ selector }) => selector === "@theme")?.body ?? "");
  return variants.map(({ selector, body, context }) => {
    const skin = selector.match(/data-skin="([\w-]+)"/)?.[1] ?? "pulse";
    const explicitMode = selector.match(/data-mode="(light|dark)"/)?.[1];
    const isSystem = !explicitMode && selector !== "@theme";
    const mode = explicitMode === "light" || context.some((item) => /prefers-color-scheme:\s*light/.test(item))
      ? "light" : "dark";
    return { selector, skin, mode, isSystem,
      declaredTokens: declarations(body).map(([token]) => token),
      colors: new Map([...defaults, ...declarations(body)]) };
  });
}

function color(block: TokenBlock, token: string): string {
  const value = block.colors.get(token);
  if (!value) throw new Error(`${block.skin} ${block.mode}: missing --color-${token}`);
  return value;
}

// CSS alpha blending happens in sRGB before WCAG linearization. Quantize to the
// rendered 8-bit channels so the existing opaque-hex WCAG utility stays unchanged.
export function compositeTint(tint: string, surface: string, alpha: number): string {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) throw new Error("Alpha must be between 0 and 1");
  const foreground = hexToRgb(tint);
  const background = hexToRgb(surface);
  return "#" + foreground.map((channel, index) => Math.round(
    channel * alpha + background[index] * (1 - alpha),
  ).toString(16).padStart(2, "0")).join("");
}

function backgroundOnSurface(background: string, surface: string): string {
  if (/^#[\da-f]{8}$/i.test(background)) {
    return compositeTint(background.slice(0, 7), surface, parseInt(background.slice(7), 16) / 255);
  }
  hexToRgb(background);
  return background;
}

export interface ContrastPairing {
  readonly kind: "flat" | "composite";
  readonly text: string;
  readonly background: string;
  readonly measurements: readonly { surface: Surface; foreground: string; background: string; ratio: number }[];
  readonly bindingSurface: Surface;
  readonly ratio: number;
  readonly passes: boolean;
}

function measurePairing(block: TokenBlock, kind: ContrastPairing["kind"], text: string, background: string): ContrastPairing {
  const foreground = color(block, text);
  const measurements = SURFACES.map((surface) => {
    const bg = kind === "flat" ? color(block, surface)
      : backgroundOnSurface(color(block, background), color(block, surface));
    return { surface, foreground, background: bg, ratio: contrastRatio(foreground, bg) };
  });
  const binding = measurements.reduce((worst, next) => next.ratio < worst.ratio ? next : worst);
  return { kind, text, background, measurements, bindingSurface: binding.surface,
    ratio: binding.ratio, passes: binding.ratio >= CONTRAST_FLOOR };
}

export function enumerateFlatPairings(block: TokenBlock): ContrastPairing[] {
  return TEXT_TOKENS.map((text) => measurePairing(block, "flat", text, "surfaces"));
}

export function enumerateCompositePairings(block: TokenBlock): ContrastPairing[] {
  return COMPOSITE_PAIRINGS.map(({ text, background }) => measurePairing(block, "composite", text, background));
}

export function buildContrastMatrix(css: string) {
  return parseColorBlocks(css).map((block) => {
    assertTokenClassification(block);
    return { ...block,
      pairings: [...enumerateFlatPairings(block), ...enumerateCompositePairings(block)] };
  });
}

export type ContrastMatrix = ReturnType<typeof buildContrastMatrix>;

function failureSummary(pairings: readonly ContrastPairing[]): string {
  const failures = pairings.filter(({ passes }) => !passes);
  const flat = failures.filter(({ kind }) => kind === "flat").length;
  return `${failures.length} failing pairings: ${flat} flat, ${failures.length - flat} composite`;
}

// Totals count the twelve explicit variants once; System copies are still emitted
// and checked separately, so a divergent media-query value cannot disappear.
export function formatContrastReport(matrix: ContrastMatrix): string {
  const variants = matrix.filter(({ isSystem }) => !isSystem);
  const pairings = variants.flatMap((variant) => variant.pairings);
  // #558's original audit omitted inherited accents and button-label pairings.
  const earlierAudit = variants.flatMap((variant) => variant.pairings.filter(
    ({ text }) => text !== "on-accent" && variant.declaredTokens.includes(text),
  ));
  const lines = [
    "# Skin contrast matrix", "",
    `WCAG AA normal text: ${WCAG_AA_NORMAL}:1; Contrast Floor: ${CONTRAST_FLOOR}:1. Totals count the ${variants.length} explicit Skin × Mode variants; System copies appear below separately.`,
    "", failureSummary(pairings), "",
    `Earlier audit scope: ${failureSummary(earlierAudit)}. This subtotal excludes inherited text tokens and on-accent button labels.`,
    "", "Ratios are rounded only for display; PASS/FAIL uses the unrounded ratio. Binding marks the worst surface for each pairing.", "",
    "| Skin × Mode | Kind | Text | Fill | Surface | Foreground | Rendered background | Ratio | Result | Binding |",
    "| --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- |",
  ];
  const rows = matrix.flatMap((variant) => variant.pairings.flatMap((pairing) =>
    pairing.measurements.map((measurement) =>
      `| ${variant.skin} ${variant.mode}${variant.isSystem ? " (System)" : ""} | ${pairing.kind} | ${pairing.text} | ${pairing.background} | ${measurement.surface} | ${measurement.foreground} | ${measurement.background} | ${measurement.ratio.toFixed(2)} | ${measurement.ratio >= CONTRAST_FLOOR ? "PASS" : "FAIL"} | ${measurement.surface === pairing.bindingSurface ? "yes" : ""} |`,
    ),
  ));
  return [...lines, ...rows, ""].join("\n");
}
