import { Trophy } from "lucide-react";

import type { PersonalRecordEntry } from "@/lib/analytics-types";
import { toRecordRows } from "@/lib/records-view";
import { Card } from "@/components/ui/card";

interface RecordsPanelProps {
  // The PR milestones from the record side (ADR-0017), newest-first. Empty for an
  // Exercise that can set no Personal Record (bodyweight / qualitative / no qualifying
  // history) — which renders the honest empty state, never an error.
  milestones: PersonalRecordEntry[];
}

// The RECORDS lens (ADR-0017): the sets where the user struck a new best Estimated 1RM
// for this Exercise, drawn from the shipped PR engine — the milestone history of the
// same yardstick the stat header and the SPECS trend read. Each row is a new Est. 1RM ·
// gain over the prior PR (a distinct "First PR" badge for the first) · date, newest
// first. An Exercise with no PR history shows an honest empty state, not a fabrication.
export function RecordsPanel({ milestones }: RecordsPanelProps): React.JSX.Element {
  const rows = toRecordRows(milestones);

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-start gap-2 p-6">
        <p className="font-sans text-sm text-text-secondary">
          No Personal Records yet. Log absolute-load sets in the 1–12 rep range and
          each new Estimated 1RM will land here as a milestone.
        </p>
        <p className="label-mono text-[11px] text-text-muted">NO RECORDS</p>
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border overflow-hidden py-0">
      {rows.map((row, index) => (
        <div
          key={`${row.date}-${index}`}
          className="flex items-center gap-3.5 px-4 py-3.5"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-cyan-dim text-cyan">
            <Trophy className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div className="flex flex-1 flex-col gap-0.5">
            <span className="font-sans text-[15px] font-medium text-text-primary">
              {row.estimate}
            </span>
            <span className="label-mono text-[11px] text-text-muted">
              {row.gain} · {row.date}
            </span>
          </div>
        </div>
      ))}
    </Card>
  );
}
