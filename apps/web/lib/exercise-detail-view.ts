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

// The muscle emphasis of a catalog Exercise (ADR-0016), as the SPECS muscle map
// should render it:
// - `split`: a populated Primary/Secondary split — shown as PRIMARY/SECONDARY
//   sections (a section renders only when its list is non-empty);
// - `flat`: no asserted split, so the flat targeted-muscle union is shown as one
//   row with no primacy;
// - `empty`: no muscles recorded at all, so no muscle map is shown.
export type MuscleEmphasis =
  | { kind: "empty" }
  | { kind: "flat"; muscles: string[] }
  | { kind: "split"; primary: string[]; secondary: string[] };

// The three muscle fields the serializer returns: the durable flat union plus the
// Primary/Secondary emphasis split layered on top.
export interface ExerciseMuscles {
  targeted_muscles: string[];
  primary_muscles: string[];
  secondary_muscles: string[];
}

function cleaned(muscles: string[]): string[] {
  return muscles.map((muscle) => muscle.trim()).filter((muscle) => muscle.length > 0);
}

// Decide how the muscle map renders. Primacy is honored only when the split is
// actually asserted: an empty split falls back to the flat union — this helper
// never fabricates a primary/secondary from a flat list. Blank entries are dropped
// defensively so a stray whitespace value can never surface as a real muscle.
export function toMuscleEmphasis(muscles: ExerciseMuscles): MuscleEmphasis {
  const primary = cleaned(muscles.primary_muscles);
  const secondary = cleaned(muscles.secondary_muscles);
  if (primary.length > 0 || secondary.length > 0) {
    return { kind: "split", primary, secondary };
  }

  const flat = cleaned(muscles.targeted_muscles);
  if (flat.length === 0) return { kind: "empty" };
  return { kind: "flat", muscles: flat };
}
