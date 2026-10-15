import Link from "next/link";
import { Dumbbell, Play } from "@/components/pulse/icons";

import { exerciseCountLabel, type SessionCardModel } from "@/lib/session-card";
import { loggedCountBadge } from "@/lib/session-delete";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkoutSigil } from "@/components/pulse/workout-sigil";
import { buttonVariants } from "@/components/ui/button";
import { NAV_FORWARD } from "@/lib/nav-direction";

interface SessionCardProps {
  model: SessionCardModel;
  // Favorited => the soft cyan Glow Edge (GLOSSARY: Favorite). The glow, not an icon, carries it.
  isFavorite?: boolean;
  // The ⋯ action sheet trigger (Favorite + conditional Delete, ADR-0113), at the end of the
  // bottom row.
  actions?: React.ReactNode;
  // Where the card's title sits in the page outline (ADR-0094). 2 for a list that heads itself
  // with nothing but the page's <h1> (My Sessions); 3 inside a group that carries its own
  // heading (Train's "PICK UP AGAIN" panel).
  level?: 2 | 3;
  // Whether this card's sigil claims the cross-page morph to the Session's detail (ADR-0120).
  // Every card links to the detail, but a page may hold only one claimant per Session.
  claimsSigilMorph?: boolean;
}

// The whole card is one tap target into the Session's detail: the title link's ::after
// stretches over the positioned card, and Start and the ⋯ sit above it, so no link nests in
// another and each control keeps its own name (ADR-0134). They are `relative` with **no
// z-index**: positioned boxes paint in document order and both come after the title, so they
// already win. A `z-*` would make a stacking context, and the ⋯ sheet — rendered beside its
// trigger — could not lift its `z-50` out of it past the tab bar or the next card.
const STRETCHED_LINK =
  "rounded-sm after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-cyan/60";

// The shared Session card (GLOSSARY: Recent Sessions, My Sessions, ADR-0134): the one format the
// Train page's "Pick up again" panel and the My Sessions library both render, fed by the
// `session-card` view-model so the two can never drift. Server-safe (no hooks, no I/O); the
// Client row around it holds the Favorite toggle and passes its action sheet through `actions`.
export function SessionCard({
  model,
  isFavorite = false,
  actions,
  level = 2,
  claimsSigilMorph = false,
}: SessionCardProps): React.JSX.Element {
  const Title = level === 3 ? "h3" : "h2";
  const loggedBadge = loggedCountBadge(model.loggedCount);

  return (
    <Card
      className={cn(
        "relative flex flex-col gap-3 p-4 transition-colors hover:border-cyan/40",
        // Glow Edge (GLOSSARY: Favorite): a favorited row wears the soft cyan glow.
        isFavorite && "glow-favorite",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {/* The Workout Signature mark (GLOSSARY: Workout Signature): keyed on the Session id, so
              a plan carries the same sigil here that it shows on every other surface. */}
          <WorkoutSigil
            seedId={model.id}
            exerciseCount={model.exerciseCount}
            trainingType={model.trainingType}
            size={44}
            morphSessionId={claimsSigilMorph ? model.id : undefined}
          />
          <div className="flex min-w-0 flex-col gap-2">
            {/* A heading, not a styled <span> (ADR-0094). An authored name wraps, never
                truncates (ADR-0085): Start alone shares its line, so it keeps most of the width. */}
            <Title className="break-words font-display text-base font-semibold text-text-primary">
              <Link {...NAV_FORWARD} href={model.detailHref} className={STRETCHED_LINK}>
                {model.displayName}
              </Link>
            </Title>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={model.badgeVariant} className="capitalize">
                {model.trainingType}
              </Badge>
              {/* The Author credit, only on a plan someone else authored. */}
              {model.authorName ? (
                <span className="label-mono text-[10px] text-text-muted">
                  by {model.authorName}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {/* Start deep-links straight into the plan's Live Session (the concurrency guard lives in
            LiveSessionScreen, ADR-0012). Deliberately `secondary`: a Start that repeats once per
            row is never the list's primary emphasis. The label names the row for screen readers. */}
        <Link
          {...NAV_FORWARD}
          href={model.startHref}
          aria-label={model.startLabel}
          className={buttonVariants({ variant: "secondary", className: "relative shrink-0" })}
        >
          <Play className="h-4 w-4" aria-hidden />
          Start
        </Link>
      </div>

      {/* "Last trained" on a line of its own, so it never wraps in among the badges. */}
      <p className="label-mono text-[10px] text-text-muted">{model.lastTrainedLabel}</p>

      {/* The plan's first movements (≤ 3) — a preview of what Start runs, drawn from the plan's
          Exercise Prescriptions, never the last record. */}
      {model.previewExercises.length > 0 ? (
        <p className="truncate font-mono text-[12px] text-text-secondary">
          {model.previewExercises.join(" · ")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="label-mono inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
          <Dumbbell className="h-3.5 w-3.5 text-text-muted" aria-hidden />
          {exerciseCountLabel(model.exerciseCount)}
        </span>
        {/* The Logged Count signal (GLOSSARY: Logged Count): "Trained N×" when performed. Delete is
            withheld then and lives in the action sheet only for a never-performed plan. The ⋯
            closes the row; negative margins keep its 40px target from growing the row. */}
        <div className="relative -my-2 -mr-2 flex items-center gap-1">
          {loggedBadge ? (
            <Badge
              variant="muted"
              className="uppercase"
              title="Logged performances of this session"
            >
              {loggedBadge}
            </Badge>
          ) : null}
          {actions}
        </div>
      </div>
    </Card>
  );
}
