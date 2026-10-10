import { fetchHistory } from "@/lib/logs";
import { fetchSession, fetchSessions } from "@/lib/sessions";
import { bestEffortData, settleBestEffort } from "@/lib/best-effort-read";
import {
  selectRecentSessions,
  toRecentSessionRows,
  type RecentSessionRow,
} from "@/lib/recent-sessions";
import { RecentSessions } from "@/components/RecentSessions";

// The fetching half of the Train page's "Recent Sessions" panel, split out of `app/train/page.tsx`
// so the page itself no longer awaits anything (perf audit A4). Everything above this panel —
// the header, the descriptive paragraph, the generate launchpad — is fully static, and awaiting
// this chain at the page level held all of it back for two sequential round trips plus an N-way
// fan-out. Behind a `<Suspense>` the static surface paints at once and the panel streams in.
//
// `RecentSessions` stays purely presentational; this component is only the read.

// Load the panel rows (GLOSSARY: Recent Sessions). Recency and dedupe come from the record
// (History), standalone-ness and names from the library (My Sessions), and the exercise preview
// from each plan's detail read — so we deep-link Start straight into the plan the button runs,
// never the last record.
//
// This function is the **reads only**: the selection rule is `selectRecentSessions` and the
// drop-an-unreadable-plan rule is `toRecentSessionRows`, both pure and both pinned by
// `recent-sessions.test.ts` (CLAUDE.md: frontend logic lives in `lib/`, components stay thin).
//
// Every read is best-effort, which **changes behaviour** for a read that *rejects*: it used to
// propagate and error the whole Train page, contradicting the panel's own long-standing comment
// that "a failed read simply yields no rows … rather than erroring the whole Train page". Behind
// a Suspense boundary that propagation would now reach the nearest error boundary, so the panel
// honours what it always said it did: a rejected read is settled to `null`
// (`lib/best-effort-read.ts`) and the launchpad above still covers "start something new".
async function loadRecentSessions(): Promise<RecentSessionRow[]> {
  const [historyResult, sessionsResult] = await Promise.all([
    settleBestEffort(fetchHistory()),
    settleBestEffort(fetchSessions()),
  ]);
  const history = bestEffortData(historyResult);
  const sessions = bestEffortData(sessionsResult);
  if (!history || !sessions) return [];

  // Select the up-to-five distinct standalone plans performed most recently, then read each
  // plan's detail in parallel for its first exercises. `Promise.all` keeps `details` positional
  // against `selections`, which is the pairing `toRecentSessionRows` relies on.
  const selections = selectRecentSessions(history, sessions);
  const details = await Promise.all(
    selections.map((selection) =>
      settleBestEffort(fetchSession(selection.session.id)),
    ),
  );

  return toRecentSessionRows(selections, details.map(bestEffortData));
}

export async function RecentSessionsPanel(): Promise<React.JSX.Element> {
  return <RecentSessions rows={await loadRecentSessions()} />;
}
