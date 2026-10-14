// The Scheme Next Step projection — the Scheme Preview (ADR-0064/0065, #452) split into the parts
// a set table places: **what changes next** (`+2.5 kg`, `+1 rep`), **the condition that earns it**,
// and **what a miss costs**. The Session detail card reads it as the "NEXT" row under the planned
// sets; the full sentence (`scheme-preview`) stays the explanation beside each scheme choice.
//
// A read-time projection like its sentence twin: it stores nothing and touches no record. It names
// the *change*, never a resulting value: stepping is a function of the logged record, not of the
// plan's Load (ADR-0066), so "82.5 kg next" from an 80 kg plan would be a promise the engine does
// not make. It branches exactly as `schemePreview` does and reuses its parsing and constants, so
// the two never disagree about whether a movement steps.
//
// No server-only imports, so it is safe in both Server and Client Components.

import type { Load } from "./load.ts";
import type { ProgressionScheme } from "./scheme-view.ts";
import {
  DECREASE_KG,
  INCREASE_KG,
  LOW_EFFORT_MAX,
  RESET_PERCENT,
  SESSION_COUNT_N,
  axisOf,
  formatKg,
  greyskullFloor,
  ordinal,
  parseRepTarget,
} from "./scheme-preview.ts";

// Which value the step moves: the table puts `change` in the matching column, and a harder
// variation replaces the movement rather than a value.
export type NextStepMoves = "load" | "reps" | "variation";

export type SchemeNextStep =
  | { kind: "hold"; reason: string }
  | {
      kind: "step";
      moves: NextStepMoves;
      change: string;
      when: string;
      // What a miss costs, or null when the scheme never steps down.
      otherwise: string | null;
    };

const ADD_LOAD = `+${formatKg(INCREASE_KG)}`;
const ADD_REP = "+1 rep";

function hold(reason: string): SchemeNextStep {
  return { kind: "hold", reason };
}

function doubleStep(reps: string, load: Load | null | undefined): SchemeNextStep {
  const axis = axisOf(load);
  if (axis === "none") return hold("Double Progression needs a single load value to step.");
  const target = parseRepTarget(reps);
  if (target === null) {
    return hold(`Double Progression needs a set rep target to step; “${reps.trim()}” isn’t one.`);
  }
  const when = `every set reaches ${target.ceiling} at RPE ${LOW_EFFORT_MAX} or lower`;
  if (axis === "weight") {
    return {
      kind: "step",
      moves: "load",
      change: ADD_LOAD,
      when,
      otherwise: `miss the ${target.floor}-rep floor and it backs off ${formatKg(DECREASE_KG)}`,
    };
  }
  if (target.floor < target.ceiling) {
    return { kind: "step", moves: "reps", change: ADD_REP, when, otherwise: null };
  }
  return { kind: "step", moves: "variation", change: "Harder variation", when, otherwise: null };
}

function greyskullStep(reps: string, load: Load | null | undefined): SchemeNextStep {
  if (axisOf(load) !== "weight") return hold("Greyskull-style Linear only steps a weighted movement.");
  const floor = greyskullFloor(reps);
  if (floor === null) return hold("Greyskull-style Linear needs a rep floor to check.");
  return {
    kind: "step",
    moves: "load",
    change: ADD_LOAD,
    when: `the all-out final set clears ${floor} reps`,
    otherwise: `miss it and the load resets down ${RESET_PERCENT}%`,
  };
}

function sessionCountStep(load: Load | null | undefined): SchemeNextStep {
  const axis = axisOf(load);
  if (axis === "none") return hold("Session-Count-Based needs a single load value to step.");
  return {
    kind: "step",
    moves: axis === "weight" ? "load" : "reps",
    change: axis === "weight" ? ADD_LOAD : ADD_REP,
    when: `every ${ordinal(SESSION_COUNT_N)} time you train it`,
    otherwise: null,
  };
}

// The next step a Progression Scheme takes for a movement's reps and typed Load.
export function schemeNextStep(
  scheme: ProgressionScheme,
  reps: string,
  load: Load | null | undefined,
): SchemeNextStep {
  switch (scheme) {
    case "double_progression":
      return doubleStep(reps, load);
    case "greyskull":
      return greyskullStep(reps, load);
    case "session_count":
      return sessionCountStep(load);
    case "static":
      return hold("Static holds it as written; you set the numbers by hand.");
  }
}
