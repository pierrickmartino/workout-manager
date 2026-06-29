"use server";

import { redirect } from "next/navigation";

import {
  TRAINING_TYPES,
  generateSession,
  type GenerateSessionInput,
} from "@/lib/sessions";

export interface GenerateFormState {
  error: string | null;
}

const VALID_TRAINING_TYPES = new Set<string>(TRAINING_TYPES);

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

// Split a free-text equipment list (comma- or newline-separated) into a clean
// array, dropping blanks.
function equipmentList(form: FormData): string[] {
  return text(form, "equipment")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function toInput(form: FormData): GenerateSessionInput | null {
  const trainingType = text(form, "training_type");
  if (!VALID_TRAINING_TYPES.has(trainingType)) return null;

  const duration = Number(text(form, "duration_minutes"));
  if (!Number.isInteger(duration) || duration < 1) return null;

  return {
    training_type: trainingType,
    duration_minutes: duration,
    equipment: equipmentList(form),
  };
}

export async function submitGenerate(
  _prevState: GenerateFormState,
  form: FormData,
): Promise<GenerateFormState> {
  const input = toInput(form);
  if (input === null) {
    return { error: "Pick a training type and a duration of at least 1 minute." };
  }

  const result = await generateSession(input);
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not generate your session." };
  }

  redirect(`/sessions/${result.data.id}`);
}
