// Shared Fitness Profile constants and types. This module has NO server-only
// imports, so it is safe to import from both Server and Client Components. The
// server-only data access (Clerk auth + fetch) lives in `lib/profile.ts`.

// Mirrors the backend's SensitiveConstraintType. Sensitive Constraints are
// stored as these specific types; `is_sensitive` is derived from them.
export const SENSITIVE_CONSTRAINT_TYPES = [
  { value: "injury", label: "Injury" },
  { value: "rehabilitation", label: "Rehabilitation" },
  { value: "postpartum", label: "Postpartum" },
  { value: "flagged_medical", label: "Flagged medical limitation" },
] as const;

export type SensitiveConstraintType =
  (typeof SENSITIVE_CONSTRAINT_TYPES)[number]["value"];

// Training types a Fitness Level can be held against (1–10, per type).
export const TRAINING_TYPES = [
  "strength",
  "cardio",
  "hiit",
  "yoga",
  "mobility",
] as const;

export type TrainingType = (typeof TRAINING_TYPES)[number];

export interface Profile {
  id: number;
  clerk_user_id: string;
  display_name: string | null;
  gender: string | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  training_habits: string | null;
  recent_workout: string | null;
  default_equipment: string[];
  fitness_levels: Record<string, number>;
  preferences: string[];
  sensitive_constraints: string[];
  is_sensitive: boolean;
}

// The editable subset sent to PUT /api/profile (onboarding and edits share it).
export interface ProfileInput {
  display_name: string | null;
  gender: string | null;
  age: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  training_habits: string | null;
  recent_workout: string | null;
  default_equipment: string[];
  fitness_levels: Record<string, number>;
  preferences: string[];
  sensitive_constraints: string[];
}

// A profile is "onboarded" once the core demographics and at least one
// per-type Fitness Level are present. Used to route new users to onboarding.
export function isProfileComplete(profile: Profile): boolean {
  return profile.age !== null && Object.keys(profile.fitness_levels).length > 0;
}
