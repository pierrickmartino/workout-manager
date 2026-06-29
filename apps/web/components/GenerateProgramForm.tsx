"use client";

import { GenerationProgress } from "@/components/GenerationProgress";
import { TRAINING_TYPES } from "@/lib/sessions-types";
import { useProgramGeneration } from "@/lib/use-program-generation";

const fieldStyle: React.CSSProperties = { display: "block", marginBottom: "1rem" };
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600 };

// Split a free-text equipment list (comma- or newline-separated) into a clean
// array, dropping blanks — mirrors the standalone Session form.
function parseEquipment(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function GenerateProgramForm() {
  const { phase, error, start } = useProgramGeneration();
  const busy = phase === "submitting" || phase === "generating";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await start({
      training_type: String(form.get("training_type") ?? ""),
      objective: String(form.get("objective") ?? "").trim(),
      sessions_per_week: Number(form.get("sessions_per_week")),
      duration_minutes: Number(form.get("duration_minutes")),
      weeks: Number(form.get("weeks")),
      equipment: parseEquipment(String(form.get("equipment") ?? "")),
    });
  }

  if (busy) {
    return <GenerationProgress />;
  }

  return (
    <form onSubmit={onSubmit}>
      {error ? (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {error}
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
        <span style={labelStyle}>Objective</span>
        <input
          name="objective"
          required
          placeholder="e.g. gain muscle mass"
          defaultValue="gain muscle mass"
        />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Sessions per week</span>
        <input
          name="sessions_per_week"
          type="number"
          min={1}
          max={14}
          defaultValue={3}
        />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Weeks</span>
        <input name="weeks" type="number" min={1} max={52} defaultValue={4} />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Session duration (minutes)</span>
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

      <button type="submit">Generate program</button>
    </form>
  );
}
