import type {
  HistoryMonthDay,
  HistoryMonthProjection,
  HistoryMonthStep,
  HistoryMonthTypeCount,
} from "@/lib/history-month";
import { trainingTypeFillClass } from "@/lib/training-type-accent";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "@/components/pulse/icons";
import { SectionHeader } from "@/components/pulse/section-header";

// History's Month view (ADR-0138): the month on screen, the previous / next month arrows, a
// Monday-first grid of its days, each marking its matching Logged Sessions by Training Type, the
// legend naming those types, and how many of the month's Logged Sessions match. A thin renderer of
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
      <TypeLegend tally={projection.typeTally} />
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

// The weekday abbreviations over the grid, Monday first (ADR-0054). Decorative: each day
// button's accessible name already carries its full date.
const WEEKDAY_ABBREVIATIONS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const;

// The month's days as seven `minmax(0,1fr)` columns (`grid-cols-7`), so the grid shrinks to a
// 320px screen and 200% text (ADR-0085). Native buttons in Tab order, no ARIA grid and no roving
// tabindex: at a month's size the plain order is enough (ADR-0138). No day is styled as
// "today" and none as missed: a day with matching Logged Sessions is a raised tile carrying one
// equal-sized Training Type mark per session, never a shade graded by how much was done.
function DayGrid({
  weeks,
  onSelectDay,
}: {
  weeks: HistoryMonthProjection["weeks"];
  onSelectDay: (day: string | null) => void;
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-7 gap-1">
      {WEEKDAY_ABBREVIATIONS.map((abbreviation, column) => (
        <span
          key={column}
          aria-hidden
          className="label-mono text-center text-[10px] text-text-muted"
        >
          {abbreviation}
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
  const logged = day.count > 0;
  return (
    <button
      type="button"
      aria-pressed={day.selected}
      aria-label={day.label}
      onClick={() => onSelectDay(day.toggleTo)}
      className={cn(
        "flex min-h-16 min-w-0 flex-col justify-between rounded-md border p-1.5 text-left font-mono text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none",
        day.selected
          ? "border-cyan bg-cyan-dim text-cyan"
          : logged
            ? "border-border bg-elevated text-text-primary hover:border-cyan"
            : "border-transparent text-text-muted hover:border-border",
      )}
    >
      <span aria-hidden>{day.dayNumber}</span>
      <DayMarks marks={day.marks} more={day.moreMarks} />
    </button>
  );
}

// One mark per Logged Session in its Training Type's colour, then "+n" for the rest.
// Decorative: the button's accessible name says the same.
function DayMarks({
  marks,
  more,
}: {
  marks: readonly string[];
  more: number;
}): React.JSX.Element {
  return (
    <span aria-hidden className="flex min-h-1.5 flex-wrap items-center gap-0.5">
      {marks.map((trainingType, position) => (
        <TypeMark key={position} trainingType={trainingType} />
      ))}
      {more > 0 ? <span className="text-[9px] leading-none">+{more}</span> : null}
    </span>
  );
}

function TypeMark({ trainingType }: { trainingType: string }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn("h-1.5 w-3 shrink-0 rounded-full", trainingTypeFillClass(trainingType))}
    />
  );
}

// The month's Training Types and how many of its matching Logged Sessions each holds, so a
// mark's colour is always named in text. Read-only: the Training Type chips above filter.
function TypeLegend({
  tally,
}: {
  tally: readonly HistoryMonthTypeCount[];
}): React.JSX.Element | null {
  if (tally.length === 0) return null;
  return (
    <ul aria-label="Sessions by Training Type" className="flex flex-wrap gap-x-4 gap-y-1">
      {tally.map(({ trainingType, count }) => (
        <li
          key={trainingType}
          className="label-mono flex items-center gap-1.5 text-[11px] capitalize text-text-secondary"
        >
          <TypeMark trainingType={trainingType} />
          {trainingType} · {count}
        </li>
      ))}
    </ul>
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
