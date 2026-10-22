// PROTOTYPE — throwaway. A shared portrait "rig" for the realistic-Avatar prototype: a
// lit, shaded head-and-shoulders bust (skin gradient, rim light, eyes with iris and catch
// light, nose and jaw shading) that each universe dresses with its own layers. Deliberately
// breaks ADR-0136's tone-only rule (real skin tones, fixed palettes, gradients) because
// "how realistic can the art get" is the question being asked. Not for main.

import * as React from "react";

export type Skin = readonly [light: string, mid: string, dark: string];

export interface Ids {
  readonly skin: string;
  readonly face: string;
  readonly bg: string;
  readonly shadeX: string;
  readonly shadeY: string;
  readonly metal: string;
  readonly gold: string;
  readonly bronze: string;
  readonly glow: string;
}

type Layer = (ids: Ids, p: Portrait) => React.ReactNode;

export interface Portrait {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly skin: Skin;
  readonly iris: string;
  readonly brow: string;
  readonly bg: readonly [inner: string, outer: string];
  readonly rim: string;
  readonly jaw?: "soft" | "square";
  readonly eyes?: "open" | "closed" | "glow";
  readonly lips?: string;
  // Behind the head: back hair, hoods, props over the shoulder, scenery.
  readonly scene?: Layer;
  readonly back?: Layer;
  // Clothing and armour over the shoulders.
  readonly body?: Layer;
  // Over the face: fringe, beards, helmets, paint.
  readonly front?: Layer;
}

const HEAD = {
  soft: "M50 20C38 20 31 29 31 41C31 50 34 57 39 61C43 64.5 46.5 66 50 66C53.5 66 57 64.5 61 61C66 57 69 50 69 41C69 29 62 20 50 20Z",
  square:
    "M50 20C38 20 31 29 31 41C31 52 33 58 38 62L44 65.5C47 66.5 53 66.5 56 65.5L62 62C67 58 69 52 69 41C69 29 62 20 50 20Z",
};

export const BARE_SHOULDERS = "M4 100C6 86 18 78 34 74L43 69H57L66 74C82 78 94 86 96 100Z";

// Paint a shape in a flat colour, then lay the side-light and top-light over it so cloth and
// metal read as volumes rather than cut-outs.
export function Shaded({
  d,
  fill,
  ids,
  stroke,
}: {
  d: string;
  fill: string;
  ids: Ids;
  stroke?: string;
}): React.JSX.Element {
  return (
    <g>
      <path d={d} fill={fill} stroke={stroke} strokeWidth={stroke ? 0.6 : undefined} />
      <path d={d} fill={`url(#${ids.shadeX})`} />
      <path d={d} fill={`url(#${ids.shadeY})`} />
    </g>
  );
}

function Eye({ cx, p, ids }: { cx: number; p: Portrait; ids: Ids }): React.JSX.Element {
  const [, , dark] = p.skin;
  if (p.eyes === "closed") {
    return (
      <g>
        <path d={`M${cx - 4} 44.5Q${cx} 47 ${cx + 4} 44.5`} fill="none" stroke={dark} strokeWidth="0.9" strokeLinecap="round" />
        <path d={`M${cx - 3.5} 45.8Q${cx} 47.2 ${cx + 3.5} 45.8`} fill="none" stroke={dark} strokeOpacity="0.35" strokeWidth="0.6" />
      </g>
    );
  }
  const glow = p.eyes === "glow";
  return (
    <g>
      <ellipse cx={cx} cy="44.5" rx="5.5" ry="3.6" fill={dark} opacity="0.22" />
      <path d={`M${cx - 4} 44.5Q${cx} 41.2 ${cx + 4} 44.5Q${cx} 47 ${cx - 4} 44.5Z`} fill={glow ? p.iris : "#f4efe9"} />
      {glow ? (
        <ellipse cx={cx} cy="44.4" rx="6" ry="4" fill={`url(#${ids.glow})`} />
      ) : (
        <g>
          <circle cx={cx} cy="44.3" r="1.9" fill={p.iris} />
          <circle cx={cx} cy="44.3" r="0.95" fill="#120d0b" />
          <circle cx={cx - 0.6} cy="43.6" r="0.45" fill="#fff" />
        </g>
      )}
      <path d={`M${cx - 4.3} 44.6Q${cx} 40.6 ${cx + 4.3} 44.4`} fill="none" stroke="#1d1410" strokeWidth="0.75" strokeLinecap="round" />
    </g>
  );
}

function Face({ p, ids }: { p: Portrait; ids: Ids }): React.JSX.Element {
  const [, mid, dark] = p.skin;
  const head = HEAD[p.jaw ?? "soft"];
  return (
    <g>
      {/* Ears */}
      <ellipse cx="31" cy="45" rx="3" ry="5" fill={mid} />
      <ellipse cx="69" cy="45" rx="3" ry="5" fill={dark} />
      {/* Head, lit from the upper left, with the far cheek falling into shadow */}
      <path d={head} fill={`url(#${ids.skin})`} />
      <path d={head} fill={`url(#${ids.face})`} />
      {/* Rim light on the shadow side */}
      <path d="M65 27C70 34 70.5 47 66 56" fill="none" stroke={p.rim} strokeOpacity="0.65" strokeWidth="1.1" strokeLinecap="round" />
      {/* Brows */}
      <path d="M37 39.5Q41.5 37.3 46.5 39" fill="none" stroke={p.brow} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M53.5 39Q58.5 37.3 63 39.5" fill="none" stroke={p.brow} strokeWidth="1.7" strokeLinecap="round" />
      <Eye cx={42} p={p} ids={ids} />
      <Eye cx={58} p={p} ids={ids} />
      {/* Nose: a shadowed side plane, the tip and the nostrils */}
      <path d="M51 45L53.5 52.5Q51.5 54 49 53.2" fill="none" stroke={dark} strokeOpacity="0.55" strokeWidth="0.9" strokeLinecap="round" />
      <ellipse cx="48.6" cy="53.4" rx="1" ry="0.55" fill={dark} opacity="0.6" />
      <ellipse cx="52.4" cy="53.4" rx="1" ry="0.55" fill={dark} opacity="0.6" />
      <ellipse cx="50.2" cy="51.8" rx="1.2" ry="0.8" fill="#fff" opacity="0.18" />
      {/* Mouth */}
      <path d="M45.5 58.2Q50 59.6 54.5 58.2" fill="none" stroke={p.lips ?? dark} strokeWidth="1.1" strokeLinecap="round" />
      <path d="M47 60.2Q50 61.3 53 60.2" fill="none" stroke="#fff" strokeOpacity="0.16" strokeWidth="0.9" strokeLinecap="round" />
      {/* Cheek warmth */}
      <ellipse cx="39" cy="52" rx="4" ry="2.5" fill="#d9605a" opacity="0.1" />
    </g>
  );
}

export function PortraitSvg({
  p,
  size,
  locked = false,
}: {
  p: Portrait;
  size: number;
  locked?: boolean;
}): React.JSX.Element {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name: string): string => `${name}-${p.id}-${uid}`;
  const ids: Ids = {
    skin: id("skin"),
    face: id("face"),
    bg: id("bg"),
    shadeX: id("sx"),
    shadeY: id("sy"),
    metal: id("metal"),
    gold: id("gold"),
    bronze: id("bronze"),
    glow: id("glow"),
  };
  const clip = id("clip");
  const [light, mid, dark] = p.skin;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      style={locked ? { filter: "grayscale(1) brightness(0.32) contrast(0.9)" } : undefined}
    >
      <defs>
        <radialGradient id={ids.skin} cx="0.4" cy="0.36" r="0.75">
          <stop offset="0" stopColor={light} />
          <stop offset="0.55" stopColor={mid} />
          <stop offset="1" stopColor={dark} />
        </radialGradient>
        <linearGradient id={ids.face} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="0.55" stopColor={dark} stopOpacity="0" />
          <stop offset="1" stopColor={dark} stopOpacity="0.75" />
        </linearGradient>
        <radialGradient id={ids.bg} cx="0.35" cy="0.3" r="0.85">
          <stop offset="0" stopColor={p.bg[0]} />
          <stop offset="1" stopColor={p.bg[1]} />
        </radialGradient>
        <linearGradient id={ids.shadeX} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="0.45" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.5" />
        </linearGradient>
        <linearGradient id={ids.shadeY} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="1" stopColor="#000" stopOpacity="0.35" />
        </linearGradient>
        <linearGradient id={ids.metal} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3f5f8" />
          <stop offset="0.3" stopColor="#a5adb7" />
          <stop offset="0.55" stopColor="#4d545d" />
          <stop offset="0.75" stopColor="#c6ccd3" />
          <stop offset="1" stopColor="#5b626a" />
        </linearGradient>
        <linearGradient id={ids.gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2bd" />
          <stop offset="0.35" stopColor="#e2aa3c" />
          <stop offset="0.65" stopColor="#8a5a14" />
          <stop offset="1" stopColor="#e8c266" />
        </linearGradient>
        <linearGradient id={ids.bronze} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6c995" />
          <stop offset="0.4" stopColor="#b5753d" />
          <stop offset="0.7" stopColor="#5f3519" />
          <stop offset="1" stopColor="#c98d52" />
        </linearGradient>
        <radialGradient id={ids.glow}>
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="0.35" stopColor={p.iris} stopOpacity="0.9" />
          <stop offset="1" stopColor={p.iris} stopOpacity="0" />
        </radialGradient>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="100" fill={`url(#${ids.bg})`} />
        {p.scene?.(ids, p)}
        {p.back?.(ids, p)}
        {/* Neck, with the jaw's shadow falling across it */}
        <path d="M42 56L42 72Q50 77 58 72L58 56Z" fill={mid} />
        <path d="M42 60Q50 68 58 60L58 64Q50 71 42 64Z" fill={dark} opacity="0.55" />
        <path d={BARE_SHOULDERS} fill={`url(#${ids.skin})`} />
        {p.body?.(ids, p)}
        <Face p={p} ids={ids} />
        {p.front?.(ids, p)}
        {/* A soft vignette pulls the eye to the face */}
        <circle cx="50" cy="50" r="49" fill="none" stroke="#000" strokeOpacity="0.25" strokeWidth="4" />
      </g>
    </svg>
  );
}
