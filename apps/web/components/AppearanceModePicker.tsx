"use client";

import { useState, useTransition } from "react";

import { updateAppearanceMode } from "@/app/profile/appearance-actions";
import { buildAppearanceView } from "@/lib/appearance-view";
import type { Mode } from "@/lib/theme";
import { Alert } from "@/components/pulse/alert";
import { cn } from "@/lib/utils";

interface AppearanceModePickerProps {
  // The user's current Mode, read server-side; the initial selection.
  currentMode: Mode;
}

// The Profile Appearance control: a segmented Light / Dark / System picker backed
// by a thin server action (updateAppearanceMode → PUT /api/appearance). The
// options and which one is active come from the pure `buildAppearanceView` mapper,
// so this component stays thin. Selection is optimistic — it moves the instant you
// tap so the choice feels immediate — while the action persists and revalidates
// the root layout to re-stamp the app's Mode; a failed save reverts the selection
// and surfaces the error.
export function AppearanceModePicker({
  currentMode,
}: AppearanceModePickerProps): React.JSX.Element {
  const [selected, setSelected] = useState<Mode>(currentMode);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const { modeOptions } = buildAppearanceView(selected);

  function choose(mode: Mode): void {
    if (mode === selected) return;
    const previous = selected;
    setSelected(mode);
    setError(null);
    startTransition(async () => {
      const result = await updateAppearanceMode(mode);
      if (result.error) {
        // Revert to what was actually persisted and tell the user why.
        setSelected(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label="Appearance mode"
        className="grid grid-cols-3 gap-2"
      >
        {modeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.selected}
            disabled={isPending}
            onClick={() => choose(option.value)}
            className={cn(
              "flex flex-col items-start gap-1 rounded-sm border px-3.5 py-3 text-left transition-colors",
              "disabled:cursor-not-allowed disabled:opacity-60",
              option.selected
                ? "border-cyan bg-cyan-dim"
                : "border-border bg-elevated/40 hover:bg-elevated/70",
            )}
          >
            <span
              className={cn(
                "font-sans text-[15px] font-medium",
                option.selected ? "text-cyan" : "text-text-primary",
              )}
            >
              {option.label}
            </span>
            <span className="label-mono text-[10px] text-text-secondary">
              {option.caption}
            </span>
          </button>
        ))}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
