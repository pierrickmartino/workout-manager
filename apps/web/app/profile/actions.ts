"use server";

import { redirect } from "next/navigation";

import {
  GENDER_OPTIONS,
  SENSITIVE_CONSTRAINT_TYPES,
  TRAINING_TYPES,
  saveProfile,
  type ProfileInput,
} from "@/lib/profile";

export interface ProfileFormState {
  error: string | null;
}

const VALID_SENSITIVE = new Set<string>(
  SENSITIVE_CONSTRAINT_TYPES.map((c) => c.value),
);

const VALID_GENDERS = new Set<string>(GENDER_OPTIONS.map((g) => g.value));

function text(form: FormData, name: string): string | null {
  const value = form.get(name);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function number(form: FormData, name: string): number | null {
  const raw = text(form, name);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

// Split a free-text list (one item per line or comma-separated) into a clean
// array, dropping blanks.
function list(form: FormData, name: string): string[] {
  const raw = text(form, name);
  if (raw === null) return [];
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function fitnessLevels(form: FormData): Record<string, number> {
  const levels: Record<string, number> = {};
  for (const trainingType of TRAINING_TYPES) {
    const value = number(form, `level_${trainingType}`);
    if (value !== null) {
      levels[trainingType] = value;
    }
  }
  return levels;
}

// Gender is a constrained choice: keep the submitted value only if it is one of
// the known options, otherwise treat it as unset.
function gender(form: FormData): string | null {
  const value = text(form, "gender");
  return value !== null && VALID_GENDERS.has(value) ? value : null;
}

function sensitiveConstraints(form: FormData): string[] {
  return form
    .getAll("sensitive_constraints")
    .filter((value): value is string => typeof value === "string")
    .filter((value) => VALID_SENSITIVE.has(value));
}

function toProfileInput(form: FormData): ProfileInput {
  return {
    display_name: text(form, "display_name"),
    gender: gender(form),
    age: number(form, "age"),
    height_cm: number(form, "height_cm"),
    weight_kg: number(form, "weight_kg"),
    training_habits: text(form, "training_habits"),
    recent_workout: text(form, "recent_workout"),
    default_equipment: list(form, "default_equipment"),
    fitness_levels: fitnessLevels(form),
    preferences: list(form, "preferences"),
    sensitive_constraints: sensitiveConstraints(form),
  };
}

export async function submitProfile(
  _prevState: ProfileFormState,
  form: FormData,
): Promise<ProfileFormState> {
  const result = await saveProfile(toProfileInput(form));
  if (!result.success) {
    return { error: result.error ?? "Could not save your profile." };
  }
  redirect("/dashboard");
}
