import Link from "next/link";
import { ChevronRight } from "@/components/pulse/icons";

import type { CuratedProtocolRow } from "@/lib/curated-protocol-view";
import { NAV_FORWARD } from "@/lib/nav-direction";
import { Card } from "@/components/ui/card";

interface CuratedProtocolPickerProps {
  rows: CuratedProtocolRow[];
}

// The Curated Protocol picker (issue #684): one card per released Curated Protocol, opening its adopt
// form. A thin renderer over `curatedProtocolRow`; names and descriptions are authored text,
// so they wrap rather than truncate (ADR-0085). A program needing kit the user lacks is flagged,
// never hidden, and stays adoptable (issue #689, ADR-0130).
export function CuratedProtocolPicker({
  rows,
}: CuratedProtocolPickerProps): React.JSX.Element {
  if (rows.length === 0) {
    return (
      <Card className="p-6">
        <p className="font-sans text-sm text-text-secondary">
          No Curated Protocols are available yet.
        </p>
      </Card>
    );
  }
  return (
    <ol className="flex list-none flex-col gap-3 p-0">
      {rows.map((row) => (
        <li key={row.identifier}>
          <Card className="transition-colors hover:border-cyan">
            <Link {...NAV_FORWARD} href={row.href} className="group flex items-center gap-3 p-4">
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="font-sans text-[15px] font-medium break-words text-text-primary">
                  {row.name}
                </span>
                <span className="label-mono text-[11px] text-text-secondary">
                  {row.schedule}
                </span>
                <span className="font-sans text-[13px] break-words text-text-secondary">
                  {row.description}
                </span>
                <span className="font-mono text-[12px] break-words text-text-muted">
                  Main lifts: {row.mainLifts}
                </span>
                <span className="font-mono text-[12px] break-words text-text-muted">
                  Equipment: {row.equipment}
                </span>
                {row.equipmentFlag !== null ? (
                  <span className="font-mono text-[12px] break-words text-amber">
                    {row.equipmentFlag}
                  </span>
                ) : null}
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-text-muted" />
            </Link>
          </Card>
        </li>
      ))}
    </ol>
  );
}
