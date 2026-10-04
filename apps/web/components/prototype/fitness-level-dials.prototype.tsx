import * as React from "react";

import type { FitnessLevelVisualRow } from "@/lib/fitness-level-visual.prototype";
import { MAX_LEVEL } from "@/lib/fitness-level-visual.prototype";
import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";

// PROTOTYPE — THROWAWAY. Variant B: "Dial grid".
//
// Throws the list out. Each Training Type becomes a gauge in a grid, so the section reads as an
// instrument panel: five dials, each one sweeping a neutral arc to what the user declared and an
// accent arc beyond it to what the app plans with. The bet is that a *dial* says "position on a
// bounded scale" more immediately than any bar, and that a grid lets a reader take all five in
// one glance instead of scanning rows.
//
// Keeps: the per-type sentence (as a caption under each dial).
// Drops: the list, the row-by-row scan, both numerals from the visual read.

// Geometry of one dial: a 270° sweep with the gap at the bottom, drawn in a 64×64 box that
// scales with its grid column (no fixed width, so a 320px viewport at 200% text just gets
// smaller dials rather than a row that overflows — ADR-0085/0087).
const BOX = 64;
const CENTRE = BOX / 2;
const RADIUS = 25;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SWEEP_DEGREES = 270;
const START_DEGREES = 135;
const SWEEP_LENGTH = (CIRCUMFERENCE * SWEEP_DEGREES) / 360;

function arcLength(levels: number): number {
  return (SWEEP_LENGTH * levels) / MAX_LEVEL;
}

// Where the needle tip sits, in the un-rotated box: the arcs are drawn with a rotate(135)
// transform, so this does the same rotation by hand.
function needle(level: number): { x: number; y: number } {
  const degrees = START_DEGREES + (SWEEP_DEGREES * level) / MAX_LEVEL;
  const radians = (degrees * Math.PI) / 180;
  return {
    x: CENTRE + RADIUS * Math.cos(radians),
    y: CENTRE + RADIUS * Math.sin(radians),
  };
}

function Dial({ row }: { row: FitnessLevelVisualRow }): React.JSX.Element {
  const declaredLength = arcLength(row.declared);
  const earnedLength = arcLength(row.earned);
  const tip = needle(row.effective);

  return (
    <svg
      viewBox={`0 0 ${BOX} ${BOX}`}
      className="w-full"
      role="presentation"
      aria-hidden
    >
      <g
        transform={`rotate(${START_DEGREES} ${CENTRE} ${CENTRE})`}
        fill="none"
        strokeWidth={6}
      >
        {/* The whole scale. */}
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          className="stroke-elevated"
          strokeDasharray={`${SWEEP_LENGTH} ${CIRCUMFERENCE}`}
        />
        {/* What the user declared. */}
        <circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          className="stroke-text-muted"
          strokeDasharray={`${declaredLength} ${CIRCUMFERENCE}`}
        />
        {/* What the recent record earned on top of it. Omitted rather than drawn at zero
            length, which a round cap would still render as a stray dot. */}
        {earnedLength > 0 ? (
          <circle
            cx={CENTRE}
            cy={CENTRE}
            r={RADIUS}
            className="stroke-cyan"
            strokeDasharray={`${earnedLength} ${CIRCUMFERENCE}`}
            strokeDashoffset={-declaredLength}
          />
        ) : null}
      </g>
      {/* The reading the app plans at, marked on the rim. Accent only when it sits above the
          declaration — otherwise it is the end of the neutral arc and says so by being there. */}
      <circle
        cx={tip.x}
        cy={tip.y}
        r={3.5}
        className={row.raised ? "fill-cyan" : "fill-text-secondary"}
      />
    </svg>
  );
}

export function FitnessLevelDials({
  rows,
}: {
  rows: FitnessLevelVisualRow[];
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader>FITNESS LEVEL</SectionHeader>
      <Card className="flex flex-col gap-5 p-5">
        <p className="text-sm text-text-secondary">
          Your plans are generated at the Effective Fitness Level: what you declared, plus
          what your recent record shows. It is never read below what you declared.
        </p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-3">
          {rows.map((row) => (
            <li key={row.trainingType} className="flex min-w-0 flex-col gap-2">
              <Dial row={row} />
              <h3 className="label-mono min-w-0 break-words text-center text-[10px] text-text-secondary">
                {row.trainingType}
              </h3>
              <span className="sr-only">{row.readout}</span>
              <p className="text-center text-[11px] leading-snug text-text-muted">
                {row.note}
              </p>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border pt-4">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 shrink-0 rounded-[1px] bg-text-muted" aria-hidden />
            <span className="label-mono text-[9px] text-text-muted">DECLARED</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 shrink-0 rounded-[1px] bg-cyan" aria-hidden />
            <span className="label-mono text-[9px] text-text-muted">EARNED</span>
          </span>
          <span className="label-mono text-[9px] text-text-muted">
            FULL SWEEP = {MAX_LEVEL}
          </span>
        </div>
      </Card>
    </div>
  );
}
