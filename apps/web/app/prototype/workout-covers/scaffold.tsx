"use client";

// PROTOTYPE — throwaway. Shared plumbing for the workout-cover variants: the labelled surface
// sections (01–04), the "quiet prescription" block that sits BELOW a cover (the brief: "the
// prescription below stays quiet"), and a mock Start affordance. This is deliberately NOT the
// design under test — every variant renders the SAME scaffolding so the only thing that changes
// between variants is the cover treatment itself.

import { Play } from "lucide-react";

import { cn } from "@/lib/utils";
import type { SampleWorkout } from "@/lib/prototype/sample-workouts";
import { buttonVariants } from "@/components/ui/button";

// One of the four surfaces the identity system has to live on. `screen` is the "01 · Dashboard"
// style caption so the reviewer always knows which density they are judging.
export function SurfaceSection({
  screen,
  note,
  children,
}: {
  screen: string;
  note?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-2">
        <span className="label-mono text-[11px] text-cyan">{screen}</span>
        {note ? (
          <span className="label-mono text-[10px] text-text-muted">{note}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

// The intentionally-restrained detail below a cover — sets × reps rows, no colour, no drama. It
// exists so the reviewer can confirm the loud cover and the quiet prescription coexist.
export function QuietPrescription({
  workout,
  limit = 4,
}: {
  workout: SampleWorkout;
  limit?: number;
}): React.JSX.Element {
  const shown = workout.exercises.slice(0, limit);
  const remaining = workout.exercises.length - shown.length;
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {shown.map((exercise, index) => (
        <li
          key={exercise}
          className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 last:border-0"
        >
          <span className="flex items-center gap-2.5">
            <span className="label-mono text-[10px] text-text-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="font-sans text-[13px] text-text-secondary">
              {exercise}
            </span>
          </span>
          <span className="label-mono text-[10px] text-text-muted">
            3 × {8 + ((index * 2) % 6)}
          </span>
        </li>
      ))}
      {remaining > 0 ? (
        <li className="label-mono text-[10px] text-text-muted">
          + {remaining} more
        </li>
      ) : null}
    </ul>
  );
}

// A mock Start button. href="#" — the prototype checks a look, never a real mutation.
export function StartAction({
  variant = "primary",
  className,
}: {
  variant?: "primary" | "secondary";
  className?: string;
}): React.JSX.Element {
  return (
    <a href="#" className={cn(buttonVariants({ variant, size: "sm" }), className)}>
      <Play className="h-3.5 w-3.5" />
      Start
    </a>
  );
}
