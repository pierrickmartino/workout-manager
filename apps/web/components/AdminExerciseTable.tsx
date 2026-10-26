import Link from "next/link";

import {
  PROVENANCE_BADGE,
  type AdminExerciseRowView,
} from "@/lib/admin-exercises-view";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { NAV_FORWARD } from "@/lib/nav-direction";

// The admin catalog as a table at the shell's wide width (#772, ADR-0088): the same row views
// the card list renders, laid out so tier, Provenance, Retired and usage compare down a column
// instead of being remembered across cards. It adds no action — every row is still just the
// way into its Exercise editor (ADR-0071) — and no sorting; the order is the browser's.
//
// An ARIA table over a grid of `div`s rather than a `<table>`, for one measured reason: each
// row carries `.list-row-defer` (ADR-0097), and `content-visibility` does nothing on a table
// row, so a real `<tr>` would put all 500 rows back on the keystroke path. The tracks are
// Tailwind's own `grid-cols-12` (`minmax(0,1fr)`), behind `lg:` only, never bracket syntax.
//
// Reached only through `AdminExerciseTableLazy` behind the `useWideViewport` gate, so a phone
// neither downloads nor renders it.
const COLUMNS = [
  { label: "Name", span: "lg:col-span-5" },
  { label: "Completeness", span: "lg:col-span-2" },
  { label: "Provenance", span: "lg:col-span-2" },
  { label: "Status", span: "lg:col-span-1" },
  { label: "Usage", span: "lg:col-span-2" },
] as const;

const ROW_GRID = "lg:grid lg:grid-cols-12 lg:items-center lg:gap-4 px-4";

interface AdminExerciseTableProps {
  views: readonly AdminExerciseRowView[];
}

export function AdminExerciseTable({ views }: AdminExerciseTableProps): React.JSX.Element {
  return (
    <Card className="overflow-hidden p-0">
      <div role="table" aria-label="Exercise catalog">
        <div role="rowgroup">
          <div role="row" className={`${ROW_GRID} border-b border-border-lite py-2.5`}>
            {COLUMNS.map((column) => (
              <span
                key={column.label}
                role="columnheader"
                className={`${column.span} label-mono text-[11px] text-text-secondary`}
              >
                {column.label}
              </span>
            ))}
          </div>
        </div>
        <div role="rowgroup" className="divide-y divide-border-lite">
          {views.map((view) => (
            <AdminExerciseTableRow key={view.id} view={view} />
          ))}
        </div>
      </div>
    </Card>
  );
}

interface AdminExerciseTableRowProps {
  view: AdminExerciseRowView;
}

function AdminExerciseTableRow({ view }: AdminExerciseTableRowProps): React.JSX.Element {
  return (
    // `relative` so the name's link can stretch over the whole row: one link per row, named by
    // the Exercise, rather than five tab stops all going to the same editor.
    <div
      role="row"
      className={`${ROW_GRID} list-row-defer relative py-3 transition-colors hover:bg-elevated/50`}
    >
      <span role="cell" className={`${COLUMNS[0].span} min-w-0`}>
        {/* An authored name wraps, never truncates (ADR-0085): `wrap-anywhere` because only it
            lets a 120-character unbroken name break inside its cell. */}
        <Link
          href={view.href}
          {...NAV_FORWARD}
          className="font-sans text-[15px] font-medium text-text-primary wrap-anywhere after:absolute after:inset-0"
        >
          <span>{view.name}</span>
        </Link>
      </span>
      <span role="cell" className={`${COLUMNS[1].span} font-mono text-[13px] text-text-secondary`}>
        {view.completenessLabel}
      </span>
      <span role="cell" className={COLUMNS[2].span}>
        <Badge variant={PROVENANCE_BADGE[view.provenance] ?? "muted"}>
          {view.provenanceLabel}
        </Badge>
      </span>
      <span role="cell" className={COLUMNS[3].span}>
        {view.retired ? (
          <Badge variant="magenta">{view.statusLabel}</Badge>
        ) : (
          <span className="font-mono text-[13px] text-text-muted">{view.statusLabel}</span>
        )}
      </span>
      <span role="cell" className={`${COLUMNS[4].span} font-mono text-[13px] text-text-secondary`}>
        {view.usageLabel}
      </span>
    </div>
  );
}
