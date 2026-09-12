// PROTOTYPE — Field Guide exercise discovery. Throwaway; see
// components/exercise-fieldguide-prototype/README.md.
//
// Classifies a catalog exercise into a BROAD MOVEMENT FAMILY so the library can carry
// a small, consistent line illustration per family — visual variety across 100+
// movements without 100+ bespoke drawings. Pure functions, no I/O, no React, so the
// classification (the risky part) stays trivially checkable.
//
// Honesty rule (from the brief): "use an illustrated generic movement only when it
// accurately represents the exercise." So a confident, name-keyword match earns its
// family glyph; a weak muscle-only guess is marked `inferred` (the UI can dim it); and
// no signal at all falls back to `movement` — the neutral generic glyph — never a
// misleading family.

export type MovementFamily =
  | "squat"
  | "hinge"
  | "push"
  | "pull"
  | "carry"
  | "locomotion"
  | "core"
  | "movement"; // the neutral generic — "some movement", no family asserted

// How sure we are of the family, which the UI uses to decide how boldly to draw it.
//  - "named":    a name keyword matched — trust the glyph fully.
//  - "inferred": no keyword, but the muscle mix strongly implies a family — show it, dimmed.
//  - "generic":  nothing conclusive — the neutral `movement` glyph.
export type FamilyConfidence = "named" | "inferred" | "generic";

export interface FamilyVerdict {
  family: MovementFamily;
  confidence: FamilyConfidence;
}

// The exercise fields the classifier reads. A structural subset of ExerciseSearchResult
// so either the browse row or the full detail can be classified.
export interface ClassifiableExercise {
  name: string;
  targeted_muscles: string[];
  required_equipment?: string[];
}

// Human labels + one-line "what this family is" blurbs for the field-guide UI.
export const FAMILY_LABEL: Record<MovementFamily, string> = {
  squat: "Squat",
  hinge: "Hinge",
  push: "Push",
  pull: "Pull",
  carry: "Carry",
  locomotion: "Locomotion",
  core: "Core",
  movement: "Movement",
};

export const FAMILY_BLURB: Record<MovementFamily, string> = {
  squat: "Bend at the knees and hips to lower and stand — the primary leg pattern.",
  hinge: "Push the hips back and drive them forward — the posterior-chain pattern.",
  push: "Press a load away from you, overhead or in front.",
  pull: "Draw a load toward you, from overhead or in front.",
  carry: "Hold a load and stay braced — often while moving.",
  locomotion: "Cover ground or drive a machine — running, rowing, cycling.",
  core: "Resist or create motion through the trunk.",
  movement: "A general movement — no single pattern dominates.",
};

// Name-keyword tables, checked in this priority order. Order matters where a movement
// could read two ways:
//  - Locomotion first, so "rowing"/"row erg" beats the "row" → pull keyword.
//  - Core before push/pull, so a distinctive core name ("Pallof Press", "Woodchop")
//    beats the generic "press"/"row"/"chop" verb it happens to contain.
//  - Hinge before pull, so "power clean" (hip drive) reads as a hinge, not the pull it
//    finishes with.
const FAMILY_KEYWORDS: ReadonlyArray<readonly [MovementFamily, readonly string[]]> = [
  [
    "locomotion",
    [
      "run",
      "sprint",
      "jog",
      "walk",
      "march",
      "rowing",
      "row erg",
      "row machine",
      "erg",
      "bike",
      "cycl",
      "spin",
      "elliptical",
      "ski erg",
      "skierg",
      "sled",
      "prowler",
      "crawl",
      "jump rope",
      "skip",
      "stair",
      "swim",
      "shuttle",
    ],
  ],
  [
    "carry",
    ["carry", "farmer", "suitcase", "waiter", "yoke", "loaded carry", "rack walk"],
  ],
  [
    "core",
    [
      "plank",
      "crunch",
      "sit-up",
      "situp",
      "sit up",
      "hollow",
      "dead bug",
      "deadbug",
      "russian twist",
      "leg raise",
      "knee raise",
      "pallof",
      "woodchop",
      "wood chop",
      "rotation",
      "anti-rotation",
      "mountain climber",
      "bicycle",
      "v-up",
      "v up",
      "flutter",
      "ab wheel",
      "ab rollout",
      "rollout",
      "toes to bar",
      "windmill",
    ],
  ],
  [
    "hinge",
    [
      "deadlift",
      "hinge",
      "rdl",
      "romanian",
      "good morning",
      "hip thrust",
      "glute bridge",
      "kettlebell swing",
      "kb swing",
      "swing",
      "clean",
      "snatch",
      "back extension",
      "hyperextension",
      "pull-through",
      "pull through",
    ],
  ],
  [
    "squat",
    [
      "squat",
      "lunge",
      "split squat",
      "step-up",
      "step up",
      "leg press",
      "pistol",
      "box squat",
      "goblet",
      "hack squat",
      "sissy",
      "bulgarian",
      "wall sit",
      "leg extension",
    ],
  ],
  [
    "pull",
    [
      "pull-up",
      "pullup",
      "pull up",
      "chin-up",
      "chinup",
      "chin up",
      "row", // after locomotion, so "rowing"/"erg" already claimed the machines
      "pulldown",
      "lat pull",
      "curl",
      "face pull",
      "shrug",
      "pullover",
      "rear delt",
      "reverse fly",
      "reverse flye",
      "dead hang",
      "deadhang",
      "inverted row",
    ],
  ],
  [
    "push",
    [
      "press",
      "push-up",
      "pushup",
      "push up",
      "bench",
      "dip",
      "fly",
      "flye",
      "overhead",
      "incline",
      "decline",
      "chest",
      "tricep",
      "triceps",
      "skullcrusher",
      "skull crusher",
      "pushdown",
      "push-down",
      "jerk",
      "thruster", // squat + press — the press keyword wins; both are defensible
      "kickback",
    ],
  ],
];

// Muscle-based fallback when no name keyword matched — a weaker signal, so any hit here
// is only ever "inferred". Keyed on lowercased substrings of muscle names. Deliberately
// conservative: only muscles that point cleanly at one family.
const MUSCLE_HINTS: ReadonlyArray<readonly [MovementFamily, readonly string[]]> = [
  ["core", ["abdominal", "abs", "oblique", "core", "transverse"]],
  ["hinge", ["hamstring", "glute", "erector", "lower back", "spinal erector"]],
  ["squat", ["quadricep", "quad", "calf", "calves", "adductor"]],
  ["push", ["chest", "pectoral", "tricep", "front delt", "anterior delt"]],
  ["pull", ["lat", "latissimus", "bicep", "rhomboid", "trapezius", "rear delt"]],
];

function normalize(text: string): string {
  return text.toLowerCase();
}

// Does `haystack` contain `needle` as a word-ish match? We keep it as a plain substring
// test — exercise names are short and the keyword tables are specific enough that
// substring false positives (e.g. "scaption" containing no keyword) are not a concern
// for a prototype. The one guard: keywords in the tables are chosen to be distinctive.
function contains(haystack: string, needle: string): boolean {
  return haystack.includes(needle);
}

// Classify one exercise. Name keywords first (confidence "named"); then a muscle-mix
// fallback (confidence "inferred"); else the neutral generic ("generic").
export function classifyMovementFamily(
  exercise: ClassifiableExercise,
): FamilyVerdict {
  const name = normalize(exercise.name);

  for (const [family, keywords] of FAMILY_KEYWORDS) {
    if (keywords.some((keyword) => contains(name, keyword))) {
      return { family, confidence: "named" };
    }
  }

  // No name signal — try the muscle mix. Count hits per family and take the clear
  // leader; a tie (two families equally implied) is not confident enough, so fall
  // through to generic.
  const muscles = exercise.targeted_muscles.map(normalize);
  const scores = new Map<MovementFamily, number>();
  for (const [family, hints] of MUSCLE_HINTS) {
    const hits = muscles.filter((muscle) =>
      hints.some((hint) => muscle.includes(hint)),
    ).length;
    if (hits > 0) scores.set(family, hits);
  }

  if (scores.size > 0) {
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const [topFamily, topScore] = ranked[0];
    const tie = ranked.length > 1 && ranked[1][1] === topScore;
    if (!tie) return { family: topFamily, confidence: "inferred" };
  }

  return { family: "movement", confidence: "generic" };
}

// Convenience for grouping views (variant C): the ordered families a taxonomy renders,
// with the generic bucket last so it reads as "everything else".
export const FAMILY_ORDER: readonly MovementFamily[] = [
  "squat",
  "hinge",
  "push",
  "pull",
  "carry",
  "locomotion",
  "core",
  "movement",
];
