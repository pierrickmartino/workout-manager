import Link from "next/link";

import { SectionHeader } from "@/components/pulse/section-header";
import { Card } from "@/components/ui/card";
import { NAV_FORWARD } from "@/lib/nav-direction";
import type { GeneratorKindCountView } from "@/lib/admin-dashboard-view";

// The admin home's calls-by-Generator-Kind list (issue #769, ADR-0142): a plain list, no chart,
// in the Operations column. Thin by design: labels, counts and hrefs come from
// `lib/admin-dashboard-view.ts`. Server-safe — no hooks, no client JS. Like the tile row it is
// `hidden lg:flex`, so the phone admin home is unchanged; and it renders nothing when the
// summary failed, because the AI tile group's inline error already says so.
interface GeneratorKindBreakdownProps {
  // `null` when the summary could not be read: the AI group's inline error already says so.
  kinds: readonly GeneratorKindCountView[] | null;
}

export function GeneratorKindBreakdown({
  kinds,
}: GeneratorKindBreakdownProps): React.JSX.Element | null {
  if (kinds === null) return null;
  return (
    <section className="hidden lg:flex lg:flex-col lg:gap-4">
      <SectionHeader>CALLS BY GENERATOR KIND</SectionHeader>
      <Card className="p-0">
        <ul className="flex flex-col divide-y divide-border">
          {kinds.map((kind) => (
            <li key={kind.kind} className="min-w-0">
              {/* One link per kind, named by its label then its count, the order drawn. */}
              <Link
                href={kind.href}
                {...NAV_FORWARD}
                className="flex items-baseline justify-between gap-4 px-4 py-3 transition-colors hover:text-cyan"
              >
                <span className="min-w-0 font-mono text-[13px] text-text-primary">{kind.label}</span>
                <span className="font-display text-base font-bold text-text-primary">{kind.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}
