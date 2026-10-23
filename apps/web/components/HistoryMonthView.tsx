import type {
  HistoryMonthDay,
  HistoryMonthProjection,
  HistoryMonthStep,
} from "@/lib/history-month";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "@/components/pulse/icons";
import { SectionHeader } from "@/components/pulse/section-header";

// History's Month view (ADR-0138): the month on screen, the previous / next month arrows, a
// Monday-first grid of its days and how many of its Logged Sessions match. A thin renderer of
// `projectHistoryMonth`; the cards below it are the same History cards as the List, fed through
// the same window loader. The heading is a polite live region, so a reader hears where the
// arrows took the view.
export function HistoryMonthView({
  projection,
  onNavigate,
  onSelectDay,
}: {
  projection: HistoryMonthProjection;
  onNavigate: (month: string) => void;
  // Select a day, or clear the selection with null.
  onSelectDay: (day: string | null) => void;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
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
      <DayGrid weeks={projection.weeks} onSelectDay={onSelectDay} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {projection.visible.length > 0 ? (
          <p className="label-mono text-[11px] text-text-muted">{projection.summary}</p>
        ) : null}
        {projection.showAll !== null ? (
          <button
            type="button"
            onClick={() => onSelectDay(null)}
            className="label-mono text-[11px] text-cyan hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
          >
            {projection.showAll}
          </button>
        ) : null}
      </div>
    </div>
  );
}

// The weekday initials over the grid, Monday first (ADR-0054). Decorative: each day button's
// accessible name already carries its full date.
const WEEKDAY_INITIALS = ["M", "T", "W", "T", "F", "S", "S"] as const;

// The month's days as seven `minmax(0,1fr)` columns (`grid-cols-7`), so the grid shrinks to a
// 320px screen and 200% text (ADR-0085). Native buttons in Tab order, no ARIA grid and no roving
// tabindex: at a month's size the plain order is enough (ADR-0138). No day is styled as
// "today" and none as missed — a day with matching Logged Sessions carries a neutral dot.
function DayGrid({
  weeks,
  onSelectDay,
}: {
  weeks: HistoryMonthProjection["weeks"];
  onSelectDay: (day: string | null) => void;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-7 gap-1">
      {WEEKDAY_INITIALS.map((initial, column) => (
        <span
          key={column}
          aria-hidden
          className="label-mono text-center text-[10px] text-text-muted"
        >
          {initial}
        </span>
      ))}
      {weeks.flat().map((day, cell) =>
        day === null ? (
          <span key={`pad-${cell}`} aria-hidden />
        ) : (
          <DayButton key={day.date} day={day} onSelectDay={onSelectDay} />
        ),
      )}
    </div>
  );
}

function DayButton({
  day,
  onSelectDay,
}: {
  day: HistoryMonthDay;
  onSelectDay: (day: string | null) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={day.selected}
      aria-label={day.label}
      onClick={() => onSelectDay(day.toggleTo)}
      className={cn(
        "flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-md border font-mono text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none",
        day.selected
          ? "border-cyan/40 bg-cyan-dim text-cyan"
          : "border-transparent text-text-secondary hover:border-cyan hover:text-cyan",
      )}
    >
      <span aria-hidden>{day.dayNumber}</span>
      <span
        aria-hidden
        className={cn("h-1 w-1 rounded-full", day.count > 0 ? "bg-text-muted" : "bg-transparent")}
      />
    </button>
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
