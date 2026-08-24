"use client";

import { useState, useTransition } from "react";

import { updateKeepScreenAwake } from "@/app/profile/appearance-actions";
import { buildKeepScreenAwakeControl } from "@/lib/appearance-view";
import { Alert } from "@/components/pulse/alert";
import { cn } from "@/lib/utils";

interface AppearanceKeepAwakeToggleProps {
  // The user's stored Keep Screen Awake preference, read server-side; the initial
  // state of the toggle.
  keepScreenAwake: boolean;
}

// The Profile control for the user's Keep Screen Awake Interface Preference
// (CONTEXT "Keep Screen Awake" / ADR-0055): a set-once switch — beside the Mode
// picker — for whether the device screen is held on during a Live Session. The copy
// and on/off state come from the pure `buildKeepScreenAwakeControl` mapper, so this
// component stays thin. The switch is optimistic — it moves the instant you tap so
// the choice feels immediate — while the action persists via PUT /api/appearance; a
// failed save reverts the switch to what was actually persisted and surfaces the
// error, mirroring the Mode picker.
export function AppearanceKeepAwakeToggle({
  keepScreenAwake,
}: AppearanceKeepAwakeToggleProps): React.JSX.Element {
  const [enabled, setEnabled] = useState<boolean>(keepScreenAwake);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const control = buildKeepScreenAwakeControl(enabled);

  function toggle(): void {
    const previous = enabled;
    const next = !enabled;
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      const result = await updateKeepScreenAwake(next);
      if (result.error) {
        // Revert to what was actually persisted and tell the user why.
        setEnabled(previous);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span
            id="keep-screen-awake-label"
            className="font-sans text-[15px] font-medium text-text-primary"
          >
            {control.label}
          </span>
          <span className="label-mono text-[10px] text-text-secondary">
            {control.caption}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={control.enabled}
          aria-labelledby="keep-screen-awake-label"
          disabled={isPending}
          onClick={toggle}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60",
            "disabled:cursor-not-allowed disabled:opacity-60",
            control.enabled
              ? "border-cyan bg-cyan-dim"
              : "border-border bg-elevated/70",
          )}
        >
          <span
            aria-hidden="true"
            className={cn(
              "inline-block h-4 w-4 rounded-full transition-transform",
              control.enabled
                ? "translate-x-[22px] bg-cyan"
                : "translate-x-1 bg-text-secondary",
            )}
          />
        </button>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
