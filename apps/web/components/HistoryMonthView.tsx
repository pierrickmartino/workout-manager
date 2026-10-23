import type { HistoryMonthView as HistoryMonthProjection } from "@/lib/history-month";
import { SectionHeader } from "@/components/pulse/section-header";

// History's Month view header (ADR-0138): the month on screen and how many of its Logged
// Sessions match. A thin renderer of `projectHistoryMonth`; the cards below it are the same
// History cards as the List, fed through the same window loader. The heading is a polite live
// region, so a reader hears where the view landed when it changes month.
export function HistoryMonthView({
  projection,
}: {
  projection: HistoryMonthProjection;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div aria-live="polite">
        <SectionHeader>{projection.heading}</SectionHeader>
      </div>
      {projection.visible.length > 0 ? (
        <p className="label-mono text-[11px] text-text-muted">{projection.summary}</p>
      ) : null}
    </div>
  );
}
