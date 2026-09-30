"use client";

import { useEffect, useRef } from "react";

import { formatElapsed, restRemainingSeconds } from "@/lib/live-timer";
import { useSecondTick } from "@/lib/use-second-tick";

interface RestCountdownProps {
  // The wall-clock instant the running rest elapses. Mounted only while a rest runs,
  // so there is no "no rest" case to render.
  endAt: number;
  // Fired once, on the transition to zero — the owner's cue to end the rest. Read
  // through a ref, so a caller that hands a fresh arrow each render does not re-arm it.
  onElapsed: () => void;
}

// The rest countdown face, as a bare string, owning its own per-second tick (see
// useSecondTick for why the tick lives here and not in the screen).
//
// It also owns the "rest is over" transition. The screen used to re-test that condition
// in an effect keyed on the ticking `now`, so the effect tore down and re-ran sixty times
// a minute to find a condition that is true at most once per rest. Here it is a single
// boolean the countdown already knows.
export function RestCountdown({ endAt, onElapsed }: RestCountdownProps): React.JSX.Element {
  const now = useSecondTick();
  const remaining = restRemainingSeconds(endAt, now);
  const isOver = remaining === 0;

  // The transition below must key on `isOver` and nothing else, or it re-fires whenever
  // the handler's identity changes — which for a caller that hands a fresh arrow each
  // render is every render. Reading the handler through a ref is what makes that
  // dependency list honest rather than a suppressed lint rule, and it is why the caller
  // is free to write `onElapsed` however it likes.
  const onElapsedRef = useRef(onElapsed);
  useEffect(() => {
    onElapsedRef.current = onElapsed;
  });

  useEffect(() => {
    if (isOver) onElapsedRef.current();
  }, [isOver]);

  return <>{formatElapsed(remaining)}</>;
}
