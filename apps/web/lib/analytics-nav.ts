import type { AnalyticsRange } from "./analytics-types";

// The Analytics hub (`/analytics`) is the parent of the Strength Analytics and Metric
// history screens. When it links into one of those children it threads its own URL as the
// `?from=` origin (via `appendFrom`), so the child's BackLink returns the user to the exact
// window they left rather than a reset hub. The served window is encoded only when it
// differs from the default floor ("30d", the default `toAnalyticsRange` falls back to), so a
// user who never touched the range toggle gets the clean `/analytics` origin instead of a
// redundant `?range=30d`. Pure and server-free.
const ANALYTICS_DEFAULT_RANGE: AnalyticsRange = "30d";

export function analyticsBackOrigin(range: AnalyticsRange): string {
  return range === ANALYTICS_DEFAULT_RANGE
    ? "/analytics"
    : `/analytics?range=${range}`;
}
