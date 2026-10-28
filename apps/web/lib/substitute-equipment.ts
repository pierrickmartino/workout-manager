// The Available Equipment picker before a Substitution (ADR-0143, #789). The user picks the
// equipment they have for this one action: pre-filled with their Default Equipment, with a one-tap
// "Bodyweight only" (an empty selection, ADR-0038). The saved Fitness Profile is never changed.
// Pure: no server or React imports, so it is unit-testable with `node --test`.

import { EQUIPMENT_LABEL, EQUIPMENT_ORDER, type Equipment } from "./equipment.ts";
import { toggleFacetValue } from "./exercise-browse-query.ts";

// "bodyweight" needs no equipment (Bodyweight only is the empty selection) and "other" names no real
// piece of equipment, so neither is a pickable option.
const NOT_PICKABLE: ReadonlySet<Equipment> = new Set<Equipment>(["bodyweight", "other"]);

export const SUBSTITUTE_EQUIPMENT_OPTIONS: readonly Equipment[] = EQUIPMENT_ORDER.filter(
  (item) => !NOT_PICKABLE.has(item),
);

const PICKABLE = new Set<string>(SUBSTITUTE_EQUIPMENT_OPTIONS);

// The form field names the picker posts, read back by `readSubstituteEquipment`.
export const EQUIPMENT_FIELD = "available_equipment";
export const EQUIPMENT_STATED_FIELD = "equipment_stated";

export const BODYWEIGHT_ONLY_LABEL = "Bodyweight only";

// Keep only pickable tokens, deduplicated, in the canonical order.
function inCanonicalOrder(values: readonly string[]): Equipment[] {
  const wanted = new Set(values);
  return SUBSTITUTE_EQUIPMENT_OPTIONS.filter((item) => wanted.has(item));
}

// The picker's starting selection: the Profile's canonical Default Equipment
// (`default_equipment_canonical`).
export function prefillSubstituteEquipment(defaultEquipment: readonly string[]): Equipment[] {
  return inCanonicalOrder(defaultEquipment.filter((value) => PICKABLE.has(value)));
}

// A new selection with `item` added when absent or removed when present.
export function toggleSubstituteEquipment(
  selected: readonly Equipment[],
  item: Equipment,
): Equipment[] {
  return inCanonicalOrder(toggleFacetValue(selected, item));
}

export function isBodyweightOnly(selected: readonly Equipment[]): boolean {
  return selected.length === 0;
}

// The one-line summary of the chosen equipment.
export function substituteEquipmentSummary(selected: readonly Equipment[]): string {
  if (isBodyweightOnly(selected)) return BODYWEIGHT_ONLY_LABEL;
  return selected.map((item) => EQUIPMENT_LABEL[item]).join(", ");
}

// The Available Equipment a posted Substitute form states, or `undefined` when the form never
// stated any (the server then inherits the Default Equipment). Values outside the picker's
// options are dropped; an empty stated list is bodyweight only.
export function readSubstituteEquipment(form: FormData): Equipment[] | undefined {
  if (form.get(EQUIPMENT_STATED_FIELD) === null) return undefined;
  const values = form
    .getAll(EQUIPMENT_FIELD)
    .filter((value): value is string => typeof value === "string");
  return inCanonicalOrder(values.filter((value) => PICKABLE.has(value)));
}
