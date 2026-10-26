import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { LocalInstant } from "@/components/pulse/local-instant";
import type { GenerationCallRowView } from "@/lib/admin-generation-calls-view";
import { NAV_FORWARD } from "@/lib/nav-direction";
import { cn } from "@/lib/utils";

interface GenerationCallTableProps {
  calls: readonly GenerationCallRowView[];
}

// The admin AI audit log at the wide shell (issue #771, ADR-0088): one row per Generation Call
// so tokens, latency and outcome compare down a column. Every cell is a field of the row
// view-model; nothing is formatted here. `table-fixed` with fractional column widths and no
// `whitespace-nowrap`, so a Clerk user id or a model slug (one unbroken token) breaks inside its
// cell instead of widening the document. Each row's time is the link to the call's detail page,
// stretched over the whole row so the row is the click target while the link stays the one tab
// stop and the one named control.
export function GenerationCallTable({ calls }: GenerationCallTableProps): React.JSX.Element {
  return (
    <table className="w-full table-fixed border-collapse font-mono text-[13px]">
      <caption className="sr-only">AI calls of the last 3 days, newest first</caption>
      <colgroup>
        <col className="w-2/12" />
        <col className="w-2/12" />
        <col className="w-2/12" />
        <col className="w-2/12" />
        <col className="w-2/12" />
        <col className="w-1/12" />
        <col className="w-1/12" />
      </colgroup>
      <thead>
        <tr className="border-b border-border">
          <HeaderCell>Time</HeaderCell>
          <HeaderCell>Kind</HeaderCell>
          <HeaderCell>User</HeaderCell>
          <HeaderCell>Model</HeaderCell>
          <HeaderCell align="right">Tokens in / out</HeaderCell>
          <HeaderCell align="right">Latency</HeaderCell>
          <HeaderCell>Outcome</HeaderCell>
        </tr>
      </thead>
      <tbody>
        {calls.map((call) => (
          <tr
            key={call.id}
            className="relative border-b border-border-lite align-top transition-colors last:border-b-0 hover:bg-elevated/50"
          >
            <td className="px-2 py-2.5 text-[12px] text-text-secondary">
              <Link
                href={call.href}
                {...NAV_FORWARD}
                className="rounded-sm outline-none after:absolute after:inset-0 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-cyan"
              >
                <LocalInstant iso={call.createdAt} />
              </Link>
            </td>
            <td className="px-2 py-2.5 text-text-primary">{call.kindLabel}</td>
            <td className="break-all px-2 py-2.5 text-text-secondary">{call.userLabel}</td>
            <td className="break-all px-2 py-2.5 text-text-secondary">{call.servedBy}</td>
            <td className="break-all px-2 py-2.5 text-right tabular-nums text-text-secondary">
              {call.tokensCell}
            </td>
            <td className="px-2 py-2.5 text-right tabular-nums text-text-secondary">
              {call.latencyLabel}
            </td>
            <td className="px-2 py-2.5">
              <Badge variant={call.isError ? "magenta" : "muted"}>{call.outcomeLabel}</Badge>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HeaderCell({
  align = "left",
  children,
}: {
  align?: "left" | "right";
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <th
      scope="col"
      className={cn(
        "label-mono px-2 py-1.5 text-[10px] text-text-muted",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}
