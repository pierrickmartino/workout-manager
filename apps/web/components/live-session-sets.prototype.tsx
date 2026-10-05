"use client";

// PROTOTYPE — throwaway (see .claude/skills/prototype/UI.md).
//
// Question: how small can one exercise of a Live Session get, built from the design system's
// own parts, without losing anything the current set card does (prescribed, previous, reps,
// typed Load, effort, complete / skip / reopen)?
//
// Four variants of the live set list, switchable with `?variant=` on the live route:
//   A  Current       — the production card, one per set (baseline).
//   B  Set table     — one card per exercise, one grid row per set (Strong/Hevy shape).
//   C  Focus stepper — one card per exercise; only the set in hand has controls, as steppers.
//   D  Accept-first  — one card per exercise; each set is a one-line summary + a ✓, edit on tap.
//
// Read-only beyond the screen's own reducer: every variant raises the same three callbacks
// the production card does. No tests, no polish — fold the winner in properly.

import { useState } from "react";

import { Check, Minus, Pencil, Plus, RotateCcw, SkipForward } from "@/components/pulse/icons";
import type { PrototypeVariant } from "@/components/pulse/prototype-switcher";
import { SetEntry, SetEntryProvider } from "@/components/pulse/set-entry";
import { FieldRow } from "@/components/pulse/field-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { liveSetDomId, type LiveSet, type LiveUnit } from "@/lib/live-session";
import { loadKindOptions, type LoadKind } from "@/lib/load";
import { SET_ENTRY_EFFORT_VALUES, setEntryValues, type SetEntryValues } from "@/lib/set-entry";
import { weightUnitLabel } from "@/lib/weight-format";
import type { WeightUnit } from "@/lib/weight-unit";
import { cn } from "@/lib/utils";

export const LIVE_SETS_VARIANTS: readonly PrototypeVariant[] = [
  { key: "A", name: "Current" },
  { key: "B", name: "Set table" },
  { key: "C", name: "Focus stepper" },
  { key: "D", name: "Accept-first" },
];

export interface PrototypeUnitProps {
  variant: string;
  unit: LiveUnit;
  currentIndex: number;
  onCompleteSet: (index: number, reps: number, loadKind: LoadKind, loadValue: string, rpe: number | null) => void;
  onSkipSet: (index: number) => void;
  onReopenSet: (index: number) => void;
  isFinishing: boolean;
  weightUnit: WeightUnit;
}

export function PrototypeUnit(props: PrototypeUnitProps) {
  if (props.variant === "B") return <TableUnit {...props} />;
  if (props.variant === "C") return <FocusUnit {...props} />;
  return <AcceptUnit {...props} />;
}

// ---------------------------------------------------------------------------------------------
// Shared data plumbing (not layout): the unit's edited values, held per set index.

function seed(set: LiveSet): SetEntryValues {
  return setEntryValues({
    kind: "repetitions",
    reps: String(set.reps),
    load_kind: set.loadKind,
    load_value: set.loadValue,
    rpe: set.rpe === null ? "" : String(set.rpe),
  });
}

function useUnitEntries(unit: LiveUnit) {
  const [entries, setEntries] = useState<Record<number, SetEntryValues>>(() =>
    Object.fromEntries(unit.sets.map(({ set, index }) => [index, seed(set)])),
  );
  const edit = (index: number, patch: Partial<SetEntryValues>) =>
    setEntries((current) => ({ ...current, [index]: { ...current[index], ...patch } }));
  return { entries, edit };
}

function complete(props: PrototypeUnitProps, index: number, entry: SetEntryValues) {
  const reps = Number.parseInt(entry.reps, 10);
  const rpe = entry.rpe === "" ? null : Number.parseInt(entry.rpe, 10);
  props.onCompleteSet(
    index,
    Number.isInteger(reps) && reps >= 0 ? reps : 0,
    entry.load_kind as LoadKind,
    entry.load_value.trim(),
    rpe !== null && Number.isInteger(rpe) ? rpe : null,
  );
}

// "3 × 5 · 100 kg" — the prescription of the unit's first set, which every set of a solo
// Prescription shares.
function target(set: LiveSet): string {
  return `${set.moduleSetCount} × ${set.prescribedReps} · ${set.prescribedLoadText}`;
}

// "100 kg", "BW", "BW +10 kg", "75%", or the descriptive text.
function loadShort(entry: SetEntryValues, unit: WeightUnit): string {
  const value = entry.load_value.trim();
  const label = weightUnitLabel(unit);
  switch (entry.load_kind) {
    case "bodyweight":
      return value ? `BW +${value} ${label}` : "BW";
    case "absolute":
      return value ? `${value} ${label}` : "—";
    case "percent_1rm":
      return value ? `${value}%` : "—";
    default:
      return value || "—";
  }
}

function loadSuffix(kind: string, unit: WeightUnit): string {
  if (kind === "absolute") return weightUnitLabel(unit);
  if (kind === "percent_1rm") return "%";
  if (kind === "bodyweight") return `+${weightUnitLabel(unit)}`;
  return "";
}

function isNumericLoad(kind: string): boolean {
  return kind === "absolute" || kind === "percent_1rm" || kind === "bodyweight";
}

function UnitHeader({ unit, done }: { unit: LiveUnit; done: number }) {
  const first = unit.sets[0].set;
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        {unit.supersetLabel ? (
          <span className="label-mono text-[10px] text-cyan">SUPERSET {unit.supersetLabel}</span>
        ) : null}
        <h3 className="min-w-0 break-words text-pretty font-display text-[15px] font-semibold leading-tight text-text-primary">
          {unit.exerciseNames.join(" + ")}
        </h3>
        {unit.supersetLabel ? null : (
          <span className="font-mono text-[11px] text-text-muted">{target(first)}</span>
        )}
      </div>
      <Badge variant={done === unit.sets.length ? "cyan" : "muted"}>
        {done}/{unit.sets.length}
      </Badge>
    </div>
  );
}

// "2" for a solo set; "2a" / "2b" for round 2 of a Superset's first / second member.
function setTag(unit: LiveUnit, set: LiveSet): string {
  if (!unit.supersetLabel) return String(set.setNumber);
  return `${set.setNumber}${String.fromCharCode(97 + unit.exerciseNames.indexOf(set.exerciseName))}`;
}

// "bodyweight" reads as "BW" where space is short.
const shortLoad = (text: string) => text.replace(/^bodyweight$/i, "BW");

const doneCount = (unit: LiveUnit) => unit.sets.filter(({ set }) => set.status === "completed").length;

// ---------------------------------------------------------------------------------------------
// B · Set table — one card per exercise, one 36px grid row per set.

const TABLE_TRACKS =
  "grid grid-cols-[minmax(0,1.75rem)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,2.25rem)] items-center gap-1.5";
const CELL_INPUT = "h-9 px-1 text-center";

function TableUnit(props: PrototypeUnitProps) {
  const { unit, currentIndex, weightUnit } = props;
  const { entries, edit } = useUnitEntries(unit);
  const pending = unit.sets.filter(({ set }) => set.status !== "completed");
  const kind = pending.length > 0 ? entries[pending[0].index].load_kind : entries[unit.sets[0].index].load_kind;
  const previous = unit.sets.map(({ set }) => set.previous).filter((p) => p !== null);
  const current = unit.sets.find(({ index }) => index === currentIndex);

  return (
    <Card className={cn("flex flex-col gap-2.5 p-3", current ? "border-cyan" : null)}>
      <UnitHeader unit={unit} done={doneCount(unit)} />
      {previous.length > 0 ? (
        <p className="font-mono text-[11px] text-cyan">
          Last: {previous.map((p) => `${p!.reps}×${shortLoad(p!.loadText)}`).join(" · ")}
        </p>
      ) : null}

      <div className={cn(TABLE_TRACKS, "label-mono text-[9px] text-text-muted")}>
        <span className="text-center">SET</span>
        <span className="text-center">REPS</span>
        {/* The Load kind once per exercise rather than per set: it applies to every set still
            to do. A tiny borderless picker, so the column caption *is* the control. */}
        <label className="relative flex items-center justify-center gap-0.5">
          <span className="sr-only">Load kind for {unit.exerciseNames.join(" + ")}</span>
          <Select
            className="label-mono h-6 border-0 bg-transparent px-0 pr-[18px] text-center text-[9px] text-cyan"
            value={kind}
            onChange={(event) => pending.forEach(({ index }) => edit(index, { load_kind: event.target.value }))}
          >
            {loadKindOptions(weightUnit).map((option) => (
              <option key={option.value} value={option.value}>
                {option.value === "bodyweight" ? "BW" : option.value === "absolute" ? weightUnitLabel(weightUnit).toUpperCase() : option.label.toUpperCase()}
              </option>
            ))}
          </Select>
        </label>
        <span className="text-center">RPE</span>
        <span />
      </div>

      <ol className="flex list-none flex-col gap-1 p-0">
        {unit.sets.map(({ set, index }) => {
          const entry = entries[index];
          const completed = set.status === "completed";
          const isCurrent = index === currentIndex;
          const label = `${set.exerciseName}, set ${set.setNumber}`;
          return (
            <li
              key={liveSetDomId(set)}
              id={liveSetDomId(set)}
              className={cn(
                TABLE_TRACKS,
                "rounded-sm py-0.5",
                completed ? "bg-cyan-dim" : null,
                isCurrent ? "outline outline-1 outline-cyan" : null,
              )}
            >
              <span className={cn("text-center font-mono text-[12px] font-bold", completed || isCurrent ? "text-cyan" : "text-text-muted")}>
                {setTag(unit, set)}
              </span>
              <Input
                type="number"
                min={0}
                className={CELL_INPUT}
                aria-label={`Reps for ${label}`}
                disabled={completed}
                value={entry.reps}
                onChange={(event) => edit(index, { reps: event.target.value })}
              />
              <Input
                spellCheck={false}
                className={CELL_INPUT}
                aria-label={`Load for ${label}`}
                placeholder={entry.load_kind === "bodyweight" ? "BW" : "—"}
                inputMode={isNumericLoad(entry.load_kind) ? "decimal" : "text"}
                disabled={completed}
                value={entry.load_value}
                onChange={(event) => edit(index, { load_value: event.target.value })}
              />
              <Select
                className="h-9 px-1 pr-[18px] text-center"
                aria-label={`Effort for ${label}`}
                disabled={completed}
                value={entry.rpe}
                onChange={(event) => edit(index, { rpe: event.target.value })}
              >
                <option value="">—</option>
                {SET_ENTRY_EFFORT_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
              {completed ? (
                <Button
                  type="button"
                  variant="primary"
                  size="icon"
                  className="h-9 w-9"
                  disabled={props.isFinishing}
                  onClick={() => props.onReopenSet(index)}
                  aria-label={`Reopen ${label}`}
                >
                  <Check className="h-4 w-4" aria-hidden />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => complete(props, index, entry)}
                  aria-label={`Complete ${label}`}
                >
                  <Check className="h-4 w-4" aria-hidden />
                </Button>
              )}
            </li>
          );
        })}
      </ol>

      {current && current.set.status !== "completed" ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => props.onSkipSet(current.index)}
            aria-label={`Skip ${current.set.exerciseName}, set ${current.set.setNumber}`}
          >
            <SkipForward className="h-3.5 w-3.5" aria-hidden />
            Skip set {current.set.setNumber}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// C · Focus stepper — only the set in hand has controls; the rest are dots.

function Stepper({
  label,
  suffix,
  value,
  step,
  disabled,
  onChange,
  numeric,
}: {
  label: string;
  suffix: string;
  value: string;
  step: number;
  disabled: boolean;
  onChange: (value: string) => void;
  numeric: boolean;
}) {
  const bump = (delta: number) => {
    const current = Number.parseFloat(value || "0");
    const next = Math.max(0, (Number.isFinite(current) ? current : 0) + delta);
    onChange(String(Math.round(next * 100) / 100));
  };
  return (
    <div className="flex min-w-0 grow basis-32 items-center gap-1">
      {numeric ? (
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" disabled={disabled} onClick={() => bump(-step)} aria-label={`Less ${label}`}>
          <Minus className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
      <div className="relative min-w-0 grow">
        <Input
          spellCheck={false}
          type={numeric ? "number" : "text"}
          step="any"
          className="h-10 px-1 pr-7 text-center text-[16px] font-bold"
          aria-label={label}
          disabled={disabled}
          value={value}
          placeholder={suffix.startsWith("+") ? "BW" : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-text-muted">
          {suffix}
        </span>
      </div>
      {numeric ? (
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" disabled={disabled} onClick={() => bump(step)} aria-label={`More ${label}`}>
          <Plus className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}

function FocusUnit(props: PrototypeUnitProps) {
  const { unit, currentIndex, weightUnit } = props;
  const { entries, edit } = useUnitEntries(unit);
  const holdsCurrent = unit.sets.some(({ index }) => index === currentIndex);
  const firstPending = unit.sets.find(({ set }) => set.status !== "completed");
  const [picked, setPicked] = useState<number | null>(null);
  const focus = picked ?? (holdsCurrent ? currentIndex : null);
  const focused = unit.sets.find(({ index }) => index === focus);

  return (
    <Card className={cn("flex flex-col gap-3 p-3", holdsCurrent ? "border-cyan" : null)}>
      <UnitHeader unit={unit} done={doneCount(unit)} />

      {/* One dot per set: done (filled), in hand (ringed), to do (hollow). A dot is the way to
          pick a set out of order, or to bring a done one back to reopen it. */}
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={`Sets of ${unit.exerciseNames.join(" + ")}`}>
        {unit.sets.map(({ set, index }) => {
          const completed = set.status === "completed";
          const inHand = index === focus;
          const entry = entries[index];
          return (
            <button
              key={liveSetDomId(set)}
              id={liveSetDomId(set)}
              type="button"
              onClick={() => setPicked(inHand ? null : index)}
              aria-pressed={inHand}
              aria-label={`${set.exerciseName}, set ${set.setNumber}${completed ? ", done" : ""}`}
              className={cn(
                "flex h-8 min-w-8 items-center justify-center gap-1 rounded-full border px-2 font-mono text-[11px] font-bold transition-colors",
                completed ? "border-cyan bg-cyan text-on-accent" : "border-border text-text-muted",
                inHand ? "ring-2 ring-cyan ring-offset-1 ring-offset-surface" : null,
              )}
            >
              {completed ? `${entry.reps}×${loadShort(entry, weightUnit)}` : setTag(unit, set)}
            </button>
          );
        })}
        {!focused && firstPending ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => setPicked(firstPending.index)}>
            Start here
          </Button>
        ) : null}
      </div>

      {focused ? (() => {
        const { set, index } = focused;
        const entry = entries[index];
        const completed = set.status === "completed";
        const label = `${set.exerciseName}, set ${set.setNumber}`;
        return (
          <div className="flex flex-col gap-2.5 border-t border-border pt-3">
            <p className="font-mono text-[11px] text-text-muted">
              {unit.supersetLabel ? <span className="text-text-primary">{set.exerciseName} · </span> : null}
              Set {set.setNumber}/{set.moduleSetCount}
              {set.previous ? <span className="text-cyan"> · last {set.previous.reps} × {shortLoad(set.previous.loadText)}</span> : null}
            </p>
            <div className="flex flex-wrap gap-2">
              <Stepper label={`Reps for ${label}`} suffix="reps" value={entry.reps} step={1} disabled={completed} numeric onChange={(reps) => edit(index, { reps })} />
              {entry.load_kind === "bodyweight" && entry.load_value === "" ? null : (
                <Stepper
                  label={`Load for ${label}`}
                  suffix={loadSuffix(entry.load_kind, weightUnit)}
                  value={entry.load_value}
                  step={weightUnit === "lb" ? 5 : 2.5}
                  disabled={completed}
                  numeric={isNumericLoad(entry.load_kind)}
                  onChange={(load_value) => edit(index, { load_value })}
                />
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select
                className="h-10 w-[5.5rem] px-3 pr-[28px] text-[12px]"
                aria-label={`Effort for ${label}`}
                disabled={completed}
                value={entry.rpe}
                onChange={(event) => edit(index, { rpe: event.target.value })}
              >
                <option value="">RPE —</option>
                {SET_ENTRY_EFFORT_VALUES.map((value) => (
                  <option key={value} value={value}>
                    RPE {value}
                  </option>
                ))}
              </Select>
              <Select
                className="h-10 min-w-0 px-3 pr-[28px] text-[12px]"
                aria-label={`Load kind for ${label}`}
                disabled={completed}
                value={entry.load_kind}
                onChange={(event) => edit(index, { load_kind: event.target.value })}
              >
                {loadKindOptions(weightUnit).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-2">
              {completed ? (
                <Button type="button" variant="outline" className="h-11 grow" disabled={props.isFinishing} onClick={() => props.onReopenSet(index)} aria-label={`Reopen ${label}`}>
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Reopen set {set.setNumber}
                </Button>
              ) : (
                <>
                  <Button type="button" className="h-11 grow" onClick={() => { complete(props, index, entry); setPicked(null); }}>
                    <Check className="h-4 w-4" aria-hidden />
                    Done · set {set.setNumber}
                  </Button>
                  <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={() => { props.onSkipSet(index); setPicked(null); }} aria-label={`Skip ${label}`}>
                    <SkipForward className="h-4 w-4" aria-hidden />
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })() : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// D · Accept-first — each set reads as one line of what will be logged; ✓ logs it as is.

function AcceptUnit(props: PrototypeUnitProps) {
  const { unit, currentIndex, weightUnit } = props;
  const { entries, edit } = useUnitEntries(unit);
  const [editing, setEditing] = useState<number | null>(null);
  const holdsCurrent = unit.sets.some(({ index }) => index === currentIndex);

  return (
    <Card className={cn("flex flex-col gap-2 p-3", holdsCurrent ? "border-cyan" : null)}>
      <UnitHeader unit={unit} done={doneCount(unit)} />
      <ol className="flex list-none flex-col divide-y divide-border p-0">
        {unit.sets.map(({ set, index }) => {
          const entry = entries[index];
          const completed = set.status === "completed";
          const isCurrent = index === currentIndex;
          const open = editing === index && !completed;
          const label = `${set.exerciseName}, set ${set.setNumber}`;
          return (
            <li key={liveSetDomId(set)} id={liveSetDomId(set)} className="flex flex-col gap-2 py-1.5">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm font-mono text-[11px] font-bold",
                    completed ? "bg-cyan text-on-accent" : isCurrent ? "bg-cyan-dim text-cyan" : "bg-base text-text-muted",
                  )}
                >
                  {setTag(unit, set)}
                </span>
                {/* The summary *is* the edit affordance: it reads as the set that will be
                    logged, and tapping it opens the shared set-entry fields underneath. */}
                <button
                  type="button"
                  className="flex min-w-0 grow flex-col items-start rounded-sm px-1 py-0.5 text-left disabled:cursor-default"
                  onClick={() => setEditing(open ? null : index)}
                  disabled={completed}
                  aria-expanded={open}
                  aria-label={`Edit ${label}`}
                >
                  {unit.supersetLabel ? (
                    <span className="max-w-full truncate font-mono text-[10px] text-text-muted">{set.exerciseName}</span>
                  ) : null}
                  <span className={cn("flex items-center gap-1.5 font-mono text-[13px]", completed ? "text-text-secondary" : "text-text-primary")}>
                    {entry.reps} reps · {loadShort(entry, weightUnit)}
                    {entry.rpe ? ` · RPE ${entry.rpe}` : ""}
                    {completed ? null : <Pencil className="h-3 w-3 shrink-0 text-text-muted" aria-hidden />}
                  </span>
                  {set.previous && !completed ? (
                    <span className="font-mono text-[10px] text-cyan">
                      last {set.previous.reps} × {shortLoad(set.previous.loadText)}
                    </span>
                  ) : null}
                </button>
                {completed ? (
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" disabled={props.isFinishing} onClick={() => props.onReopenSet(index)} aria-label={`Reopen ${label}`}>
                    <RotateCcw className="h-4 w-4" aria-hidden />
                  </Button>
                ) : (
                  <>
                    {isCurrent ? (
                      <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => props.onSkipSet(index)} aria-label={`Skip ${label}`}>
                        <SkipForward className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant={isCurrent ? "primary" : "outline"}
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => { complete(props, index, entry); setEditing(null); }}
                      aria-label={`Complete ${label}`}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                    </Button>
                  </>
                )}
              </div>
              {open ? (
                <SetEntryProvider
                  values={entry}
                  unit={weightUnit}
                  prefix={null}
                  subject={{ joiner: "for", name: label }}
                  onEdit={(patch) => edit(index, patch)}
                >
                  <FieldRow>
                    <SetEntry.Reps />
                    <SetEntry.Effort />
                  </FieldRow>
                  <FieldRow>
                    <SetEntry.Load />
                  </FieldRow>
                </SetEntryProvider>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
