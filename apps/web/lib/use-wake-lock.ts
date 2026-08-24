"use client";

import { useEffect, useRef } from "react";

import { wakeLockAction, type Phase } from "./wake-lock.ts";

// The DOM-bound half of Keep Screen Awake (issue #386 — ADR-0055). The whole
// decision lives in the pure `wakeLockAction` seam (wake-lock.ts, unit-tested); this
// shell is the *only* place raw `navigator.wakeLock` is touched, so it stays a thin,
// deliberately uncovered effect.
//
// It keeps the Screen Wake Lock in step with the pure decision: acquire while the tab
// is visible, the Live Session is in the `live` phase, and the preference is on;
// release otherwise. Crucially it re-runs on every `visibilitychange` — the OS
// auto-releases the lock whenever the tab hides (phone lock, app switch, notification
// shade), so re-acquiring on the return to visible is the actual feature, not the
// first request.
//
// Best-effort and silent (ADR-0055): where `navigator.wakeLock` is absent or a
// request rejects, it no-ops — no video-hack fallback, no user-facing notice. It
// never touches the idle/duration model (ADR-0014); it only holds the screen on.
export function useWakeLock(phase: Phase, prefEnabled: boolean): void {
  // The live sentinel, or null when no lock is held. A ref (not state) because it is
  // effect-local bookkeeping that must never trigger a re-render.
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    // Feature-detect: unsupported browsers get a silent no-op, nothing breaks.
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
      return;
    }
    const wakeLock = navigator.wakeLock;

    // Guards against a resolved request landing after this effect was torn down
    // (phase/pref change or unmount mid-flight) — we'd otherwise leak a live lock.
    let cancelled = false;

    const reconcile = async () => {
      const visible = document.visibilityState === "visible";
      const held = sentinelRef.current !== null;
      const action = wakeLockAction(visible, phase, prefEnabled, held);

      if (action === "acquire") {
        try {
          const sentinel = await wakeLock.request("screen");
          if (cancelled) {
            // Torn down while the request was in flight — release immediately.
            void sentinel.release();
            return;
          }
          sentinelRef.current = sentinel;
          // The OS auto-releases on hide and fires this event; drop our ref so the
          // next visible reconcile re-acquires rather than believing it still holds.
          sentinel.addEventListener("release", () => {
            if (sentinelRef.current === sentinel) sentinelRef.current = null;
          });
        } catch {
          // Rejected (denied, not visible, unsupported "screen") — silent no-op.
        }
      } else if (action === "release") {
        const sentinel = sentinelRef.current;
        sentinelRef.current = null;
        try {
          await sentinel?.release();
        } catch {
          // Already released by the OS — nothing to do.
        }
      }
    };

    void reconcile();

    // Re-acquire on return to visible / release-bookkeep on hide — the load-bearing
    // listener (ADR-0055): the lock only survives a hide/show cycle because of this.
    const onVisibilityChange = () => void reconcile();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      const sentinel = sentinelRef.current;
      sentinelRef.current = null;
      void sentinel?.release();
    };
  }, [phase, prefEnabled]);
}
