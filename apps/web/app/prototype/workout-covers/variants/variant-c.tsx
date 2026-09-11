"use client";

// PROTOTYPE — Variant C · "Strata".
//
// Cover treatment: the cover IS the graphic — a full-bleed field of stacked horizontal bands,
// one per exercise in prescription order, each band's inset and length driven by that exercise's
// stable weight. It reads like sediment strata / a side-on equalizer. The name and Start sit
// OVER the field on a scrim so they stay fully readable (the brief's hard constraint), while the
// field itself is free to be expressive. Two "Calisthenics" with different movement lists layer
// into visibly different strata.
//
// Reveal (adapted from Expandable): tapping the field expands a legend naming each band's
// movement, top-to-bottom.

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

// The strata field, stretched to fill its banner via preserveAspectRatio="none". Each exercise
// is one horizontal band; its horizontal inset and length come from stable weights, so the
// stack is a reproducible per-workout landscape.
function StrataField({ identity }: { identity: WorkoutIdentity }): React.JSX.Element {
  const weights = identity.exerciseWeights;
  const rowH = 10;
  const gap = 2.5;
  const totalH = weights.length * rowH;
  return (
    <svg
      viewBox={`0 0 100 ${totalH}`}
      preserveAspectRatio="none"
      aria-hidden
      className="absolute inset-0 h-full w-full"
    >
      {weights.map((weight, index) => {
        const inset = identity.rand(`inset:${index}`) * 30;
        const length = Math.max(12, weight * (100 - inset));
        return (
          <rect
            key={index}
            x={inset}
            y={index * rowH}
            width={length}
            height={rowH - gap}
            rx={1.5}
            fill={accentTint(identity.accentVar, 0.22 + 0.55 * weight)}
          />
        );
      })}
    </svg>
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

function StrataLegend({
  workout,
  identity,
}: {
  workout: SampleWorkout;
  identity: WorkoutIdentity;
}): React.JSX.Element {
  return (
    <ol className="flex list-none flex-col gap-1.5 p-0">
      {workout.exercises.map((exercise, index) => (
        <li key={exercise} className="flex items-center gap-2.5">
          <span
            className="h-2 w-6 shrink-0 rounded-[1px]"
            style={{
              backgroundColor: accentTint(
                identity.accentVar,
                0.22 + 0.55 * identity.exerciseWeights[index],
              ),
            }}
          />
          <span className="font-sans text-[12px] text-text-secondary">{exercise}</span>
        </li>
      ))}
    </ol>
  );
}

// The scrim keeps overlaid text legible over the field — a base-colour wash rising from the
// bottom (where the name sits) and a lighter top for the type tag.
function Banner({
  identity,
  height,
  children,
  onToggle,
  open,
}: {
  identity: WorkoutIdentity;
  height: number;
  children: React.ReactNode;
  onToggle?: () => void;
  open?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="relative block w-full overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan/60"
      style={{ height }}
    >
      <StrataField identity={identity} />
      <span
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, var(--color-surface) 6%, color-mix(in srgb, var(--color-surface) 55%, transparent) 45%, transparent 85%)",
        }}
      />
      <span className="absolute inset-0 flex flex-col justify-between p-4">{children}</span>
    </button>
  );
}

function TypeTag({ identity }: { identity: WorkoutIdentity }): React.JSX.Element {
  return (
    <span
      className="label-mono inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-0.5 text-[9px]"
      style={{ color: `var(${identity.accentVar})`, backgroundColor: accentTint(identity.accentVar, 0.18) }}
    >
      {identity.typeLabel}
    </span>
  );
}

function HeroCover({ workout }: { workout: SampleWorkout }): React.JSX.Element {
  const identity = createWorkoutIdentity(workout);
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col overflow-hidden">
      <Banner identity={identity} height={132} onToggle={() => setOpen((v) => !v)} open={open}>
        <div className="flex items-start justify-between">
          <TypeTag identity={identity} />
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="font-display text-2xl font-bold text-text-primary">{workout.name}</h2>
            <span className="label-mono text-[10px] text-text-muted">
              {workout.exercises.length} EXERCISES · {workout.durationMinutes} MIN
            </span>
          </div>
        </div>
      </Banner>
      <div className="flex items-center justify-between gap-3 p-4">
        <span className="label-mono text-[10px] text-text-muted">
          {open ? "SIGNATURE" : "TAP COVER TO REVEAL"}
        </span>
        <StartAction />
      </div>
      <Reveal open={open}>
        <div className="border-t border-border px-4 pb-4 pt-3">
          <StrataLegend workout={workout} identity={identity} />
        </div>
      </Reveal>
    </Card>
  );
}

function RowCover({ workout }: { workout: SampleWorkout }): React.JSX.Element {
  const identity = createWorkoutIdentity(workout);
  const [open, setOpen] = useState(false);
  return (
    <Card className="flex flex-col overflow-hidden transition-colors hover:border-cyan/40">
      <Banner identity={identity} height={84} onToggle={() => setOpen((v) => !v)} open={open}>
        <div className="flex items-start justify-between">
          <TypeTag identity={identity} />
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <h3 className="truncate font-display text-base font-semibold text-text-primary">
              {workout.name}
            </h3>
            <span className="label-mono text-[10px] text-text-muted">
              {workout.exercises.length} ex · {workout.durationMinutes}m
            </span>
          </div>
          <span onClick={(e) => e.stopPropagation()}>
            <StartAction variant="secondary" />
          </span>
        </div>
      </Banner>
      <Reveal open={open}>
        <div className="border-t border-border p-4">
          <StrataLegend workout={workout} identity={identity} />
        </div>
      </Reveal>
    </Card>
  );
}

function DetailCover({ workout }: { workout: SampleWorkout }): React.JSX.Element {
  const identity = createWorkoutIdentity(workout);
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="relative h-44 w-full overflow-hidden">
        <StrataField identity={identity} />
        <span
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, var(--color-surface) 8%, color-mix(in srgb, var(--color-surface) 55%, transparent) 50%, transparent 88%)",
          }}
        />
        <span className="absolute inset-0 flex flex-col justify-between p-5">
          <TypeTag identity={identity} />
          <div className="flex flex-col gap-0.5">
            <h2 className="font-display text-2xl font-bold text-text-primary">{workout.name}</h2>
            <span className="label-mono text-[10px] text-text-muted">
              by {workout.author} · {workout.durationMinutes} MIN
            </span>
          </div>
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

export function VariantC(): React.JSX.Element {
  const hero = SAMPLE_WORKOUTS[3];
  const library = SAMPLE_WORKOUTS;
  const recent = SAMPLE_WORKOUTS.slice(0, 3);
  const detail = SAMPLE_WORKOUTS[0];
  return (
    <div className="flex flex-col gap-10">
      <SurfaceSection screen="01 · Dashboard" note="hero — next session">
        <HeroCover workout={hero} />
      </SurfaceSection>

      <SurfaceSection screen="02 · My sessions" note="tap a cover to reveal its signature">
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
