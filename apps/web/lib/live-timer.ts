// The Live Session timers (issue #88 — F2·S3). Pure timestamp math shared by the
// live screen (elapsed display) and the finish→payload mapper (recorded duration).
// Every figure is computed wall-clock — a stored millisecond timestamp compared to
// a passed `now` — never a decrementing tick counter, so a backgrounded or locked
// tab cannot corrupt it (ADR-0014). No imports, no side effects.

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

// The rest countdown between sets (issue #89 — F2·S4). Fallback rest when an
// Exercise Prescription names no `rest_seconds` of its own.
export const DEFAULT_REST_SECONDS = 90;

// Whole seconds the `−15 / +15` controls add to or subtract from a running rest.
export const REST_ADJUST_STEP_SECONDS = 15;

// The rest duration a completed set's rest countdown starts from: the
// prescription's own `rest_seconds`, or the named fallback when it has none.
export function resolveRestSeconds(restSeconds: number | null): number {
  return restSeconds ?? DEFAULT_REST_SECONDS;
}

// The wall-clock instant a rest of `restSeconds` started at `now` will elapse.
// Stored and compared against a live `now`, so a backgrounded/locked tab reads the
// correct remaining time on return — never a decrementing tick counter.
export function restTargetEnd(now: number, restSeconds: number): number {
  return now + restSeconds * MS_PER_SECOND;
}

// Whole seconds left on a running rest: the ceiling of the wall-clock gap to
// `targetEndAt`, so the display reads the full duration for the first tick and only
// reaches 0 the instant the rest truly elapses. Clamped to 0 once past the
// target-end, and 0 when no rest is running (`targetEndAt` null).
export function restRemainingSeconds(
  targetEndAt: number | null,
  now: number,
): number {
  if (targetEndAt === null) return 0;
  return Math.max(0, Math.ceil((targetEndAt - now) / MS_PER_SECOND));
}

// Shift a running rest's target-end by `deltaSeconds` — how the `−15 / +15`
// controls adjust the countdown. The result never falls before `now`, so a `−15`
// past the end simply ends the rest instead of banking negative time that a later
// `+15` would have to climb back out of.
export function adjustRestTargetEnd(
  targetEndAt: number,
  deltaSeconds: number,
  now: number,
): number {
  return Math.max(now, targetEndAt + deltaSeconds * MS_PER_SECOND);
}

// Whole seconds of wall-clock between `startedAt` and `now`. Zero before a session
// has started (no start timestamp) and never negative if the clock jumps backwards.
export function elapsedSeconds(startedAt: number | null, now: number): number {
  if (startedAt === null) return 0;
  return Math.max(0, Math.floor((now - startedAt) / MS_PER_SECOND));
}

// The recorded Session Duration in whole seconds: start → last activity, so the
// idle tail after the final set is excluded (ADR-0014). Null when the performance
// was never live-tracked (no start or no activity) — the static form's case. Never
// negative.
export function durationSeconds(
  startedAt: number | null,
  lastActivityAt: number | null,
): number | null {
  if (startedAt === null || lastActivityAt === null) return null;
  return Math.max(0, Math.floor((lastActivityAt - startedAt) / MS_PER_SECOND));
}

// Render a whole-second count for the eye: `M:SS` under an hour, `H:MM:SS` past it.
export function formatElapsed(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / SECONDS_PER_HOUR);
  const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const secs = seconds % SECONDS_PER_MINUTE;
  const paddedSecs = String(secs).padStart(2, "0");

  if (hours === 0) return `${minutes}:${paddedSecs}`;

  const paddedMinutes = String(minutes).padStart(2, "0");
  return `${hours}:${paddedMinutes}:${paddedSecs}`;
}
