import { fetchHistory } from "@/lib/logs";
import { fetchSessions } from "@/lib/sessions";
import { bestEffortData, settleBestEffort } from "@/lib/best-effort-read";
import { selectRecentSessions } from "@/lib/recent-sessions";
import type { SessionSummary } from "@/lib/session-library";
import { RecentSessions } from "@/components/RecentSessions";

// The fetching half of the Train page's "Recent Sessions" panel, split out of `app/train/page.tsx`
// so the page itself no longer awaits anything (perf audit A4). Everything above this panel —
// the header, the descriptive paragraph, the generate launchpad — is fully static, and awaiting
// this read at the page level held all of it back. Behind a `<Suspense>` the static surface paints
// at once and the panel streams in.
//
// `RecentSessions` stays purely presentational; this component is only the read.

// Load the panel's plans (GLOSSARY: Recent Sessions). Recency and dedupe come from the record
// (History), standalone-ness and every card fact from the library (My Sessions) — its rows carry
// the exercise preview and last performed date, so there is no per-plan detail read (ADR-0134).
// The selection rule is `selectRecentSessions`, pure and pinned by `recent-sessions.test.ts`.
//
// Both reads are best-effort: a rejected read is settled to `null` (`lib/best-effort-read.ts`)
// and the panel renders nothing, rather than erroring the whole Train page — the launchpad above
// still covers "start something new".
async function loadRecentSessions(): Promise<SessionSummary[]> {
  const [historyResult, sessionsResult] = await Promise.all([
    settleBestEffort(fetchHistory()),
    settleBestEffort(fetchSessions()),
  ]);
  const history = bestEffortData(historyResult);
  const sessions = bestEffortData(sessionsResult);
  if (!history || !sessions) return [];

  return selectRecentSessions(history, sessions).map((selection) => selection.session);
}

export async function RecentSessionsPanel(): Promise<React.JSX.Element | null> {
  return <RecentSessions sessions={await loadRecentSessions()} />;
}
