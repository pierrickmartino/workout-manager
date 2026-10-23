import type {
  HistoryMonthStep,
  HistoryMonthView as HistoryMonthProjection,
} from "@/lib/history-month";
import { ChevronLeft, ChevronRight } from "@/components/pulse/icons";
import { SectionHeader } from "@/components/pulse/section-header";

// History's Month view header (ADR-0138): the month on screen, the previous / next month arrows
// and how many of its Logged Sessions match. A thin renderer of `projectHistoryMonth`; the
// cards below it are the same History cards as the List, fed through the same window loader.
// The heading is a polite live region, so a reader hears where the arrows took the view.
export function HistoryMonthView({
  projection,
  onNavigate,
}: {
  projection: HistoryMonthProjection;
  onNavigate: (month: string) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <MonthArrow step={projection.previous} onNavigate={onNavigate}>
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </MonthArrow>
        <div aria-live="polite" className="min-w-0 flex-1">
          <SectionHeader>{projection.heading}</SectionHeader>
        </div>
        <MonthArrow step={projection.next} onNavigate={onNavigate}>
          <ChevronRight className="h-4 w-4" aria-hidden />
        </MonthArrow>
      </div>
      {projection.visible.length > 0 ? (
        <p className="label-mono text-[11px] text-text-muted">{projection.summary}</p>
      ) : null}
    </div>
  );
}

// One month arrow: a native button named by the month it goes to, disabled at a bound of the
// record (ADR-0138).
function MonthArrow({
  step,
  onNavigate,
  children,
}: {
  step: HistoryMonthStep;
  onNavigate: (month: string) => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const target = step.month;
  return (
    <button
      type="button"
      aria-label={step.label}
      disabled={target === null}
      onClick={() => {
        if (target !== null) onNavigate(target);
      }}
      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-text-secondary transition-colors hover:border-cyan hover:text-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-secondary motion-reduce:transition-none"
    >
      {children}
    </button>
  );
}
