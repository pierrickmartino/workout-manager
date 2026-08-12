"use server";

import { redirect } from "next/navigation";

import { logSession, type LogSetInput } from "@/lib/logs";
import type { CompletionOutcome } from "@/lib/logs-types";
import { repetitionsInput } from "@/lib/quantity";

export interface LogFormState {
  error: string | null;
}

const MIN_RPE = 1;
const MAX_RPE = 10;

function strings(form: FormData, name: string): string[] {
  return form.getAll(name).map((value) => (typeof value === "string" ? value.trim() : ""));
}

// The client submits only Done (attempted) rows — a skipped set disables its inputs, so they
// never reach here (Model B, Q10). Read the derived Completion Outcome back off the form,
// falling back to `completed` for any missing/unknown value so the action never fabricates an
// outcome the form did not send.
function completionOutcome(form: FormData): CompletionOutcome {
  return form.get("completion_outcome") === "incomplete" ? "incomplete" : "completed";
}

// Build the per-set payload from the row-aligned form fields. Every submitted row is an
// attempted set, so a blank reps field logs as 0 reps (a set ground out to failure is still
// attempted, CONTEXT 'Completion Outcome') rather than being dropped.
function loggedSets(form: FormData): LogSetInput[] {
  const exerciseIds = strings(form, "exercise_id");
  const reps = strings(form, "reps");
  const loadKinds = strings(form, "load_kind");
  const loadValues = strings(form, "load_value");
  const rpes = strings(form, "rpe");

  const sets: LogSetInput[] = [];
  for (let row = 0; row < exerciseIds.length; row += 1) {
    const repsValue = reps[row] === "" ? 0 : Number(reps[row]);
    if (!Number.isInteger(repsValue) || repsValue < 0) continue;

    const exerciseId = Number(exerciseIds[row]);
    if (!Number.isInteger(exerciseId)) continue;

    const rpeValue = rpes[row] === "" ? null : Number(rpes[row]);
    const perceivedDifficulty =
      rpeValue !== null && Number.isInteger(rpeValue) && rpeValue >= MIN_RPE && rpeValue <= MAX_RPE
        ? rpeValue
        : null;

    // Carry the picked kinds through; the backend types the amount and the load from
    // them. The reps become a repetitions Quantity via the shared mapper. An empty load
    // value means "no load recorded" for this set (the backend maps it to null).
    sets.push({
      exercise_id: exerciseId,
      ...repetitionsInput(repsValue),
      load_kind: (loadKinds[row] || "absolute") as LogSetInput["load_kind"],
      load_value: loadValues[row] === "" ? null : loadValues[row],
      perceived_difficulty: perceivedDifficulty,
    });
  }
  return sets;
}

export async function submitLog(
  _prevState: LogFormState,
  form: FormData,
): Promise<LogFormState> {
  const sessionId = Number(form.get("session_id"));
  if (!Number.isInteger(sessionId)) {
    return { error: "Could not determine which session to log." };
  }

  const performedOn = typeof form.get("performed_on") === "string" ? String(form.get("performed_on")).trim() : "";
  if (performedOn === "") {
    return { error: "Pick the date you performed this session." };
  }

  const sets = loggedSets(form);
  if (sets.length === 0) {
    return { error: "Mark at least one set as done to log this session." };
  }

  // The Completion Outcome is now derived per-set (Q8, ADR-0045): the form marks each
  // prescribed set done or skipped, and reports Incomplete when any prescribed set was left
  // un-attempted — no longer the old always-`completed` declaration.
  const result = await logSession(sessionId, {
    performed_on: performedOn,
    completion_outcome: completionOutcome(form),
    logged_sets: sets,
  });
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not save your log." };
  }

  redirect("/history");
}
