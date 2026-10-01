"use client";

import { useEffect, useState } from "react";

import {
  formatInstantLocal,
  formatInstantUtc,
  normalizeApiInstant,
  parseApiInstant,
} from "@/lib/instant";

// An instant from the API, written out in the reader's own clock (ADR-0096).
//
// It renders twice on purpose. The server — and the first client paint, which must produce
// byte-identical markup or hydration reports a mismatch — writes the zone-explicit UTC text,
// because on the server "the reader's locale" is the container's: `en-US`, UTC, nobody's. Once
// mounted, the component knows it is in a browser and swaps to that browser's locale,
// timezone and ordering.
//
// Both texts are correct readings of the same moment; only the second is the reader's. The
// first says `UTC` out loud so it is never mistaken for the other.
export function LocalInstant({ iso }: { iso: string }): React.JSX.Element {
  const machine = normalizeApiInstant(iso);
  const epochMs = parseApiInstant(iso);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Not an instant at all. Show what the row actually holds rather than a plausible date
  // computed from nothing, and emit no `<time>`, which would have nothing to put in `datetime`.
  if (machine === null || epochMs === null) return <>{iso}</>;

  return (
    <time dateTime={machine}>
      {mounted ? formatInstantLocal(epochMs) : formatInstantUtc(epochMs)}
    </time>
  );
}
