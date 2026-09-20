"use client";

import { useCallback, useRef } from "react";

import { LONG_PRESS_DURATION_MS, exceedsMoveTolerance } from "@/lib/long-press";

// The pointer handlers a long-press target spreads onto its root element, plus the click-capture
// guard that swallows the click a fired long-press would otherwise leave behind.
export interface LongPressHandlers {
  onPointerDown: (event: React.PointerEvent) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onClickCapture: (event: React.MouseEvent) => void;
}

// Press-and-hold detection for the My Sessions Favorite gesture (Q6/Q9). A thin, untested wiring
// over the pure `long-press` helpers (which own the timing/tolerance and ARE unit-tested): start a
// timer on pointer-down, cancel it if the pointer lifts early or drifts past the tolerance (a
// scroll/drag, not a hold), and on fire run `onLongPress`. Because the card's title and Start are
// links, a fired press also arms `onClickCapture` to preventDefault the click that follows, so the
// hold toggles the favorite instead of navigating. Secondary/right mouse buttons are ignored.
export function useLongPress(
  onLongPress: () => void,
  durationMs: number = LONG_PRESS_DURATION_MS,
): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Ignore secondary/right mouse presses; a right-click is its own affordance.
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }
      fired.current = false;
      origin.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        timer.current = null;
        onLongPress();
      }, durationMs);
    },
    [durationMs, onLongPress],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const start = origin.current;
      if (start === null) {
        return;
      }
      if (exceedsMoveTolerance(event.clientX - start.x, event.clientY - start.y)) {
        clear();
      }
    },
    [clear],
  );

  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (fired.current) {
      // The hold already toggled the favorite; swallow the trailing click so the card's links
      // (detail, Start) don't also navigate.
      event.preventDefault();
      event.stopPropagation();
      fired.current = false;
    }
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClickCapture,
  };
}
