"use client";

// PROTOTYPE — Variant B · "Geometric Sigil".
//
// Cover treatment: a compact square medallion holding a generative geometric glyph — a faint
// base polygon plus a constellation of nodes, one per exercise, placed on a ring at
// weight-driven radii and joined in prescription order. The whole figure is rotated by a stable
// per-workout angle. It reads like an emblem / identicon: instantly recognizable, and the two
// "Calisthenics" (5 nodes vs 4, different rotation and radii) are unmistakably different sigils.
//
// Composition: the medallion is a corner/lead emblem; the NAME dominates and Start stays loud.
// Reveal (adapted from Expandable): tapping the medallion expands a numbered legend tying each
// node to its movement.

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

// The generative glyph, drawn in a 100×100 viewBox and scaled by the caller. Pure function of
// the identity, so a workout's sigil is byte-identical everywhere.
function Sigil({
  identity,
  exerciseCount,
  size,
}: {
  identity: WorkoutIdentity;
  exerciseCount: number;
  size: number;
}): React.JSX.Element {
  const accent = `var(${identity.accentVar})`;
  const cx = 50;
  const cy = 50;
  const rotation = identity.rand("rotation") * 360;
  const sides = 3 + identity.randInt("poly", 0, 3); // base polygon: triangle…hexagon
  const baseRadius = 40;

  // The faint base polygon — a rotated regular n-gon.
  const polygon = Array.from({ length: sides }, (_, i) => {
    const angle = (i / sides) * 2 * Math.PI - Math.PI / 2;
    return `${cx + baseRadius * Math.cos(angle)},${cy + baseRadius * Math.sin(angle)}`;
  }).join(" ");

  // The constellation nodes — one per exercise, on a ring at a weight-driven radius.
  const nodes = identity.exerciseWeights.map((weight, i) => {
    const angle = (i / exerciseCount) * 2 * Math.PI - Math.PI / 2;
    const radius = 14 + weight * 26;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      r: 2.5 + weight * 4,
    };
  });
  const path = nodes.map((node) => `${node.x},${node.y}`).join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Workout sigil"
      className="shrink-0"
    >
      <g transform={`rotate(${rotation} ${cx} ${cy})`}>
        <polygon
          points={polygon}
          fill={accentTint(identity.accentVar, 0.08)}
          stroke={accentTint(identity.accentVar, 0.35)}
          strokeWidth={1}
        />
        {nodes.length > 1 ? (
          <polyline
            points={path}
            fill="none"
            stroke={accentTint(identity.accentVar, 0.5)}
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
        ) : null}
        {nodes.map((node, i) => (
          <circle key={i} cx={node.x} cy={node.y} r={node.r} fill={accent} />
        ))}
        <circle cx={cx} cy={cy} r={2} fill={accentTint(identity.accentVar, 0.6)} />
      </g>
    </svg>
  );
}

// A framed medallion around the sigil — the recognizable "cover" chip.
function Medallion({
  identity,
  exerciseCount,
  box,
  glyph,
}: {
  identity: WorkoutIdentity;
  exerciseCount: number;
  box: number;
  glyph: number;
}): React.JSX.Element {
  return (
    <span
      className="flex items-center justify-center rounded-md border"
      style={{
        width: box,
        height: box,
        borderColor: accentTint(identity.accentVar, 0.3),
        backgroundColor: accentTint(identity.accentVar, 0.05),
      }}
    >
      <Sigil identity={identity} exerciseCount={exerciseCount} size={glyph} />
    </span>
  );
}

function TypeTag({ identity }: { identity: WorkoutIdentity }): React.JSX.Element {
  return (
    <span
      className="label-mono inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-0.5 text-[9px]"
      style={{ color: `var(${identity.accentVar})`, backgroundColor: accentTint(identity.accentVar, 0.12) }}
    >
      {identity.typeLabel}
    </span>
  );
}

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

function NodeLegend({ workout }: { workout: SampleWorkout }): React.JSX.Element {
  return (
    <ol className="flex list-none flex-col gap-1.5 p-0">
      {workout.exercises.map((exercise, index) => (
        <li key={exercise} className="flex items-center gap-2.5">
          <span className="label-mono text-[10px] text-text-muted">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="font-sans text-[12px] text-text-secondary">{exercise}</span>
        </li>
      ))}
    </ol>
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
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
        >
          <Medallion identity={identity} exerciseCount={workout.exercises.length} box={76} glyph={64} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <TypeTag identity={identity} />
          <h2 className="font-display text-2xl font-bold text-text-primary">{workout.name}</h2>
          <span className="label-mono text-[10px] text-text-muted">
            {workout.exercises.length} EXERCISES · {workout.durationMinutes} MIN
          </span>
        </div>
        <StartAction className="shrink-0" />
      </div>
      <Reveal open={open}>
        <div className="border-t border-border pt-3">
          <NodeLegend workout={workout} />
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
          aria-label={`Toggle sigil for ${workout.name}`}
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
        >
          <Medallion identity={identity} exerciseCount={workout.exercises.length} box={46} glyph={40} />
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
          <NodeLegend workout={workout} />
        </div>
      </Reveal>
    </Card>
  );
}

function DetailCover({ workout }: { workout: SampleWorkout }): React.JSX.Element {
  const identity = createWorkoutIdentity(workout);
  return (
    <Card className="flex flex-col overflow-hidden">
      <div
        className="flex flex-col items-center gap-3 border-b border-border p-6"
        style={{ backgroundColor: accentTint(identity.accentVar, 0.04) }}
      >
        <Medallion identity={identity} exerciseCount={workout.exercises.length} box={110} glyph={94} />
        <TypeTag identity={identity} />
        <h2 className="text-center font-display text-2xl font-bold text-text-primary">
          {workout.name}
        </h2>
        <span className="label-mono text-[10px] text-text-muted">
          by {workout.author} · {workout.durationMinutes} MIN
        </span>
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

export function VariantB(): React.JSX.Element {
  const hero = SAMPLE_WORKOUTS[3];
  const library = SAMPLE_WORKOUTS;
  const recent = SAMPLE_WORKOUTS.slice(0, 3);
  const detail = SAMPLE_WORKOUTS[1]; // Calisthenics #2 — contrast its sigil with the row above
  return (
    <div className="flex flex-col gap-10">
      <SurfaceSection screen="01 · Dashboard" note="hero — next session">
        <HeroCover workout={hero} />
      </SurfaceSection>

      <SurfaceSection screen="02 · My sessions" note="tap a sigil to reveal its movements">
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
