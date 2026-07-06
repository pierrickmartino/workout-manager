// The Live Session timers (issue #88 — F2·S3). Pure timestamp math shared by the
// live screen (elapsed display) and the finish→payload mapper (recorded duration).
// Every figure is computed wall-clock — a stored millisecond timestamp compared to
// a passed `now` — never a decrementing tick counter, so a backgrounded or locked
// tab cannot corrupt it (ADR-0014). No imports, no side effects.

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

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
