"use client";

import { useActionState } from "react";

import { submitMetric, type RecordMetricState } from "@/app/metrics/actions";

const fieldStyle: React.CSSProperties = { display: "block", marginBottom: "1rem" };
const labelStyle: React.CSSProperties = { display: "block", fontWeight: 600 };

interface RecordMetricFormProps {
  today: string;
  // The metric currently being viewed, pre-filled so a reading lands in the same
  // series the user is looking at.
  defaultMetric: string;
}

// Records one dated metric reading (weight, body-fat, …). The metric name, a
// numeric value, and a date are required; the unit is free-form and optional.
export function RecordMetricForm({ today, defaultMetric }: RecordMetricFormProps) {
  const [state, action, pending] = useActionState<RecordMetricState, FormData>(
    submitMetric,
    { error: null, saved: false },
  );

  return (
    <form action={action}>
      {state.error ? (
        <p role="alert" style={{ color: "#b91c1c" }}>
          {state.error}
        </p>
      ) : null}
      {state.saved ? (
        <p role="status" style={{ color: "#15803d" }}>
          Reading saved.
        </p>
      ) : null}

      <label style={fieldStyle}>
        <span style={labelStyle}>Metric</span>
        <input
          name="metric"
          defaultValue={defaultMetric}
          placeholder="e.g. weight"
          required
        />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Value</span>
        <input name="value" type="number" step="any" required style={{ width: "8rem" }} />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Unit (optional)</span>
        <input name="unit" placeholder="e.g. kg" style={{ width: "8rem" }} />
      </label>

      <label style={fieldStyle}>
        <span style={labelStyle}>Date recorded</span>
        <input name="recorded_on" type="date" defaultValue={today} max={today} required />
      </label>

      <button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Record reading"}
      </button>
    </form>
  );
}
