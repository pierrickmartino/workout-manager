// Quick equipment presets for the generate forms. A preset is a one-tap set of
// common kit that populates the existing free-text equipment field — the values
// then flow through the generation request exactly as hand-typed equipment does.
// This module is pure (no I/O, no React) so it is unit-testable in isolation and
// safe to import from Client Components.

export interface EquipmentPreset {
  label: string;
  items: readonly string[];
}

// A bodyweight user's common kit, so they need not hand-type it each time (#198).
export const CALISTHENICS_PRESET: EquipmentPreset = {
  label: "Calisthenics",
  items: ["pull-up bar", "rings", "parallettes", "dip bars"],
};

// Merge preset items into the current free-text equipment value, additively and
// without duplicating what is already there. The result reads back through the
// same comma/newline parsing the forms use today.
export function applyEquipmentPreset(
  currentText: string,
  items: readonly string[],
): string {
  const merged = [...parseEquipment(currentText)];
  const seen = new Set(merged.map((item) => item.toLowerCase()));
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      merged.push(item);
      seen.add(key);
    }
  }
  return merged.join(", ");
}

// Split a free-text equipment list (comma- or newline-separated) into a clean
// array, dropping blanks.
export function parseEquipment(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
