"use client";

import { useState, useTransition } from "react";

import { updateWeightUnit } from "@/app/profile/appearance-actions";
import { buildWeightUnitControl } from "@/lib/appearance-view";
import type { WeightUnit } from "@/lib/weight-unit";
import { Alert } from "@/components/pulse/alert";
import { cn } from "@/lib/utils";

interface AppearanceWeightUnitToggleProps {
  // The user's stored Weight Unit, read server-side; the initial selection.
  weightUnit: WeightUnit;
}

// The Profile control for the user's Weight Unit Interface Preference (CONTEXT
// "Weight Unit" / ADR-0055): a compact segmented kg / lb toggle — beside the Keep
// Screen Awake control — for the unit a Load is entered and displayed in. The copy
// and which unit is active come from the pure `buildWeightUnitControl` mapper, so
// this component stays thin. Selection is optimistic — it moves the instant you tap
// so the choice feels immediate — while the action persists via PUT /api/appearance;
// a failed save reverts the selection to what was actually persisted and surfaces
// the error, mirroring the Mode picker and the Keep Screen Awake toggle.
export function AppearanceWeightUnitToggle({
  weightUnit,
}: AppearanceWeightUnitToggleProps): React.JSX.Element {
  const [selected, setSelected] = useState<WeightUnit>(weightUnit);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const control = buildWeightUnitControl(selected);

  function choose(unit: WeightUnit): void {
    if (unit === selected) return;
    const previous = selected;
    setSelected(unit);
    setError(null);
    startTransition(async () => {
      const result = await updateWeightUnit(unit);
      if (result.error) {
        // Revert to what was actually persisted and tell the user why.
        setSelected(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span
            id="weight-unit-label"
            className="font-sans text-[15px] font-medium text-text-primary"
          >
            {control.label}
          </span>
          <span className="label-mono text-[10px] text-text-secondary">
            {control.caption}
          </span>
        </div>
        <div
          role="radiogroup"
          aria-labelledby="weight-unit-label"
          className="grid grid-cols-2 gap-1 rounded-full border border-border bg-elevated/40 p-1"
        >
          {control.options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={option.selected}
              disabled={isPending}
              onClick={() => choose(option.value)}
              className={cn(
                "min-w-[3rem] rounded-full px-3 py-1 text-center font-sans text-[13px] font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60",
                "disabled:cursor-not-allowed disabled:opacity-60",
                option.selected
                  ? "bg-cyan-dim text-cyan"
                  : "text-text-secondary hover:text-text-primary",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
