import { Suspense } from "react";
import Link from "next/link";

import {
  fetchHistoryByIds,
  fetchHistoryIndex,
  fetchRecentHistory,
} from "@/lib/logs";
import { appendFrom } from "@/lib/back-target";
import { resolveAppearance } from "@/lib/appearance";
import { bestEffortData, settleBestEffort } from "@/lib/best-effort-read";
import { filterHistory, hasActiveFilters } from "@/lib/history-filter";
import {
  HISTORY_WINDOW,
  filtersFromSearchParams,
  toHistoryCard,
  windowIds,
  type HistoryCard,
  type RawSearchParams,
} from "@/lib/history-window";
import { PageHeader } from "@/components/pulse/page-header";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HistoryBrowser } from "@/components/HistoryBrowser";

// Lists the user's Logged Sessions — the record side of the plan/record split — newest first.
// Reads use the server-only transport seam (ADR-0022). The screen holds the whole History
// index and filters over it client-side in `HistoryBrowser`, while full records arrive in
// windows (ADR-0128): this page renders the first window of the filter in the URL, so a shared
// filtered link paints its matches at once (ADR-0100).
export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const filters = filtersFromSearchParams(await searchParams);
  // Unfiltered, the first window is simply the newest records, so it is read alongside the
  // index instead of after it. A failed window read is not fatal: the client fetches it.
  const [envelope, appearance, recent] = await Promise.all([
    fetchHistoryIndex(),
    resolveAppearance(),
    hasActiveFilters(filters)
      ? null
      : settleBestEffort(fetchRecentHistory(HISTORY_WINDOW)),
  ]);

  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // STATS" title="Training history" />
        <Alert tone="error">
          Could not load your history: {envelope.error ?? "unknown error"}
        </Alert>
      </section>
    );
  }

  const index = envelope.data;

  // With no records at all, there is nothing to filter — show the first-run prompt rather
  // than an empty filter bar.
  if (index.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader
          overline="PULSE // STATS"
          title="Training history"
          action={
            <div className="flex items-center gap-3">
              <Link
                href="/logs/new"
                className="label-mono text-[11px] text-cyan hover:underline"
              >
                + Log a movement
              </Link>
              <Badge variant="muted">0 LOGGED</Badge>
            </div>
          }
        />
        <Card className="flex flex-col items-start gap-3 p-6">
          <p className="font-sans text-sm text-text-secondary">
            You haven&apos;t logged any sessions yet.
          </p>
          <Link
            href={appendFrom("/sessions/new", "/history")}
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Generate a workout →
          </Link>
          <Link
            href="/logs/new"
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Or log something you did →
          </Link>
        </Card>
      </section>
    );
  }

  // `HistoryBrowser` reads the URL via `useSearchParams`, so it lives under a Suspense
  // boundary per the App Router contract.
  const firstWindow =
    recent === null
      ? await loadWindow(windowIds(filterHistory(index, filters)))
      : (bestEffortData(recent) ?? []).map(toHistoryCard);

  return (
    <Suspense fallback={null}>
      <HistoryBrowser
        index={index}
        firstWindow={firstWindow}
        unit={appearance.weight_unit}
      />
    </Suspense>
  );
}

// The cards for a filtered link's first matches. Best-effort: on a failed read the screen
// still renders, and the client fetches the window it is missing.
async function loadWindow(ids: number[]): Promise<HistoryCard[]> {
  if (ids.length === 0) return [];
  const records = bestEffortData(await settleBestEffort(fetchHistoryByIds(ids)));
  return (records ?? []).map(toHistoryCard);
}
