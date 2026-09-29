import type { AnalyticsOverview, AnalyticsRange } from "./analytics-types";
import { toVolumeRows, formatVolumeDelta, formatCoverageCaption, type VolumeChartRow } from "./volume-view.ts";
import { toRecordRows, toRecentRecordsTeaser, type RecordRow, type RecentRecordsTeaser } from "./records-view.ts";
import type { WeightUnit } from "./weight-unit";

// What Home's **review column** shows at the shell's wide width (ADR-0088): the read-time
// projections a 26rem column has no room for. Two rules shape this module, and they are the
// reason it exists rather than living inline in the page:
//
//   1. **A failed or empty secondary read never degrades Home.** Home's job is to launch the
//      next Session; this content is a bonus. An analytics read that errors, or a window with
//      nothing convertible in it, yields `null` for that block and Home renders as it always
//      did — never an error banner, never an empty chart frame, never a fabricated zero.
//   2. **Projections only, never an action.** ADR-0071's click budget governs the paths to
//      *doing* things; duplicating an action is how a second entry point to the same intent
//      appears and the budget stops meaning anything. Everything here is information.
//
// Pure and server-free: the page fetches, this maps, and `home-review.test.ts` pins the
// degradation rules without a browser (CLAUDE.md: frontend logic lives in `lib/`).

// The window Home reads. Fixed, because Home carries no range selector — the 30-day window is
// the Analytics default and the shortest one every History Depth can serve (ADR-0056), so this
// can never ask for a window the user is not deep enough to be shown.
export const HOME_VOLUME_RANGE: AnalyticsRange = "30d";

export interface HomeVolumeReview {
  readonly rows: VolumeChartRow[];
  // The "+N%" against the preceding equal-length window, or `null` when there is no prior
  // volume to compare against — a first month shows the line and no delta, not "+0%".
  readonly delta: string | null;
  // The disclosed share of logged reps the line actually converted; bodyweight and %-1RM sets
  // are not convertible and sit in the uncovered remainder.
  readonly coverageCaption: string;
}

export interface HomeRecordsReview {
  readonly rows: RecordRow[];
  readonly teaser: RecentRecordsTeaser | null;
}

export interface HomeReview {
  readonly volume: HomeVolumeReview | null;
  readonly records: HomeRecordsReview | null;
}

// Nothing to show — the shape returned whenever the read failed or carried nothing.
const EMPTY: HomeReview = { volume: null, records: null };

// Project one analytics read into Home's review column. `overview` is `null` when the read
// failed — the envelope unwrap stays at the call site, as it does for every other read in
// `lib/` (see the transport seam's note in `api.ts`), which also keeps this module free of
// the server-only import that type would drag in. `unit` is the reader's Weight Unit; both
// the volume line and the record headlines are converted into it.
export function homeReview(
  overview: AnalyticsOverview | null,
  unit: WeightUnit,
): HomeReview {
  if (!overview) return EMPTY;

  const volumeRows = toVolumeRows(overview.volume.points, unit);
  const recordRows = toRecordRows(overview.recent_records, unit);

  return {
    // An empty series is not a chart. A user whose every set is bodyweight converts nothing,
    // and drawing them an axis with no line would be worse than drawing nothing.
    volume:
      volumeRows.length === 0
        ? null
        : {
            rows: volumeRows,
            delta: formatVolumeDelta(overview.volume.delta),
            coverageCaption: formatCoverageCaption(overview.volume.coverage),
          },
    records:
      recordRows.length === 0
        ? null
        : {
            rows: recordRows,
            teaser: toRecentRecordsTeaser(overview.recent_records),
          },
  };
}
