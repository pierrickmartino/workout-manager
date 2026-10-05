import type { LoggedSession } from "@/lib/logs-types";
import type { SessionSummary } from "@/lib/session-library";
import type { ExerciseSearchResult } from "@/lib/exercises-types";
import type { ExerciseDetail, ExercisePrescription, WorkoutSession } from "@/lib/sessions-types";
import type { AdminExerciseRow } from "@/lib/admin-exercises-view";
import type { Profile } from "@/lib/profile-types";
import type { ProtocolProgress } from "@/lib/protocols-types";
import type { PersonalRecordEntry, VolumePoint } from "@/lib/analytics-types";

const originalNames = ["Long workout name with spaces ".repeat(5).slice(0, 120), "W".repeat(120)];
const originalExerciseNames = ["Long exercise name with spaces ".repeat(4).slice(0, 100), "W".repeat(100)];
// Each split case changes one input axis; other names stay short.
const nameFixture = new URLSearchParams(location.search).get("fixture") ?? "mixed";
const sessionVariant = nameFixture === "session-spaced" ? 0 : nameFixture === "session-unbroken" ? 1 : null;
const exerciseVariant = nameFixture === "exercise-spaced" ? 0 : nameFixture === "exercise-unbroken" ? 1 : null;
export const names = nameFixture === "mixed" ? originalNames : [0, 1].map(() => sessionVariant === null ? "Synthetic Session" : originalNames[sessionVariant]);
export const exerciseNames = nameFixture === "mixed" ? originalExerciseNames : [0, 1].map(() => exerciseVariant === null ? "Synthetic squat" : originalExerciseNames[exerciseVariant]);
export const exercises: ExerciseSearchResult[] = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1, name: i < 2 ? exerciseNames[i] : `Synthetic squat ${i + 1}`,
  targeted_muscles: ["quadriceps", "glutes"], required_equipment: ["barbell"],
  difficulty: 5, provenance: "curated", movement_pattern: "squat", equipment: ["barbell"],
}));
export const taxonomy = { groups: [{ pattern: "squat", count: exercises.length, exercises }], total: exercises.length };
export const sessions: SessionSummary[] = names.map((name, i) => ({
  id: i + 1, name, display_name: name, training_type: "strength", created_at: "2026-09-01",
  author: { display_name: nameFixture === "mixed" ? "Long author name ".repeat(6) : "Synthetic author" }, authored_by_me: false,
  is_favorite: i === 0, exercise_count: 100, logged_count: 1000,
}));
export function history(count: number): LoggedSession[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1, clerk_user_id: "audit-synthetic-account", session_id: null, training_type: "strength",
    performed_on: "2026-09-01", completion_outcome: null, duration_seconds: null,
    logged_sets: [{ position: 1, exercise_id: i % 2 + 1, exercise_name: exerciseNames[i % 2],
      quantity: { kind: "repetitions", count: 12, text: "12" }, load: null,
      perceived_difficulty: 8, body_weight_kg: null }],
  }));
}
export const prescriptions: ExercisePrescription[] = exercises.slice(0, 3).map((exercise, i) => ({
  position: i + 1, sets: 3, reps: "12", rest_seconds: 60, tempo: null, recommended_load: null,
  prescribed_quantity: { kind: "repetitions", count: 12, text: "12" },
  exercise_id: exercise.id, exercise_name: exercise.name, exercise_description: null,
  targeted_muscles: exercise.targeted_muscles, required_equipment: exercise.required_equipment,
  provenance: "curated", previous_performance: [
    { reps: 8, load: { kind: "absolute", text: "65 kg", kg: 65 } },
  ],
}));
export const workout: WorkoutSession = {
  id: 1, clerk_user_id: "audit-synthetic-account", training_type: "strength", duration_minutes: 30,
  has_been_regenerated: false, provenance: "user_authored", name: names[0], prescriptions,
};
export const profile: Profile = {
  id: 1, clerk_user_id: "audit-synthetic-account", display_name: nameFixture === "mixed" ? names[0] : "Synthetic account", gender: null,
  age: 100, height_cm: 199.9, weight_kg: 199.9, training_habits: null, recent_workout: null,
  default_rest_seconds: 120, default_equipment: ["barbell"], default_equipment_canonical: ["barbell"],
  fitness_levels: { strength: 10 }, preferences: [], sensitive_constraints: [], is_sensitive: false,
};

// --- Home at the shell's wide width (ADR-0088) ---
//
// The `home` journey is the sweep's only page that opts in with `data-shell="wide"`, so it is
// the one case exercising the wide *column* rather than the wide *frame*. Names come from the
// same `names`/`exerciseNames` axes as every other journey, so a long authored Session title
// stresses the two-column layout exactly as it stresses the narrow one.
export const protocolProgress: ProtocolProgress = {
  id: 1,
  clerk_user_id: "audit-synthetic-account",
  training_type: "strength",
  objective: "build strength",
  sessions_per_week: 3,
  weeks: 4,
  duration_minutes: 45,
  name: names[0],
  label: names[0],
  sessions: Array.from({ length: 12 }, (_, i) => ({
    session_id: i + 1,
    position: i + 1,
    week: Math.floor(i / 3) + 1,
    day: (i % 3) + 1,
    title: names[i % names.length],
    performed: i < 4,
    logged_session_id: i < 4 ? i + 1 : null,
    prescriptions,
  })),
  next_session: {
    session_id: 5,
    position: 5,
    week: 2,
    day: 2,
    title: names[0],
    performed: false,
    logged_session_id: null,
    prescriptions,
  },
  completed_count: 4,
  // The standing Calibration and the clamp's bounds (ADR-0111). Stated rather than
  // defaulted: the server always sends all three, and a fixture that omitted them would
  // let a control render against a shape the API never produces.
  calibration: 0,
  calibration_min: -3,
  calibration_max: 3,
};

// A month of daily volume, so the chart carries a realistic point count and its ChartValues
// table a realistic row count — the payload the wide Home actually ships (ADR-0088's budget).
export const volumePoints: VolumePoint[] = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-09-${String(i + 1).padStart(2, "0")}`,
  volume_kg: 800 + i * 25,
}));

// Eight records, the cap the backend feed serves.
export const personalRecords: PersonalRecordEntry[] = Array.from({ length: 8 }, (_, i) => ({
  exercise: exerciseNames[i % exerciseNames.length],
  estimated_1rm: 100 + i * 5,
  gain: i === 7 ? 0 : 2.5,
  date: `2026-09-${String(28 - i).padStart(2, "0")}`,
  reps: 5,
  is_bodyweight: i % 4 === 3,
  added_kg: i % 4 === 3 ? 20 : null,
}));

// The Exercise detail page's SPECS lens (ADR-0017), mounted so the illustration's reserved box
// (ADR-0095) is measured at 320px and at 200% text like everything else. The image src is a
// real app route the isolated audit server does not serve, which is the useful case rather than
// a defect: a box that only holds its space once the bytes arrive is exactly the CLS this is
// here to catch, and here they never arrive.
export const exerciseDetail: ExerciseDetail = {
  id: 1,
  name: exerciseNames[0],
  description: "A synthetic description long enough to wrap on a narrow screen. ".repeat(3),
  provenance: "curated",
  targeted_muscles: ["quadriceps", "glutes"],
  primary_muscles: ["quadriceps"],
  secondary_muscles: ["glutes"],
  muscle_highlight: {
    primary: { muscles: ["quadriceps"], groups: [] },
    secondary: { muscles: ["glutes"], groups: [] },
  },
  required_equipment: ["barbell", "squat rack"],
  instructions: [
    "Set the bar at mid-chest height and brace before unracking.",
    "Descend until the hip crease passes the knee, then drive up.",
  ],
  difficulty: 5,
  precautions: ["Stop if the knee tracks inward under load."],
  image: null,
  has_image: true,
  retired: false,
  reference_count: null,
  variations: [{ id: 2, name: exerciseNames[1] }],
  alternatives: [{ id: 3, name: "Synthetic squat 3" }],
};

// The admin catalog browser's rows (ADR-0097). Deliberately over the 50-item threshold the
// audit cares about and over the >426px column where the facet grid goes three-up, with the
// long authored names in the first two slots so the row's truncation and the badge cluster are
// measured against the same names every other journey uses.
export const adminExerciseRows: AdminExerciseRow[] = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1,
  name: i < 2 ? exerciseNames[i] : `Synthetic squat ${i + 1}`,
  provenance: ["curated", "ai_generated", "user_entered"][i % 3],
  completeness: ["stub", "listable", "enriched"][i % 3],
  retired: i % 7 === 0,
}));

// One admin audit-trail entry, in the row shape `app/admin/exercises/[id]/page.tsx` renders it
// in (ADR-0096). The page itself is a Server Component, so the row is replicated here rather
// than imported — what is under measurement is the instant's own text, which is the longest
// thing in that row and the part this change made longer.
export const auditEntry = { actor: "operator@example.com", createdAt: "2026-09-30T14:03:22.123456" };

// --- PROTOTYPE (live set density, throwaway) ---
// A realistic Session for judging the `?variant=` set-card prototypes: a bodyweight hold, a
// bodyweight pull, a loaded barbell lift with history, and a two-member Superset.
function prototypePrescription(
  position: number, exercise_id: number, exercise_name: string, sets: number, reps: string,
  recommended_load: ExercisePrescription["recommended_load"],
  previous: ExercisePrescription["previous_performance"] = [], superset_group: string | null = null,
): ExercisePrescription {
  return {
    position, sets, reps, rest_seconds: 90, tempo: null, recommended_load,
    prescribed_quantity: { kind: "repetitions", count: Number.parseInt(reps, 10) || 0, text: reps },
    exercise_id, exercise_name, exercise_description: null, targeted_muscles: [], required_equipment: [],
    provenance: "curated", previous_performance: previous, superset_group, round_rest_seconds: superset_group ? 90 : null,
  };
}
const bw = { kind: "bodyweight" as const, text: "bodyweight" };
export const prototypeWorkout: WorkoutSession = {
  id: 2, clerk_user_id: "audit-synthetic-account", training_type: "strength", duration_minutes: 45,
  has_been_regenerated: false, provenance: "user_authored", name: "Pull day",
  prescriptions: [
    prototypePrescription(1, 101, "Dead hang", 2, "45", bw, [{ reps: 45, load: bw }, { reps: 40, load: bw }]),
    prototypePrescription(2, 102, "Explosive pull-up", 4, "5", bw, [{ reps: 5, load: bw }, { reps: 5, load: bw }, { reps: 4, load: bw }]),
    prototypePrescription(3, 103, "Barbell row", 4, "8", { kind: "absolute", text: "70 kg", kg: 70 },
      [1, 2, 3, 4].map(() => ({ reps: 8, load: { kind: "absolute" as const, text: "67.5 kg", kg: 67.5 } }))),
    prototypePrescription(4, 104, "Incline dumbbell curl", 3, "12", { kind: "absolute", text: "12 kg", kg: 12 }, [], "ss1"),
    prototypePrescription(5, 105, "Face pull", 3, "15", { kind: "absolute", text: "20 kg", kg: 20 }, [], "ss1"),
  ],
};
