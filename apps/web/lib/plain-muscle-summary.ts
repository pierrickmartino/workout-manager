// Turns a catalog Exercise's raw targeted-muscle list into a plain-language sentence for
// the field-guide taxonomy entry — "Builds your chest, shoulders, and triceps" instead of
// the terse "Chest · Shoulders +1" line the pick-mode rows use (ADR-0072). Pure, no I/O;
// the terse `formatMuscleSummary` stays for the Library picker, this is the friendlier
// sentence voice the field guide wants.

// Cap the muscles spelled out so the sentence stays a glance, not a paragraph; the rest
// collapse into "N more". The full list still lives on Exercise Detail.
export const PLAIN_SUMMARY_LIMIT = 3;

// Join a list into an Oxford-comma clause: [] → "", [a] → "a", [a,b] → "a and b",
// [a,b,c] → "a, b, and c".
function joinNaturally(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  const head = parts.slice(0, -1).join(", ");
  return `${head}, and ${parts[parts.length - 1]}`;
}

// The full field-guide sentence. Empty muscles → "" so the caller can omit the line rather
// than print "Builds your." More muscles than the limit fold into "…and N more".
export function plainMuscleSummary(muscles: readonly string[]): string {
  if (muscles.length === 0) return "";

  const shown = muscles.slice(0, PLAIN_SUMMARY_LIMIT).map((m) => m.toLowerCase());
  const moreCount = muscles.length - shown.length;

  // With overflow the "…and N more" tail is the final clause, so the shown muscles join
  // with plain commas — Oxford-joining them too would produce a double "and" ("triceps,
  // and 2 more" preceded by "shoulders, and triceps").
  const clause =
    moreCount > 0
      ? `${shown.join(", ")}, and ${moreCount} more`
      : joinNaturally(shown);

  return `Builds your ${clause}.`;
}
