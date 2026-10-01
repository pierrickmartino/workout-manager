"use client";

import { type LoadKind } from "@/lib/load";
import { toIntOrZero } from "@/lib/numeric-input";
import {
  DEFAULT_SCHEME,
  compatibleSchemesForInput,
  currentScheme,
} from "@/lib/scheme-view";
import { schemePreviewForInput } from "@/lib/scheme-preview";
import { planSetType } from "@/lib/set-type-view";
import { targetEffortFromInput } from "@/lib/target-effort-view";
import { DEFAULT_EFFORT_SCALE } from "@/lib/effort";
import { PrescriptionFieldStack } from "@/components/prescription/PrescriptionFieldStack";
import { Select } from "@/components/ui/select";
import { SupersetBadge } from "@/components/builder/prescription-row-parts";
import { usePrescriptionDraft } from "@/components/builder/prescription-draft-context";

// The editable card for one Prescription in an un-performed Session: the shared authoring field
// stack (ADR-0067) wired to the draft, plus the Builder's own advanced field (the Progression
// Scheme) and its preview sentence.
//
// `position` is the whole prop list (ADR-0105). Every value it renders and every edit it raises
// comes from `PrescriptionDraftContext`, so this card is reachable from any row surface without
// a chain of intermediaries re-declaring the seven callbacks it used to take.
export function PrescriptionEditor({ position }: { position: number }) {
  const {
    state: { prescriptions, layout, unit },
    actions: { dispatch },
  } = usePrescriptionDraft();
  const prescription = prescriptions[position];
  const slot = layout[position];
  const name = prescription.exerciseName;
  // While grouped, a member's own rest is dormant (ADR-0023): the group rests once per round, so
  // the per-member Rest input collapses and the single round-rest field shows on the group's
  // container instead. Ungrouping brings the member's rest input back.
  const grouped = slot.group !== null;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
      <span className="flex items-center gap-2">
        {slot.memberLabel ? <SupersetBadge label={slot.memberLabel} /> : null}
        <span className="font-display text-[14px] font-semibold text-text-primary">
          {name}
        </span>
      </span>

      {/* The authored plan — the one shared, presentation-only field stack every authoring
          surface now renders (ADR-0067, #464). Extracting it hands the Builder card the typed
          Quantity kind selector the ad-hoc surfaces already carried, so a duration/distance is
          authored honestly rather than forced into a rep string. The Progression Scheme (the
          Builder's own advanced field) rides in the `advanced` slot. */}
      <PrescriptionFieldStack
        exerciseName={name}
        // The composition strip above shows this exercise's warm-up under the WARM-UP band, so
        // don't repeat a warm-up chip on the row (ADR-0074).
        suppressWarmUpSummaryChip
        weightUnit={unit}
        kind={prescription.quantityKind}
        unit={prescription.quantityUnit}
        sets={String(prescription.sets)}
        target={prescription.reps}
        restSeconds={
          prescription.restSeconds === null ? "" : String(prescription.restSeconds)
        }
        tempo={prescription.tempo ?? ""}
        setType={prescription.setType ?? ""}
        // Target Effort (ADR-0066, #467): the draft holds the typed value, so project it back to
        // the editor's scale pick + display value; an unset target defaults the scale and leaves
        // the value blank. The onChange parses the pair back to the typed value (or null).
        targetEffortScale={prescription.targetEffort?.scale ?? DEFAULT_EFFORT_SCALE}
        targetEffortValue={
          prescription.targetEffort ? String(prescription.targetEffort.value) : ""
        }
        // Exercise Note (ADR-0065, #468): the draft holds the decoded cue (see
        // `initBuilderDraft`), so it renders directly; a null note is an empty field.
        note={prescription.note ?? ""}
        loadKind={prescription.loadKind}
        loadValue={prescription.loadValue}
        showRest={!grouped}
        // Picking a Quantity kind fixes what the target means; unlike the ad-hoc surfaces the
        // Builder does not re-default the Load, so a generated Load the user is editing is
        // never silently discarded.
        onChangeKind={(quantityKind) =>
          dispatch({
            type: "SET_QUANTITY",
            position,
            quantityKind,
            quantityUnit: prescription.quantityUnit,
          })
        }
        onChangeUnit={(quantityUnit) =>
          dispatch({
            type: "SET_QUANTITY",
            position,
            quantityKind: prescription.quantityKind,
            quantityUnit,
          })
        }
        onChangeSets={(value) =>
          dispatch({
            type: "EDIT_PRESCRIPTION",
            position,
            field: "sets",
            value: toIntOrZero(value),
          })
        }
        onChangeTarget={(value) =>
          dispatch({ type: "EDIT_PRESCRIPTION", position, field: "reps", value })
        }
        onChangeRest={(value) =>
          dispatch({
            type: "EDIT_PRESCRIPTION",
            position,
            field: "restSeconds",
            value: value === "" ? null : toIntOrZero(value),
          })
        }
        onChangeTempo={(value) =>
          dispatch({
            type: "EDIT_PRESCRIPTION",
            position,
            field: "tempo",
            value: value === "" ? null : value,
          })
        }
        // The working default is stored as unset (null) so a plain set carries no annotation;
        // any non-working member is stored as-is and rides through DEPLOY (#463/#466).
        onChangeSetType={(value) =>
          dispatch({ type: "SET_SET_TYPE", position, setType: planSetType(value) })
        }
        // A blank value clears the target (null); any value rides onto the picked scale and
        // through DEPLOY untouched (#463). Descriptive only — it feeds no progression (ADR-0066).
        onChangeTargetEffort={(scale, value) =>
          dispatch({
            type: "SET_TARGET_EFFORT",
            position,
            targetEffort: targetEffortFromInput(scale, value),
          })
        }
        // A blank value clears the note (null); any text rides through DEPLOY, where the write
        // boundary length-caps + HTML-escapes it (ADR-0065, #468). Descriptive only.
        onChangeNote={(value) =>
          dispatch({
            type: "SET_NOTE",
            position,
            note: value.trim() === "" ? null : value,
          })
        }
        onChangeLoadKind={(value) =>
          dispatch({
            type: "EDIT_LOAD",
            position,
            loadKind: value as LoadKind,
            loadValue: prescription.loadValue,
          })
        }
        onChangeLoadValue={(value) =>
          dispatch({
            type: "EDIT_LOAD",
            position,
            loadKind: prescription.loadKind,
            loadValue: value,
          })
        }
        advanced={
          /* Progression Scheme (ADR-0064, #432): how this movement's un-performed tail steps.
             The selector lives inside **More** (#465). Only schemes compatible with the current
             Load are offered — Greyskull disappears the moment the Load has no clean kilogram
             axis — so an incompatible choice can't be staged. Selecting the default clears the
             stored selection (null ⇒ default). */
          <label className="flex flex-col gap-1.5">
            <span className="label-mono text-[9px] text-text-muted">
              Progression scheme
            </span>
            <Select
              value={currentScheme(prescription)}
              aria-label={`Progression scheme for ${name}`}
              onChange={(e) =>
                dispatch({
                  type: "SET_SCHEME",
                  position,
                  scheme:
                    e.target.value === DEFAULT_SCHEME ? null : e.target.value,
                })
              }
            >
              {compatibleSchemesForInput(
                prescription.loadKind,
                prescription.loadValue,
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
        }
        preview={
          /* Scheme Preview (ADR-0064/0065, #452): a plain-language sentence describing what the
             chosen scheme will do next, from this movement's live reps + Load. It stands in for
             the scheme on its own line whether More is open or closed (never a summary chip,
             #465), and recomputes as the scheme, reps, or Load fields change — a read-time
             projection that stores nothing. */
          <span
            aria-live="polite"
            className="font-mono text-[11px] leading-snug text-text-muted"
          >
            {schemePreviewForInput(
              currentScheme(prescription),
              prescription.reps,
              prescription.loadKind,
              prescription.loadValue,
            )}
          </span>
        }
      />
    </div>
  );
}
