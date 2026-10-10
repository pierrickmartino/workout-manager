import Link from "next/link";

import { NAV_FORWARD } from "@/lib/nav-direction";
import type { ProgressStoryView } from "@/lib/progress-story-view";
import { Card } from "@/components/ui/card";

interface ProgressStoryCardProps {
  // The story already worded by `toProgressStoryView` — this component only lays it out.
  story: ProgressStoryView;
}

// The Progress Story (ADR-0127): one plain sentence on what changed since last time, then
// the two compared Logged Sessions side by side, each linking to its record so the claim
// can be checked, and a bodyweight story's Performed Body Weight change as a footnote. Plain text throughout, and one colour for every outcome — nothing
// encodes better or worse, so a decline reads as calmly as an improvement.
export function ProgressStoryCard({ story }: ProgressStoryCardProps): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p className="font-sans text-[15px] font-medium text-pretty text-text-primary">
        {story.headline}
      </p>
      {story.rows.length > 0 ? (
        // A wrapping row, not a two-column grid: each side asks for a width in rem, so the
        // pair sits side by side at 320px and stacks once text doubles, never clipping a
        // figure (ADR-0087).
        <ul className="flex flex-wrap gap-3">
          {story.rows.map((row) => (
            <li key={row.href} className="min-w-0 flex-1 basis-[7rem]">
              <Link
                {...NAV_FORWARD}
                href={row.href}
                className="flex h-full flex-col gap-0.5 rounded-sm border border-border px-3 py-2 hover:border-cyan"
              >
                <span className="label-mono text-[11px] text-text-muted">{row.label}</span>
                <span className="font-sans text-sm text-text-primary">{row.performance}</span>
                <span className="label-mono text-[11px] text-text-muted">{row.date}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {story.footnote !== null ? (
        <p className="font-sans text-xs text-text-muted">{story.footnote}</p>
      ) : null}
    </Card>
  );
}
