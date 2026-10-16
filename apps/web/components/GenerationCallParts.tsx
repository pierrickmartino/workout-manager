import { Badge } from "@/components/ui/badge";
import { LocalInstant } from "@/components/pulse/local-instant";
import type { GenerationCallRowView } from "@/lib/admin-generation-calls-view";

// The pieces the AI audit log's list card and its call detail share (issues #730/#731): the
// headline (kind, outcome, instant) and one wrapping fact. Each surface picks its own facts.

interface GenerationCallHeadlineProps {
  call: GenerationCallRowView;
}

export function GenerationCallHeadline({
  call,
}: GenerationCallHeadlineProps): React.JSX.Element {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-text-primary">{call.kindLabel}</span>
        <Badge variant={call.isError ? "magenta" : "muted"}>{call.outcomeLabel}</Badge>
      </div>
      <span className="text-[11px] text-text-muted">
        <LocalInstant iso={call.createdAt} />
      </span>
    </>
  );
}

interface CallFactProps {
  label: string;
  value: string;
}

// A Clerk user id or a model slug is one unbroken token, so the value breaks anywhere.
export function CallFact({ label, value }: CallFactProps): React.JSX.Element {
  return (
    <div className="flex min-w-0 gap-1.5">
      <dt className="text-text-muted">{label}</dt>
      <dd className="min-w-0 break-all text-text-secondary">{value}</dd>
    </div>
  );
}
