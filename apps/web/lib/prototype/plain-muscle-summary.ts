// PROTOTYPE — Field Guide exercise discovery. Throwaway; see
// components/exercise-fieldguide-prototype/README.md.
//
// Turns a raw targeted-muscle list into a plain-language sentence for the field-guide
// entry — "Builds your chest, shoulders, and triceps" instead of "Chest · Shoulders +1".
// Pure, no I/O. The existing `formatMuscleSummary` (the terse middot line) stays as-is
// for production; this is the friendlier, sentence-shaped voice the field guide wants.

// Cap the muscles we spell out so the sentence stays a glance, not a paragraph; the rest
// collapse into "and more". Kept small deliberately — the full list lives on Details.
const PLAIN_SUMMARY_LIMIT = 3;

// Lowercase the display muscle for mid-sentence flow ("your chest"), but leave known
// acronyms alone so we never write "your lats" as "your l ats" or lowercase a proper
// initialism awkwardly. Muscle names arrive already human-cased from the catalog.
function toPhraseCase(muscle: string): string {
  return muscle.toLowerCase();
}

// Join a list into an Oxford-comma clause: [] → "", [a] → "a", [a,b] → "a and b",
// [a,b,c] → "a, b, and c".
function joinNaturally(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  const head = parts.slice(0, -1).join(", ");
  return `${head}, and ${parts[parts.length - 1]}`;
}

// The full field-guide sentence. Empty muscles → "" so the caller can omit the line
// rather than print an empty "Builds your.". More muscles than the limit fold into
// "…and N more".
export function plainMuscleSummary(muscles: readonly string[]): string {
  if (muscles.length === 0) return "";

  const shown = muscles.slice(0, PLAIN_SUMMARY_LIMIT).map(toPhraseCase);
  const moreCount = muscles.length - shown.length;

  const clause =
    moreCount > 0
      ? `${joinNaturally(shown)}, and ${moreCount} more`
      : joinNaturally(shown);

  return `Builds your ${clause}.`;
}
