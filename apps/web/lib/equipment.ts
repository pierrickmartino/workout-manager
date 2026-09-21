// The Equipment vocabulary — presentation model for the Catalog equipment facet and the
// per-exercise kit chip (ADR-0077). The backend classifies each free-text equipment string
// into one curated, canonical Equipment (a read-time projection) and emits the lowercase wire
// token; this module owns the *presentation* side the server does not: the human label and the
// canonical order. No server or React imports, so it is safe in any component and unit-testable
// with `node --test`. Mirrors `movement-pattern.ts`, the sibling curated-taxonomy module.

// The wire tokens the backend emits (app/domain/equipment.py). "other" is the honest
// "no alias claims this" bucket, always shown last.
export type Equipment =
  | "barbell"
  | "dumbbell"
  | "kettlebell"
  | "bench"
  | "rack"
  | "cable"
  | "machine"
  | "resistance band"
  | "pull-up bar"
  | "rings"
  | "parallettes"
  | "suspension trainer"
  | "medicine ball"
  | "box"
  | "jump rope"
  | "foam roller"
  | "cardio machine"
  | "bodyweight"
  | "other";

// Canonical presentation order, "other" last — mirrors the backend EQUIPMENT_ORDER so the
// client never re-sorts the server's already-ordered facet options into a different shape.
export const EQUIPMENT_ORDER: readonly Equipment[] = [
  "barbell",
  "dumbbell",
  "kettlebell",
  "bench",
  "rack",
  "cable",
  "machine",
  "resistance band",
  "pull-up bar",
  "rings",
  "parallettes",
  "suspension trainer",
  "medicine ball",
  "box",
  "jump rope",
  "foam roller",
  "cardio machine",
  "bodyweight",
  "other",
];

// Human labels for the facet chips and kit markers — the Title-Case display form of each
// canonical token.
export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  bench: "Bench",
  rack: "Rack",
  cable: "Cable",
  machine: "Machine",
  "resistance band": "Resistance Band",
  "pull-up bar": "Pull-Up Bar",
  rings: "Rings",
  parallettes: "Parallettes",
  "suspension trainer": "Suspension Trainer",
  "medicine ball": "Medicine Ball",
  box: "Box",
  "jump rope": "Jump Rope",
  "foam roller": "Foam Roller",
  "cardio machine": "Cardio Machine",
  bodyweight: "Bodyweight",
  other: "Other",
};

const KNOWN_EQUIPMENT = new Set<string>(EQUIPMENT_ORDER);

// Resolve a raw wire value to an Equipment, defaulting an unknown/legacy token to "other" so
// an unexpected value from an older or future API renders as the honest catch-all rather than a
// broken chip.
export function parseEquipment(value: string): Equipment {
  return KNOWN_EQUIPMENT.has(value) ? (value as Equipment) : "other";
}

// The human label for a raw wire token, resolving unknown tokens through "other".
export function equipmentLabel(value: string): string {
  return EQUIPMENT_LABEL[parseEquipment(value)];
}
