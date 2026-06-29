"use client";

import { useActionState } from "react";

import { submitLog, type LogFormState } from "@/app/sessions/[id]/log/actions";
import type { ExercisePrescription } from "@/lib/sessions-types";

const fieldStyle: React.CSSProperties = { display: "block", marginBottom: "1rem" };
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600 };
const rowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "center",
  marginBottom: "0.75rem",
  flexWrap: "wrap",
};

const RPE_VALUES = Array.from({ length: 10 }, (_, index) => index + 1);

interface LogSessionFormProps {
  sessionId: number;
  prescriptions: ExercisePrescription[];
  today: string;
}

// Records a performance of a Session. One row per prescribed Exercise lets the
// user enter the real reps, load, and perceived difficulty (RPE 1–10) they did;
// rows left without reps are skipped. The session id is carried in a hidden field
// so the server action can target the right Session.
export function LogSessionForm({ sessionId, prescriptions, today }: LogSessionFormProps) {
  const [state, action, pending] = useActionState<LogFormState, FormData>(submitLog, {
    error: null,
  });

  return (
    <form action={action}>
      <input type="hidden" name="session_id" value={sessionId} />

      {state.error ? (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {state.error}
        </p>
      ) : null}

      <label style={fieldStyle}>
        <span style={labelStyle}>Date performed</span>
        <input name="performed_on" type="date" defaultValue={today} max={today} required />
      </label>

      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={labelStyle}>Sets performed</legend>
        {prescriptions.map((prescription) => (
          <div key={prescription.exercise_id} style={rowStyle}>
            <input type="hidden" name="exercise_id" value={prescription.exercise_id} />
            <span style={{ minWidth: "10rem" }}>{prescription.exercise_name}</span>
            <label>
              Reps{" "}
              <input
                name="reps"
                type="number"
                min={0}
                style={{ width: "5rem" }}
                aria-label={`Reps for ${prescription.exercise_name}`}
              />
            </label>
            <label>
              Load{" "}
              <input
                name="load"
                placeholder="e.g. 70kg"
                style={{ width: "7rem" }}
                aria-label={`Load for ${prescription.exercise_name}`}
              />
            </label>
            <label>
              RPE{" "}
              <select name="rpe" defaultValue="" aria-label={`RPE for ${prescription.exercise_name}`}>
                <option value="">—</option>
                {RPE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </fieldset>

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save log"}
      </button>
    </form>
  );
}
