"use client";

// PROTOTYPE — throwaway (.claude/skills/prototype/UI.md, sub-shape A).
//
// Question: how should one Exercise Prescription's card on the Session detail page be laid out,
// especially its Progression Scheme part? Three structurally different answers to the current
// card (variant A), switchable via `?variant=` on `/sessions/[id]`, borrowing from the Live
// Session's set table (ADR-0114): a compact header, a mono prescription line, one row per set.
//
//   B — Set table:  the plan as the live set table, with progression as a "NEXT" row beneath it.
//   C — Ladder:     stat tiles, then progression as a NOW → IF → THEN / ELSE stepper with
//                   scheme chips that re-draw it live.
//   D — Compact:    one dense row per movement; progression is a one-line "Next" strip that
//                   opens a bottom sheet holding the scheme choice.
//
// Choosing a scheme here is a STUB: it changes local state and the preview only, it never writes.
// No tests, no error handling — the point is to see the layouts with real data.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Minus,
  RotateCcw,
  TrendingUp,
} from "@/components/pulse/icons";

import { SubstituteButton } from "@/components/SubstituteButton";
import { RemoveExerciseButton } from "@/components/RemoveExerciseButton";
import { HarderVariationOffer } from "@/components/HarderVariationOffer";
import { ActionSheet, ActionSheetPanel } from "@/components/pulse/action-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatLoad, isPureBodyweight, type Load } from "@/lib/load";
import type { WeightUnit } from "@/lib/weight-unit";
import type { ExercisePrescription } from "@/lib/sessions-types";
import type { SupersetSlot } from "@/lib/supersets";
import type { HarderVariationOffer as HarderVariationOfferView } from "@/lib/harder-variation-view";
import {
  DEFAULT_SCHEME,
  schemeLabel,
  type ProgressionScheme,
  type SchemeControlModel,
} from "@/lib/scheme-view";
import { schemePreview } from "@/lib/scheme-preview";
import { prescriptionSetTypeBadge } from "@/lib/set-type-view";
import { targetEffortLabel } from "@/lib/target-effort-view";
import { exerciseNoteText } from "@/lib/note-view";
import { toTempoView } from "@/lib/tempo-view";
import { appendFrom } from "@/lib/back-target";
import { NAV_FORWARD } from "@/lib/nav-direction";

export const PROTOTYPE_VARIANTS = [
  { key: "A", name: "Current" },
  { key: "B", name: "Set table" },
  { key: "C", name: "Ladder" },
  { key: "D", name: "Compact + sheet" },
] as const;

export interface PrototypeCardProps {
  variant: string;
  prescription: ExercisePrescription;
  superset: SupersetSlot | undefined;
  sessionId: number;
  unit: WeightUnit;
  index: number;
  harderVariation: HarderVariationOfferView;
  schemeModel: SchemeControlModel;
  showScheme: boolean;
  showRemove: boolean;
  canRemove: boolean;
  dissolvesSuperset: boolean;
}

export function PrototypeExerciseCard(props: PrototypeCardProps) {
  if (props.variant === "B") return <SetTableVariant {...props} />;
  if (props.variant === "C") return <LadderVariant {...props} />;
  return <CompactVariant {...props} />;
}

// ---------------------------------------------------------------------------------------------
// The progression "ladder": the Scheme Preview sentence split into structured parts so a layout
// can place them. Prototype-only; a winner would move this into lib/scheme-preview.ts with tests.

type Ladder =
  | { kind: "hold"; reason: string }
  | {
      kind: "step";
      // The condition that earns the step.
      when: string;
      // The next prescription, as short as possible ("62.5 kg", "9–13 reps").
      next: string;
      // Which value moves, so a table can put `next` in the right column.
      moves: "load" | "reps" | "variation";
      // What happens on a miss, or null when it never steps down.
      otherwise: string | null;
    };

const RANGE = /^\s*(\d+)\s*-\s*(\d+)\s*$/;
const SINGLE = /^\s*(\d+)\s*$/;
const AMRAP = /^\s*(\d+)\s*\+\s*$/;

function repTarget(reps: string): { floor: number; ceiling: number } | null {
  const range = RANGE.exec(reps);
  if (range) return { floor: Number(range[1]), ceiling: Number(range[2]) };
  const single = SINGLE.exec(reps);
  if (single) return { floor: Number(single[1]), ceiling: Number(single[1]) };
  return null;
}

function stepLoad(load: Load, deltaKg: number, unit: WeightUnit): string {
  if (load.kind === "absolute" && load.kg != null) {
    return formatLoad({ ...load, kg: load.kg + deltaKg }, unit);
  }
  if (load.kind === "bodyweight" && load.added_kg != null) {
    return formatLoad({ ...load, added_kg: load.added_kg + deltaKg }, unit);
  }
  return `${deltaKg > 0 ? "+" : "−"}${Math.abs(deltaKg)} kg`;
}

function prettyReps(reps: string): string {
  return reps.replace(/^\s*(\d+)\s*-\s*(\d+)\s*$/, "$1–$2");
}

function ladderFor(
  scheme: ProgressionScheme,
  reps: string,
  load: Load | null,
  unit: WeightUnit,
): Ladder {
  const axis =
    load == null
      ? "none"
      : load.kind === "absolute"
        ? "weight"
        : load.kind === "bodyweight"
          ? isPureBodyweight(load)
            ? "reps"
            : "weight"
          : "none";
  const target = repTarget(reps);

  if (scheme === "static") {
    return { kind: "hold", reason: "Nothing auto-adjusts — you set the numbers by hand." };
  }
  if (scheme === "double_progression") {
    if (axis === "none") return { kind: "hold", reason: "Needs a single load value to step." };
    if (target === null) return { kind: "hold", reason: `Needs a rep target to step; “${reps}” isn’t one.` };
    const when = `every set hits ${target.ceiling} @ RPE ≤ 7`;
    if (axis === "weight") {
      return {
        kind: "step",
        when,
        next: stepLoad(load!, 2.5, unit),
        moves: "load",
        otherwise: `miss ${target.floor} reps → ${stepLoad(load!, -5, unit)}`,
      };
    }
    if (target.floor < target.ceiling) {
      return {
        kind: "step",
        when,
        next: `${target.floor + 1}–${target.ceiling + 1}`,
        moves: "reps",
        otherwise: null,
      };
    }
    return { kind: "step", when, next: "harder variation", moves: "variation", otherwise: null };
  }
  if (scheme === "greyskull") {
    if (axis !== "weight") return { kind: "hold", reason: "Only steps a weighted movement." };
    const amrap = AMRAP.exec(reps);
    const floor = target?.floor ?? (amrap ? Number(amrap[1]) : null);
    if (floor === null) return { kind: "hold", reason: "Needs a rep floor to check." };
    return {
      kind: "step",
      when: `last set (all-out) clears ${floor} reps`,
      next: stepLoad(load!, 2.5, unit),
      moves: "load",
      otherwise: "miss it → load resets −10%",
    };
  }
  // session_count
  if (axis === "none") return { kind: "hold", reason: "No single load value to step." };
  if (axis === "weight") {
    return { kind: "step", when: "every 3rd session", next: stepLoad(load!, 2.5, unit), moves: "load", otherwise: null };
  }
  return {
    kind: "step",
    when: "every 3rd session",
    next: target ? `${target.floor + 1}–${target.ceiling + 1}` : "+1 rep",
    moves: "reps",
    otherwise: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Pieces every variant reads (data, not layout).

function loadText(p: ExercisePrescription, unit: WeightUnit): string | null {
  return p.recommended_load ? formatLoad(p.recommended_load, unit) : null;
}

function restText(p: ExercisePrescription, superset: SupersetSlot | undefined): string | null {
  const grouped = superset !== undefined && superset.group !== null;
  if (!grouped) return p.rest_seconds !== null ? `${p.rest_seconds}s` : null;
  return superset.isLastMember && superset.roundRestSeconds !== null
    ? `${superset.roundRestSeconds}s round`
    : null;
}

function Badges({ p, superset }: { p: ExercisePrescription; superset: SupersetSlot | undefined }) {
  const setType = prescriptionSetTypeBadge(p);
  const effort = targetEffortLabel(p);
  const grouped = superset !== undefined && superset.group !== null;
  if (!grouped && p.provenance !== "ai_generated" && !setType && !effort) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {grouped ? <Badge variant="cyan">SUPERSET {superset.memberLabel}</Badge> : null}
      {setType ? <Badge variant="violet">{setType.label}</Badge> : null}
      {effort ? <Badge variant="violet">{effort}</Badge> : null}
      {p.provenance === "ai_generated" ? <Badge variant="magenta">AI</Badge> : null}
    </div>
  );
}

function NameLink({ p, sessionId, className }: { p: ExercisePrescription; sessionId: number; className?: string }) {
  return (
    <Link
      {...NAV_FORWARD}
      href={appendFrom(`/exercises/${p.exercise_id}`, `/sessions/${sessionId}`)}
      className={cn(
        "break-words text-pretty font-display font-semibold leading-tight text-text-primary transition-colors hover:text-cyan",
        className,
      )}
    >
      {p.exercise_name}
    </Link>
  );
}

function IndexTag({ index, tone = "muted" }: { index: number; tone?: "muted" | "current" }) {
  return (
    <span
      className={cn(
        "flex h-7 min-w-7 shrink-0 items-center justify-center rounded-sm px-1 font-mono text-[11px] font-bold",
        tone === "current" ? "bg-cyan-dim text-cyan" : "bg-base text-text-muted",
      )}
    >
      {String(index).padStart(2, "0")}
    </span>
  );
}

function Details({ p }: { p: ExercisePrescription }) {
  const note = exerciseNoteText(p);
  const tempo = toTempoView(p.tempo);
  return (
    <div className="flex flex-col gap-1.5 font-sans text-[13px] leading-relaxed text-text-secondary">
      {p.exercise_description ? <p>{p.exercise_description}</p> : null}
      {note ? <p className="italic">“{note}”</p> : null}
      {tempo.kind !== "none" ? (
        <p className="font-mono text-[11px] text-text-muted">
          TEMPO {tempo.kind === "raw" ? tempo.raw : `${tempo.label} · ${tempo.expansion}`}
        </p>
      ) : null}
      {p.targeted_muscles.length > 0 ? (
        <p className="font-mono text-[11px] text-text-muted">{p.targeted_muscles.join(" · ")}</p>
      ) : null}
    </div>
  );
}

function MoreSheet(props: PrototypeCardProps & { withSubstitute?: boolean }) {
  const { prescription: p, sessionId, showRemove, canRemove, dissolvesSuperset, withSubstitute } = props;
  if (!showRemove && !withSubstitute) return null;
  return (
    <ActionSheet label={`More actions for ${p.exercise_name}`} title={p.exercise_name}>
      {withSubstitute ? (
        <div className="px-4 py-2">
          <SubstituteButton sessionId={sessionId} position={p.position} />
        </div>
      ) : null}
      {showRemove ? (
        <RemoveExerciseButton
          sessionId={sessionId}
          position={p.position}
          canRemove={canRemove}
          dissolvesSuperset={dissolvesSuperset}
        />
      ) : null}
    </ActionSheet>
  );
}

// The stubbed Apply / Reset row every variant's scheme picker ends with.
function useSchemeChoice(model: SchemeControlModel) {
  const [choice, setChoice] = useState<ProgressionScheme>(model.current);
  const [applied, setApplied] = useState<ProgressionScheme>(model.current);
  return { choice, setChoice, applied, apply: () => setApplied(choice), dirty: choice !== applied };
}

function ApplyStub({ dirty, onApply, applied }: { dirty: boolean; onApply: () => void; applied: ProgressionScheme }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {dirty ? (
        <Button type="button" size="sm" onClick={onApply}>
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          Apply
        </Button>
      ) : null}
      {!dirty && applied !== DEFAULT_SCHEME ? (
        <span className="flex items-center gap-1 font-mono text-[11px] text-text-muted">
          <RotateCcw className="h-3 w-3" aria-hidden />
          Default is {schemeLabel(DEFAULT_SCHEME)}
        </span>
      ) : null}
      <span className="font-mono text-[10px] text-text-muted">(prototype: Apply is a stub)</span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// B — Set table. The plan reads like the live card the user will meet: compact header, a mono
// summary line, one row per set; the progression is the table's last row, "NEXT", so the step is
// read in the same columns as the sets it changes. The scheme is a quiet picker under the table.

function SetTableVariant(props: PrototypeCardProps) {
  const { prescription: p, superset, sessionId, unit, index, schemeModel, showScheme } = props;
  const scheme = useSchemeChoice(schemeModel);
  const [picking, setPicking] = useState(false);
  const ladder = ladderFor(scheme.choice, p.reps, schemeModel.load, unit);
  const load = loadText(p, unit) ?? "—";
  const rest = restText(p, superset);
  const ROW = "flex items-center gap-1.5";
  const TAG = "w-10 shrink-0 text-center";
  const CELL = "min-w-0 grow basis-12 rounded-sm px-2 py-1.5 text-center";

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex items-start gap-2.5">
        <IndexTag index={index} />
        <div className="flex min-w-0 grow flex-col gap-1">
          <NameLink p={p} sessionId={sessionId} className="text-[15px]" />
          <p className="font-mono text-[11px] text-text-muted">
            {p.sets} × {prettyReps(p.reps)} · {load}
            {rest ? ` · rest ${rest}` : ""}
          </p>
          <Badges p={p} superset={superset} />
        </div>
        <MoreSheet {...props} withSubstitute />
      </div>

      <div className="flex flex-col gap-1">
        <div className={cn(ROW, "label-mono text-[9px] text-text-muted")} aria-hidden>
          <span className={TAG}>SET</span>
          <span className={cn(CELL, "py-0")}>REPS</span>
          <span className={cn(CELL, "py-0")}>LOAD</span>
        </div>
        <ol className="flex list-none flex-col gap-1 p-0">
          {Array.from({ length: p.sets }, (_, i) => (
            <li key={i} className={cn(ROW, "font-mono text-[13px] text-text-primary")}>
              <span className={cn(TAG, "text-[12px] font-bold text-text-muted")}>{i + 1}</span>
              <span className={cn(CELL, "bg-base")}>{prettyReps(p.reps)}</span>
              <span className={cn(CELL, "bg-base")}>{load}</span>
            </li>
          ))}
        </ol>
        {(
          <div
            className={cn(
              ROW,
              "mt-1 rounded-sm border border-dashed py-1 font-mono text-[13px]",
              ladder.kind === "step" ? "border-cyan text-cyan" : "border-border text-text-muted",
            )}
          >
            <span className={cn(TAG, "label-mono text-[9px]")}>NEXT</span>
            {ladder.kind === "step" && ladder.moves === "variation" ? (
              <span className={cn(CELL, "basis-24 font-bold")}>{ladder.next}</span>
            ) : ladder.kind === "step" ? (
              <>
                <span className={cn(CELL, ladder.moves === "reps" ? "font-bold" : "text-text-muted")}>
                  {ladder.moves === "reps" ? ladder.next : "="}
                </span>
                <span className={cn(CELL, ladder.moves !== "reps" ? "font-bold" : "text-text-muted")}>
                  {ladder.moves === "reps" ? "=" : ladder.next}
                </span>
              </>
            ) : (
              <span className={cn(CELL, "basis-24")}>holds as written</span>
            )}
          </div>
        )}
        <p className="pl-1 font-mono text-[11px] leading-snug text-text-muted">
          {ladder.kind === "step" ? (
            <>
              when {ladder.when}
              {ladder.otherwise ? <> · {ladder.otherwise}</> : null}
            </>
          ) : (
            ladder.reason
          )}
        </p>
      </div>

      <HarderVariationOffer sessionId={sessionId} position={p.position} offer={props.harderVariation} />

      {showScheme ? (
        <div className="flex flex-col gap-2 border-t border-border pt-2.5">
          <button
            type="button"
            onClick={() => setPicking((open) => !open)}
            aria-expanded={picking}
            className="flex items-center justify-between gap-2 text-left"
          >
            <span className="label-mono text-[9px] text-text-muted">PROGRESSION</span>
            <span className="flex items-center gap-1.5 font-mono text-[12px] text-text-primary">
              <TrendingUp className="h-3.5 w-3.5 text-cyan" aria-hidden />
              {schemeLabel(scheme.choice)}
              <ChevronDown
                className={cn("h-3.5 w-3.5 text-text-muted transition-transform motion-reduce:transition-none", picking && "rotate-180")}
                aria-hidden
              />
            </span>
          </button>
          {picking ? (
            <div role="radiogroup" aria-label="Progression scheme" className="flex flex-col gap-1">
              {schemeModel.options.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={scheme.choice === option.value}
                  onClick={() => scheme.setChoice(option.value)}
                  className={cn(
                    "flex flex-col gap-0.5 rounded-sm border px-3 py-2 text-left transition-colors",
                    scheme.choice === option.value ? "border-cyan bg-cyan-dim" : "border-border hover:border-border-lite",
                  )}
                >
                  <span className="font-mono text-[12px] font-bold text-text-primary">{option.label}</span>
                  <span className="font-sans text-[12px] leading-snug text-text-secondary">
                    {schemePreview(option.value, schemeModel.reps, schemeModel.load)}
                  </span>
                </button>
              ))}
              <ApplyStub dirty={scheme.dirty} onApply={scheme.apply} applied={scheme.applied} />
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="group">
        <summary className="label-mono flex cursor-pointer list-none items-center gap-1 text-[9px] text-text-muted">
          <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
          ABOUT THIS EXERCISE
        </summary>
        <div className="pt-2">
          <Details p={p} />
        </div>
      </details>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// C — Ladder. The numbers become tiles (the scannable part), and progression gets the visual
// weight: scheme chips on top, then a vertical stepper NOW → IF → THEN / ELSE that re-draws the
// moment a chip is tapped, so a user compares schemes by what they *do*, not by name.

function Tile({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={cn("flex grow flex-col gap-0.5 rounded-sm bg-base px-2.5 py-2", wide ? "basis-28" : "basis-14")}>
      <span className="font-mono text-[17px] font-bold leading-tight text-text-primary">{value}</span>
      <span className="label-mono text-[9px] text-text-muted">{label}</span>
    </div>
  );
}

function Step({ tag, tone, children, last }: { tag: string; tone: "muted" | "cyan" | "magenta"; children: ReactNode; last?: boolean }) {
  return (
    <li className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "label-mono flex h-6 min-w-12 items-center justify-center rounded-sm px-1.5 text-[9px] font-bold",
            tone === "cyan" && "bg-cyan-dim text-cyan",
            tone === "magenta" && "bg-magenta-dim text-magenta",
            tone === "muted" && "bg-elevated text-text-muted",
          )}
        >
          {tag}
        </span>
        {last ? null : <span className="w-px grow bg-border" aria-hidden />}
      </div>
      <div className="min-w-0 pb-3 pt-0.5 font-mono text-[13px] leading-snug text-text-primary">{children}</div>
    </li>
  );
}

function LadderVariant(props: PrototypeCardProps) {
  const { prescription: p, superset, sessionId, unit, index, schemeModel, showScheme } = props;
  const scheme = useSchemeChoice(schemeModel);
  const ladder = ladderFor(scheme.choice, p.reps, schemeModel.load, unit);
  const load = loadText(p, unit);
  const rest = restText(p, superset);

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex items-start gap-3">
        <IndexTag index={index} />
        <div className="flex min-w-0 grow flex-col gap-1.5">
          <NameLink p={p} sessionId={sessionId} className="text-[16px]" />
          <Badges p={p} superset={superset} />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Tile label="SETS" value={p.sets} />
        <Tile label="REPS" value={prettyReps(p.reps)} />
        {load ? <Tile wide label="LOAD" value={<span className="text-[14px]">{load}</span>} /> : null}
        {rest ? <Tile label="REST" value={rest} /> : null}
      </div>

      <Details p={p} />

      <div className="flex flex-col gap-3 rounded-md border border-border p-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-cyan" aria-hidden />
          <span className="label-mono text-[10px] text-text-primary">PROGRESSION</span>
          {!showScheme ? (
            <span className="ml-auto font-mono text-[11px] text-text-muted">{schemeLabel(scheme.choice)}</span>
          ) : null}
        </div>
        {showScheme ? (
          <div role="radiogroup" aria-label="Progression scheme" className="flex flex-wrap gap-1.5">
            {schemeModel.options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={scheme.choice === option.value}
                onClick={() => scheme.setChoice(option.value)}
                className={cn(
                  "rounded-full border px-3 py-1.5 font-mono text-[11px] transition-colors",
                  scheme.choice === option.value
                    ? "border-cyan bg-cyan-dim text-cyan"
                    : "border-border text-text-secondary hover:border-border-lite",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {ladder.kind === "hold" ? (
          <ol className="flex list-none flex-col p-0">
            <Step tag="NOW" tone="muted">
              {p.sets} × {prettyReps(p.reps)}
              {load ? ` @ ${load}` : ""}
            </Step>
            <Step tag="HOLD" tone="muted" last>
              <span className="text-text-secondary">Stays exactly as written.</span>
              <span className="block text-[11px] text-text-muted">{ladder.reason}</span>
            </Step>
          </ol>
        ) : (
          <ol className="flex list-none flex-col p-0">
            <Step tag="NOW" tone="muted">
              {p.sets} × {prettyReps(p.reps)}
              {load ? ` @ ${load}` : ""}
            </Step>
            <Step tag="IF" tone="muted">
              <span className="text-text-secondary">{ladder.when}</span>
            </Step>
            <Step tag="THEN" tone="cyan" last={ladder.otherwise === null}>
              <span className="font-bold text-cyan">
                {ladder.moves === "reps" ? `${p.sets} × ${ladder.next}` : ladder.next}
              </span>
            </Step>
            {ladder.otherwise ? (
              <Step tag="ELSE" tone="magenta" last>
                <span className="text-text-secondary">{ladder.otherwise}</span>
              </Step>
            ) : null}
          </ol>
        )}
        {showScheme ? <ApplyStub dirty={scheme.dirty} onApply={scheme.apply} applied={scheme.applied} /> : null}
      </div>

      <HarderVariationOffer sessionId={sessionId} position={p.position} offer={props.harderVariation} />

      <div className="flex items-center gap-2">
        <SubstituteButton sessionId={sessionId} position={p.position} />
        <MoreSheet {...props} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------
// D — Compact + sheet. The page becomes a scannable list (16 movements fit in a few screens): one
// row per movement and a one-line "Next" strip. Everything else — the scheme choice with its full
// sentences, the description, Substitute, Remove — lives one tap away.

function CompactVariant(props: PrototypeCardProps) {
  const { prescription: p, superset, sessionId, unit, index, schemeModel, showScheme } = props;
  const scheme = useSchemeChoice(schemeModel);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const shown = ladderFor(scheme.applied, p.reps, schemeModel.load, unit);
  const load = loadText(p, unit);
  const rest = restText(p, superset);

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-start gap-2.5">
        <IndexTag index={index} />
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 grow flex-col gap-0.5 text-left"
        >
          <span className="break-words text-pretty font-display text-[15px] font-semibold leading-tight text-text-primary">
            {p.exercise_name}
          </span>
          <span className="font-mono text-[12px] text-text-secondary">
            <span className="font-bold text-text-primary">
              {p.sets} × {prettyReps(p.reps)}
            </span>
            {load ? ` · ${load}` : ""}
            {rest ? ` · ${rest}` : ""}
          </span>
        </button>
        <MoreSheet {...props} withSubstitute />
      </div>

      <button
        type="button"
        disabled={!showScheme}
        onClick={() => setSheetOpen(true)}
        className="flex items-center gap-2 rounded-sm bg-base px-2.5 py-2 text-left disabled:cursor-default"
      >
        {shown.kind === "step" ? (
          <TrendingUp className="h-3.5 w-3.5 shrink-0 text-cyan" aria-hidden />
        ) : (
          <Minus className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden />
        )}
        <span className="min-w-0 grow font-mono text-[11px] leading-snug">
          {shown.kind === "step" ? (
            <>
              <span className="font-bold text-cyan">Next {shown.next}</span>
              <span className="text-text-muted"> when {shown.when}</span>
            </>
          ) : (
            <span className="text-text-muted">Holds as written · {schemeLabel(scheme.applied)}</span>
          )}
        </span>
        {showScheme ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden /> : null}
      </button>

      {open ? (
        <div className="flex flex-col gap-2 pl-[2.375rem]">
          <Badges p={p} superset={superset} />
          <Details p={p} />
          <Link
            {...NAV_FORWARD}
            href={appendFrom(`/exercises/${p.exercise_id}`, `/sessions/${sessionId}`)}
            className="font-mono text-[11px] text-cyan hover:underline"
          >
            Open exercise →
          </Link>
        </div>
      ) : null}

      <HarderVariationOffer sessionId={sessionId} position={p.position} offer={props.harderVariation} />

      {sheetOpen ? (
        <ActionSheetPanel title={`Progression · ${p.exercise_name}`} onClose={() => setSheetOpen(false)}>
          <div role="radiogroup" aria-label="Progression scheme" className="flex flex-col gap-1.5 px-4 pb-2">
            {schemeModel.options.map((option) => {
              const ladder = ladderFor(option.value, p.reps, schemeModel.load, unit);
              const checked = scheme.choice === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => scheme.setChoice(option.value)}
                  className={cn(
                    "flex flex-col gap-1 rounded-sm border px-3 py-2.5 text-left transition-colors",
                    checked ? "border-cyan bg-cyan-dim" : "border-border hover:border-border-lite",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[12px] font-bold text-text-primary">{option.label}</span>
                    <span className={cn("font-mono text-[11px]", ladder.kind === "step" ? "text-cyan" : "text-text-muted")}>
                      {ladder.kind === "step" ? `→ ${ladder.next}` : "holds"}
                    </span>
                  </span>
                  <span className="font-sans text-[12px] leading-snug text-text-secondary">
                    {schemePreview(option.value, schemeModel.reps, schemeModel.load)}
                  </span>
                </button>
              );
            })}
            <ApplyStub
              dirty={scheme.dirty}
              onApply={() => {
                scheme.apply();
                setSheetOpen(false);
              }}
              applied={scheme.applied}
            />
          </div>
        </ActionSheetPanel>
      ) : null}
    </Card>
  );
}
