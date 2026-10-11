"use client";

import * as React from "react";
import { ChevronDown, StickyNote } from "@/components/pulse/icons";

import { loadKindOptions } from "@/lib/load";
import {
  prescriptionSummaryChips,
  restSecondsFromInput,
  type PrescriptionSummaryChip,
} from "@/lib/prescription-summary";
import {
  DEFAULT_EFFORT_SCALE,
  KNOWN_EFFORT_SCALES,
  effortScaleLabel,
  type EffortScale,
} from "@/lib/effort";
import { targetEffortFromInput } from "@/lib/target-effort-view";
import { SET_TYPE_OPTIONS, resolveSetType } from "@/lib/set-type-view";
import {
  AMOUNT_KIND_OPTIONS,
  DISTANCE_UNIT_OPTIONS,
  type DistanceUnit,
  type QuantityKind,
} from "@/lib/quantity";
import {
  type PrescriptionControlEdit,
  type PrescriptionControlSet,
  type PrescriptionControlValues,
} from "@/lib/prescription-controls";
import { cn } from "@/lib/utils";
import type { WeightUnit } from "@/lib/weight-unit";
import { FieldLabel } from "@/components/pulse/field";
import { LoadValueInput } from "@/components/pulse/load-value-input";
import { FieldRow, FIELD_WIDTH } from "@/components/pulse/field-row";
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
// value is a display string it renders and every edit is one `onChange` the surface owns. Which
// controls it renders is the surface's declared preset (`lib/prescription-controls`, ADR-0129),
// never inferred from which handlers were passed. The one bit
// of state it does keep is the **ephemeral** open/closed state of the progressive-disclosure
// **More** area (#465) — per-card, per-render, deliberately *not* an Interface Preference
// (ADR-0047/0055): it steers nothing about the plan and is not worth syncing across devices, so it
// lives as plain React state that resets on every fresh render. Each surface keeps its own
// surrounding chrome (the Builder's drag/reorder/superset/remove controls, Insert's add
// affordance, the Hand-Authored list) and threads its own draft in and out.
//
// **Progressive disclosure** (#465): the frequent path — Quantity (kind + optional distance unit),
// Sets, the typed target, and the optional Load — stays always visible. The advanced fields —
// Tempo, Rest, the **Set Type** (#466), the optional **Target Effort** (#467), the optional
// **Exercise Note** (#468), and the surface's `advanced` slot (the Builder's Progression Scheme
// selector) — collapse behind **More**.
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

// A summary chip's visible content: an icon for a chip that names one (the Exercise Note, whose
// presence — not its text — is the signal, #468), else its label text. The Badge already carries
// the chip's `ariaLabel`, so the icon is decorative (`aria-hidden`) and a screen reader hears the
// spoken form rather than an unlabeled graphic.
function chipContent(chip: PrescriptionSummaryChip): React.ReactNode {
  if (chip.icon === "note") {
    return <StickyNote className="h-3.5 w-3.5" aria-hidden />;
  }
  return chip.label;
}

export interface PrescriptionFieldStackProps {
  // The movement's name, woven into each field's accessible label so a screen reader hears
  // which exercise a control belongs to.
  exerciseName: string;
  // The reader's Weight Unit (#417): the Load picker names it and the value is authored in it.
  weightUnit: WeightUnit;
  // Which controls this row renders and how its summary reads, from the surface's declared
  // preset (`prescriptionControlSet`, ADR-0129). A control outside the set is not rendered and
  // earns no summary chip, so a surface opts out by its preset, never by omitting a handler.
  controls: PrescriptionControlSet;
  // Every plan value as the display string the surface holds (ADR-0067).
  value: PrescriptionControlValues;
  // One edit, reported as the field and its new value. The surface owns what it means: the
  // ad-hoc surfaces patch their row, re-defaulting the Load kind on a kind pick; the Builder
  // dispatches an event and leaves its stored Load untouched.
  onChange: (edit: PrescriptionControlEdit) => void;
  // Surface-specific advanced fields rendered inside the **More** area, below the shared advanced
  // controls (the Builder's Progression Scheme selector).
  advanced?: React.ReactNode;
  // The always-visible line under the disclosure — the **Scheme Preview** sentence (#452). It
  // stands in for the Progression Scheme whether More is open or closed and is never a summary
  // chip (GLOSSARY: Prescription Summary). Omitted by surfaces that render no scheme.
  preview?: React.ReactNode;
}

export function PrescriptionFieldStack({
  exerciseName,
  weightUnit,
  controls: { controls, suppressWarmUpSummaryChip },
  value: {
    kind,
    unit,
    sets,
    target,
    restSeconds,
    tempo,
    setType,
    targetEffortScale = DEFAULT_EFFORT_SCALE,
    targetEffortValue = "",
    note = "",
    loadKind,
    loadValue,
  },
  onChange,
  advanced,
  preview,
}: PrescriptionFieldStackProps): React.JSX.Element {
  const name = exerciseName;
  const isDistance = kind === "distance";
  const targetLabel = targetLabelFor(kind);

  // The picked Target Effort scale is ephemeral React state, the same species as the open/closed
  // state below: a scale means nothing to the plan until a value rides onto it, so a surface that
  // derives its stored scale from the typed value (the Builder) would otherwise snap the selector
  // back to the default the instant a user picks a scale *before* typing. Seeding the pick here
  // lets the user choose a scale first and then type; the value stays the controlled prop, and
  // every edit still reports the `(scale, value)` pair the surface stores and round-trips. Seeded
  // from the incoming scale so a stored target shows the scale it was prescribed in.
  const [effortScale, setEffortScale] = React.useState<EffortScale>(targetEffortScale);

  // The typed Target Effort the summary reasons about, parsed from the picked scale + value — the
  // one seam the editor's strings become the typed value (scale-faithful, no conversion). Null
  // (no target) when the row has no Target Effort control or the value is blank, so it earns no
  // chip.
  const targetEffort = controls.has("targetEffort")
    ? targetEffortFromInput(effortScale, targetEffortValue)
    : null;

  // The advanced values the Prescription Summary reasons about, each only when its control is on
  // this row: a note-less surface never manufactures a note chip, and a grouped member's rest
  // belongs to the group (ADR-0023), so its summary never carries a rest chip. A non-working Set
  // Type, a set Target Effort, or a present Exercise Note earns its own chip (and, via the seed
  // below, opens the card).
  const summaryChips = prescriptionSummaryChips(
    {
      tempo: controls.has("tempo") ? tempo : "",
      restSeconds: controls.has("rest") ? restSecondsFromInput(restSeconds) : null,
      setType: controls.has("setType") ? setType : "",
      targetEffort,
      note: controls.has("note") ? note : null,
    },
    { suppressWarmUpSetType: suppressWarmUpSummaryChip },
  );

  // Open/closed is ephemeral React state (#465): seeded once so a card with any non-default
  // advanced value opens expanded and a plain set opens collapsed, then freely toggled. It never
  // persists — a fresh render (reload, remount) re-seeds. The seed mirrors `shouldAutoExpand`: a
  // chip means a non-default summarized value.
  const [open, setOpen] = React.useState<boolean>(() => summaryChips.length > 0);
  const contentId = React.useId();

  return (
    <>
      <FieldRow>
        {controls.has("quantity") ? (
          <>
            <FieldLabel className={FIELD_WIDTH} label="Quantity">
              <Select
                value={kind}
                onChange={(event) =>
                  onChange({ field: "kind", value: event.target.value as QuantityKind })
                }
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
              <FieldLabel className={FIELD_WIDTH} label="Unit">
                <Select
                  value={unit}
                  onChange={(event) =>
                    onChange({ field: "unit", value: event.target.value as DistanceUnit })
                  }
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
          </>
        ) : null}
        {controls.has("sets") ? (
          <FieldLabel className={FIELD_WIDTH} label="Sets">
            <Input
              type="number"
              min={1}
              value={sets}
              onChange={(event) => onChange({ field: "sets", value: event.target.value })}
              aria-label={`Sets for ${name}`}
            />
          </FieldLabel>
        ) : null}
        {controls.has("target") ? (
          <FieldLabel className={FIELD_WIDTH} label={targetLabel}>
            <Input
              spellCheck={false}
              value={target}
              placeholder={targetPlaceholderFor(kind)}
              onChange={(event) => onChange({ field: "target", value: event.target.value })}
              aria-label={`${targetLabel} for ${name}`}
            />
          </FieldLabel>
        ) : null}
        {/* Load is a typed value (ADR-0010): pick the kind, then give the value that kind
            carries — the same picker the log form uses. On the frequent path (ADR-0067). */}
        {controls.has("load") ? (
          <>
            <FieldLabel className={FIELD_WIDTH} label="Load kind">
              <Select
                value={loadKind}
                onChange={(event) => onChange({ field: "loadKind", value: event.target.value })}
                aria-label={`Load kind for ${name}`}
              >
                {loadKindOptions(weightUnit).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </FieldLabel>
            <FieldLabel className={FIELD_WIDTH} label="Load">
              <LoadValueInput
                kind={loadKind}
                unit={weightUnit}
                value={loadValue}
                onChange={(event) => onChange({ field: "loadValue", value: event.target.value })}
                aria-label={`Load for ${name}`}
              />
            </FieldLabel>
          </>
        ) : null}
      </FieldRow>

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
                  {chipContent(chip)}
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
            className={cn("h-3.5 w-3.5 transition-transform motion-reduce:transition-none", open && "rotate-180")}
            aria-hidden
          />
          {open ? "Less" : "More"}
        </button>

        <div
          id={contentId}
          hidden={!open}
          className="flex flex-col gap-2.5 border-l border-border pl-2.5"
        >
          <FieldRow>
            {/* A grouped member rests once per round at the group level, so its own rest is
                dormant while grouped — out of its control set and restored on ungroup
                (ADR-0023). */}
            {controls.has("rest") ? (
              <FieldLabel className={FIELD_WIDTH} label="Rest (sec)">
                <Input
                  type="number"
                  min={0}
                  value={restSeconds}
                  placeholder="90"
                  onChange={(event) =>
                    onChange({ field: "restSeconds", value: event.target.value })
                  }
                  aria-label={`Rest seconds for ${name}`}
                />
              </FieldLabel>
            ) : null}
            {controls.has("tempo") ? (
              <FieldLabel className={FIELD_WIDTH} label="Tempo">
                <Input
                  spellCheck={false}
                  value={tempo}
                  placeholder="3-1-1"
                  onChange={(event) => onChange({ field: "tempo", value: event.target.value })}
                  aria-label={`Tempo for ${name}`}
                />
              </FieldLabel>
            ) : null}
            {/* Set Type (ADR-0065, #466): a curated annotation on the movement line —
                Warm-up / Working / Drop set / To failure / AMRAP. It is descriptive only
                (it feeds no progression); leaving it Working keeps the set a plain working
                set and shows no summary chip. The value resolves for display so an unset
                (or legacy) value reads as Working rather than a blank option. */}
            {controls.has("setType") ? (
              <FieldLabel className={FIELD_WIDTH} label="Set type">
                <Select
                  value={resolveSetType(setType)}
                  onChange={(event) => onChange({ field: "setType", value: event.target.value })}
                  aria-label={`Set type for ${name}`}
                >
                  {SET_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FieldLabel>
            ) : null}
            {/* Target Effort (ADR-0066, #467): the prescribed Effort in either scale — pick a
                scale (RPE / RIR), then give a value; a blank value authors no target. Descriptive
                only (it feeds no progression, ADR-0066); a set target shows a scale-faithful
                summary chip and opens the card. The value's band is validated at the write
                boundary. */}
            {controls.has("targetEffort") ? (
              <>
                <FieldLabel className={FIELD_WIDTH} label="Target effort scale">
                  <Select
                    value={effortScale}
                    onChange={(event) => {
                      const scale = event.target.value as EffortScale;
                      setEffortScale(scale);
                      onChange({ field: "targetEffort", scale, value: targetEffortValue });
                    }}
                    aria-label={`Target effort scale for ${name}`}
                  >
                    {KNOWN_EFFORT_SCALES.map((scale) => (
                      <option key={scale} value={scale}>
                        {effortScaleLabel(scale)}
                      </option>
                    ))}
                  </Select>
                </FieldLabel>
                <FieldLabel className={FIELD_WIDTH} label="Target effort">
                  <Input
                    spellCheck={false}
                    value={targetEffortValue}
                    placeholder={effortScale === "rir" ? "e.g. 2" : "e.g. 8"}
                    onChange={(event) =>
                      onChange({
                        field: "targetEffort",
                        scale: effortScale,
                        value: event.target.value,
                      })
                    }
                    aria-label={`Target effort for ${name}`}
                  />
                </FieldLabel>
              </>
            ) : null}
          </FieldRow>
          {/* Exercise Note (ADR-0065, #468): an optional plan-side coaching cue as free text —
              "pause on the chest". A blank value authors no note; the backend length-caps and
              HTML-escapes it at the write boundary. Full-width below the two-column grid so a
              sentence-long cue has room. When present it shows a note icon in the collapsed
              summary and opens the card. */}
          {controls.has("note") ? (
            <FieldLabel label="Note">
              <Input
                value={note}
                placeholder="Optional cue (e.g. pause on the chest)"
                onChange={(event) => onChange({ field: "note", value: event.target.value })}
                aria-label={`Note for ${name}`}
              />
            </FieldLabel>
          ) : null}
          {advanced}
        </div>

        {/* The Scheme Preview line stands on its own, visible whether More is open or closed
            (GLOSSARY: Prescription Summary; #465). */}
        {preview}
      </div>
    </>
  );
}
