import Link from "next/link";

import { fetchSessions } from "@/lib/sessions";
import { PageHeader } from "@/components/pulse/page-header";
import { BackLink } from "@/components/pulse/back-link";
import { Alert } from "@/components/pulse/alert";
import { Card } from "@/components/ui/card";
import { SessionsLibrary } from "@/components/SessionsLibrary";

// My Sessions — the user's personal library of their own standalone Sessions (CONTEXT: My
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
            href="/sessions/new"
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

  return <SessionsLibrary sessions={sessions} />;
}
