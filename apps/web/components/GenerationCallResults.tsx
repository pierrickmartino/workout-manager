import { GenerationCallList } from "@/components/GenerationCallList";
import { GenerationCallTable } from "@/components/GenerationCallTable";
import type { GenerationCallRowView } from "@/lib/admin-generation-calls-view";

interface GenerationCallResultsProps {
  calls: readonly GenerationCallRowView[];
  isFiltered: boolean;
}

// The AI audit log's rows at both shell widths (issue #771, ADR-0088): the card list below `lg:`
// exactly as before, the table from `lg:`, switched by CSS only. A mountable component rather
// than classes on the page, so `audit/wide.mjs` and `audit/reflow.mjs` render the page's real
// switch rather than a copy of it. Both are server-rendered markup, so hiding one ships no
// client JavaScript for it. An empty page has no table: the list's empty copy says it once.
export function GenerationCallResults({
  calls,
  isFiltered,
}: GenerationCallResultsProps): React.JSX.Element {
  if (calls.length === 0) {
    return <GenerationCallList calls={calls} isFiltered={isFiltered} />;
  }

  return (
    <div>
      <div className="lg:hidden">
        <GenerationCallList calls={calls} isFiltered={isFiltered} />
      </div>
      <div className="hidden lg:block">
        <GenerationCallTable calls={calls} />
      </div>
    </div>
  );
}
