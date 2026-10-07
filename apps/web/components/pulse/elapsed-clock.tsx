"use client";

import { elapsedSeconds, formatElapsed } from "@/lib/live-timer";
import { useSecondTick } from "@/lib/use-second-tick";

interface ElapsedClockProps {
  // The instant the performance started, or null before it has (the elapsed
  // figure is then 0 — see elapsedSeconds).
  startedAt: number | null;
}

// The running elapsed face, as a bare string. It owns the per-second tick so its owner
// does not: everything else on the Live Session screen re-renders only when the workout
// state actually changes. Renders no element of its own, so the caller keeps the styling
// and the accessible name.
export function ElapsedClock({ startedAt }: ElapsedClockProps): React.JSX.Element {
  const now = useSecondTick();
  return <>{formatElapsed(elapsedSeconds(startedAt, now))}</>;
}
