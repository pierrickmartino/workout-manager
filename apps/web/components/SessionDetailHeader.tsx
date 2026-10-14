import { Star } from "@/components/pulse/icons";

import { PageHeader } from "@/components/pulse/page-header";
import { WorkoutSigil } from "@/components/pulse/workout-sigil";
import { Badge } from "@/components/ui/badge";
import type { SessionAuthorView } from "@/lib/session-author";
import type { WorkoutSession } from "@/lib/sessions";

interface SessionDetailHeaderProps {
  session: WorkoutSession;
  // The Session Name view's display name (issue #394): the user-given name, else the derived label.
  displayName: string;
  authorView: SessionAuthorView;
  // Whether the Session is favorited. Reads false wherever Favorite is not offered.
  isFavorite: boolean;
  // The ⋯ action sheet, pinned to the header's top-right corner.
  menu: React.ReactNode;
}

// The Session detail's header (ADR-0133): the sigil and title at full width, the ⋯ action sheet on
// the overline's line, top right, and a meta line under the title. Favorite's toggle lives in the
// sheet, so the header is where a favorited Session says so: its sigil wears the Glow Edge — the
// cyan glow a favorited My Sessions row wears — and a FAVORITE chip leads the meta line. Its own
// component so the audit harness renders the real header, not a copy (`session-header` journey).
export function SessionDetailHeader({
  session,
  displayName,
  authorView,
  isFavorite,
  menu,
}: SessionDetailHeaderProps): React.JSX.Element {
  return (
    <>
      <PageHeader
        overline="PULSE // SESSION"
        title={
          <span className="flex items-center gap-3">
            {/* The Workout Signature mark (GLOSSARY: Workout Signature): the Session's recognizable
                sigil, keyed on its id so it matches the mark shown for this Session on Home, My
                Sessions, and Train. Fill hue by Training Type. */}
            <WorkoutSigil
              seedId={session.id}
              exerciseCount={session.prescriptions.length}
              trainingType={session.training_type}
              size={48}
              morphSessionId={session.id}
              className={isFavorite ? "glow-favorite" : undefined}
            />
            {/* An authored name wraps, never truncates or overflows (ADR-0085). */}
            <span className="min-w-0 break-words">{displayName}</span>
          </span>
        }
        menu={menu}
      />

      {/* The meta line: the FAVORITE chip, the Training Type and duration badges, then the Author
          byline (issue #395) — "by <name>", crediting the human who first created this plan. Quiet
          secondary text so it reads as attribution, kept visually distinct from the magenta
          AI-GENERATED Provenance badges on each movement (who made it vs. how it was made). A
          generic-label fallback (unnamed author) is shown muted/italic to read as a placeholder.
          Suppressed when the Author is the viewer (`showByline`): the byline is provenance, not a
          "by <you>" on every one of your own plans. */}
      <div className="-mt-4 flex flex-wrap items-center gap-2">
        {isFavorite ? (
          <Badge variant="cyan">
            <Star className="h-3 w-3 fill-cyan" aria-hidden />
            FAVORITE
          </Badge>
        ) : null}
        <Badge variant="magenta" className="capitalize">
          {session.training_type}
        </Badge>
        <Badge variant="cyan">{session.duration_minutes} MIN</Badge>
        {authorView.showByline ? (
          <p
            className={`font-sans text-[13px] ${
              authorView.isNamed ? "text-text-secondary" : "text-text-muted italic"
            }`}
          >
            {authorView.byline}
          </p>
        ) : null}
      </div>
    </>
  );
}
