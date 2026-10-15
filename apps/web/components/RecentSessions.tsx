import type { SessionSummary } from "@/lib/session-library";
import { SessionCardRow } from "@/components/SessionCardRow";

// The Train page's "Recent Sessions" panel (GLOSSARY: Recent Sessions): the user's up-to-five
// most-recently-performed standalone Session plans. Presentational only; the selection and dedupe
// live in the `recent-sessions` view-model. Each row is the same Session card row My Sessions
// renders (ADR-0134) — tap to open, Start, Favorite behind the ⋯. Renders nothing when there is
// nothing to resume, so the Train page can mount it unconditionally.
export function RecentSessions({
  sessions,
}: {
  sessions: SessionSummary[];
}): React.JSX.Element | null {
  if (sessions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {/* The panel's own heading (ADR-0094). Train labels a group with a `TRAIN // …` eyebrow
          rather than the ▸ rule, but it is still what opens the section, so it is an <h2> and
          the cards under it are <h3> — the group lands in the outline, not just its items. */}
      <h2 className="label-mono text-[11px] text-text-muted">
        TRAIN // PICK UP AGAIN
      </h2>
      <ol className="flex list-none flex-col gap-3 p-0">
        {sessions.map((session) => (
          <li key={session.id}>
            <SessionCardRow session={session} level={3} />
          </li>
        ))}
      </ol>
    </div>
  );
}
