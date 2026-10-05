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
//   D  Accept-first  — one card per exercise; the set in hand shows its fields, every other set
//                      is a one-line summary + a ✓ (tap the line to edit it).
//
// Round 2 (feedback): B–D share one exercise header, the **member legend**. It names each
// member of a Superset with the conventional A1 / A2 tag, its prescription and last time, and
// carries that member's **Load kind picker** — so a curl on dumbbells and a dip on bodyweight
// keep their own kinds, and the kind is always on screen. Every set row then always shows a
// **Load value** field, including bodyweight, where it is the added load ("+kg"). A Superset's
// rows are grouped by round.
//
// Read-only beyond the screen's own reducer: every variant raises the same three callbacks
// the production card does. No tests, no polish — fold the winner in properly.

import { useState, type ReactNode } from "react";

import { Check, Minus, Pencil, Plus, RotateCcw, SkipForward } from "@/components/pulse/icons";
import type { PrototypeVariant } from "@/components/pulse/prototype-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { liveSetDomId, type LiveSet, type LiveUnit, type LiveUnitSet } from "@/lib/live-session";
import { loadKindOptions, loadValueInputMode, type LoadKind } from "@/lib/load";
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

// =============================================================================================
// Shared data plumbing (not layout).

type Entries = Record<number, SetEntryValues>;
type Edit = (index: number, patch: Partial<SetEntryValues>) => void;

function seed(set: LiveSet): SetEntryValues {
  return setEntryValues({
    kind: "repetitions",
    reps: String(set.reps),
    load_kind: set.loadKind,
    load_value: set.loadValue,
    rpe: set.rpe === null ? "" : String(set.rpe),
  });
}

function useUnitEntries(unit: LiveUnit): { entries: Entries; edit: Edit } {
  const [entries, setEntries] = useState<Entries>(() =>
    Object.fromEntries(unit.sets.map(({ set, index }) => [index, seed(set)])),
  );
  const edit: Edit = (index, patch) =>
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

// One member of a unit: the solo Prescription, or one exercise of a Superset.
interface Member {
  name: string;
  // "A1" / "A2" for a Superset member (the gym's own notation); null for a solo exercise.
  tag: string | null;
  sets: LiveUnitSet[];
}

function membersOf(unit: LiveUnit): Member[] {
  return unit.exerciseNames.map((name, i) => ({
    name,
    tag: unit.supersetLabel ? `${unit.supersetLabel}${i + 1}` : null,
    sets: unit.sets.filter(({ set }) => set.exerciseName === name),
  }));
}

function memberOf(unit: LiveUnit, set: LiveSet): Member {
  return membersOf(unit).find((member) => member.name === set.exerciseName)!;
}

// A Superset's sets grouped by round (its interleaved order already is round-major); a solo
// unit is one group with no round heading.
function roundsOf(unit: LiveUnit): { round: number | null; sets: LiveUnitSet[] }[] {
  if (!unit.supersetLabel) return [{ round: null, sets: unit.sets }];
  const rounds = new Map<number, LiveUnitSet[]>();
  for (const item of unit.sets) rounds.set(item.set.setNumber, [...(rounds.get(item.set.setNumber) ?? []), item]);
  return [...rounds].map(([round, sets]) => ({ round, sets }));
}

// The row's tag: the set number for a solo exercise, the member tag in a Superset (the round
// is the group heading above it).
function rowTag(unit: LiveUnit, set: LiveSet): string {
  return memberOf(unit, set).tag ?? String(set.setNumber);
}

const shortLoad = (text: string) => text.replace(/^bodyweight/i, "BW").replace(" + ", " +");

// "BW", "BW +10 kg", "70 kg", "75%", or the descriptive text — the value as it will be logged.
function loadShort(entry: SetEntryValues, unit: WeightUnit): string {
  const value = entry.load_value.trim();
  const label = weightUnitLabel(unit);
  switch (entry.load_kind) {
    case "bodyweight":
      return value && Number.parseFloat(value) !== 0 ? `BW +${value} ${label}` : "BW";
    case "absolute":
    case "range":
      return value ? `${value} ${label}` : "—";
    case "percent_1rm":
      return value ? `${value}% 1RM` : "—";
    default:
      return value || "—";
  }
}

// What the Load value field is *in*, shown inside it: bodyweight's value is the added load.
function loadSuffix(kind: string, unit: WeightUnit): string {
  if (kind === "bodyweight") return `+${weightUnitLabel(unit)}`;
  if (kind === "absolute" || kind === "range") return weightUnitLabel(unit);
  if (kind === "percent_1rm") return "%";
  return "";
}

function loadPlaceholder(kind: string): string {
  if (kind === "bodyweight") return "0";
  if (kind === "range") return "60-70";
  if (kind === "qualitative") return "light";
  return "—";
}

const isSteppable = (kind: string) => kind === "absolute" || kind === "percent_1rm" || kind === "bodyweight";

// Last time, as compactly as the prescription reads: "3 × 12 · 10 kg" when every set matched,
// else each set in turn ("5×BW, 5×BW, 4×BW").
function lastText(previous: { reps: number; loadText: string }[]): string {
  const [first] = previous;
  const same = previous.every((p) => p.reps === first.reps && p.loadText === first.loadText);
  return same
    ? `${previous.length} × ${first.reps} · ${shortLoad(first.loadText)}`
    : previous.map((p) => `${p.reps}×${shortLoad(p.loadText)}`).join(", ");
}

const doneCount = (unit: LiveUnit) => unit.sets.filter(({ set }) => set.status === "completed").length;

// =============================================================================================
// Shared header: the unit's title and its member legend.

function Tag({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "current" | "done" }) {
  return (
    <span
      className={cn(
        "flex h-7 min-w-7 shrink-0 items-center justify-center rounded-sm px-1 font-mono text-[11px] font-bold",
        tone === "done" ? "bg-cyan text-on-accent" : tone === "current" ? "bg-cyan-dim text-cyan" : "bg-base text-text-muted",
      )}
    >
      {children}
    </span>
  );
}

// The picker for a member's Load kind. Applies to every set of that member still to do — the
// kind of load an exercise is done with does not change between its sets, so asking per set
// (as the production card does) is four selects for one decision.
function LoadKindPicker({ member, entries, edit, unit }: { member: Member; entries: Entries; edit: Edit; unit: WeightUnit }) {
  const pending = member.sets.filter(({ set }) => set.status !== "completed");
  const shown = entries[(pending[0] ?? member.sets[0]).index].load_kind;
  return (
    <Select
      className="h-8 px-2.5 pr-[30px] text-[11px]"
      aria-label={`Load kind for ${member.name}`}
      disabled={pending.length === 0}
      value={shown}
      onChange={(event) => pending.forEach(({ index }) => edit(index, { load_kind: event.target.value }))}
    >
      {loadKindOptions(unit).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

function MemberLine({ member, entries, edit, unit, currentIndex }: { member: Member; entries: Entries; edit: Edit; unit: WeightUnit; currentIndex: number }) {
  const first = member.sets[0].set;
  const previous = member.sets.map(({ set }) => set.previous).filter((p) => p !== null);
  const inHand = member.sets.some(({ index }) => index === currentIndex);
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <div className="flex min-w-0 grow basis-40 items-start gap-2">
        {member.tag ? <Tag tone={inHand ? "current" : "muted"}>{member.tag}</Tag> : null}
        <div className="flex min-w-0 flex-col">
          {member.tag ? (
            <span className="break-words font-display text-[14px] font-semibold leading-tight text-text-primary">{member.name}</span>
          ) : null}
          <span className="font-mono text-[11px] text-text-muted">
            {first.moduleSetCount} × {first.prescribedReps} · {shortLoad(first.prescribedLoadText)}
            {previous.length > 0 ? (
              <span className="text-cyan"> · last {lastText(previous as { reps: number; loadText: string }[])}</span>
            ) : null}
          </span>
        </div>
      </div>
      <div className="w-[7.5rem] shrink-0">
        <LoadKindPicker member={member} entries={entries} edit={edit} unit={unit} />
      </div>
    </div>
  );
}

function UnitHeader({ unit, entries, edit, weightUnit, currentIndex }: { unit: LiveUnit; entries: Entries; edit: Edit; weightUnit: WeightUnit; currentIndex: number }) {
  const members = membersOf(unit);
  const done = doneCount(unit);
  const rounds = members[0].sets.length;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        {unit.supersetLabel ? (
          <span className="label-mono pt-1 text-[11px] text-cyan">
            SUPERSET {unit.supersetLabel} · {rounds} ROUNDS
          </span>
        ) : (
          <h3 className="min-w-0 break-words text-pretty font-display text-[15px] font-semibold leading-tight text-text-primary">
            {unit.exerciseNames[0]}
          </h3>
        )}
        <Badge variant={done === unit.sets.length ? "cyan" : "muted"}>
          {done}/{unit.sets.length}
        </Badge>
      </div>
      <div className={cn("flex flex-col", unit.supersetLabel ? "gap-2.5" : null)}>
        {members.map((member) => (
          <MemberLine key={member.name} member={member} entries={entries} edit={edit} unit={weightUnit} currentIndex={currentIndex} />
        ))}
      </div>
    </div>
  );
}

function RoundHeading({ round, total }: { round: number; total: number }) {
  return (
    <span className="label-mono flex items-center gap-2 pt-1 text-[9px] text-text-muted">
      ROUND {round}/{total}
      <span className="h-px grow bg-border" aria-hidden />
    </span>
  );
}

// =============================================================================================
// Shared cells: a Load value field that always says what it is in, and the effort picker.

function LoadField({ entry, label, unit, disabled, onChange, className }: { entry: SetEntryValues; label: string; unit: WeightUnit; disabled: boolean; onChange: (value: string) => void; className?: string }) {
  const suffix = loadSuffix(entry.load_kind, unit);
  return (
    <div className="relative min-w-0">
      <Input
        spellCheck={false}
        className={cn("h-9 px-1 text-center", suffix ? "pr-6" : null, className)}
        aria-label={`Load for ${label}`}
        placeholder={loadPlaceholder(entry.load_kind)}
        inputMode={loadValueInputMode(entry.load_kind)}
        disabled={disabled}
        value={entry.load_value}
        onChange={(event) => onChange(event.target.value)}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 font-mono text-[9px] text-text-muted">{suffix}</span>
      ) : null}
    </div>
  );
}

function EffortField({ value, label, disabled, onChange, className, prefix = "" }: { value: string; label: string; disabled: boolean; onChange: (value: string) => void; className?: string; prefix?: string }) {
  return (
    <Select
      className={cn("h-9 px-1 pr-[18px] text-center", className)}
      aria-label={`Effort for ${label}`}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{prefix}—</option>
      {SET_ENTRY_EFFORT_VALUES.map((v) => (
        <option key={v} value={v}>
          {prefix}
          {v}
        </option>
      ))}
    </Select>
  );
}

// =============================================================================================
// B · Set table — one card per exercise, one 36px grid row per set.

const TABLE_TRACKS =
  "grid grid-cols-[minmax(0,1.75rem)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,2.25rem)] items-center gap-1.5";

function TableUnit(props: PrototypeUnitProps) {
  const { unit, currentIndex, weightUnit } = props;
  const { entries, edit } = useUnitEntries(unit);
  const rounds = roundsOf(unit);
  const current = unit.sets.find(({ index }) => index === currentIndex);

  return (
    <Card className={cn("flex flex-col gap-2.5 p-3", current ? "border-cyan" : null)}>
      <UnitHeader unit={unit} entries={entries} edit={edit} weightUnit={weightUnit} currentIndex={currentIndex} />

      <div className={cn(TABLE_TRACKS, "label-mono text-[9px] text-text-muted")} aria-hidden>
        <span className="text-center">{unit.supersetLabel ? "" : "SET"}</span>
        <span className="text-center">REPS</span>
        <span className="text-center">LOAD</span>
        <span className="text-center">RPE</span>
        <span />
      </div>

      <div className="flex flex-col gap-1">
        {rounds.map(({ round, sets }) => (
          <div key={round ?? 0} className="flex flex-col gap-1">
            {round !== null ? <RoundHeading round={round} total={rounds.length} /> : null}
            <ol className="flex list-none flex-col gap-1 p-0">
              {sets.map(({ set, index }) => {
                const entry = entries[index];
                const completed = set.status === "completed";
                const isCurrent = index === currentIndex;
                const label = `${set.exerciseName}, set ${set.setNumber}`;
                return (
                  <li
                    key={liveSetDomId(set)}
                    id={liveSetDomId(set)}
                    className={cn(TABLE_TRACKS, "rounded-sm py-0.5", completed ? "bg-cyan-dim" : null, isCurrent ? "outline outline-1 outline-cyan" : null)}
                  >
                    <span className={cn("text-center font-mono text-[12px] font-bold", completed || isCurrent ? "text-cyan" : "text-text-muted")}>
                      {rowTag(unit, set)}
                    </span>
                    <Input
                      type="number"
                      min={0}
                      className="h-9 px-1 text-center"
                      aria-label={`Reps for ${label}`}
                      disabled={completed}
                      value={entry.reps}
                      onChange={(event) => edit(index, { reps: event.target.value })}
                    />
                    <LoadField entry={entry} label={label} unit={weightUnit} disabled={completed} onChange={(load_value) => edit(index, { load_value })} />
                    <EffortField value={entry.rpe} label={label} disabled={completed} onChange={(rpe) => edit(index, { rpe })} />
                    {completed ? (
                      <Button type="button" variant="primary" size="icon" className="h-9 w-9" disabled={props.isFinishing} onClick={() => props.onReopenSet(index)} aria-label={`Reopen ${label}`}>
                        <Check className="h-4 w-4" aria-hidden />
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => complete(props, index, entry)} aria-label={`Complete ${label}`}>
                        <Check className="h-4 w-4" aria-hidden />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>

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
            Skip {rowTag(unit, current.set) === String(current.set.setNumber) ? `set ${current.set.setNumber}` : `${rowTag(unit, current.set)} · round ${current.set.setNumber}`}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

// =============================================================================================
// C · Focus stepper — only the set in hand has controls; the rest are chips.

function Stepper({ label, suffix, value, step, disabled, numeric, placeholder, onChange }: { label: string; suffix: string; value: string; step: number; disabled: boolean; numeric: boolean; placeholder?: string; onChange: (value: string) => void }) {
  const bump = (delta: number) => {
    const current = Number.parseFloat(value || "0");
    const next = Math.max(0, (Number.isFinite(current) ? current : 0) + delta);
    onChange(String(Math.round(next * 100) / 100));
  };
  return (
    <div className="flex min-w-0 grow basis-36 items-center gap-1">
      {numeric ? (
        <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" disabled={disabled} onClick={() => bump(-step)} aria-label={`Less ${label}`}>
          <Minus className="h-4 w-4" aria-hidden />
        </Button>
      ) : null}
      <div className="relative min-w-0 grow">
        <Input
          spellCheck={false}
          inputMode={numeric ? "decimal" : undefined}
          className={cn("h-10 px-1 text-center text-[16px] font-bold", suffix ? "pr-7" : null)}
          aria-label={label}
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-text-muted">{suffix}</span>
        ) : null}
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
  const rounds = roundsOf(unit);

  return (
    <Card className={cn("flex flex-col gap-3 p-3", holdsCurrent ? "border-cyan" : null)}>
      <UnitHeader unit={unit} entries={entries} edit={edit} weightUnit={weightUnit} currentIndex={currentIndex} />

      {/* One chip per set — done (filled, showing what was logged), in hand (ringed), to do
          (hollow). A Superset's chips are grouped per round: "1 · A1 A2". A chip is how a set is
          picked out of order, or a done one brought back to reopen it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" role="group" aria-label={`Sets of ${unit.exerciseNames.join(" + ")}`}>
        {rounds.map(({ round, sets }) => (
          <div key={round ?? 0} className="flex items-center gap-1">
            {round !== null ? <span className="font-mono text-[10px] text-text-muted">R{round}</span> : null}
            {sets.map(({ set, index }) => {
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
                    "flex h-8 min-w-8 items-center justify-center rounded-full border px-2 font-mono text-[11px] font-bold transition-colors",
                    completed ? "border-cyan bg-cyan text-on-accent" : "border-border text-text-muted",
                    inHand ? "ring-2 ring-cyan ring-offset-1 ring-offset-surface" : null,
                  )}
                >
                  {completed && round === null ? `${entry.reps}×${loadShort(entry, weightUnit)}` : rowTag(unit, set)}
                </button>
              );
            })}
          </div>
        ))}
        {!focused && firstPending ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2" onClick={() => setPicked(firstPending.index)}>
            Start here
          </Button>
        ) : null}
      </div>

      {focused
        ? (() => {
            const { set, index } = focused;
            const entry = entries[index];
            const completed = set.status === "completed";
            const member = memberOf(unit, set);
            const label = `${set.exerciseName}, set ${set.setNumber}`;
            return (
              <div className="flex flex-col gap-2.5 border-t border-border pt-3">
                <p className="flex items-center gap-2 font-mono text-[11px] text-text-muted">
                  {member.tag ? <Tag tone="current">{member.tag}</Tag> : null}
                  <span className="min-w-0">
                    {member.tag ? <span className="text-text-primary">{set.exerciseName} · round </span> : "Set "}
                    {set.setNumber}/{set.moduleSetCount}
                    {set.previous ? <span className="text-cyan"> · last {set.previous.reps} × {shortLoad(set.previous.loadText)}</span> : null}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Stepper label={`Reps for ${label}`} suffix="reps" value={entry.reps} step={1} disabled={completed} numeric onChange={(reps) => edit(index, { reps })} />
                  <Stepper
                    label={`Load for ${label}`}
                    suffix={loadSuffix(entry.load_kind, weightUnit)}
                    value={entry.load_value}
                    step={entry.load_kind === "percent_1rm" ? 2.5 : weightUnit === "lb" ? 5 : 2.5}
                    disabled={completed}
                    numeric={isSteppable(entry.load_kind)}
                    placeholder={loadPlaceholder(entry.load_kind)}
                    onChange={(load_value) => edit(index, { load_value })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <EffortField className="h-11 w-[5.5rem] px-2 pr-[26px] text-[12px]" prefix="RPE " value={entry.rpe} label={label} disabled={completed} onChange={(rpe) => edit(index, { rpe })} />
                  {completed ? (
                    <Button type="button" variant="outline" className="h-11 grow" disabled={props.isFinishing} onClick={() => props.onReopenSet(index)} aria-label={`Reopen ${label}`}>
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      Reopen
                    </Button>
                  ) : (
                    <>
                      <Button type="button" className="h-11 grow px-2" onClick={() => { complete(props, index, entry); setPicked(null); }}>
                        <Check className="h-4 w-4" aria-hidden />
                        Done
                      </Button>
                      <Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0" onClick={() => { props.onSkipSet(index); setPicked(null); }} aria-label={`Skip ${label}`}>
                        <SkipForward className="h-4 w-4" aria-hidden />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })()
        : null}
    </Card>
  );
}

// =============================================================================================
// D · Accept-first — each set reads as one line of what will be logged; ✓ logs it as is.
// The set in hand shows a one-row editor (reps · load · RPE) underneath; tapping any other
// line opens the same editor there.

const EDIT_TRACKS = "grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-1.5";

function AcceptUnit(props: PrototypeUnitProps) {
  const { unit, currentIndex, weightUnit } = props;
  const { entries, edit } = useUnitEntries(unit);
  // `undefined` = follow the set in hand; a number = the set the user opened; null = all closed.
  const [editing, setEditing] = useState<number | null | undefined>(undefined);
  const holdsCurrent = unit.sets.some(({ index }) => index === currentIndex);
  const rounds = roundsOf(unit);

  return (
    <Card className={cn("flex flex-col gap-2 p-3", holdsCurrent ? "border-cyan" : null)}>
      <UnitHeader unit={unit} entries={entries} edit={edit} weightUnit={weightUnit} currentIndex={currentIndex} />
      {rounds.map(({ round, sets }) => (
        <div key={round ?? 0} className="flex flex-col">
          {round !== null ? <RoundHeading round={round} total={rounds.length} /> : null}
          <ol className="flex list-none flex-col divide-y divide-border p-0">
            {sets.map(({ set, index }) => {
              const entry = entries[index];
              const completed = set.status === "completed";
              const isCurrent = index === currentIndex;
              const open = (editing === undefined ? isCurrent : editing === index) && !completed;
              const label = `${set.exerciseName}, set ${set.setNumber}`;
              return (
                <li key={liveSetDomId(set)} id={liveSetDomId(set)} className="flex flex-col gap-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <Tag tone={completed ? "done" : isCurrent ? "current" : "muted"}>{rowTag(unit, set)}</Tag>
                    {/* The summary *is* the edit affordance: it reads as the set that will be
                        logged, and tapping it opens the row's fields underneath. */}
                    <button
                      type="button"
                      className="flex min-w-0 grow flex-col items-start rounded-sm px-1 py-0.5 text-left disabled:cursor-default"
                      onClick={() => setEditing(open ? null : index)}
                      disabled={completed}
                      aria-expanded={open}
                      aria-label={`Edit ${label}`}
                    >
                      {open ? (
                        // Open, the fields below *are* the set, so the line would only repeat them.
                        <span className="font-mono text-[11px] text-cyan">
                          {set.previous ? `last ${set.previous.reps} × ${shortLoad(set.previous.loadText)}` : <span className="text-text-muted">no previous set</span>}
                        </span>
                      ) : (<>
                      <span className={cn("flex flex-wrap items-center gap-x-1.5 font-mono text-[13px]", completed ? "text-text-secondary" : "text-text-primary")}>
                        <span>{entry.reps} reps</span>
                        <span>· {loadShort(entry, weightUnit)}</span>
                        {entry.rpe ? <span>· RPE {entry.rpe}</span> : null}
                        {completed ? null : <Pencil className="h-3 w-3 shrink-0 text-text-muted" aria-hidden />}
                      </span>
                      {set.previous && !completed ? (
                        <span className="font-mono text-[10px] text-cyan">last {set.previous.reps} × {shortLoad(set.previous.loadText)}</span>
                      ) : null}
                      </>)}
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
                          onClick={() => { complete(props, index, entry); setEditing(undefined); }}
                          aria-label={`Complete ${label}`}
                        >
                          <Check className="h-4 w-4" aria-hidden />
                        </Button>
                      </>
                    )}
                  </div>
                  {open ? (
                    <div className="flex flex-col gap-1 pl-9">
                      <div className={cn(EDIT_TRACKS, "label-mono text-[9px] text-text-muted")} aria-hidden>
                        <span className="text-center">REPS</span>
                        <span className="text-center">LOAD</span>
                        <span className="text-center">RPE</span>
                      </div>
                      <div className={EDIT_TRACKS}>
                        <Input type="number" min={0} className="h-9 px-1 text-center" aria-label={`Reps for ${label}`} value={entry.reps} onChange={(event) => edit(index, { reps: event.target.value })} />
                        <LoadField entry={entry} label={label} unit={weightUnit} disabled={false} onChange={(load_value) => edit(index, { load_value })} />
                        <EffortField value={entry.rpe} label={label} disabled={false} onChange={(rpe) => edit(index, { rpe })} />
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </Card>
  );
}
