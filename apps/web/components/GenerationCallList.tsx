import { Badge } from "@/components/ui/badge";
import { LocalInstant } from "@/components/pulse/local-instant";
import type { GenerationCallRowView } from "@/lib/admin-generation-calls-view";

interface GenerationCallListProps {
  calls: readonly GenerationCallRowView[];
}

// The admin AI audit log's rows (issue #730, ADR-0135): one card per Generation Call, newest
// first. A card rather than a table row, so the columns wrap at 320px and 200% text instead of
// scrolling sideways; a Clerk user id is one unbroken token, so it breaks anywhere.
export function GenerationCallList({
  calls,
}: GenerationCallListProps): React.JSX.Element {
  if (calls.length === 0) {
    return (
      <p className="font-mono text-[13px] text-text-muted">
        No AI calls in the last 3 days.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {calls.map((call) => (
        <li
          key={call.id}
          className="flex flex-col gap-2 rounded-sm border border-border bg-surface px-3.5 py-2.5 font-mono text-[13px]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-text-primary">{call.kindLabel}</span>
            <Badge variant={call.isError ? "magenta" : "muted"}>
              {call.outcomeLabel}
            </Badge>
          </div>
          <span className="text-[11px] text-text-muted">
            <LocalInstant iso={call.createdAt} />
          </span>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
            <Fact label="User" value={call.userLabel} />
            <Fact label="Model" value={call.servedBy} />
            <Fact label="Tokens in" value={call.inputTokensLabel} />
            <Fact label="Tokens out" value={call.outputTokensLabel} />
            <Fact label="Latency" value={call.latencyLabel} />
          </dl>
        </li>
      ))}
    </ul>
  );
}

interface FactProps {
  label: string;
  value: string;
}

function Fact({ label, value }: FactProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 break-all text-text-secondary">{value}</dd>
    </div>
  );
}
