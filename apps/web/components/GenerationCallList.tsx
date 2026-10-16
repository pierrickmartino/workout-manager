import Link from "next/link";

import { CallFact, GenerationCallHeadline } from "@/components/GenerationCallParts";
import type { GenerationCallRowView } from "@/lib/admin-generation-calls-view";
import { NAV_FORWARD } from "@/lib/nav-direction";

interface GenerationCallListProps {
  calls: readonly GenerationCallRowView[];
  // Whether the operator narrowed the log, so an empty page says "no match", not "no calls".
  isFiltered: boolean;
}

// The admin AI audit log's rows (issue #730, ADR-0135): one card per Generation Call, newest
// first. A card rather than a table row, so the columns wrap at 320px and 200% text instead of
// scrolling sideways; a Clerk user id is one unbroken token, so it breaks anywhere. Each card
// links to the call's detail page (issue #731).
export function GenerationCallList({
  calls,
  isFiltered,
}: GenerationCallListProps): React.JSX.Element {
  if (calls.length === 0) {
    return (
      <p className="font-mono text-[13px] text-text-muted">
        {isFiltered
          ? "No AI calls in the last 3 days match these filters."
          : "No AI calls in the last 3 days."}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {calls.map((call) => (
        <li key={call.id}>
          <Link
            href={call.href}
            {...NAV_FORWARD}
            className="flex flex-col gap-2 rounded-sm border border-border bg-surface px-3.5 py-2.5 font-mono text-[13px] transition-colors hover:bg-elevated/50"
          >
            <GenerationCallHeadline call={call} />
            <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
              <CallFact label="User" value={call.userLabel} />
              <CallFact label="Model" value={call.servedBy} />
              <CallFact label="Tokens in" value={call.inputTokensLabel} />
              <CallFact label="Tokens out" value={call.outputTokensLabel} />
              <CallFact label="Latency" value={call.latencyLabel} />
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}
