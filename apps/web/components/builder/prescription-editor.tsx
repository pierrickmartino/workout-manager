"use client";

import {
  DEFAULT_SCHEME,
  compatibleSchemesForInput,
  currentScheme,
} from "@/lib/scheme-view";
import { schemePreviewForInput } from "@/lib/scheme-preview";
import {
  builderControlValues,
  builderPrescriptionEvent,
  prescriptionControlSet,
} from "@/lib/prescription-controls";
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
        weightUnit={unit}
        // The Builder authors every control; the composition strip above shows this exercise's
        // warm-up under the WARM-UP band, so its preset drops the row's warm-up chip (ADR-0074).
        controls={prescriptionControlSet("builder", { grouped })}
        value={builderControlValues(prescription)}
        // Unlike the ad-hoc surfaces, a Quantity pick leaves the Load alone, so a generated Load
        // the user is editing is never silently discarded (`builderPrescriptionEvent`).
        onChange={(edit) => dispatch(builderPrescriptionEvent(position, prescription, edit))}
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
