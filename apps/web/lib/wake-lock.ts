// The pure Screen Wake Lock decision (issue #386 — ADR-0055). Keeping the device
// screen on during a Live Session is split into a pure decision (here) and a thin
// effect shell (`useWakeLock`), so the whole rule is unit-testable with no DOM. This
// module holds *only* the decision; every raw `navigator.wakeLock` call stays in the
// shell.

// The Live Session screen's lifecycle phase (mirrors LiveSessionScreen). The wake
// lock is held in the `live` phase **only** — never while `deciding`, `blocked`, or
// showing the idle-ended `summary`. Owned here so the pure decision and the screen
// share one source of truth for the vocabulary.
export type Phase = "deciding" | "live" | "summary" | "blocked";

// The effect the shell should run for the current inputs.
export type WakeLockAction = "acquire" | "release" | "noop";

// Decide what to do with the Screen Wake Lock, given whether the document is visible,
// the lifecycle `phase`, whether the Keep Screen Awake preference is on, and whether
// a sentinel is currently `held`. Pure — no DOM, no I/O.
//
// The lock is *wanted* exactly while the tab is visible, the screen is in the `live`
// phase, and the preference is on. From that and the held state:
//   - acquire  when wanted && !held  — take the lock (incl. re-acquire on returning
//              to visible, which is the real feature: the OS drops it on hide)
//   - release  when held && !wanted  — drop it (or reconcile our bookkeeping with the
//              OS auto-release that fires when the tab hides)
//   - noop     otherwise             — already in the wanted state
//
// (The grilling-session shape elided `held`; the pure function needs the current held
// state to choose acquire vs. noop and release vs. noop.)
export function wakeLockAction(
  visible: boolean,
  phase: Phase,
  prefEnabled: boolean,
  held: boolean,
): WakeLockAction {
  const wanted = visible && phase === "live" && prefEnabled;
  if (wanted && !held) return "acquire";
  if (held && !wanted) return "release";
  return "noop";
}
