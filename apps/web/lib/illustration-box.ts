// The one box every Exercise illustration renders into (ADR-0095).
//
// The catalog's images are remote or proxied and of unknown intrinsic size, so nothing about
// the picture can reserve its own space: a `max-h-* w-full object-contain` <img> is zero tall
// until the bytes land, and everything below it jumps when they do. The box is therefore a
// property of the *layout*, declared here once and shared by every surface that shows a
// movement's picture, rather than guessed per call site.
//
// Two declarations state that shape — the aspect utility that reserves the box and the
// `width`/`height` pair the <img> carries as a ratio hint for the moment before the
// stylesheet applies — so both live here and `illustration-box.test.ts` holds them to the
// same number.

// 4:3 — the shape most of the catalog's illustrations already sit closest to, so
// `object-contain` letterboxes the rest by a little rather than stranding them in a tall box.
export const ILLUSTRATION_ASPECT = "aspect-[4/3]";

// The same ratio as a pixel pair. Not the intrinsic size of any particular image (there is no
// such thing here) — a shape a browser can lay out before it has one.
export const ILLUSTRATION_WIDTH = 800;
export const ILLUSTRATION_HEIGHT = 600;

// How tall the reserved box may grow. The aspect alone would make the illustration 864px tall
// in the 72rem wide shell (ADR-0088); the cap keeps it to a readable band.
//
// Where the cap binds — past ~427px of column, which is only the wide shell — the box is 320px
// tall and no longer 4:3, and the picture letterboxes horizontally inside it. That costs no
// stability: both the aspect and the cap are known before the image is, so the height is
// `min(width × 3/4, 320px)` from the first layout either way. What it does mean is that the
// ratio hint below describes the *uncapped* box, which is the one a browser lays out from
// before the stylesheet applies.
export const ILLUSTRATION_MAX_HEIGHT = "max-h-80";

const ARBITRARY_ASPECT = /^aspect-\[(\d+)\/(\d+)\]$/;

// The ratio an arbitrary width-over-height `aspect-…` utility reserves, or null when the class
// is not one this can read. Null rather than a fallback on purpose: a guard that answered 1 for
// an unreadable class would report agreement it never checked. (The ratio is spelled out rather
// than written as a sample class, so Tailwind's source scan does not compile the sample.)
export function aspectClassRatio(className: string): number | null {
  const match = ARBITRARY_ASPECT.exec(className.trim());
  if (match === null) return null;
  const [, width, height] = match.map(Number);
  if (width <= 0 || height <= 0) return null;
  return width / height;
}
