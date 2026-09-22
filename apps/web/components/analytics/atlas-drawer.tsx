import { useEffect, useRef } from "react";

import type { MuscleRegion } from "@/lib/muscle-region-atlas-view";
import { setsWord } from "@/lib/muscle-atlas-labels";
import { groupColorVar } from "@/components/pulse/muscle-colors";
import { cn } from "@/lib/utils";

// The elements inside the sheet that keyboard focus can land on, for the focus trap below.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface AtlasDrawerProps {
  region: MuscleRegion | null;
  weeksLabel: string;
  onClose: () => void;
}

// The muscle-detail bottom sheet (the shadcn Drawer pattern): slides up when a muscle is
// selected, naming it, its parent group, its in-window mapped sets, and the exercises behind
// them. Kept in the DOM for a two-way slide, made inert + hidden from assistive tech when closed,
// and dismissed by the scrim or Escape. As a modal dialog it also **traps keyboard focus** while
// open, so Tab cycles within the sheet rather than escaping to the body map behind the scrim. The
// slide transition is disabled under `prefers-reduced-motion`.
export function AtlasDrawer({ region, weeksLabel, onClose }: AtlasDrawerProps) {
  const open = region !== null;
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const sheet = sheetRef.current;
    sheet?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !sheet) return;
      // Keep Tab / Shift+Tab within the sheet: wrap from the last focusable to the first (and
      // vice versa), and pull focus back in if it has drifted outside.
      const focusable = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0] ?? sheet;
      const last = focusable[focusable.length - 1] ?? sheet;
      const activeEl = document.activeElement;
      if (event.shiftKey) {
        if (activeEl === first || activeEl === sheet || !sheet.contains(activeEl)) {
          event.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !sheet.contains(activeEl)) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-black/55 transition-opacity duration-200 motion-reduce:transition-none",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={region ? `${region.muscle} detail` : undefined}
        aria-hidden={!open}
        inert={!open}
        tabIndex={-1}
        className={cn(
          "fixed bottom-0 left-1/2 z-50 w-full max-w-[26rem] -translate-x-1/2 rounded-t-2xl border border-b-0 border-border bg-surface px-5 pb-7 pt-2 shadow-2xl outline-none transition-transform duration-200 motion-reduce:transition-none",
          open ? "translate-y-0" : "translate-y-full",
        )}
      >
        <div aria-hidden className="mx-auto mb-4 mt-1.5 h-1 w-9 rounded-full bg-border-lite" />
        {region ? <RegionDetail region={region} weeksLabel={weeksLabel} /> : null}
      </div>
    </>
  );
}

function RegionDetail({ region, weeksLabel }: { region: MuscleRegion; weeksLabel: string }) {
  const color = groupColorVar(region.group);
  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <span className="block font-display text-lg font-semibold text-text-primary">
            {region.muscle}
          </span>
          <span className="label-mono text-[10px] text-text-muted">{region.group}</span>
        </div>
        <span
          className={cn(
            "label-mono text-[10px] font-semibold",
            region.covered ? "text-text-primary" : "text-text-muted",
          )}
        >
          {region.stateLabel}
        </span>
      </div>

      {region.covered ? (
        <>
          <div className="mt-4 flex flex-col gap-1">
            <span className="label-mono text-[9px] tracking-wider text-text-muted">Mapped sets</span>
            <span className="font-display text-2xl font-semibold text-text-primary tabular-nums">
              {region.sets}
            </span>
          </div>
          <p className="mt-4 mb-2 label-mono text-[9px] tracking-wider text-text-muted">
            Contributing exercises
          </p>
          <ul className="divide-y divide-border">
            {region.contributingExercises.map((exercise) => (
              <li key={exercise.name} className="flex items-center justify-between py-2">
                <span className="font-sans text-sm text-text-primary">{exercise.name}</span>
                <span className="label-mono text-[11px] text-text-secondary">
                  {exercise.sets} {setsWord(exercise.sets)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 font-sans text-sm text-text-secondary">
          No {region.muscle.toLowerCase()} sets in the {weeksLabel} yet. When you log some,
          they&apos;ll map here.
        </p>
      )}
    </div>
  );
}
