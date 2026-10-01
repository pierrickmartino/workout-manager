"use client";

import { useEffect, useState } from "react";

// A wall-clock "now" that advances once a second, for the two Live Session leaves that
// display time (components/pulse/elapsed-clock, components/pulse/rest-countdown).
//
// It is a hook rather than a value lifted into the screen on purpose. Whoever calls it
// re-renders every second, so it belongs in a leaf that renders a string and nothing
// else: held in `LiveSessionScreen` it re-rendered the whole 830-line shell and the full
// set table sixty times a minute, on the one screen where the phone is awake, the Screen
// Wake Lock is held, and the user is typing reps between sets.
//
// The value is always the wall clock, never a decrementing counter, so a backgrounded or
// locked tab reads the correct time on return (ADR-0014) — the caller derives its figure
// from a stored timestamp compared to this.
const TICK_INTERVAL_MS = 1000;

export function useSecondTick(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return now;
}
