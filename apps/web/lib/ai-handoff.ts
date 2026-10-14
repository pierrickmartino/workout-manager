// The AI Hand-off view-model (ADR-0132): one Logged Session as the plain text a user previews and
// then sends, from their own device, to an outside AI assistant for a critique. Pure and
// browser-safe, so the whole format is pinned by `ai-handoff.test.ts` and the sheet that shows it
// stays a thin renderer.
//
// The text is a **translation for an outside reader**, not our UI: it speaks plain gym language
// ("ended early", "warm-up"), so the plain-wording tables below are deliberate and their words do
// not belong in the terminology guard. Every number still routes through the shared formatters
// (`formatLoad`, `formatQuantity`, `formatPace`, `formatEffort`) — this module relabels, it never
// re-derives a unit or a Load type.
//
// What never goes in: the exact date, body weight unless a bodyweight Load needs it, and (later
// slices) Sensitive Constraints, the Effective Fitness Level and our Progression decision.

import { loggedSetEffort, formatEffort, type Effort } from "./effort.ts";
import { formatBodyWeight, formatLoad, isPureBodyweight, type Load } from "./load.ts";
import { formatPace, formatQuantity, type Quantity } from "./quantity.ts";
import { setNoteText } from "./note-view.ts";
import { resolveSetType, type SetType } from "./set-type-view.ts";
import type { LoggedSession, LoggedSet } from "./logs-types.ts";
import type { WorkoutSession } from "./sessions-types.ts";
import type { WeightUnit } from "./weight-unit.ts";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 60 * SECONDS_PER_MINUTE;

// The editable opening instruction: pasted on its own, it asks the assistant for a useful
// critique; the user can delete or rewrite it in the assistant before sending.
export const AI_HANDOFF_LEAD_IN =
  "Please critique this workout. Tell me what went well, what I should change next time, and anything that looks risky.";

// The permanent disclosure line the sheet always shows (ADR-0132): never dismissed, so it needs
// no stored flag.
export const AI_HANDOFF_DISCLOSURE =
  "This text leaves Workout Manager. The AI app you send it to handles it under its own terms.";

export interface AiHandoffInput {
  // The saved record the text is built from — never Live Session state.
  record: LoggedSession;
  // The reader's Weight Unit, so every Load reads in kg or lb.
  unit: WeightUnit;
  // The source plan, for a plan-backed record whose plan could be read; absent otherwise. This
  // slice reads only how many exercises it prescribes — the "M" of "Ended early: N of M
  // exercises done".
  plan?: Pick<WorkoutSession, "prescriptions"> | null;
}

export interface AiHandoff {
  // The full plain text that leaves the app, exactly as previewed.
  text: string;
  // Whether the sheet shows the Sensitive-Constraint caveat. Always false until the profile is
  // read (issue #714).
  showSensitiveCaveat: boolean;
}

// Training Types in plain words. An uncurated type reads as itself.
const TRAINING_TYPE_WORDS: Record<string, string> = {
  strength: "strength training",
  cardio: "cardio",
  hiit: "HIIT",
  yoga: "yoga",
  mobility: "mobility work",
};

// The Training Types whose timed sets are holds (a pose, a stretch), so a duration reads
// "held for …" rather than as timed work.
const HOLD_TRAINING_TYPES: ReadonlySet<string> = new Set(["yoga", "mobility"]);

// Set Types in plain words; a working set carries no mark.
const SET_TYPE_WORDS: Record<SetType, string | null> = {
  warm_up: "warm-up",
  working: null,
  drop: "drop set",
  failure: "to failure",
  amrap: "as many reps as possible",
};

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

// Join the parts that are present, skipping the absent ones.
function joinPresent(parts: ReadonlyArray<string | null>, separator: string): string {
  return parts.filter((part) => part !== null).join(separator);
}

// A span of time in words to the second ("25 minutes", "1 minute 30 seconds"), never a bare
// clock an outside reader could misread as hours:minutes.
function timeWords(totalSeconds: number): string {
  const rounded = Math.round(Math.max(0, totalSeconds));
  const hours = Math.floor(rounded / SECONDS_PER_HOUR);
  const minutes = Math.floor((rounded % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = rounded % SECONDS_PER_MINUTE;
  return (
    joinPresent(
      [
        hours > 0 ? plural(hours, "hour", "hours") : null,
        minutes > 0 ? plural(minutes, "minute", "minutes") : null,
        seconds > 0 ? plural(seconds, "second", "seconds") : null,
      ],
      " ",
    ) || "0 seconds"
  );
}

// A measured Session Duration in words, to the minute ("52 minutes", "1 hour 5 minutes"), or
// null when the record measured none.
function sessionDurationWords(totalSeconds: number | null): string | null {
  if (totalSeconds === null) return null;
  const totalMinutes = Math.round(Math.max(0, totalSeconds) / SECONDS_PER_MINUTE);
  if (totalMinutes < 1) return "under a minute";
  return timeWords(totalMinutes * SECONDS_PER_MINUTE);
}

// One exercise of the record, with its sets in performed order.
interface PerformedExercise {
  exerciseId: number;
  name: string;
  sets: LoggedSet[];
}

// The exercises a record performed, in first-performed order, each with its sets in order.
function exercisesInPerformedOrder(sets: readonly LoggedSet[]): PerformedExercise[] {
  const ordered = [...sets].sort((a, b) => a.position - b.position);
  const groups = new Map<number, PerformedExercise>();
  for (const loggedSet of ordered) {
    const group = groups.get(loggedSet.exercise_id);
    groups.set(loggedSet.exercise_id, {
      exerciseId: loggedSet.exercise_id,
      name: group?.name ?? loggedSet.exercise_name,
      sets: [...(group?.sets ?? []), loggedSet],
    });
  }
  return [...groups.values()];
}

// The distinct exercises a plan prescribes, or null when there is no plan.
function plannedExerciseIds(plan: AiHandoffInput["plan"]): ReadonlySet<number> | null {
  if (plan == null) return null;
  return new Set(plan.prescriptions.map((prescription) => prescription.exercise_id));
}

// The Completion Outcome in plain words, or null when the record declares none (an ad-hoc log).
// With a plan, only prescribed exercises count as done (matching is by exercise), so a substitute
// or an extra never inflates "N of M".
function outcomeWords(
  outcome: LoggedSession["completion_outcome"],
  performed: readonly PerformedExercise[],
  planned: ReadonlySet<number> | null,
): string | null {
  if (outcome === "completed") return "Finished the whole session.";
  if (outcome !== "incomplete") return null;
  if (planned === null) {
    return `Ended early: ${plural(performed.length, "exercise", "exercises")} done.`;
  }
  const done = performed.filter((exercise) => planned.has(exercise.exerciseId)).length;
  return `Ended early: ${done} of ${plural(planned.size, "exercise", "exercises")} done.`;
}

function sessionLine(record: LoggedSession, outcome: string | null): string {
  const type = TRAINING_TYPE_WORDS[record.training_type] ?? record.training_type;
  const line = `Session: ${joinPresent([type, sessionDurationWords(record.duration_seconds)], ", ")}.`;
  return outcome === null ? line : `${line} ${outcome}`;
}

// A distance in words: as logged, then its time and pace when a time was logged with it
// ("5 km in 25 minutes, pace 5:00 per km").
function distanceWords(quantity: Quantity): string {
  const distance = formatQuantity(quantity);
  const pace = formatPace(quantity);
  if (pace === null || quantity.duration_s == null) return distance;
  return `${distance} in ${timeWords(quantity.duration_s)}, pace ${pace.replace(" /", " per ")}`;
}

// A timed set in words: a hold in a hold-based Training Type ("held for 1 minute"), timed work
// otherwise ("40 seconds of work"). A time the record could not measure reads as logged.
function timedQuantityWords(quantity: Quantity, trainingType: string): string {
  if (quantity.seconds == null) return formatQuantity(quantity);
  const time = timeWords(quantity.seconds);
  return HOLD_TRAINING_TYPES.has(trainingType) ? `held for ${time}` : `${time} of work`;
}

// A set's Quantity in words, by its kind: a rep count reads "8 reps"; a distance reads
// with its time and pace; a duration reads as a hold or as timed work.
function quantityWords(quantity: Quantity | null, trainingType: string): string | null {
  if (quantity == null) return null;
  if (quantity.kind === "repetitions" && quantity.count != null) {
    return plural(quantity.count, "rep", "reps");
  }
  if (quantity.kind === "distance") return distanceWords(quantity);
  if (quantity.kind === "duration") return timedQuantityWords(quantity, trainingType);
  return formatQuantity(quantity);
}

// A pure bodyweight Load stored as shorthand ("BW", "body weight"). Only this reads as plain
// "bodyweight"; a bodyweight Load whose text says more ("BW + light band") keeps that text.
const BODYWEIGHT_SHORTHAND = /^\s*(?:bw|body\s*weight)\s*$/i;

// The top of the reps-in-reserve scale, which stands for "5 or more" (the backend `RIR_MAX`).
const RIR_CEILING = 5;

// A Load in plain words, by its type. Weights route through `formatLoad`, so they read in the
// user's Weight Unit; this only relabels shorthand ("BW" → "bodyweight", "70% 1RM" → "70% of
// 1-rep max").
function loadWords(load: Load, unit: WeightUnit): string {
  if (isPureBodyweight(load) && BODYWEIGHT_SHORTHAND.test(load.text)) return "bodyweight";
  if (load.kind === "percent_1rm" && load.percent != null) {
    return `${load.percent}% of 1-rep max`;
  }
  return formatLoad(load, unit);
}

// Logged Effort in plain words, on the scale it was logged in.
function effortWords(effort: Effort | null): string | null {
  if (effort === null) return null;
  if (effort.scale === "rpe") return formatEffort(effort);
  if (effort.value >= RIR_CEILING) return `${RIR_CEILING} or more reps in reserve`;
  return `${plural(effort.value, "rep", "reps")} in reserve`;
}

function setLine(
  loggedSet: LoggedSet,
  index: number,
  unit: WeightUnit,
  trainingType: string,
): string {
  const mark = SET_TYPE_WORDS[resolveSetType(loggedSet.set_type)];
  const label = mark === null ? `Set ${index + 1}` : `Set ${index + 1} (${mark})`;
  const quantity = quantityWords(loggedSet.quantity, trainingType);
  const load = loggedSet.load == null ? null : loadWords(loggedSet.load, unit);
  const core = joinPresent([quantity, load], " @ ") || "nothing recorded";
  const bodyWeight =
    loggedSet.load?.kind === "bodyweight" && loggedSet.body_weight_kg != null
      ? `body weight ${formatBodyWeight(loggedSet.body_weight_kg, unit)}`
      : null;
  const details = joinPresent([core, bodyWeight, effortWords(loggedSetEffort(loggedSet))], ", ");
  const note = setNoteText(loggedSet);
  return note === null ? `- ${label}: ${details}` : `- ${label}: ${details}. Note: “${note}”`;
}

function performedBlock(
  performed: readonly PerformedExercise[],
  unit: WeightUnit,
  trainingType: string,
): string {
  const lines = performed.flatMap((exercise) => [
    exercise.name,
    ...exercise.sets.map((loggedSet, index) => setLine(loggedSet, index, unit, trainingType)),
  ]);
  return ["Performed:", ...lines].join("\n");
}

// Build the AI Hand-off for one Logged Session. Reads its inputs and returns new values only.
export function aiHandoff({ record, unit, plan = null }: AiHandoffInput): AiHandoff {
  const performed = exercisesInPerformedOrder(record.logged_sets);
  const outcome = outcomeWords(record.completion_outcome, performed, plannedExerciseIds(plan));
  const text = [
    AI_HANDOFF_LEAD_IN,
    sessionLine(record, outcome),
    performedBlock(performed, unit, record.training_type),
  ].join("\n\n");
  return { text, showSensitiveCaveat: false };
}
