// Session Section — the read-time composition bucket of an Exercise Prescription
// (CONTEXT: Session Section; ADR-0074). Where a movement sits in a Session's arc —
// warm-up / main work / accessory / cooldown — that the Builder's composition strip
// groups a Session by.
//
// This is the frontend twin of `app/domain/session_section.py`: the Builder edits a
// client-side draft, so it re-derives sections here from the same rules as the user adds,
// removes, and reorders exercises (the server projects the identical sections onto a plan
// *read*, but the live draft never round-trips). Kept a pure view-model with co-located
// tests, like `scheme-preview` / `prescription-summary` — no React, no I/O. Signals: the
// warm-up Set Type, name keywords for mobility / cardio / compound / isolation movements,
// and position. It is a heuristic, honest about it: an unclaimed movement falls to
// `accessory`, the neutral supporting-work bucket, never forced into main work.

export type SessionSectionKey = "warm_up" | "main" | "accessory" | "cooldown";

// The arc of a session, warm-up first to cooldown last — the presentation order the strip
// renders bands in.
export const SECTION_ORDER: readonly SessionSectionKey[] = [
  "warm_up",
  "main",
  "accessory",
  "cooldown",
];

// How many leading compound movements read as main work; the rest of the work block is
// accessory. Mirrors MAIN_WORK_LIMIT in the Python domain — keep the two in step.
export const MAIN_WORK_LIMIT = 3;

// The Prescription fields the classifier reads. A DraftPrescription satisfies this
// structurally (exerciseName / setType / quantityKind), so the Builder passes its draft
// rows straight in.
export interface Sectionable {
  exerciseName: string;
  setType: string | null;
  quantityKind?: string | null;
}

// Compound, multi-joint movements — the main-work candidates. Checked after isolation so
// an isolation name containing a compound stem still reads as accessory.
const COMPOUND_KEYWORDS = [
  "squat", "deadlift", "rdl", "romanian", "hinge", "hip thrust", "lunge",
  "split squat", "step-up", "step up", "leg press", "bench", "press", "dip",
  "push-up", "pushup", "push up", "row", "pull-up", "pullup", "pull up", "chin-up",
  "chinup", "chin up", "pulldown", "lat pull", "clean", "snatch", "jerk", "thruster",
  "good morning", "hack squat", "front squat", "back squat", "overhead",
];

// Isolation, single-joint movements — always accessory. Checked first so "face pull" /
// "leg extension" never read as a compound pull/press.
const ISOLATION_KEYWORDS = [
  "curl", "extension", "raise", "fly", "flye", "face pull", "kickback", "pushdown",
  "push-down", "shrug", "pec deck", "calf", "lateral", "rear delt", "reverse fly",
  "reverse flye", "cable cross", "crossover", "concentration", "preacher", "cuban",
  "pull-apart", "pull apart",
];

// Mobility / stretch — warm-up when leading a session, cooldown when trailing (position
// decides, in `sectionize`).
const MOBILITY_KEYWORDS = [
  "stretch", "mobility", "foam roll", "foamroll", "world's greatest", "worlds greatest",
  "cat-cow", "cat cow", "pigeon", "child's pose", "childs pose", "cobra",
  "downward dog", "couch stretch", "hip opener", "thoracic", "scapular", "wall slide",
  "hip circle", "leg swing", "arm circle",
];

// Dynamic prep / activation — warm-up only.
const WARM_UP_KEYWORDS = [
  "warm-up", "warmup", "warm up", "activation", "inchworm", "jumping jack",
  "high knee", "butt kick", "a-skip", "b-skip", "dynamic",
];

// Conditioning / cardio — warm-up when leading; cooldown when trailing and done for time.
const CARDIO_KEYWORDS = [
  "run", "sprint", "jog", "treadmill", "row erg", "erg", "assault bike", "bike", "cycl",
  "spin", "elliptical", "ski erg", "skierg", "jump rope", "burpee", "mountain climber",
  "stair", "shuttle",
];

// Down-regulation / breathing — cooldown only.
const BREATHING_KEYWORDS = [
  "breathing", "savasana", "meditation", "cool-down", "cooldown", "cool down",
];

const FOR_TIME_KINDS = new Set(["duration", "distance"]);

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function containsAny(name: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => name.includes(keyword));
}

// A warm-up Set Type is the strongest warm-up signal. Mirrors the domain `is_warm_up`: an
// unset or any other value is not a warm-up.
function isWarmUpSet(setType: string | null | undefined): boolean {
  return setType === "warm_up";
}

function isForTime(quantityKind: string | null | undefined): boolean {
  return quantityKind != null && FOR_TIME_KINDS.has(quantityKind);
}

function isWarmUpLike(item: Sectionable): boolean {
  if (isWarmUpSet(item.setType)) return true;
  const name = normalize(item.exerciseName);
  return (
    containsAny(name, WARM_UP_KEYWORDS) ||
    containsAny(name, MOBILITY_KEYWORDS) ||
    containsAny(name, CARDIO_KEYWORDS)
  );
}

function isCooldownLike(item: Sectionable): boolean {
  const name = normalize(item.exerciseName);
  if (containsAny(name, MOBILITY_KEYWORDS) || containsAny(name, BREATHING_KEYWORDS)) {
    return true;
  }
  return containsAny(name, CARDIO_KEYWORDS) && isForTime(item.quantityKind);
}

// Assign each Prescription in a Session, in order, to its Session Section (ADR-0074).
// Warm-up is the leading run of prep material (or an explicit warm-up Set Type); cooldown
// is the trailing run of down-regulation material; the work block between them is main work
// for its first MAIN_WORK_LIMIT compound movements and accessory for the rest. Returns one
// section per input, in input order.
export function sectionize(items: readonly Sectionable[]): SessionSectionKey[] {
  const count = items.length;
  const sections: (SessionSectionKey | null)[] = new Array(count).fill(null);

  // Explicit warm-up Set Type wins wherever it sits.
  for (let index = 0; index < count; index += 1) {
    if (isWarmUpSet(items[index].setType)) sections[index] = "warm_up";
  }

  // Leading warm-up run.
  let lead = 0;
  while (lead < count && (sections[lead] === "warm_up" || isWarmUpLike(items[lead]))) {
    sections[lead] = "warm_up";
    lead += 1;
  }

  // Trailing cooldown run — never consuming a movement already claimed by the warm-up.
  let tail = count - 1;
  while (tail >= 0 && sections[tail] === null && isCooldownLike(items[tail])) {
    sections[tail] = "cooldown";
    tail -= 1;
  }

  // Work block: the first MAIN_WORK_LIMIT compound movements are main work; isolation is
  // always accessory; anything else falls to accessory.
  let mainCount = 0;
  for (let index = 0; index < count; index += 1) {
    if (sections[index] !== null) continue;
    const name = normalize(items[index].exerciseName);
    if (containsAny(name, ISOLATION_KEYWORDS)) {
      sections[index] = "accessory";
    } else if (containsAny(name, COMPOUND_KEYWORDS) && mainCount < MAIN_WORK_LIMIT) {
      sections[index] = "main";
      mainCount += 1;
    } else {
      sections[index] = "accessory";
    }
  }

  return sections.map((section) => section ?? "accessory");
}

// One contiguous band of one Section, carrying the original positions of the Prescriptions
// in it. Because warm-up is only ever leading and cooldown only trailing, the sections are
// contiguous, so a band is a run of same-section positions — exactly what the strip renders.
export interface SectionBand {
  section: SessionSectionKey;
  positions: number[];
}

// Group an ordered Session into contiguous Section bands, preserving original positions so
// the Builder can dispatch edits/selection by position. A section change starts a new band.
export function sectionBands(items: readonly Sectionable[]): SectionBand[] {
  const keys = sectionize(items);
  const bands: SectionBand[] = [];
  keys.forEach((section, index) => {
    const last = bands[bands.length - 1];
    if (last && last.section === section) {
      last.positions.push(index);
    } else {
      bands.push({ section, positions: [index] });
    }
  });
  return bands;
}
