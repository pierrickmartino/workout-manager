"use server";

import { revalidatePath } from "next/cache";

import { recordMetric } from "@/lib/metrics";

export interface RecordMetricState {
  error: string | null;
  saved: boolean;
}

// Record one dated metric reading. The metric name and a finite numeric value are
// required; the unit is optional. On success the metrics page is revalidated so
// the new reading shows in the history immediately.
export async function submitMetric(
  _prevState: RecordMetricState,
  form: FormData,
): Promise<RecordMetricState> {
  const metric =
    typeof form.get("metric") === "string" ? String(form.get("metric")).trim() : "";
  if (metric === "") {
    return { error: "Name the metric you're recording (e.g. weight).", saved: false };
  }

  const rawValue =
    typeof form.get("value") === "string" ? String(form.get("value")).trim() : "";
  const value = Number(rawValue);
  if (rawValue === "" || !Number.isFinite(value)) {
    return { error: "Enter a numeric value for the reading.", saved: false };
  }

  const recordedOn =
    typeof form.get("recorded_on") === "string"
      ? String(form.get("recorded_on")).trim()
      : "";
  if (recordedOn === "") {
    return { error: "Pick the date of the reading.", saved: false };
  }

  const rawUnit =
    typeof form.get("unit") === "string" ? String(form.get("unit")).trim() : "";

  const result = await recordMetric({
    metric,
    value,
    unit: rawUnit === "" ? null : rawUnit,
    recorded_on: recordedOn,
  });
  if (!result.success || !result.data) {
    return { error: result.error ?? "Could not save your reading.", saved: false };
  }

  revalidatePath("/metrics");
  return { error: null, saved: true };
}
