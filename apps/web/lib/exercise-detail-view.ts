// Shared Exercise Detail view helpers. This module has NO server-only imports, so
// it is safe to import from both Server and Client Components. The server-only data
// access (Clerk auth + fetch) lives in `lib/sessions.ts` and `lib/progress.ts`.

// The three lenses of the Exercise Detail screen (ADR-0017): SPECS (the catalog
// facts), HISTORY (every Logged Session of this Exercise), and RECORDS (PR-setting
// sets — filled by a later slice). The active tab is reflected in the URL as ?tab=.
export type ExerciseTab = "specs" | "history" | "records";

// Narrow an untrusted query value to one of the tabs, defaulting to SPECS.
export function toExerciseTab(value: string | undefined): ExerciseTab {
  return value === "history" || value === "records" ? value : "specs";
}

// A single Execution Step in a numbered list: its zero-padded `01…0N` ordinal and
// the authored text.
export interface NumberedStep {
  ordinal: string;
  text: string;
}

// How an Exercise's ordered Execution Steps (ADR-0015) should render:
// - `numbered`: two or more steps, shown as a `01…0N` numbered list;
// - `single`: exactly one step, shown as an un-numbered guidance block (never a
//   lone "01", which reads as a bug);
// - `empty`: no authored steps, so no Execution Steps block is shown.
export type ExecutionSteps =
  | { kind: "empty" }
  | { kind: "single"; step: string }
  | { kind: "numbered"; steps: NumberedStep[] };

// Decide how the ordered Execution Steps render. The step count always equals what
// the author wrote: this helper never chops prose or fabricates a step. Blank
// entries are dropped defensively so a stray empty line can never inflate the count
// or surface a lone "01".
export function toExecutionSteps(instructions: string[]): ExecutionSteps {
  const steps = instructions
    .map((step) => step.trim())
    .filter((step) => step.length > 0);

  if (steps.length === 0) return { kind: "empty" };
  if (steps.length === 1) return { kind: "single", step: steps[0] };
  return {
    kind: "numbered",
    steps: steps.map((text, index) => ({
      ordinal: String(index + 1).padStart(2, "0"),
      text,
    })),
  };
}
