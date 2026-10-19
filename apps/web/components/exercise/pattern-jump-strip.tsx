import { PATTERN_LABEL, parseMovementPattern } from "@/lib/movement-pattern";
import { patternAnchorId } from "@/lib/catalog-entry-view";
import { MovementPlate } from "@/components/exercise/movement-glyph";

// The field-guide index's jump strip (ADR-0072): one illustrated link per Movement Pattern
// present in the filtered catalog, pinned under the app header so a reader can skip between
// families of a long, unpaged list. In-page anchors only — it changes no filter and is not a
// navigation, so it carries no direction (ADR-0121). Scrolls sideways when the families
// outgrow the width; the page itself never does.

interface PatternJumpStripProps {
  patterns: readonly string[];
}

export function PatternJumpStrip({ patterns }: PatternJumpStripProps): React.JSX.Element | null {
  if (patterns.length === 0) return null;

  return (
    <nav
      aria-label="Jump to a movement pattern"
      className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-6 border-b border-border bg-base px-6 py-2.5 lg:mx-0 lg:px-0"
    >
      <ul className="flex gap-2 overflow-x-auto scrollbar-thin">
        {patterns.map((raw) => {
          const pattern = parseMovementPattern(raw);
          return (
            <li key={raw} className="shrink-0">
              <a
                href={`#${patternAnchorId(pattern)}`}
                className="flex flex-col items-center gap-1 rounded-lg px-1.5 py-1 transition-colors hover:bg-elevated"
              >
                <MovementPlate pattern={pattern} className="h-12 w-12" />
                <span className="font-sans text-[11px] font-medium text-text-secondary">
                  {PATTERN_LABEL[pattern]}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
