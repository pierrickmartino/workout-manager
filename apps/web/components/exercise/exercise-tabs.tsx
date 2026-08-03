import Link from "next/link";

import { cn } from "@/lib/utils";
import type { ExerciseTab } from "@/lib/exercise-detail-view";
import { appendFrom } from "@/lib/back-target";

interface ExerciseTabsProps {
  exerciseId: number;
  active: ExerciseTab;
  // The `?from=` origin to preserve across tab switches, so changing lens never
  // drops the back target the screen was opened with.
  from?: string;
}

const TABS: { tab: ExerciseTab; label: string }[] = [
  { tab: "specs", label: "SPECS" },
  { tab: "history", label: "HISTORY" },
  { tab: "records", label: "RECORDS" },
];

// The SPECS / HISTORY / RECORDS switcher (ADR-0017). Server-rendered as links so the
// screen needs no client JavaScript; the active lens is scoped via ?tab=, so a
// refresh or shared link lands on the same tab. SPECS is the default and omits the
// query so /exercises/[id] stays the canonical URL.
export function ExerciseTabs({
  exerciseId,
  active,
  from,
}: ExerciseTabsProps): React.JSX.Element {
  return (
    <div
      role="tablist"
      className="flex items-center gap-1 rounded-md border border-border bg-surface p-1"
    >
      {TABS.map(({ tab, label }) => {
        const isActive = tab === active;
        const href = appendFrom(
          tab === "specs"
            ? `/exercises/${exerciseId}`
            : `/exercises/${exerciseId}?tab=${tab}`,
          from,
        );
        return (
          <Link
            key={tab}
            href={href}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "flex-1 rounded-sm py-1.5 text-center label-mono text-[11px] font-semibold transition-colors",
              isActive
                ? "bg-cyan/15 text-cyan"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
