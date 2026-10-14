// PROTOTYPE — throwaway: mounts the exercise-card variants (app/sessions/[id]/prototype-exercise-cards.tsx)
// with a synthetic Session so they can be screenshotted without Clerk or the API.
// `?journey=prototype-cards&variant=B`
import type { ExercisePrescription } from "@/lib/sessions-types";
import { SectionHeader } from "@/components/pulse/section-header";
import { PrototypeSwitcher } from "@/components/PrototypeSwitcher";
import {
  PROTOTYPE_VARIANTS,
  PrototypeExerciseCard,
} from "@/app/sessions/[id]/prototype-exercise-cards";
import { schemeControlModel } from "@/lib/scheme-view";
import { supersetLayout } from "@/lib/supersets";

const base: ExercisePrescription = {
  position: 1, sets: 2, reps: "45s", rest_seconds: 45, tempo: null,
  recommended_load: { kind: "bodyweight", text: "bodyweight" },
  prescribed_quantity: { kind: "repetitions", count: 45, text: "45s" },
  exercise_id: 1, exercise_name: "Dead hang", exercise_description: null,
  targeted_muscles: [], required_equipment: [], provenance: "curated",
  previous_performance: [], set_type: "warmup",
} as ExercisePrescription;

const rows: ExercisePrescription[] = [
  base,
  {
    ...base, position: 2, sets: 3, reps: "5", exercise_id: 2, exercise_name: "Explosive pull-up",
    set_type: null, provenance: "ai_generated", superset_group: "a", round_rest_seconds: 120,
    exercise_description: "An advanced bodyweight upper-body movement that emphasizes rapid force production and pulling power.",
    targeted_muscles: ["lats", "biceps"],
  },
  {
    ...base, position: 3, sets: 3, reps: "8-12", exercise_id: 3, exercise_name: "Ring dip",
    set_type: null, superset_group: "a", round_rest_seconds: 120, targeted_muscles: ["chest", "triceps"],
  },
  {
    ...base, position: 4, sets: 4, reps: "6-8", rest_seconds: 150, exercise_id: 4, exercise_name: "Back squat",
    set_type: null, recommended_load: { kind: "absolute", text: "80 kg", kg: 80 }, tempo: "3-1-1-0",
    note: "Brace before every rep", targeted_muscles: ["quads", "glutes"], scheme: "greyskull",
  } as ExercisePrescription,
  {
    ...base, position: 5, sets: 3, reps: "10", rest_seconds: 60, exercise_id: 5, exercise_name: "Romanian deadlift",
    set_type: null, recommended_load: { kind: "percent_1rm", text: "70% 1RM", percent: 70 },
  },
];

export function PrototypeCards({ variant }: { variant: string }) {
  const slots = supersetLayout(rows.map((r) => ({ supersetGroup: r.superset_group ?? null, roundRestSeconds: r.round_rest_seconds ?? null })));
  return (
    <div className="flex flex-col gap-4">
      <SectionHeader meta={`${rows.length} EXERCISES`}>PROTOCOL</SectionHeader>
      <ol className="flex list-none flex-col gap-3 p-0">
        {rows.map((p, i) => (
          <li key={p.position}>
            <PrototypeExerciseCard
              variant={variant}
              prescription={p}
              superset={slots[i]}
              sessionId={1}
              unit="kg"
              index={i + 1}
              harderVariation={{ kind: "none" }}
              schemeModel={schemeControlModel(p)}
              showScheme
              showRemove
              canRemove
              dissolvesSuperset={false}
            />
          </li>
        ))}
      </ol>
      <PrototypeSwitcher variants={PROTOTYPE_VARIANTS} current={variant} />
    </div>
  );
}
