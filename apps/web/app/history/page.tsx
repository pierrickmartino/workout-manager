import { Suspense } from "react";
import Link from "next/link";

import { fetchHistory } from "@/lib/logs";
import { resolveAppearance } from "@/lib/appearance";
import { PageHeader } from "@/components/pulse/page-header";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { HistoryBrowser } from "@/components/HistoryBrowser";

// Lists the user's Logged Sessions — the record side of the plan/record split — newest first.
// The Server Component fetches the whole feed once (ADR-0031); the interactive search-by-
// exercise and Training Type filter run entirely client-side over it in `HistoryBrowser`.
export default async function HistoryPage() {
  const [envelope, appearance] = await Promise.all([
    fetchHistory(),
    resolveAppearance(),
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

  const history = envelope.data;

  // With no records at all, there is nothing to filter — show the first-run prompt rather
  // than an empty filter bar.
  if (history.length === 0) {
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
            href="/sessions/new"
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
  return (
    <Suspense fallback={null}>
      <HistoryBrowser records={history} unit={appearance.weight_unit} />
    </Suspense>
  );
}
