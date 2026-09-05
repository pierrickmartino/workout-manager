"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { loadKindOptions } from "@/lib/load";
import {
  prescriptionSummaryChips,
  restSecondsFromInput,
} from "@/lib/prescription-summary";
import { SET_TYPE_OPTIONS, resolveSetType } from "@/lib/set-type-view";
import {
  AMOUNT_KIND_OPTIONS,
  DISTANCE_UNIT_OPTIONS,
  type DistanceUnit,
  type QuantityKind,
} from "@/lib/quantity";
import { cn } from "@/lib/utils";
import { weightUnitLabel } from "@/lib/weight-format";
import type { WeightUnit } from "@/lib/weight-unit";
import { FieldLabel } from "@/components/pulse/field";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

// The one shared, presentation-only Exercise Prescription field stack (ADR-0067, #464/#465). The
// three authoring surfaces — the Protocol Builder card, the standalone-Session **Insert** editor,
// and the **Hand-Authored** form — used to render these fields three different ways; this component
// collapses the frequent path onto one layout so authoring a prescription looks and behaves
// identically wherever it happens, and gives the Builder card the typed **Quantity** kind selector
// the ad-hoc surfaces already had.
//
// It owns **only the field stack** and holds **no domain state of its own** (ADR-0067): every plan
// value is a display string it renders and every edit is a callback the surface owns. The one bit
// of state it does keep is the **ephemeral** open/closed state of the progressive-disclosure
// **More** area (#465) — per-card, per-render, deliberately *not* an Interface Preference
// (ADR-0047/0055): it steers nothing about the plan and is not worth syncing across devices, so it
// lives as plain React state that resets on every fresh render. Each surface keeps its own
// surrounding chrome (the Builder's drag/reorder/superset/remove controls, Insert's add
// affordance, the Hand-Authored list) and threads its own draft in and out.
//
// **Progressive disclosure** (#465): the frequent path — Quantity (kind + optional distance unit),
// Sets, the typed target, and the optional Load — stays always visible. The advanced fields —
// Tempo, Rest, the **Set Type** (#466), and the surface's `advanced` slot (the Builder's
// Progression Scheme selector, the Hand-Authored Note + Target Effort) — collapse behind **More**.
// When collapsed the card shows a
// **Prescription Summary** (`lib/prescription-summary`): compact chips for only the non-default
// advanced values, so a plain working set reads clean. A card **auto-expands** when any advanced
// value is non-default, so nothing meaningful is hidden on first view. The **Scheme Preview**
// sentence (the surface's `preview` slot) is *not* a chip — it stands on its own line whether More
// is open or closed.

// The plan-side target is one free-text field whatever the kind (ADR-0032); only its label and
// placeholder follow the Quantity kind, so a timed hold reads as a hold and a run as a distance
// rather than a "rep target".
function targetLabelFor(kind: QuantityKind): string {
  switch (kind) {
    case "duration":
      return "Hold (time)";
    case "distance":
      return "Distance";
    default:
      return "Reps";
  }
}

function targetPlaceholderFor(kind: QuantityKind): string {
  switch (kind) {
    case "duration":
      return "45s";
    case "distance":
      return "5 km";
    default:
      return "8-12";
  }
}

export interface PrescriptionFieldStackProps {
  // The movement's name, woven into each field's accessible label so a screen reader hears
  // which exercise a control belongs to.
  exerciseName: string;
  // The reader's Weight Unit (#417): the Load picker names it and the value is authored in it.
  weightUnit: WeightUnit;
  // Frequent path — the typed Quantity, Sets, and the free-text target.
  kind: QuantityKind;
  // The distance unit; only rendered (and meaningful) when the kind is `distance`.
  unit: DistanceUnit;
  sets: string;
  target: string;
  // Advanced fields, collapsed behind **More** (#465).
  restSeconds: string;
  tempo: string;
  // The Set Type (ADR-0065, #466): the stored value ("" for unset), shown behind **More** as a
  // curated selector that leads with Warm-up and defaults to Working. An unset or working value
  // is the quiet default — it renders no summary chip and never forces the card open. Shared by
  // all three authoring surfaces, so it lives here rather than in any one surface's slot.
  setType: string;
  // The typed Load (ADR-0010): the picked kind and its value field — on the frequent path.
  loadKind: string;
  loadValue: string;
  // Whether to render the per-movement Rest field. False for a grouped Superset member, whose
  // rest is the group's round-rest and lives on the container instead (ADR-0023). A grouped
  // member therefore also carries no rest chip in its summary.
  showRest: boolean;
  // The surface owns the effect of picking a kind: the ad-hoc surfaces re-default the Load kind
  // for the new Quantity (bodyweight for a hold, absolute for reps), the Builder leaves its
  // stored Load untouched. The component just reports the pick.
  onChangeKind: (kind: QuantityKind) => void;
  onChangeUnit: (unit: DistanceUnit) => void;
  onChangeSets: (value: string) => void;
  onChangeTarget: (value: string) => void;
  onChangeRest: (value: string) => void;
  onChangeTempo: (value: string) => void;
  // Report the picked Set Type — a raw catalog member string. The surface stores it (mapping
  // the working default back to unset via `planSetType`), so the component reports the pick and
  // holds no domain state.
  onChangeSetType: (value: string) => void;
  onChangeLoadKind: (value: string) => void;
  onChangeLoadValue: (value: string) => void;
  // Surface-specific advanced fields rendered inside the **More** area, below Rest + Tempo (the
  // Builder's Progression Scheme selector; the Hand-Authored Note + Target Effort). Omitted by
  // Insert.
  advanced?: React.ReactNode;
  // The always-visible line under the disclosure — the **Scheme Preview** sentence (#452). It
  // stands in for the Progression Scheme whether More is open or closed and is never a summary
  // chip (CONTEXT: Prescription Summary). Omitted by surfaces that render no scheme.
  preview?: React.ReactNode;
  // Whether the surface's opaque `advanced` slot currently holds a non-default value that should
  // force the card open, so nothing meaningful is hidden on first view (#465). The component can't
  // read into that slot, so the surface reports it: Hand-Authored sets it for a non-blank Note or
  // Target Effort; the Builder leaves it false — its scheme selector isn't a hidden value, the
  // always-visible Scheme Preview line stands in for it.
  advancedNonDefault?: boolean;
}

export function PrescriptionFieldStack({
  exerciseName,
  weightUnit,
  kind,
  unit,
  sets,
  target,
  restSeconds,
  tempo,
  setType,
  loadKind,
  loadValue,
  showRest,
  onChangeKind,
  onChangeUnit,
  onChangeSets,
  onChangeTarget,
  onChangeRest,
  onChangeTempo,
  onChangeSetType,
  onChangeLoadKind,
  onChangeLoadValue,
  advanced,
  preview,
  advancedNonDefault = false,
}: PrescriptionFieldStackProps): React.JSX.Element {
  const name = exerciseName;
  const isDistance = kind === "distance";
  const targetLabel = targetLabelFor(kind);

  // The advanced values the Prescription Summary reasons about. A grouped member's rest belongs to
  // the group (ADR-0023), so it is excluded here — a member's summary never carries a rest chip.
  // A non-working Set Type earns its own chip (and, via the seed below, opens the card).
  const summaryChips = prescriptionSummaryChips({
    tempo,
    restSeconds: showRest ? restSecondsFromInput(restSeconds) : null,
    setType,
  });

  // Open/closed is ephemeral React state (#465): seeded once so a card with any non-default
  // advanced value opens expanded and a plain set opens collapsed, then freely toggled. It never
  // persists — a fresh render (reload, remount) re-seeds. The seed mirrors `shouldAutoExpand`
  // (a chip means a non-default summarized value) and adds the surface's advanced-slot signal, so
  // a Hand-Authored Note or Target Effort — behind More but not yet a chip — still opens the card.
  const [open, setOpen] = React.useState<boolean>(
    () => summaryChips.length > 0 || advancedNonDefault,
  );
  const contentId = React.useId();

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <FieldLabel label="Quantity">
          <Select
            value={kind}
            onChange={(event) => onChangeKind(event.target.value as QuantityKind)}
            aria-label={`Quantity kind for ${name}`}
          >
            {AMOUNT_KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FieldLabel>
        {/* A distance movement reads in one unit, chosen once here and applied to every set
            (ADR-0032). Hidden for the other kinds, which carry no unit. */}
        {isDistance ? (
          <FieldLabel label="Unit">
            <Select
              value={unit}
              onChange={(event) => onChangeUnit(event.target.value as DistanceUnit)}
              aria-label={`Distance unit for ${name}`}
            >
              {DISTANCE_UNIT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FieldLabel>
        ) : null}
        <FieldLabel label="Sets">
          <Input
            type="number"
            min={1}
            value={sets}
            onChange={(event) => onChangeSets(event.target.value)}
            aria-label={`Sets for ${name}`}
          />
        </FieldLabel>
        <FieldLabel label={targetLabel}>
          <Input
            value={target}
            placeholder={targetPlaceholderFor(kind)}
            onChange={(event) => onChangeTarget(event.target.value)}
            aria-label={`${targetLabel} for ${name}`}
          />
        </FieldLabel>
        {/* Load is a typed value (ADR-0010): pick the kind, then give the value that kind
            carries — the same picker the log form uses. On the frequent path (ADR-0067). */}
        <FieldLabel label="Load kind">
          <Select
            value={loadKind}
            onChange={(event) => onChangeLoadKind(event.target.value)}
            aria-label={`Load kind for ${name}`}
          >
            {loadKindOptions(weightUnit).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </FieldLabel>
        <FieldLabel label="Load">
          <Input
            value={loadValue}
            placeholder={`60 ${weightUnitLabel(weightUnit)}`}
            onChange={(event) => onChangeLoadValue(event.target.value)}
            aria-label={`Load for ${name}`}
          />
        </FieldLabel>
      </div>

      <div className="flex flex-col gap-2.5">
        {/* Prescription Summary (#465): compact chips for the non-default advanced values,
            shown only while More is collapsed so a set's tempo/rest read at a glance without
            expanding. A plain set has no chips and this row disappears entirely. */}
        {!open && summaryChips.length > 0 ? (
          <ul
            className="flex flex-wrap gap-1.5"
            aria-label={`Prescription summary for ${name}`}
          >
            {summaryChips.map((chip) => (
              <li key={chip.key}>
                <Badge variant="outline" aria-label={chip.ariaLabel}>
                  {chip.label}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        {/* The More disclosure — a standard button/region pair (aria-expanded + aria-controls)
            so keyboard and screen-reader users operate and hear it, matching the Builder's
            accessibility floor (ADR-0027). The accessible name leads with the visible "More"/
            "Less" word (WCAG 2.5.3) and adds the exercise so one card's control is
            distinguishable from the next. */}
        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={`${open ? "Less" : "More"} — advanced fields for ${name}`}
          className="label-mono flex items-center gap-1 self-start rounded-sm text-[10px] text-text-muted transition-colors hover:text-text-primary"
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
            aria-hidden
          />
          {open ? "Less" : "More"}
        </button>

        <div
          id={contentId}
          hidden={!open}
          className="flex flex-col gap-2.5 border-l border-border pl-2.5"
        >
          <div className="grid grid-cols-2 gap-2.5">
            {/* A grouped member rests once per round at the group level, so its own rest is
                dormant while grouped — hidden here and restored on ungroup (ADR-0023). */}
            {showRest ? (
              <FieldLabel label="Rest (sec)">
                <Input
                  type="number"
                  min={0}
                  value={restSeconds}
                  placeholder="90"
                  onChange={(event) => onChangeRest(event.target.value)}
                  aria-label={`Rest seconds for ${name}`}
                />
              </FieldLabel>
            ) : null}
            <FieldLabel label="Tempo">
              <Input
                value={tempo}
                placeholder="3-1-1"
                onChange={(event) => onChangeTempo(event.target.value)}
                aria-label={`Tempo for ${name}`}
              />
            </FieldLabel>
            {/* Set Type (ADR-0065, #466): a curated annotation on the movement line —
                Warm-up / Working / Drop set / To failure / AMRAP. It is descriptive only
                (it feeds no progression); leaving it Working keeps the set a plain working
                set and shows no summary chip. The value resolves for display so an unset
                (or legacy) value reads as Working rather than a blank option. */}
            <FieldLabel label="Set type">
              <Select
                value={resolveSetType(setType)}
                onChange={(event) => onChangeSetType(event.target.value)}
                aria-label={`Set type for ${name}`}
              >
                {SET_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FieldLabel>
          </div>
          {advanced}
        </div>

        {/* The Scheme Preview line stands on its own, visible whether More is open or closed
            (CONTEXT: Prescription Summary; #465). */}
        {preview}
      </div>
    </>
  );
}
