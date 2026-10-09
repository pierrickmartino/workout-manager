import Link from "next/link";
import { ChevronRight } from "@/components/pulse/icons";

import type { ProtocolIndexRowView, ProtocolsIndexView } from "@/lib/protocols-index";
import { NAV_FORWARD } from "@/lib/nav-direction";
import { PageHeader } from "@/components/pulse/page-header";
import { SectionHeader } from "@/components/pulse/section-header";
import { BackLink } from "@/components/pulse/back-link";
import { Card } from "@/components/ui/card";
import { SwitchProtocolControl } from "@/components/SwitchProtocolControl";

// The Protocols index (issue #637): every Protocol the user owns, grouped Current / Set aside /
// Finished, each row opening the Protocol's detail page. A set-aside row also carries Switch
// (#638), offered, pending or blocked as the view-model decides. A thin renderer over the
// `protocols-index` view-model, which owns grouping, order, copy and row actions; kept
// prop-driven so the audit harness can mount it directly.
export function ProtocolsIndex({
  index,
}: {
  index: ProtocolsIndexView;
}): React.JSX.Element {
  return (
    <section className="flex flex-col gap-7">
      <PageHeader overline="PULSE // TRAIN" title="Protocols" />

      {index.isEmpty ? (
        <Card className="flex flex-col items-start gap-3 p-6">
          <p className="font-sans text-sm text-text-secondary">
            You don’t have any protocols yet. Generate one and it shows up here.
          </p>
          <Link
            href="/protocols/new"
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Generate a protocol →
          </Link>
        </Card>
      ) : (
        index.groups.map((group) => (
          <section key={group.status} className="flex flex-col gap-4">
            <SectionHeader meta={group.rows.length}>{group.heading}</SectionHeader>
            <ol className="flex list-none flex-col gap-3 p-0">
              {group.rows.map((row) => (
                <li key={row.id}>
                  <ProtocolIndexCard row={row} />
                </li>
              ))}
            </ol>
          </section>
        ))
      )}

      <BackLink href="/train">Back to train</BackLink>
    </section>
  );
}

// One row: the card's body is the link into the Protocol's detail page, and its row action sits
// below the link rather than inside it, so a control is never nested in an anchor. The title is
// an authored name, so it wraps rather than truncates (ADR-0085).
function ProtocolIndexCard({ row }: { row: ProtocolIndexRowView }): React.JSX.Element {
  return (
    <Card className="transition-colors hover:border-cyan">
      <Link
        {...NAV_FORWARD}
        href={row.href}
        className="group flex items-center gap-3 p-4"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-sans text-[15px] font-medium break-words text-text-primary">
            {row.title}
          </span>
          {row.subtitle ? (
            <span className="font-mono text-[12px] break-words text-text-muted">
              {row.subtitle}
            </span>
          ) : null}
          <span className="label-mono text-[11px] text-text-secondary">
            {row.progress}
            {row.lastPerformed ? <> · {row.lastPerformed}</> : null}
          </span>
        </span>
        <ChevronRight
          aria-hidden
          className="h-[18px] w-[18px] shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </Link>
      {row.switchAction ? (
        <div className="border-t border-border px-4 py-3">
          <SwitchProtocolControl action={row.switchAction} protocolTitle={row.title} />
        </div>
      ) : null}
    </Card>
  );
}
