"use client";

import { useActionState } from "react";

import { submitGenerate, type GenerateFormState } from "@/app/sessions/actions";
import { TRAINING_TYPES } from "@/lib/sessions";

const fieldStyle: React.CSSProperties = { display: "block", marginBottom: "1rem" };
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600 };

export function GenerateSessionForm() {
  const [state, action, pending] = useActionState<GenerateFormState, FormData>(
    submitGenerate,
    { error: null },
  );

  return (
    <form action={action}>
      {state.error ? (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {state.error}
        </p>
      ) : null}

      <label style={fieldStyle}>
        <span style={labelStyle}>Training type</span>
        <select name="training_type" defaultValue="strength">
          {TRAINING_TYPES.map((trainingType) => (
            <option key={trainingType} value={trainingType}>
              {trainingType}
            </option>
          ))}
        </select>
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Duration (minutes)</span>
        <input
          name="duration_minutes"
          type="number"
          min={1}
          max={360}
          defaultValue={45}
        />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Equipment</span>
        <input
          name="equipment"
          placeholder="dumbbells, pull-up bar (leave blank for bodyweight)"
        />
      </label>

      <button type="submit" disabled={pending}>
        {pending ? "Generating…" : "Generate session"}
      </button>
    </form>
  );
}
