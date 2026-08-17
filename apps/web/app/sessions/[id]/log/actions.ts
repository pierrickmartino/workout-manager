"use server";

import { redirect } from "next/navigation";

import { logSession } from "@/lib/logs";
import type { CompletionOutcome } from "@/lib/logs-types";
import { buildLoggedSets, readLogFormRows } from "@/lib/log-session-form";

export interface LogFormState {
  error: string | null;
}

// The client submits only Done (attempted) rows — a skipped set marks its `done` field false,
// so the reader drops it (Model B, Q10). Read the derived Completion Outcome back off the
// form, falling back to `completed` for any missing/unknown value so the action never
// fabricates an outcome the form did not send.
function completionOutcome(form: FormData): CompletionOutcome {
  return form.get("completion_outcome") === "incomplete" ? "incomplete" : "completed";
}

export async function submitLog(
  _prevState: LogFormState,
  form: FormData,
): Promise<LogFormState> {
  const sessionId = Number(form.get("session_id"));
  if (!Number.isInteger(sessionId)) {
    return { error: "Could not determine which session to log." };
  }

  const performedOn =
    typeof form.get("performed_on") === "string"
      ? String(form.get("performed_on")).trim()
      : "";
  if (performedOn === "") {
    return { error: "Pick the date you performed this session." };
  }

  // Reading the rows and typing the per-set Quantity by kind live in the pure lib
  // (`readLogFormRows` / `buildLoggedSets`, ADR-0050): the action stays a thin caller and the
  // "which kind, reject-or-skip?" rules are unit-tested. A malformed distance/duration
  // rejects the whole submission with a clear message; a malformed reps set drops silently.
  const built = buildLoggedSets(readLogFormRows(form));
  if (!built.ok) {
    return { error: built.error };
  }
  if (built.sets.length === 0) {
    return { error: "Mark at least one set as done to log this session." };
  }

  // The Completion Outcome is derived per-set (Q8, ADR-0045): the form marks each prescribed
  // set done or skipped, and reports Incomplete when any prescribed set was left un-attempted.
  const result = await logSession(sessionId, {
    performed_on: performedOn,
    completion_outcome: completionOutcome(form),
    logged_sets: built.sets,
  });
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not save your log." };
  }

  redirect("/history");
}
