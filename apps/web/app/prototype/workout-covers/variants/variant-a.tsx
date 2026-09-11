"use client";

// PROTOTYPE — Variant A · "Signature Blocks".
//
// Cover treatment: the exercise signature IS the mark — one vertical block per exercise, in
// prescription order, each block's height set by that exercise's stable weight and its fill
// stepped along the training-type accent. Five exercises ⇒ five differently-sized blocks in a
// consistent order (the brief's literal ask). Two "Calisthenics" with different movement lists
// therefore read as two different barcodes at a glance.
//
// Composition: the mark is a compact left-hand spine; the name and Start sit to its right, fully
// legible. Reveal (adapted from 21st.dev Expandable): tapping the mark expands the card to show
// the legend — which block is which movement.

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { SampleWorkout } from "@/lib/prototype/sample-workouts";
import { SAMPLE_WORKOUTS } from "@/lib/prototype/sample-workouts";
import {
  accentTint,
  createWorkoutIdentity,
  type WorkoutIdentity,
} from "@/lib/prototype/workout-identity";
import { Card } from "@/components/ui/card";
import {
  QuietPrescription,
  StartAction,
  SurfaceSection,
} from "@/app/prototype/workout-covers/scaffold";

type Density = "hero" | "row" | "detail";

const BAR_DIMENSIONS: Record<Density, { barW: number; gap: number; height: number }> = {
  hero: { barW: 11, gap: 5, height: 60 },
  row: { barW: 6, gap: 3, height: 34 },
  detail: { barW: 16, gap: 7, height: 84 },
};

// The equalizer mark — one rounded bar per exercise, height by weight, fill stepped along the
// accent so a taller (heavier) block also reads as more saturated.
function BlockMark({
  identity,
  density,
}: {
  identity: WorkoutIdentity;
  density: Density;
}): React.JSX.Element {
  const { barW, gap, height } = BAR_DIMENSIONS[density];
  const weights = identity.exerciseWeights;
  const width = weights.length * barW + (weights.length - 1) * gap;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Exercise signature"
      className="shrink-0"
    >
      {weights.map((weight, index) => {
        const barHeight = Math.max(4, weight * height);
        return (
          <rect
            key={index}
            x={index * (barW + gap)}
            y={height - barHeight}
            width={barW}
            height={barHeight}
            rx={2}
            fill={accentTint(identity.accentVar, 0.35 + 0.6 * weight)}
          />
        );
      })}
    </svg>
  );
}

// The legend the reveal exposes: a swatch per block aligned to its movement name.
function BlockLegend({
  workout,
  identity,
}: {
  workout: SampleWorkout;
  identity: WorkoutIdentity;
}): React.JSX.Element {
  return (
    <ul className="flex list-none flex-col gap-1.5 p-0">
      {workout.exercises.map((exercise, index) => {
        const weight = identity.exerciseWeights[index];
        return (
          <li key={exercise} className="flex items-center gap-2.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: accentTint(identity.accentVar, 0.35 + 0.6 * weight) }}
            />
            <span className="font-sans text-[12px] text-text-secondary">{exercise}</span>
          </li>
        );
      })}
    </ul>
  );
}

// A reveal disclosure shared by this variant's covers — collapsed height animates open. Honors
// reduced motion via Tailwind's motion-reduce.
function Reveal({ open, children }: { open: boolean; children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
        open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
      )}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

function TypeTag({ identity }: { identity: WorkoutIdentity }): React.JSX.Element {
  return (
    <span
      className="label-mono inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-0.5 text-[9px]"
      style={{
        color: `var(${identity.accentVar})`,
        backgroundColor: accentTint(identity.accentVar, 0.12),
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: `var(${identity.accentVar})` }}
      />
      {identity.typeLabel}
    </span>
  );
}

function HeroCover({ workout }: { workout: SampleWorkout }): React.JSX.Element {
  const identity = createWorkoutIdentity(workout);
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
        >
          <BlockMark identity={identity} density="hero" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <TypeTag identity={identity} />
          <h2 className="font-display text-2xl font-bold text-text-primary">{workout.name}</h2>
          <p className="truncate font-mono text-[12px] text-text-secondary">
            {workout.exercises.join(" · ")}
          </p>
        </div>
        <StartAction className="shrink-0" />
      </div>
      <Reveal open={open}>
        <div className="border-t border-border pt-3">
          <BlockLegend workout={workout} identity={identity} />
        </div>
      </Reveal>
    </Card>
  );
}

function RowCover({ workout }: { workout: SampleWorkout }): React.JSX.Element {
  const identity = createWorkoutIdentity(workout);
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col gap-3 p-4 transition-colors hover:border-cyan/40">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`Toggle signature for ${workout.name}`}
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
        >
          <BlockMark identity={identity} density="row" />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="truncate font-display text-base font-semibold text-text-primary">
            {workout.name}
          </h3>
          <div className="flex items-center gap-2">
            <TypeTag identity={identity} />
            <span className="label-mono text-[10px] text-text-muted">
              {workout.exercises.length} ex · {workout.durationMinutes}m
            </span>
          </div>
        </div>
        <StartAction variant="secondary" className="shrink-0" />
      </div>
      <Reveal open={open}>
        <div className="border-t border-border pt-3">
          <BlockLegend workout={workout} identity={identity} />
        </div>
      </Reveal>
    </Card>
  );
}

function DetailCover({ workout }: { workout: SampleWorkout }): React.JSX.Element {
  const identity = createWorkoutIdentity(workout);
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="flex items-end justify-between gap-4 border-b border-border p-5">
        <div className="flex flex-col gap-2">
          <TypeTag identity={identity} />
          <h2 className="font-display text-2xl font-bold text-text-primary">{workout.name}</h2>
          <span className="label-mono text-[10px] text-text-muted">
            by {workout.author} · {workout.durationMinutes} MIN
          </span>
        </div>
        <BlockMark identity={identity} density="detail" />
      </div>
      <div className="flex flex-col gap-4 p-5">
        <span className="label-mono text-[11px] text-text-muted">
          {workout.exercises.length} EXERCISES
        </span>
        <QuietPrescription workout={workout} />
        <StartAction className="w-full" />
      </div>
    </Card>
  );
}

export function VariantA(): React.JSX.Element {
  const hero = SAMPLE_WORKOUTS[3]; // Engine intervals — a 6-exercise HIIT plan makes a busy mark
  const library = SAMPLE_WORKOUTS;
  const recent = SAMPLE_WORKOUTS.slice(0, 3);
  const detail = SAMPLE_WORKOUTS[0]; // Calisthenics #1
  return (
    <div className="flex flex-col gap-10">
      <SurfaceSection screen="01 · Dashboard" note="hero — next session">
        <HeroCover workout={hero} />
      </SurfaceSection>

      <SurfaceSection screen="02 · My sessions" note="tap a mark to reveal its signature">
        <ol className="flex list-none flex-col gap-3 p-0">
          {library.map((workout) => (
            <li key={workout.id}>
              <RowCover workout={workout} />
            </li>
          ))}
        </ol>
      </SurfaceSection>

      <SurfaceSection screen="03 · Training hub" note="pick up again">
        <ol className="flex list-none flex-col gap-3 p-0">
          {recent.map((workout) => (
            <li key={workout.id}>
              <RowCover workout={workout} />
            </li>
          ))}
        </ol>
      </SurfaceSection>

      <SurfaceSection screen="04 · Session detail" note="cover loud, prescription quiet">
        <DetailCover workout={detail} />
      </SurfaceSection>
    </div>
  );
}
