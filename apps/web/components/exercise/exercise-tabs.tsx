import Link from "next/link";

import { cn } from "@/lib/utils";
import type { ExerciseTab } from "@/lib/exercise-detail-view";

interface ExerciseTabsProps {
  exerciseId: number;
  active: ExerciseTab;
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
}: ExerciseTabsProps): React.JSX.Element {
  return (
    <div
      role="tablist"
      className="flex items-center gap-1 rounded-md border border-border bg-surface p-1"
    >
      {TABS.map(({ tab, label }) => {
        const isActive = tab === active;
        const href =
          tab === "specs"
            ? `/exercises/${exerciseId}`
            : `/exercises/${exerciseId}?tab=${tab}`;
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
