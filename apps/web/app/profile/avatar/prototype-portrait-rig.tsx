// PROTOTYPE — throwaway. A shared painterly portrait "rig" for the realistic-Avatar prototype:
// a head-and-shoulders bust painted the way a digital painter would — soft, blurred form
// shadows clipped to the skull; skin grain; eyes with shaded sclera, limbal ring, lid crease
// and catch light; hair-stroke brows; strand-textured hair; raised, specular-lit metal and
// cloth with depth. Each universe dresses it with its own layers. Deliberately breaks
// ADR-0136's tone-only rule (real skin tones, fixed palettes, SVG filters) because "how
// realistic can vector art get" is the question being asked. Not for main.

import * as React from "react";

export type Skin = readonly [light: string, mid: string, dark: string];

export interface Ids {
  readonly skin: string;
  readonly bg: string;
  readonly metal: string;
  readonly gold: string;
  readonly bronze: string;
  readonly glow: string;
  readonly sclera: string;
  readonly iris: string;
  readonly grade: string;
  readonly side: string;
  readonly headClip: string;
  // Filters
  readonly blur1: string;
  readonly blur2: string;
  readonly blur4: string;
  readonly grain: string;
  readonly volume: string;
  readonly hairVolume: string;
  readonly bevel: string;
  readonly streakDark: string;
  readonly streakLight: string;
  readonly drop: string;
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
  // Stubble or a shaved beard shadow across the jaw.
  readonly stubble?: boolean;
  // Age lines under the eyes and across the brow.
  readonly aged?: boolean;
  // Behind the head: scenery, props over the shoulder.
  readonly scene?: Layer;
  // Behind the head: back hair, hoods.
  readonly back?: Layer;
  // Clothing and armour over the shoulders.
  readonly body?: Layer;
  // Over the face: fringe, beards, helmets, paint.
  readonly front?: Layer;
}

const HEAD = {
  soft: "M50 19.5C39 19.5 31.5 27 31.2 39C31 45 31.6 50 33.4 54.5C35 58.5 38.5 62.5 42.5 64.8C45 66.2 47.5 66.8 50 66.8C52.5 66.8 55 66.2 57.5 64.8C61.5 62.5 65 58.5 66.6 54.5C68.4 50 69 45 68.8 39C68.5 27 61 19.5 50 19.5Z",
  square:
    "M50 19.5C39 19.5 31.5 27 31.2 39C31 46 31.6 52 33.4 56.5C35 60 38 63 42 65.4C45 67 47.5 67.4 50 67.4C52.5 67.4 55 67 58 65.4C62 63 65 60 66.6 56.5C68.4 52 69 46 68.8 39C68.5 27 61 19.5 50 19.5Z",
};

export const BARE_SHOULDERS = "M2 100C4 86 16 78 32 74.5L40 70H60L68 74.5C84 78 96 86 98 100Z";

// Cloth, leather and fur: a flat base given rounded volume by an inner shadow on the far
// edges, an inner highlight on the lit ones, a woven grain, and a soft drop shadow beneath.
export function Shaded({
  d,
  fill,
  ids,
  fillRule,
}: {
  d: string;
  fill: string;
  ids: Ids;
  fillRule?: "evenodd";
}): React.JSX.Element {
  return (
    <g filter={`url(#${ids.drop})`}>
      <path d={d} fill={fill} fillRule={fillRule} filter={`url(#${ids.volume})`} />
      <path d={d} fill="#000" fillRule={fillRule} filter={`url(#${ids.grain})`} />
    </g>
  );
}

// Polished metal: a banded gradient raised into relief by a specular light from the upper left.
export function Metal({
  d,
  ids,
  tone = "steel",
  fillRule,
}: {
  d: string;
  ids: Ids;
  tone?: "steel" | "gold" | "bronze";
  fillRule?: "evenodd";
}): React.JSX.Element {
  const fill = tone === "steel" ? ids.metal : tone === "gold" ? ids.gold : ids.bronze;
  return (
    <g filter={`url(#${ids.drop})`}>
      <path d={d} fill={`url(#${fill})`} fillRule={fillRule} filter={`url(#${ids.bevel})`} />
    </g>
  );
}

// Hair, beards and fur: the mass given volume, combed into strands by stretched noise (dark
// gaps and light strands), with a soft sheen band where the key light catches it.
export function Hair({
  d,
  fill,
  ids,
  sheen = true,
}: {
  d: string;
  fill: string;
  ids: Ids;
  sheen?: boolean;
}): React.JSX.Element {
  const clip = `${ids.headClip}-hair-${hashPath(d)}`;
  return (
    <g filter={`url(#${ids.drop})`}>
      <clipPath id={clip}>
        <path d={d} />
      </clipPath>
      <path d={d} fill={fill} filter={`url(#${ids.hairVolume})`} />
      <path d={d} fill="#000" filter={`url(#${ids.streakDark})`} />
      <path d={d} fill="#fff" filter={`url(#${ids.streakLight})`} />
      {sheen ? (
        <g clipPath={`url(#${clip})`}>
          <ellipse cx="40" cy="26" rx="14" ry="4" fill="#fff" opacity="0.22" filter={`url(#${ids.blur2})`} transform="rotate(-18 40 26)" />
        </g>
      ) : null}
    </g>
  );
}

// A plait: alternating lobes down a line, each a small combed hair mass.
export function Braid({
  x,
  y0,
  y1,
  w,
  fill,
  ids,
}: {
  x: number;
  y0: number;
  y1: number;
  w: number;
  fill: string;
  ids: Ids;
}): React.JSX.Element {
  const step = w * 0.9;
  const count = Math.max(2, Math.floor((y1 - y0) / step));
  const d = Array.from({ length: count }, (_, i) => {
    const y = y0 + i * step;
    const side = i % 2 === 0 ? -1 : 1;
    const cx = x + side * w * 0.18;
    return `M${cx - w / 2} ${y}C${cx - w / 2} ${y + step * 0.9} ${cx + w / 2} ${y + step * 1.3} ${cx + w / 2} ${y + step * 0.4}C${cx + w / 2} ${y - step * 0.2} ${cx - w / 2} ${y - step * 0.4} ${cx - w / 2} ${y}Z`;
  }).join("");
  return <Hair d={d} fill={fill} ids={ids} sheen={false} />;
}

// Tapered locks of hair drawn as strokes, combed with the same strand texture as Hair.
export function Locks({
  strokes,
  fill,
  ids,
  width = 2.4,
}: {
  strokes: readonly string[];
  fill: string;
  ids: Ids;
  width?: number;
}): React.JSX.Element {
  return (
    <g filter={`url(#${ids.drop})`}>
      <g filter={`url(#${ids.hairVolume})`}>
        {strokes.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={fill} strokeWidth={width * (0.75 + ((i * 5) % 4) / 8)} strokeLinecap="round" />
        ))}
      </g>
      <g filter={`url(#${ids.streakDark})`}>
        {strokes.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#000" strokeWidth={width * (0.75 + ((i * 5) % 4) / 8)} strokeLinecap="round" />
        ))}
      </g>
    </g>
  );
}

// Chainmail: rows of interlocked rings over a dark padded backing.
export function Mail({ d, ids }: { d: string; ids: Ids }): React.JSX.Element {
  const pattern = `${ids.headClip}-mail`;
  return (
    <g filter={`url(#${ids.drop})`}>
      <pattern id={pattern} width="2.4" height="2" patternUnits="userSpaceOnUse">
        <rect width="2.4" height="2" fill="#2a2d32" />
        <circle cx="1.2" cy="1" r="0.85" fill="none" stroke="#c4cad2" strokeWidth="0.45" />
        <circle cx="0" cy="0" r="0.85" fill="none" stroke="#8a919a" strokeWidth="0.45" />
        <circle cx="2.4" cy="0" r="0.85" fill="none" stroke="#8a919a" strokeWidth="0.45" />
        <circle cx="0" cy="2" r="0.85" fill="none" stroke="#8a919a" strokeWidth="0.45" />
        <circle cx="2.4" cy="2" r="0.85" fill="none" stroke="#8a919a" strokeWidth="0.45" />
      </pattern>
      <path d={d} fill={`url(#${pattern})`} filter={`url(#${ids.volume})`} />
    </g>
  );
}

// A soft paint stroke: any shape, blurred, for glows, shadows and atmosphere.
export function Soft({
  children,
  ids,
  amount = 2,
}: {
  children: React.ReactNode;
  ids: Ids;
  amount?: 1 | 2 | 4;
}): React.JSX.Element {
  const filter = amount === 1 ? ids.blur1 : amount === 2 ? ids.blur2 : ids.blur4;
  return <g filter={`url(#${filter})`}>{children}</g>;
}

function hashPath(d: string): string {
  let h = 0;
  for (let i = 0; i < d.length; i += 1) h = (h * 31 + d.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

// Brows drawn hair by hair along a curve, over a soft base.
function Brow({ side, color, ids }: { side: -1 | 1; color: string; ids: Ids }): React.JSX.Element {
  // Inner end, arch control and outer end, for the left brow; the right is mirrored.
  const pts = (t: number): [number, number] => {
    const [x0, y0, cx, cy, x1, y1] = [46.5, 39, 41.5, 36.6, 36.5, 39.4];
    const x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * cx + t ** 2 * x1;
    const y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * cy + t ** 2 * y1;
    return [side === -1 ? x : 100 - x, y];
  };
  const hairs = Array.from({ length: 16 }, (_, i) => {
    const t = i / 15;
    const [x, y] = pts(t);
    const dx = (-1.5 + t * 0.2) * (side === -1 ? 1 : -1);
    const dy = -1 + t * 1.1;
    return (
      <path
        key={i}
        d={`M${x.toFixed(2)} ${(y + 0.5).toFixed(2)}l${dx.toFixed(2)} ${dy.toFixed(2)}`}
        stroke={color}
        strokeWidth={0.42}
        strokeOpacity={0.55 + ((i * 7) % 5) / 12}
        strokeLinecap="round"
      />
    );
  });
  const [ax, ay] = pts(0);
  const [mx, my] = pts(0.5);
  const [bx, by] = pts(1);
  return (
    <g>
      <path
        d={`M${ax} ${ay}Q${2 * mx - (ax + bx) / 2} ${2 * my - (ay + by) / 2} ${bx} ${by}`}
        stroke={color}
        strokeWidth="1.6"
        strokeOpacity="0.45"
        fill="none"
        strokeLinecap="round"
        filter={`url(#${ids.blur1})`}
      />
      {hairs}
    </g>
  );
}

function Eye({ cx, p, ids }: { cx: number; p: Portrait; ids: Ids }): React.JSX.Element {
  const [light, mid, dark] = p.skin;
  // The outer corner sits a touch higher than the inner one, on each side.
  const o = cx < 50 ? -1 : 1;
  const inner = cx - 4.1 * o;
  const outer = cx + 4.3 * o;
  const lidD = `M${inner} 44.8C${cx - 1.8 * o} 41.6 ${cx + 2 * o} 41.4 ${outer} 44.2C${cx + 1.8 * o} 46.6 ${cx - 1.6 * o} 46.8 ${inner} 44.8Z`;
  const clip = `${ids.headClip}-eye-${cx}`;

  if (p.eyes === "closed") {
    return (
      <g>
        <ellipse cx={cx} cy="44.2" rx="5.4" ry="3.2" fill={dark} opacity="0.35" filter={`url(#${ids.blur1})`} />
        <path d={lidD} fill={mid} />
        <path d={`M${inner} 44.9C${cx - 1.5 * o} 46.6 ${cx + 1.8 * o} 46.5 ${outer} 44.6`} fill="none" stroke="#1d1410" strokeWidth="0.75" strokeLinecap="round" />
        <path d={`M${inner + 0.4 * o} 43C${cx - 1 * o} 41.4 ${cx + 1.6 * o} 41.3 ${outer - 0.4 * o} 42.6`} fill="none" stroke={dark} strokeOpacity="0.5" strokeWidth="0.5" />
        <ellipse cx={cx - 0.6 * o} cy="43.4" rx="2" ry="0.6" fill={light} opacity="0.4" filter={`url(#${ids.blur1})`} />
      </g>
    );
  }

  const glow = p.eyes === "glow";
  return (
    <g>
      {/* The socket's shadow and the lid crease above it */}
      <ellipse cx={cx + 0.5 * o} cy="43" rx="6.4" ry="3.8" fill={dark} opacity={o === 1 ? 0.7 : 0.48} filter={`url(#${ids.blur2})`} />
      <ellipse cx={cx} cy="47.6" rx="3.6" ry="0.9" fill={dark} opacity="0.25" filter={`url(#${ids.blur1})`} />
      <path d={`M${inner + 0.2 * o} 43.2C${cx - 1.4 * o} 40.4 ${cx + 2.2 * o} 40.2 ${outer + 0.2 * o} 42.8`} fill="none" stroke={dark} strokeOpacity="0.55" strokeWidth="0.5" />
      <clipPath id={clip}>
        <path d={lidD} />
      </clipPath>
      <path d={lidD} fill={glow ? "#0c1214" : `url(#${ids.sclera})`} />
      <g clipPath={`url(#${clip})`}>
        {glow ? (
          <ellipse cx={cx} cy="44.2" rx="4" ry="2.4" fill={`url(#${ids.glow})`} />
        ) : (
          <g>
            <circle cx={cx + 0.2 * o} cy="44.25" r="1.78" fill={p.iris} />
            <circle cx={cx + 0.2 * o} cy="44.25" r="1.78" fill={`url(#${ids.iris})`} />
            <circle cx={cx + 0.2 * o} cy="44.25" r="1.74" fill="none" stroke="#0e0a08" strokeOpacity="0.7" strokeWidth="0.35" />
            <circle cx={cx + 0.2 * o} cy="44.25" r="0.78" fill="#0b0807" />
          </g>
        )}
        {/* The upper lid casts its shadow over the top of the eyeball */}
        <ellipse cx={cx} cy="41.9" rx="4.6" ry="1.5" fill="#1d1410" opacity="0.45" filter={`url(#${ids.blur1})`} />
      </g>
      {glow ? <ellipse cx={cx} cy="44.2" rx="6.5" ry="4.2" fill={`url(#${ids.glow})`} opacity="0.7" /> : null}
      {/* Catch lights from the key light */}
      {glow ? null : (
        <g>
          <circle cx={cx - 0.5 * o - 0.3} cy="43.4" r="0.5" fill="#fff" />
          <circle cx={cx + 0.9} cy="44.9" r="0.22" fill="#fff" opacity="0.6" />
        </g>
      )}
      {/* Lash line, flicked at the outer corner, and the lower lid's wet line */}
      <path d={`M${inner} 44.8C${cx - 1.8 * o} 41.6 ${cx + 2 * o} 41.4 ${outer} 44.2L${outer + 0.45 * o} 43.8`} fill="none" stroke="#120c09" strokeWidth="0.7" strokeLinecap="round" />
      <path d={`M${inner + 0.4 * o} 45.1C${cx - 1.4 * o} 46.7 ${cx + 1.8 * o} 46.5 ${outer - 0.2 * o} 44.6`} fill="none" stroke={light} strokeOpacity="0.55" strokeWidth="0.35" />
      <path d={`M${inner + 0.2 * o} 45.6C${cx - 1.2 * o} 47.6 ${cx + 1.8 * o} 47.4 ${outer} 45.4`} fill="none" stroke={dark} strokeOpacity="0.3" strokeWidth="0.5" />
      <ellipse cx={inner + 0.5 * o} cy="44.9" rx="0.55" ry="0.4" fill="#d47a74" opacity="0.7" />
    </g>
  );
}

function Face({ p, ids }: { p: Portrait; ids: Ids }): React.JSX.Element {
  const [light, mid, dark] = p.skin;
  const head = HEAD[p.jaw ?? "soft"];
  const lipBase = p.lips ?? dark;
  return (
    <g>
      {/* Ears: the rim, the bowl's shadow and the warm light through the lobe */}
      <path d="M32 40C27 38 26.4 44 27.4 48C28.2 52 30 54.5 33 54Z" fill={mid} />
      <path d="M31.6 42.4C29 41.6 28.6 45 29.4 47.6C30 49.6 31 50.6 32.4 50.4" fill="none" stroke={dark} strokeWidth="0.8" strokeOpacity="0.7" />
      <path d="M68 40C73 38 73.6 44 72.6 48C71.8 52 70 54.5 67 54Z" fill={dark} />
      <path d="M68.4 42.4C71 41.6 71.4 45 70.6 47.6C70 49.6 69 50.6 67.6 50.4" fill="none" stroke="#000" strokeWidth="0.8" strokeOpacity="0.35" />

      {/* The skull, base-coated, then painted in soft planes clipped to it */}
      <path d={head} fill={`url(#${ids.skin})`} />
      <path d={head} fill={`url(#${ids.side})`} />
      <g clipPath={`url(#${ids.headClip})`}>
        <Soft ids={ids} amount={4}>
          {/* Form shadow down the far side, and the turn of the jaw */}
          <ellipse cx="68" cy="46" rx="8" ry="25" fill={dark} opacity="0.95" />
          <ellipse cx="62" cy="48" rx="5" ry="18" fill={dark} opacity="0.35" />
          <ellipse cx="50" cy="70" rx="16" ry="5" fill={dark} opacity="0.6" />
          {/* Light across the forehead and the near cheek */}
          <ellipse cx="44" cy="28" rx="9" ry="5" fill={light} opacity="0.75" />
          <ellipse cx="38.5" cy="51" rx="4.2" ry="3" fill={light} opacity="0.55" />
          {/* Warmth where blood sits close: cheeks, nose, chin */}
          <ellipse cx="39" cy="54" rx="4" ry="2.6" fill="#d0574d" opacity="0.18" />
          <ellipse cx="61" cy="54" rx="3.5" ry="2.4" fill="#b8473f" opacity="0.18" />
          <ellipse cx="50" cy="52" rx="2.2" ry="1.6" fill="#d0574d" opacity="0.18" />
        </Soft>
        <Soft ids={ids} amount={2}>
          {/* Brow ridge catching light over the sockets */}
          <ellipse cx="43" cy="38.4" rx="6" ry="1.4" fill={light} opacity="0.55" />
          <ellipse cx="57" cy="38.4" rx="5" ry="1.2" fill={light} opacity="0.25" />
          {/* Temple hollows */}
          <ellipse cx="33" cy="40" rx="2" ry="5" fill={dark} opacity="0.35" />
          {/* Cheekbone underplane and the hollow below it on the shadow side */}
          <ellipse cx="62" cy="55.5" rx="4" ry="3" fill={dark} opacity="0.4" />
          <ellipse cx="38" cy="56" rx="3.4" ry="2.2" fill={dark} opacity="0.22" />
          {/* Nasolabial folds */}
          <path d="M46.4 54.2C44.4 55.4 43.6 57 43.8 58.4" stroke={dark} strokeWidth="1.4" opacity="0.25" fill="none" />
          <path d="M53.6 54.2C55.6 55.4 56.4 57 56.2 58.4" stroke={dark} strokeWidth="1.6" opacity="0.4" fill="none" />
          {/* Chin highlight and the shadow under the lower lip */}
          <ellipse cx="49" cy="64.2" rx="3" ry="1.4" fill={light} opacity="0.45" />
          <ellipse cx="50" cy="62.4" rx="3.2" ry="0.9" fill={dark} opacity="0.55" />
        </Soft>
        {p.stubble ? (
          <path d="M33 52C36 62 43 67 50 67C57 67 64 62 67 52L62 58C58 60 56 59 55 61L45 61C44 59 42 60 38 58Z" fill="#1d1612" opacity="0.32" filter={`url(#${ids.grain})`} />
        ) : null}
        {p.stubble ? (
          <Soft ids={ids} amount={2}>
            <path d="M34 54C37 62 43 67 50 67C57 67 63 62 66 54L62 59L56 61H44L38 59Z" fill="#2a1f19" opacity="0.28" />
          </Soft>
        ) : null}
        {p.aged ? (
          <g stroke={dark} fill="none" opacity="0.45" strokeWidth="0.4">
            <path d="M40 31Q50 29.5 60 31M42 33.4Q50 32.2 58 33.4" />
            <path d="M38.5 47.6Q42 49.4 45.5 47.8M54.5 47.8Q58 49.4 61.5 47.6" />
            <path d="M35.4 44.6L33.6 45.4M64.6 44.6L66.4 45.4M35.6 46L34 47.2M64.4 46L66 47.2" />
          </g>
        ) : null}
        {/* Skin grain over the whole face */}
        <path d={head} fill="#000" filter={`url(#${ids.grain})`} />
      </g>

      {/* Rim light along the shadow-side contour */}
      <path d="M64 26C69.5 32 70 45 67 55" fill="none" stroke={p.rim} strokeWidth="1.6" strokeOpacity="0.8" strokeLinecap="round" filter={`url(#${ids.blur1})`} />

      <Brow side={-1} color={p.brow} ids={ids} />
      <Brow side={1} color={p.brow} ids={ids} />
      <Eye cx={42.2} p={p} ids={ids} />
      <Eye cx={57.8} p={p} ids={ids} />

      {/* Nose: bridge highlight, the shadow plane, the wings, the tip and the nostrils */}
      <Soft ids={ids} amount={1}>
        <path d="M49.6 43L49.4 50.6" stroke={light} strokeWidth="1.5" strokeOpacity="0.6" strokeLinecap="round" />
        <path d="M51.6 44C52.8 47 53.6 50 54 52.6L52 52.6Z" fill={dark} opacity="0.6" />
        <ellipse cx="50.6" cy="54.6" rx="3.4" ry="0.9" fill={dark} opacity="0.65" />
      </Soft>
      <path d="M46.6 51.4C45.3 52.5 45.7 54.2 47.6 54.4M53.6 51.4C55.1 52.5 54.7 54.2 52.8 54.4" fill="none" stroke={dark} strokeWidth="0.5" strokeOpacity="0.7" />
      <ellipse cx="48.5" cy="53.8" rx="0.95" ry="0.45" fill="#1a110d" opacity="0.75" transform="rotate(12 48.5 53.8)" />
      <ellipse cx="52.3" cy="53.8" rx="0.95" ry="0.45" fill="#1a110d" opacity="0.8" transform="rotate(-12 52.3 53.8)" />
      <circle cx="49.9" cy="51.4" r="0.85" fill="#fff" opacity="0.4" filter={`url(#${ids.blur1})`} />

      {/* Lips: a darker upper lip, a fuller lit lower lip, the line between, a wet highlight */}
      <path d="M44 58.4C46 57.1 48 56.4 49.2 57.2C49.6 57.4 50.4 57.4 50.8 57.2C52 56.4 54 57.1 56 58.4C52.4 59 47.6 59 44 58.4Z" fill={lipBase} />
      <path d="M44 58.4C46 57.1 48 56.4 49.2 57.2C49.6 57.4 50.4 57.4 50.8 57.2C52 56.4 54 57.1 56 58.4C52.4 59 47.6 59 44 58.4Z" fill="#9c3a34" opacity="0.28" />
      <path d="M44.6 58.6C47.6 59.3 52.4 59.3 55.4 58.6C54.2 61.2 52 61.9 50 61.9C48 61.9 45.8 61.2 44.6 58.6Z" fill={mid} />
      <path d="M44.6 58.6C47.6 59.3 52.4 59.3 55.4 58.6C54.2 61.2 52 61.9 50 61.9C48 61.9 45.8 61.2 44.6 58.6Z" fill="#c4554c" opacity="0.32" />
      <path d="M43.6 58.3C47.6 59.2 52.4 59.2 56.4 58.3" fill="none" stroke="#2a1410" strokeWidth="0.55" strokeLinecap="round" />
      <ellipse cx="48.8" cy="59.8" rx="1.6" ry="0.5" fill="#fff" opacity="0.35" filter={`url(#${ids.blur1})`} />
    </g>
  );
}

// A few soft out-of-focus lights behind the figure, for depth.
function Bokeh({ p, ids }: { p: Portrait; ids: Ids }): React.JSX.Element {
  const spots = [
    [16, 22, 7, 0.22],
    [84, 18, 5, 0.18],
    [90, 46, 8, 0.12],
    [8, 52, 6, 0.1],
    [74, 8, 4, 0.2],
  ] as const;
  return (
    <Soft ids={ids} amount={2}>
      {spots.map(([x, y, r, o]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={p.rim} opacity={o} />
      ))}
    </Soft>
  );
}

function Defs({ p, ids }: { p: Portrait; ids: Ids }): React.JSX.Element {
  const [light, mid, dark] = p.skin;
  const blurRegion = { x: "-30%", y: "-30%", width: "160%", height: "160%" };
  return (
    <defs>
      <radialGradient id={ids.skin} cx="0.4" cy="0.36" r="0.75">
        <stop offset="0" stopColor={light} />
        <stop offset="0.45" stopColor={mid} />
        <stop offset="0.95" stopColor={dark} />
      </radialGradient>
      <radialGradient id={ids.bg} cx="0.35" cy="0.3" r="0.85">
        <stop offset="0" stopColor={p.bg[0]} />
        <stop offset="1" stopColor={p.bg[1]} />
      </radialGradient>
      <radialGradient id={ids.sclera} cx="0.45" cy="0.55" r="0.6">
        <stop offset="0" stopColor="#e9e0d8" />
        <stop offset="0.65" stopColor="#cfc0b6" />
        <stop offset="1" stopColor="#9c8478" />
      </radialGradient>
      <radialGradient id={ids.iris}>
        <stop offset="0.3" stopColor="#000" stopOpacity="0.15" />
        <stop offset="0.55" stopColor="#fff" stopOpacity="0.28" />
        <stop offset="1" stopColor="#000" stopOpacity="0.55" />
      </radialGradient>
      <linearGradient id={ids.metal} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#eef1f5" />
        <stop offset="0.3" stopColor="#9aa2ac" />
        <stop offset="0.5" stopColor="#434950" />
        <stop offset="0.7" stopColor="#b9c0c8" />
        <stop offset="1" stopColor="#50565e" />
      </linearGradient>
      <linearGradient id={ids.gold} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff0b4" />
        <stop offset="0.35" stopColor="#d9a034" />
        <stop offset="0.6" stopColor="#7a4e10" />
        <stop offset="1" stopColor="#e3b95a" />
      </linearGradient>
      <linearGradient id={ids.bronze} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f2c290" />
        <stop offset="0.4" stopColor="#a96b36" />
        <stop offset="0.65" stopColor="#552f15" />
        <stop offset="1" stopColor="#c08549" />
      </linearGradient>
      <radialGradient id={ids.glow}>
        <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
        <stop offset="0.35" stopColor={p.iris} stopOpacity="0.9" />
        <stop offset="1" stopColor={p.iris} stopOpacity="0" />
      </radialGradient>
      {/* A cinematic grade: warm key from the upper left, the scene's colour in the shadows */}
      <linearGradient id={ids.grade} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffe2b8" stopOpacity="0.5" />
        <stop offset="0.5" stopColor="#808080" stopOpacity="0" />
        <stop offset="1" stopColor={p.bg[1]} stopOpacity="0.7" />
      </linearGradient>
      <linearGradient id={ids.side} x1="0" x2="1">
        <stop offset="0" stopColor={dark} stopOpacity="0.15" />
        <stop offset="0.22" stopColor={dark} stopOpacity="0" />
        <stop offset="0.58" stopColor={dark} stopOpacity="0" />
        <stop offset="0.8" stopColor={dark} stopOpacity="0.55" />
        <stop offset="1" stopColor="#000" stopOpacity="0.5" />
      </linearGradient>
      <clipPath id={ids.headClip}>
        <path d={HEAD[p.jaw ?? "soft"]} />
      </clipPath>

      <filter id={ids.blur1} {...blurRegion}>
        <feGaussianBlur stdDeviation="0.6" />
      </filter>
      <filter id={ids.blur2} {...blurRegion}>
        <feGaussianBlur stdDeviation="1.6" />
      </filter>
      <filter id={ids.blur4} {...blurRegion}>
        <feGaussianBlur stdDeviation="3.6" />
      </filter>
      {/* Fine mottled grain, masked to whatever shape is drawn with it */}
      <filter id={ids.grain} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="2.4" numOctaves="1" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.12  0 0 0 0 0.07  0 0 0 0 0.05  0.2 0 0 0 -0.06" result="g" />
        <feComposite in="g" in2="SourceAlpha" operator="in" />
      </filter>
      {/* Rounded volume: inner shadow on the far edges, inner light on the near ones */}
      <filter id={ids.volume} x="-10%" y="-10%" width="120%" height="120%">
        <feComponentTransfer in="SourceAlpha" result="inv">
          <feFuncA type="table" tableValues="1 0" />
        </feComponentTransfer>
        <feGaussianBlur in="inv" stdDeviation="2.6" result="invb" />
        <feOffset in="invb" dx="-2.2" dy="-2.2" result="shOff" />
        <feFlood floodColor="#000" floodOpacity="0.6" />
        <feComposite in2="shOff" operator="in" />
        <feComposite in2="SourceAlpha" operator="in" result="shadow" />
        <feOffset in="invb" dx="1.6" dy="1.6" result="hiOff" />
        <feFlood floodColor="#fff" floodOpacity="0.28" />
        <feComposite in2="hiOff" operator="in" />
        <feComposite in2="SourceAlpha" operator="in" result="hi" />
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="shadow" />
          <feMergeNode in="hi" />
        </feMerge>
      </filter>
      <filter id={ids.hairVolume} x="-10%" y="-10%" width="120%" height="120%">
        <feComponentTransfer in="SourceAlpha" result="inv">
          <feFuncA type="table" tableValues="1 0" />
        </feComponentTransfer>
        <feGaussianBlur in="inv" stdDeviation="2" result="invb" />
        <feOffset in="invb" dx="-1.6" dy="-1.8" result="shOff" />
        <feFlood floodColor="#000" floodOpacity="0.55" />
        <feComposite in2="shOff" operator="in" />
        <feComposite in2="SourceAlpha" operator="in" result="shadow" />
        <feMerge>
          <feMergeNode in="SourceGraphic" />
          <feMergeNode in="shadow" />
        </feMerge>
      </filter>
      {/* Raised, polished relief for metal */}
      <filter id={ids.bevel} x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.3" result="b" />
        <feSpecularLighting in="b" surfaceScale="3.5" specularConstant="1.1" specularExponent="22" lightingColor="#fff" result="s">
          <feDistantLight azimuth="225" elevation="38" />
        </feSpecularLighting>
        <feComposite in="s" in2="SourceAlpha" operator="in" result="s2" />
        <feComponentTransfer in="SourceAlpha" result="inv">
          <feFuncA type="table" tableValues="1 0" />
        </feComponentTransfer>
        <feGaussianBlur in="inv" stdDeviation="1.8" />
        <feOffset dx="-1.4" dy="-1.4" result="shOff" />
        <feFlood floodColor="#000" floodOpacity="0.55" />
        <feComposite in2="shOff" operator="in" />
        <feComposite in2="SourceAlpha" operator="in" result="shadow" />
        <feComposite in="SourceGraphic" in2="s2" operator="arithmetic" k2="1" k3="0.75" result="lit" />
        <feMerge>
          <feMergeNode in="lit" />
          <feMergeNode in="shadow" />
        </feMerge>
      </filter>
      {/* Strands: noise stretched along the fall of the hair, as dark gaps and light strands */}
      <filter id={ids.streakDark} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="1.1 0.14" numOctaves="2" seed="3" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.5 0 0 0 -0.62" result="g" />
        <feComposite in="g" in2="SourceAlpha" operator="in" />
      </filter>
      <filter id={ids.streakLight} x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="1.3 0.16" numOctaves="2" seed="11" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.85  0 1.1 0 0 -0.78" result="g" />
        <feComposite in="g" in2="SourceAlpha" operator="in" />
      </filter>
      <filter id={ids.drop} x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0.6" dy="1.2" stdDeviation="1.1" floodColor="#000" floodOpacity="0.5" />
      </filter>
    </defs>
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
    bg: id("bg"),
    metal: id("metal"),
    gold: id("gold"),
    bronze: id("bronze"),
    glow: id("glow"),
    sclera: id("sclera"),
    iris: id("iris"),
    grade: id("grade"),
    side: id("side"),
    headClip: id("head"),
    blur1: id("b1"),
    blur2: id("b2"),
    blur4: id("b4"),
    grain: id("grain"),
    volume: id("vol"),
    hairVolume: id("hvol"),
    bevel: id("bevel"),
    streakDark: id("sd"),
    streakLight: id("sl"),
    drop: id("drop"),
  };
  const clip = id("clip");
  const [, mid, dark] = p.skin;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden
      focusable="false"
      style={locked ? { filter: "grayscale(1) brightness(0.3) contrast(0.9)" } : undefined}
    >
      <Defs p={p} ids={ids} />
      <clipPath id={clip}>
        <circle cx="50" cy="50" r="50" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="100" fill={`url(#${ids.bg})`} />
        <Bokeh p={p} ids={ids} />
        {p.scene?.(ids, p)}
        {p.back?.(ids, p)}
        {/* Neck: a lit cylinder with the jaw's soft cast shadow across it */}
        <path d="M40 54L39.5 72Q50 77 60.5 72L60 54Z" fill={`url(#${ids.skin})`} />
        <Soft ids={ids} amount={2}>
          <path d="M40 58Q50 70 60 58L60.5 66Q50 74 39.5 66Z" fill={dark} opacity="0.7" />
          <path d="M56 56L60.5 56L60.5 72L57 72Z" fill={dark} opacity="0.55" />
          <path d="M44 66L47 72M56 66L53 72" stroke={mid} strokeWidth="1.2" opacity="0.6" />
        </Soft>
        <g filter={`url(#${ids.volume})`}>
          <path d={BARE_SHOULDERS} fill={`url(#${ids.skin})`} />
        </g>
        <Soft ids={ids} amount={1}>
          <path d="M33 77Q41 74 46 76M67 77Q59 74 54 76" stroke={dark} strokeWidth="0.8" opacity="0.5" fill="none" />
        </Soft>
        {p.body?.(ids, p)}
        <Face p={p} ids={ids} />
        {p.front?.(ids, p)}
        {/* Grade, then a vignette that pulls the eye to the face */}
        <rect width="100" height="100" fill={`url(#${ids.grade})`} style={{ mixBlendMode: "soft-light" }} />
        <circle cx="50" cy="48" r="56" fill="none" stroke="#000" strokeOpacity="0.45" strokeWidth="22" filter={`url(#${ids.blur4})`} />
      </g>
    </svg>
  );
}
