import Link from "next/link";
import { Trophy } from "@/components/pulse/icons";

import type { RecordRow, RecentRecordsTeaser } from "@/lib/records-view";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";

// The Recent Records feed: the account's last Personal Records, newest first, each as the
// achievement that set it rather than a bare kilogram headline (ADR-0026). Presentational
// only — `toRecordRows` in `lib/records-view` does the unit projection and the "First PR"
// distinction, so this renders one array and cannot disagree with its source.
//
// Ordering is by recency, not by magnitude, so a heavier estimated max at more reps does not
// outrank a lighter true single. When the user has qualifying strength history the section
// header carries a teaser into the full, all-time PR timeline on Strength Analytics
// (ADR-0011): this capped feed is a teaser, never the only PR-history surface.
//
// Lives in `pulse/` rather than inside a page because both Analytics and the wide Home
// render it (ADR-0088): Home's desktop column shows the record side that a 26rem column has
// no room for, and two copies of this markup would drift.
export function RecentRecords({
  rows,
  teaser,
}: {
  rows: RecordRow[];
  teaser: RecentRecordsTeaser | null;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        meta={
          teaser ? (
            <Link href={teaser.href} className="text-cyan hover:underline">
              {teaser.label}
            </Link>
          ) : null
        }
      >
        RECENT RECORDS
      </SectionHeader>
      <Card className="divide-y divide-border overflow-hidden py-0">
        {rows.map((row, index) => (
          <div
            key={`${row.exercise}-${row.date}-${index}`}
            className="flex items-center gap-3.5 px-4 py-3.5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-cyan-dim text-cyan">
              <Trophy className="h-[18px] w-[18px]" aria-hidden />
            </span>
            {/* `min-w-0` + `break-words` on an authored Exercise name (ADR-0085), and
                `shrink-0` on the achievement so it cannot be pushed out. Measured, not
                precautionary: a 100-character unbroken Exercise name made this row 1,331px
                wide inside a 1,440px viewport and put the achievement's right edge at
                1,741px — clipped by the card, so the document never widened and no overflow
                gate fired, while the number the row exists to show was simply gone. This
                feed had never appeared in any audit journey until Home gained one
                (ADR-0088). */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="break-words font-sans text-[15px] font-medium text-text-primary">
                {row.exercise}
              </span>
              <span className="label-mono text-[11px] text-text-muted">
                {row.gain} · {row.date}
              </span>
            </div>
            <span className="shrink-0 font-display text-lg font-semibold text-text-primary tabular-nums">
              {row.estimate}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}
