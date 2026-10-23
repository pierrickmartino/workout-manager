"use client";

// PROTOTYPE — throwaway. Three alternative designs for History's Month view (ADR-0138), mounted
// on the real `/history?view=month` route beside the current one and switched with `?variant=`:
//
//   A  Current       — the shipped `HistoryMonthView`, as the baseline.
//   B  Type tiles    — a bigger grid whose cells show each session as a Training Type mark.
//   C  Month ribbon  — every month of the record stacked as a strip; no arrows.
//   D  Week agenda   — the month as Monday-first weeks listing only the days with sessions.
//
// Read-only over the same projection and handlers; no tests, no polish. The cardinal rules still
// hold in every variant: no "today", no missed day, no streak, no "Calendar" copy.

import type { HistoryIndexRow } from "@/lib/logs-types";
import type { HistoryMonthProjection, HistoryMonthStep } from "@/lib/history-month";
import { DAYS_PER_WEEK, daysInMonth, mondayColumnOfFirst, shiftMonth } from "@/lib/month-arithmetic";
import { formatDayMonthYear, formatMonthYear } from "@/lib/date-format";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "@/components/pulse/icons";
import { SectionHeader } from "@/components/pulse/section-header";

export interface MonthVariantProps {
  projection: HistoryMonthProjection;
  // Every Logged Session matching the exercise / type facets, any month.
  matches: readonly HistoryIndexRow[];
  onNavigate: (month: string) => void;
  onSelectDay: (day: string | null) => void;
}

// A graphic mark per Training Type (no text on it, so it is a fill, not a pairing).
const TYPE_MARK: Record<string, string> = {
  strength: "bg-cyan",
  cardio: "bg-blue",
  hiit: "bg-magenta",
  yoga: "bg-violet",
  mobility: "bg-green",
};
const markFor = (type: string) => TYPE_MARK[type] ?? "bg-text-muted";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60";

function byDay(rows: readonly HistoryIndexRow[]): Map<string, HistoryIndexRow[]> {
  const map = new Map<string, HistoryIndexRow[]>();
  for (const row of rows) map.set(row.performed_on, [...(map.get(row.performed_on) ?? []), row]);
  return map;
}

function weekdayOf(date: string): string {
  const column = (mondayColumnOfFirst(date.slice(0, 7)) + Number(date.slice(8)) - 1) % DAYS_PER_WEEK;
  return WEEKDAYS[column];
}

function inMonth(rows: readonly HistoryIndexRow[], month: string | null): HistoryIndexRow[] {
  return rows.filter((row) => row.performed_on.slice(0, 7) === month);
}

function MonthBar({ projection, onNavigate }: Pick<MonthVariantProps, "projection" | "onNavigate">) {
  const arrow = (step: HistoryMonthStep, icon: React.ReactNode) => (
    <button
      type="button"
      aria-label={step.label}
      disabled={step.month === null}
      onClick={() => step.month !== null && onNavigate(step.month)}
      className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-text-secondary hover:border-cyan hover:text-cyan disabled:opacity-40", FOCUS)}
    >
      {icon}
    </button>
  );
  return (
    <div className="flex items-center gap-2">
      {arrow(projection.previous, <ChevronLeft className="h-4 w-4" aria-hidden />)}
      <div aria-live="polite" className="min-w-0 flex-1">
        <SectionHeader>{projection.heading}</SectionHeader>
      </div>
      {arrow(projection.next, <ChevronRight className="h-4 w-4" aria-hidden />)}
    </div>
  );
}

function Footer({ projection, onSelectDay }: Pick<MonthVariantProps, "projection" | "onSelectDay">) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p className="label-mono text-[11px] text-text-muted">{projection.summary}</p>
      {projection.showAll !== null ? (
        <button type="button" onClick={() => onSelectDay(null)} className={cn("label-mono text-[11px] text-cyan hover:underline", FOCUS)}>
          {projection.showAll}
        </button>
      ) : null}
    </div>
  );
}

// ── B: Type tiles ───────────────────────────────────────────────────────────────────────────

const MAX_MARKS = 3;

export function VariantTypeTiles({ projection, matches, onNavigate, onSelectDay }: MonthVariantProps) {
  const monthRows = inMonth(matches, projection.month);
  const days = byDay(monthRows);
  const typeCounts = [...byType(monthRows)].sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-col gap-3">
      <MonthBar projection={projection} onNavigate={onNavigate} />
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((name) => (
          <span key={name} aria-hidden className="label-mono text-center text-[10px] text-text-muted">{name.slice(0, 2)}</span>
        ))}
        {projection.weeks.flat().map((day, cell) => {
          if (day === null) return <span key={`pad-${cell}`} aria-hidden className="min-h-16" />;
          const sessions = days.get(day.date) ?? [];
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={day.selected}
              aria-label={day.label}
              onClick={() => onSelectDay(day.toggleTo)}
              className={cn(
                "flex min-h-16 min-w-0 flex-col justify-between rounded-md border p-1.5 text-left font-mono text-xs tabular-nums",
                FOCUS,
                day.selected ? "border-cyan bg-cyan-dim text-cyan" : sessions.length > 0 ? "border-border bg-elevated text-text-primary hover:border-cyan" : "border-transparent text-text-muted hover:border-border",
              )}
            >
              <span aria-hidden>{day.dayNumber}</span>
              <span aria-hidden className="flex flex-wrap items-center gap-0.5">
                {sessions.slice(0, MAX_MARKS).map((s) => (
                  <span key={s.id} className={cn("h-1.5 w-3 rounded-full", markFor(s.training_type))} />
                ))}
                {sessions.length > MAX_MARKS ? <span className="text-[9px]">+{sessions.length - MAX_MARKS}</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {typeCounts.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {typeCounts.map(([type, count]) => (
            <li key={type} className="label-mono flex items-center gap-1.5 text-[11px] capitalize text-text-secondary">
              <span aria-hidden className={cn("h-1.5 w-3 rounded-full", markFor(type))} />
              {type} · {count}
            </li>
          ))}
        </ul>
      ) : null}
      <Footer projection={projection} onSelectDay={onSelectDay} />
    </div>
  );
}

function byType(rows: readonly HistoryIndexRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.training_type, (map.get(row.training_type) ?? 0) + 1);
  return map;
}

// ── C: Month ribbon ─────────────────────────────────────────────────────────────────────────

const RIBBON_SLOTS = 31;

export function VariantMonthRibbon({ projection, matches, onNavigate, onSelectDay }: MonthVariantProps) {
  if (projection.bounds === null) return <></>;
  const months: string[] = [];
  for (let m = projection.bounds.newest; m >= projection.bounds.first; m = shiftMonth(m, -1)) months.push(m);
  const days = byDay(matches);
  return (
    <div className="flex flex-col gap-1">
      <SectionHeader>Months on record</SectionHeader>
      <ol className="flex max-h-[32rem] flex-col gap-1 overflow-y-auto pr-1">
        {months.map((month) => {
          const open = month === projection.month;
          const rows = inMonth(matches, month);
          const sessionDays = [...byDay(rows).keys()].sort();
          return (
            <li key={month} className={cn("rounded-md border", open ? "border-cyan/40 bg-surface" : "border-transparent")}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() => onNavigate(month)}
                className={cn("flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-elevated", FOCUS)}
              >
                <span className={cn("label-mono w-16 shrink-0 text-[11px]", open ? "text-cyan" : "text-text-secondary")}>
                  {formatMonthYear(month).replace(/^(\w{3})\w*/, "$1")}
                </span>
                <span aria-hidden className="grid min-w-0 flex-1 grid-cols-[repeat(31,minmax(0,1fr))] gap-px">
                  {Array.from({ length: RIBBON_SLOTS }, (_, i) => {
                    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
                    const first = days.get(date)?.[0];
                    if (i + 1 > daysInMonth(month)) return <span key={i} />;
                    return <span key={i} className={cn("h-5 rounded-[1px]", first ? markFor(first.training_type) : "bg-elevated")} />;
                  })}
                </span>
                <span className="label-mono w-6 shrink-0 text-right text-[11px] tabular-nums text-text-muted">{rows.length}</span>
              </button>
              {open ? (
                <div className="flex flex-wrap gap-1.5 px-2 pb-2">
                  {sessionDays.length === 0 ? (
                    <span className="label-mono text-[11px] text-text-muted">{projection.summary}</span>
                  ) : (
                    sessionDays.map((date) => {
                      const selected = date === projection.day;
                      const count = days.get(date)?.length ?? 0;
                      return (
                        <button
                          key={date}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => onSelectDay(selected ? null : date)}
                          className={cn(
                            "label-mono inline-flex min-h-9 items-center gap-1 rounded-sm border px-2 text-[11px] tabular-nums",
                            FOCUS,
                            selected ? "border-cyan/40 bg-cyan-dim text-cyan" : "border-border text-text-secondary hover:border-cyan hover:text-cyan",
                          )}
                        >
                          {weekdayOf(date)} {Number(date.slice(8))}
                          {count > 1 ? <span className="text-text-muted">×{count}</span> : null}
                        </button>
                      );
                    })
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {projection.showAll !== null ? <Footer projection={projection} onSelectDay={onSelectDay} /> : null}
    </div>
  );
}

// ── D: Week agenda ──────────────────────────────────────────────────────────────────────────

export function VariantWeekAgenda({ projection, matches, onNavigate, onSelectDay }: MonthVariantProps) {
  const days = byDay(inMonth(matches, projection.month));
  return (
    <div className="flex flex-col gap-3">
      <MonthBar projection={projection} onNavigate={onNavigate} />
      <ol className="flex flex-col gap-3">
        {projection.weeks.map((week) => {
          const inWeek = week.filter((d) => d !== null);
          const active = inWeek.filter((d) => (days.get(d.date)?.length ?? 0) > 0);
          return (
            <li key={inWeek[0].date} className="flex flex-col gap-1">
              <p className="label-mono flex justify-between text-[10px] text-text-muted">
                <span>WEEK OF {formatDayMonthYear(inWeek[0].date).toUpperCase()}</span>
                <span>{active.length > 0 ? `${active.reduce((n, d) => n + (days.get(d.date)?.length ?? 0), 0)} logged` : ""}</span>
              </p>
              {active.length === 0 ? (
                <p className="rounded-md border border-dashed border-border px-3 py-2 font-sans text-xs text-text-muted">No logged sessions</p>
              ) : (
                active.map((day) => (
                  <button
                    key={day.date}
                    type="button"
                    aria-pressed={day.selected}
                    aria-label={day.label}
                    onClick={() => onSelectDay(day.toggleTo)}
                    className={cn(
                      "flex min-w-0 items-start gap-3 rounded-md border px-3 py-2 text-left",
                      FOCUS,
                      day.selected ? "border-cyan/40 bg-cyan-dim" : "border-border bg-surface hover:border-cyan",
                    )}
                  >
                    <span className={cn("label-mono w-12 shrink-0 text-[11px] tabular-nums", day.selected ? "text-cyan" : "text-text-secondary")}>
                      {weekdayOf(day.date).toUpperCase()} {String(day.dayNumber).padStart(2, "0")}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      {(days.get(day.date) ?? []).map((s) => (
                        <span key={s.id} className="flex min-w-0 items-start gap-2">
                          <span aria-hidden className={cn("mt-1.5 h-1.5 w-3 shrink-0 rounded-full", markFor(s.training_type))} />
                          <span className="min-w-0 font-sans text-xs text-text-primary">
                            <span className="capitalize">{s.training_type}</span>
                            <span className="text-text-secondary"> — {s.exercise_names.join(", ")}</span>
                          </span>
                        </span>
                      ))}
                    </span>
                  </button>
                ))
              )}
            </li>
          );
        })}
      </ol>
      <Footer projection={projection} onSelectDay={onSelectDay} />
    </div>
  );
}
