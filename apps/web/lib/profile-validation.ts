import { TRAINING_TYPES } from "./profile-types.ts";

export type ProfileFieldErrors = Record<string, string>;

// Mirror the API's numeric constraints, before optional parsing can erase bad input.
export function validateProfileForm(form: FormData): ProfileFieldErrors {
  const rules: readonly [string, string, (value: number) => boolean][] = [
    ["age", "Enter a whole age from 0 to 150.", (n) => Number.isInteger(n) && n >= 0 && n <= 150],
    ["height_cm", "Enter a height greater than 0 cm.", (n) => n > 0],
    ["weight_kg", "Enter a weight greater than 0 kg.", (n) => n > 0],
    ["default_rest_seconds", "Enter a positive whole number of seconds.", (n) => Number.isInteger(n) && n > 0],
    ...TRAINING_TYPES.map((type): [string, string, (value: number) => boolean] => [
      `level_${type}`, "Choose a fitness level from 1 to 10.",
      (n) => Number.isInteger(n) && n >= 1 && n <= 10,
    ]),
  ];
  return Object.fromEntries(rules.flatMap(([name, message, valid]) => {
    const raw = form.get(name);
    if (raw === null || (typeof raw === "string" && raw.trim() === "")) return [];
    const value = typeof raw === "string" ? Number(raw) : NaN;
    return Number.isFinite(value) && valid(value) ? [] : [[name, message]];
  }));
}
