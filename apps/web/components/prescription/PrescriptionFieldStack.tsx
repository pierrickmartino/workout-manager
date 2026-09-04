"use client";

import * as React from "react";

import { loadKindOptions } from "@/lib/load";
import {
  AMOUNT_KIND_OPTIONS,
  DISTANCE_UNIT_OPTIONS,
  type DistanceUnit,
  type QuantityKind,
} from "@/lib/quantity";
import { weightUnitLabel } from "@/lib/weight-format";
import type { WeightUnit } from "@/lib/weight-unit";
import { FieldLabel } from "@/components/pulse/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

// The one shared, presentation-only Exercise Prescription field stack (ADR-0067, #464). The
// three authoring surfaces — the Protocol Builder card, the standalone-Session **Insert**
// editor, and the **Hand-Authored** form — used to render these fields three different ways;
// this component collapses the frequent path onto one layout so authoring a prescription looks
// and behaves identically wherever it happens, and gives the Builder card the typed **Quantity**
// kind selector the ad-hoc surfaces already had.
//
// It owns **only the field stack** and holds **no domain state of its own** (ADR-0067): every
// value is a display string it renders and every edit is a callback the surface owns. Each
// surface keeps its own surrounding chrome (the Builder's drag/reorder/superset/remove controls,
// Insert's add affordance, the Hand-Authored list) and threads its own draft in and out. The
// values arrive as strings because the surfaces store them differently (the Builder holds numbers
// and nulls, the ad-hoc surfaces hold strings); each adapts at this boundary.
//
// The **frequent path** — Quantity (kind + optional distance unit), Sets, the typed target, and
// the common Rest/Tempo/Load — renders here. Surface-specific advanced fields that are not yet
// universal (the Builder's Progression Scheme; the Hand-Authored Note and Target Effort) ride in
// the `advanced` slot, rendered below the grid; the progressive-disclosure **More** area that
// formalizes them is a later slice (#462). Insert passes no advanced fields.

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
  // Common advanced fields every surface already carried.
  restSeconds: string;
  tempo: string;
  // The typed Load (ADR-0010): the picked kind and its value field.
  loadKind: string;
  loadValue: string;
  // Whether to render the per-movement Rest field. False for a grouped Superset member, whose
  // rest is the group's round-rest and lives on the container instead (ADR-0023).
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
  onChangeLoadKind: (value: string) => void;
  onChangeLoadValue: (value: string) => void;
  // Surface-specific advanced fields rendered after the common grid (the Builder's Progression
  // Scheme; the Hand-Authored Note + Target Effort). Omitted by Insert.
  advanced?: React.ReactNode;
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
  loadKind,
  loadValue,
  showRest,
  onChangeKind,
  onChangeUnit,
  onChangeSets,
  onChangeTarget,
  onChangeRest,
  onChangeTempo,
  onChangeLoadKind,
  onChangeLoadValue,
  advanced,
}: PrescriptionFieldStackProps): React.JSX.Element {
  const name = exerciseName;
  const isDistance = kind === "distance";
  const targetLabel = targetLabelFor(kind);

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
        {/* A grouped member rests once per round at the group level, so its own rest is dormant
            while grouped — hidden here and restored on ungroup (ADR-0023). */}
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
        {/* Load is a typed value (ADR-0010): pick the kind, then give the value that kind
            carries — the same picker the log form uses. */}
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
      {advanced}
    </>
  );
}
