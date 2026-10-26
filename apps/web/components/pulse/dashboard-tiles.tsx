import Link from "next/link";

import { Alert } from "@/components/pulse/alert";
import { SectionHeader } from "@/components/pulse/section-header";
import { NAV_FORWARD } from "@/lib/nav-direction";
import type { DashboardGroupView, DashboardTileView } from "@/lib/admin-dashboard-view";

// The admin home's summary tiles (ADR-0142). Thin by design: every label, value, footnote,
// href and state comes from `lib/admin-dashboard-view.ts`. Server-safe — no hooks, no client JS.

// One tile is one link, and its accessible name is its label then its value (then the
// footnote), the order they are drawn in. It navigates deeper into the admin area, so it is
// tagged forward (ADR-0121).
function DashboardTile({ tile }: { tile: DashboardTileView }): React.JSX.Element {
  return (
    <li className="min-w-0">
      <Link
        href={tile.href}
        {...NAV_FORWARD}
        className="flex h-full flex-col gap-1 rounded-md border border-border bg-surface p-4 transition-colors hover:border-cyan"
      >
        <span className="label-mono text-[10px] text-text-muted">{tile.label}</span>
        <span className="font-display text-2xl font-bold text-text-primary">{tile.value}</span>
        {tile.footnote ? (
          <span className="label-mono text-[10px] text-text-muted">{tile.footnote}</span>
        ) : null}
      </Link>
    </li>
  );
}

// One group: its heading, then its tiles (ready or empty) or its inline error (failed). A
// failed group never takes another group, or anything else on the page, down with it.
function DashboardTileGroup({ group }: { group: DashboardGroupView }): React.JSX.Element {
  return (
    <section className="flex min-w-0 flex-1 flex-col gap-4">
      <SectionHeader>{group.title}</SectionHeader>
      {group.state === "failed" ? (
        <Alert tone="error">{group.message}</Alert>
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {group.tiles.map((tile) => (
              <DashboardTile key={tile.key} tile={tile} />
            ))}
          </ul>
          {group.state === "empty" ? (
            <p className="font-mono text-[13px] leading-relaxed text-text-muted">{group.message}</p>
          ) : null}
        </>
      )}
    </section>
  );
}

export function DashboardTileGroups({
  groups,
}: {
  groups: DashboardGroupView[];
}): React.JSX.Element {
  return (
    <>
      {groups.map((group) => (
        <DashboardTileGroup key={group.key} group={group} />
      ))}
    </>
  );
}
