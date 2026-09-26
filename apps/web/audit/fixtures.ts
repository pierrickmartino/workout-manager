import type { LoggedSession } from "@/lib/logs-types";
import type { SessionSummary } from "@/lib/session-library";
import type { ExerciseSearchResult } from "@/lib/exercises-types";
import type { ExercisePrescription, WorkoutSession } from "@/lib/sessions-types";
import type { Profile } from "@/lib/profile-types";

export const names = ["Long workout name with spaces ".repeat(5).slice(0, 120), "W".repeat(120)];
export const exerciseNames = ["Long exercise name with spaces ".repeat(4).slice(0, 100), "W".repeat(100)];
export const exercises: ExerciseSearchResult[] = Array.from({ length: 50 }, (_, i) => ({
  id: i + 1, name: i < 2 ? exerciseNames[i] : `Synthetic squat ${i + 1}`,
  targeted_muscles: ["quadriceps", "glutes"], required_equipment: ["barbell"],
  difficulty: 5, provenance: "curated", movement_pattern: "squat", equipment: ["barbell"],
}));
export const taxonomy = { groups: [{ pattern: "squat", count: exercises.length, exercises }], total: exercises.length };
export const sessions: SessionSummary[] = names.map((name, i) => ({
  id: i + 1, name, display_name: name, training_type: "strength", created_at: "2026-09-01",
  author: { display_name: "Long author name ".repeat(6) }, authored_by_me: false,
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
  provenance: "curated", previous_performance: [],
}));
export const workout: WorkoutSession = {
  id: 1, clerk_user_id: "audit-synthetic-account", training_type: "strength", duration_minutes: 30,
  has_been_regenerated: false, provenance: "user_authored", name: names[0], prescriptions,
};
export const profile: Profile = {
  id: 1, clerk_user_id: "audit-synthetic-account", display_name: names[0], gender: null,
  age: 100, height_cm: 199.9, weight_kg: 199.9, training_habits: null, recent_workout: null,
  default_rest_seconds: 120, default_equipment: ["barbell"], default_equipment_canonical: ["barbell"],
  fitness_levels: { strength: 10 }, preferences: [], sensitive_constraints: [], is_sensitive: false,
};
