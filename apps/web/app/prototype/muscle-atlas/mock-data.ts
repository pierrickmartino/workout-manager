// PROTOTYPE — throwaway. Deterministic mock coverage so the redesigned atlas has realistic heat
// to render without a Clerk session or a backend fetch. Read-only: the prototype never mutates.

import type { MuscleRegion } from "@/lib/muscle-region-atlas-view";
import { MUSCLE_SPECS } from "@/lib/atlas/muscle-figure-spec";

// A hand-picked training week: some muscles hammered, some light, some untouched — enough spread
// that the heat ramp reads as a gradient across the body rather than an all-or-nothing wash.
const SETS_BY_MUSCLE: Record<string, number> = {
  Quadriceps: 18,
  Hamstrings: 12,
  "Gluteus Maximus": 14,
  Gastrocnemius: 8,
  Soleus: 4,
  "Tibialis Anterior": 2,
  Peroneals: 1,
  Sartorius: 3,
  "Hip Adductors": 6,
  "Pectoralis Major": 16,
  "Serratus Anterior": 3,
  "Latissimus Dorsi": 15,
  Trapezius: 11,
  "Erector Spinae": 9,
  Infraspinatus: 2,
  "Teres Major": 2,
  Deltoids: 13,
  "Biceps Brachii": 10,
  "Triceps Brachii": 12,
  Forearms: 5,
  "Rectus Abdominis": 14,
  Obliques: 7,
};

const GROUP_BY_MUSCLE: Record<string, string> = Object.fromEntries(
  MUSCLE_SPECS.map((spec) => [spec.id, spec.group]),
);

const MOCK_EXERCISES: Record<string, { name: string; sets: number }[]> = {
  Quadriceps: [
    { name: "Back Squat", sets: 10 },
    { name: "Leg Press", sets: 8 },
  ],
  "Pectoralis Major": [
    { name: "Bench Press", sets: 9 },
    { name: "Incline Dumbbell Press", sets: 7 },
  ],
  "Latissimus Dorsi": [
    { name: "Pull-Up", sets: 8 },
    { name: "Barbell Row", sets: 7 },
  ],
};

const maxSets = Math.max(...Object.values(SETS_BY_MUSCLE));

// Build a MuscleRegion for one canonical muscle from the mock table. Intensity is scaled to the
// busiest muscle, exactly like the real view-model, so the redesigned figure shades identically.
function toRegion(muscle: string, group: string): MuscleRegion {
  const sets = SETS_BY_MUSCLE[muscle] ?? 0;
  const covered = sets > 0;
  return {
    muscle,
    group,
    covered,
    stateLabel: covered ? "Trained" : "Not trained",
    sets,
    intensity: covered ? sets / maxSets : 0,
    contributingExercises: MOCK_EXERCISES[muscle] ?? (covered ? [{ name: "Assorted work", sets }] : []),
    ariaLabel: `${muscle}, ${group}. ${covered ? `Trained, ${sets} sets in the last 8 weeks` : "Not trained"}.`,
  };
}

// A map keyed by canonical Muscle id, covering every muscle in the vocabulary (drawn or not), so
// any variant — baseline or redesign — can look one up.
export const MOCK_REGIONS: Map<string, MuscleRegion> = new Map(
  MUSCLE_SPECS.map((spec) => [spec.id, toRegion(spec.id, spec.group)]),
);
