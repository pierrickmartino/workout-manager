import { Suspense } from "react";
import Link from "next/link";

import { fetchSessions } from "@/lib/sessions";
import { appendFrom } from "@/lib/back-target";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { SessionsLibrary } from "@/components/SessionsLibrary";
import { NAV_FORWARD } from "@/lib/nav-direction";
// PROTOTYPE (branch `prototype/session-card-unify`): the unified card needs Train's fields here.
import { fetchHistory } from "@/lib/logs";
import { fetchSession } from "@/lib/sessions";
import { bestEffortData, settleBestEffort } from "@/lib/best-effort-read";
import { lastPerformedBySession } from "@/components/prototype/session-card-model";

// My Sessions — the user's personal library of their own standalone Sessions (GLOSSARY: My
// Sessions, issue #397), reached from Train. The Server Component fetches the whole library
// once; the interactive search + favorites filter run entirely client-side over it in
// `SessionsLibrary` (like History, ADR-0031). It lists *plans*, never records, and only the
// user's own standalone Sessions — the backend excludes Protocol-member and other users' ones.
export default async function SessionsLibraryPage(): Promise<React.JSX.Element> {
  const envelope = await fetchSessions();

  if (!envelope.success || !envelope.data) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // TRAIN" title="My sessions" />
        <Alert tone="error">
          Could not load your sessions: {envelope.error ?? "unknown error"}
        </Alert>
        <BackLink href="/train">Back to train</BackLink>
      </section>
    );
  }

  const sessions = envelope.data;

  // With no saved Sessions at all, there is nothing to search — show the first-run prompt
  // that points to creating or generating one, rather than an empty filter bar.
  if (sessions.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <PageHeader overline="PULSE // TRAIN" title="My sessions" />
        <Card className="flex flex-col items-start gap-3 p-6">
          <p className="font-sans text-sm text-text-secondary">
            You haven&apos;t saved any sessions yet. Your standalone workouts show up
            here once you create one.
          </p>
          <Link
            href={appendFrom("/sessions/new", "/sessions")}
            {...NAV_FORWARD}
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Generate a workout →
          </Link>
          <Link
            href="/train"
            className="label-mono text-[11px] text-cyan hover:underline"
          >
            Or start something new in Train →
          </Link>
        </Card>
        <BackLink href="/train">Back to train</BackLink>
      </section>
    );
  }

  // PROTOTYPE: the list payload has neither a performed date nor exercise names, so this reads
  // all of History plus one detail per Session (N+1). Fine for a prototype; the real fold-in
  // needs both on `GET /api/sessions`.
  const [historyResult, ...detailResults] = await Promise.all([
    settleBestEffort(fetchHistory()),
    ...sessions.map((session) => settleBestEffort(fetchSession(session.id))),
  ]);
  const lastPerformed = lastPerformedBySession(
    (bestEffortData(historyResult) ?? []) as { session_id: number | null; performed_on: string }[],
  );
  const extras = Object.fromEntries(
    sessions.map((session, index) => {
      const detail = bestEffortData(detailResults[index]) as
        | { prescriptions: { exercise_name: string }[] }
        | null;
      return [
        session.id,
        {
          lastPerformedOn: lastPerformed.get(session.id) ?? null,
          exerciseNames: detail?.prescriptions.map((p) => p.exercise_name) ?? [],
        },
      ];
    }),
  );

  // `SessionsLibrary` reads the URL via `useSearchParams` (to restore a shared/refreshed
  // filtered view), so it lives under a Suspense boundary per the App Router contract —
  // the same wrapping History uses.
  return (
    <Suspense fallback={null}>
      <SessionsLibrary sessions={sessions} extras={extras} />
    </Suspense>
  );
}
