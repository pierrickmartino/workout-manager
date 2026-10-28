"use client";

import { useReducer, useTransition } from "react";
import { AlertTriangle, Check, Dumbbell, Loader2, Repeat2 } from "@/components/pulse/icons";

import {
  requestEquipmentSubstitutionPreview,
  submitEquipmentSubstitution,
} from "@/app/sessions/[id]/actions";
import {
  EQUIPMENT_SUBSTITUTION_LABEL,
  NOTHING_BLOCKED_NOTE,
  canConfirmEquipmentSubstitution,
  equipmentSubstitutionButtonView,
  equipmentSubstitutionReducer,
  initialEquipmentSubstitutionState,
  outcomeRows,
  outcomeSummary,
  previewRows,
  selectedPositions,
  type EquipmentSubstitutionState,
} from "@/lib/equipment-substitution";
import { liveSessionStandingOf } from "@/lib/live-session";
import { substituteEquipmentSummary } from "@/lib/substitute-equipment";
import { useConnectivity } from "@/lib/use-connectivity";
import { useResumableLiveSlot } from "@/lib/use-resumable-live-slot";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SubstituteEquipmentChips } from "@/components/SubstituteEquipmentChips";

interface EquipmentSubstitutionSheetProps {
  sessionId: number;
  // Whether single Substitute is offered (`substituteView`); withheld on a performed Protocol
  // Session, and so is this.
  showSubstitute: boolean;
  // The Profile's canonical Default Equipment, pre-filling the picker.
  defaultEquipment: readonly string[];
  // The step the sheet opens on: closed on the Session page. The `substitution` audit journey
  // seeds a later step, which otherwise only a preview or apply round trip reaches.
  initialState?: EquipmentSubstitutionState;
}

const PANEL_CLASS = "flex min-w-0 flex-col gap-3 rounded-sm border border-border-lite bg-base p-3";
const NOTE_CLASS = "font-mono text-[12px] text-text-muted";
const ERROR_CLASS = "font-mono text-[12px] text-magenta";

// "Missing equipment?" on the Session page (ADR-0143, #791): pick the equipment at hand, preview what
// it blocks, untick rows to keep, confirm, and read the outcome. Every rule lives in
// `lib/equipment-substitution.ts`; this only renders the step it is in.
export function EquipmentSubstitutionSheet({
  sessionId,
  showSubstitute,
  defaultEquipment,
  initialState = initialEquipmentSubstitutionState,
}: EquipmentSubstitutionSheetProps) {
  const [state, dispatch] = useReducer(equipmentSubstitutionReducer, initialState);
  const [, startTransition] = useTransition();
  const online = useConnectivity();
  const button = equipmentSubstitutionButtonView({
    sessionId,
    showSubstitute,
    liveSession: liveSessionStandingOf(useResumableLiveSlot()),
    online,
  });

  if (!button.visible) return null;

  if (state.step === "closed") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={button.disabled}
          onClick={() => dispatch({ type: "opened", defaultEquipment })}
        >
          <Dumbbell className="h-3.5 w-3.5" aria-hidden />
          {EQUIPMENT_SUBSTITUTION_LABEL}
        </Button>
        {button.note ? <span className={NOTE_CLASS}>{button.note}</span> : null}
      </div>
    );
  }

  const close = () => dispatch({ type: "closed" });

  if (state.step === "picking" || state.step === "loadingPreview") {
    const loading = state.step === "loadingPreview";
    const preview = () => {
      dispatch({ type: "previewRequested" });
      startTransition(async () => {
        const result = await requestEquipmentSubstitutionPreview(sessionId, state.equipment);
        dispatch(
          result.ok
            ? { type: "previewLoaded", rows: result.rows }
            : { type: "previewFailed", message: result.message },
        );
      });
    };
    return (
      <div className={PANEL_CLASS}>
        <SubstituteEquipmentChips
          label="Equipment you have"
          selected={state.equipment}
          onBodyweightOnly={() => dispatch({ type: "bodyweightOnlyChosen" })}
          onToggle={(item) => dispatch({ type: "equipmentToggled", item })}
        />
        <p className={NOTE_CLASS}>
          Using: {substituteEquipmentSummary(state.equipment)}. Your profile stays as it is.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" disabled={loading || button.disabled} onClick={preview}>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : null}
            {loading ? "Checking…" : "Show blocked exercises"}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={loading} onClick={close}>
            Cancel
          </Button>
        </div>
        {state.step === "picking" && state.error ? (
          <span role="alert" className={ERROR_CLASS}>
            {state.error}
          </span>
        ) : null}
      </div>
    );
  }

  if (state.step === "preview" || state.step === "applying") {
    const applying = state.step === "applying";
    const rows = previewRows(state);
    const confirm = () => {
      const positions = selectedPositions(state);
      dispatch({ type: "applyRequested" });
      startTransition(async () => {
        const result = await submitEquipmentSubstitution(sessionId, state.equipment, positions);
        dispatch(
          result.ok
            ? { type: "applied", session: result.session, outcomes: result.outcomes }
            : { type: "applyFailed", message: result.message },
        );
      });
    };
    return (
      <div className={PANEL_CLASS}>
        <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-cyan">
          Blocked by {substituteEquipmentSummary(state.equipment)}
        </span>
        {rows.length === 0 ? <p className={NOTE_CLASS}>{NOTHING_BLOCKED_NOTE}</p> : null}
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.position}>
              <button
                type="button"
                aria-pressed={row.selected}
                disabled={applying}
                onClick={() => dispatch({ type: "rowToggled", position: row.position })}
                className={cn(
                  "flex w-full min-w-0 items-start gap-2 rounded-sm border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60 motion-reduce:transition-none",
                  row.selected ? "border-cyan" : "border-border",
                )}
              >
                <Check
                  className={cn("mt-0.5 h-4 w-4 shrink-0", row.selected ? "text-cyan" : "invisible")}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col">
                  <span className="font-sans text-[14px] text-text-primary wrap-anywhere">
                    {row.exerciseName}
                  </span>
                  <span className="font-mono text-[12px] text-text-secondary wrap-anywhere">
                    {row.selected ? `→ ${row.replacement}` : "Kept as prescribed"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            size="sm"
            disabled={!canConfirmEquipmentSubstitution(state) || button.disabled}
            onClick={confirm}
          >
            {/* One short word with the spinner standing in for the icon while applying: a
                mono uppercase "SUBSTITUTE" is wider than this panel at 320px and 200% text
                (the `substitution` reflow journey). */}
            {applying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
            ) : (
              <Repeat2 className="h-3.5 w-3.5" aria-hidden />
            )}
            Apply
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={applying}
            onClick={() => dispatch({ type: "backToPicker" })}
          >
            Change equipment
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={applying} onClick={close}>
            Cancel
          </Button>
        </div>
        {state.step === "preview" && state.error ? (
          <span role="alert" className={ERROR_CLASS}>
            {state.error}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className={PANEL_CLASS} role="status">
      <span className="font-mono text-[12px] font-semibold uppercase tracking-wider text-cyan">
        Equipment Substitution · {outcomeSummary(state)}
      </span>
      <ul className="flex flex-col gap-2">
        {outcomeRows(state).map((row) => (
          <li key={row.position} className="flex min-w-0 items-start gap-2">
            {row.flagged ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-magenta" aria-hidden />
            ) : (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-cyan" aria-hidden />
            )}
            <span className="flex min-w-0 flex-col">
              <span className="font-sans text-[14px] text-text-primary wrap-anywhere">
                {row.exerciseName}
              </span>
              <span
                className={cn(
                  "font-mono text-[12px] wrap-anywhere",
                  row.flagged ? "text-magenta" : "text-text-secondary",
                )}
              >
                {row.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div>
        <Button type="button" variant="outline" size="sm" onClick={close}>
          Done
        </Button>
      </div>
    </div>
  );
}
