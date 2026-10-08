import Link from "next/link";
import { Dumbbell, Play } from "@/components/pulse/icons";

import type { SessionCardModel } from "@/lib/session-card";
import { loggedCountBadge } from "@/lib/session-delete";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkoutSigil } from "@/components/pulse/workout-sigil";
import { buttonVariants } from "@/components/ui/button";
import { NAV_FORWARD } from "@/lib/nav-direction";

interface SessionCardProps {
  model: SessionCardModel;
  // Favorited => the soft cyan Glow Edge (CONTEXT: Favorite). The My Sessions list sets it; Train
  // leaves it false. Purely presentational — the glow, not an icon, now carries favorite state.
  isFavorite?: boolean;
  // The actions slot at the end of the fact row — the My Sessions ⋯ action sheet trigger (Favorite +
  // conditional Delete, ADR-0113). Absent on Train, whose card has no per-row actions.
  actions?: React.ReactNode;
  // Where the card's title sits in the page outline (ADR-0094). 2 for a list that heads itself
  // with nothing but the page's <h1> (My Sessions); 3 inside a group that carries its own
  // heading (Train's "PICK UP AGAIN" panel).
  level?: 2 | 3;
  // Whether this card's sigil claims the cross-page morph to the Session's detail (ADR-0120).
  // Only a surface that links to the detail and renders each Session once may claim it, so
  // the library row opts in and Train's Recent panel, which has no detail link, does not.
  claimsSigilMorph?: boolean;
}

// The shared Session card (CONTEXT: Recent Sessions, My Sessions): the one presentational format
// the Train page's "Recent Sessions" panel and the My Sessions library both render, fed by the
// `session-card` view-model so the two can never drift. Server-safe (no hooks / no I/O), so Train
// renders it straight from a Server Component; the library wraps it in a Client row for the
// press-and-hold Favorite gesture and passes its action sheet through `actions`. Source-specific lines
// (performed date, exercise preview, author, Logged Count) render only when the model carries them.
export function SessionCard({
  model,
  isFavorite = false,
  actions,
  level = 2,
  claimsSigilMorph = false,
}: SessionCardProps): React.JSX.Element {
  const Title = level === 3 ? "h3" : "h2";
  const loggedBadge =
    model.loggedCount === null ? null : loggedCountBadge(model.loggedCount);
  // The fact row (exercise count + Logged Count) is a library-only footer — Train carries no
  // Logged Count, so it shows just its header and exercise preview, exactly as before.
  // A card with actions shows it too, since that is where their trigger sits.
  const showFactRow = model.loggedCount !== null || actions !== undefined;

  // The sigil/title/badge block. On the library it links to the plan's detail page; on Train it is
  // plain text (its lone navigation is Start). Kept as one node so both branches render identically.
  const heading = (
    <div className="flex min-w-0 items-start gap-3">
      {/* The Workout Signature mark (CONTEXT: Workout Signature): keyed on the Session id, so a
          plan carries the same sigil here that it shows on every other surface. */}
      <WorkoutSigil
        seedId={model.id}
        exerciseCount={model.exerciseCount}
        trainingType={model.trainingType}
        size={44}
        morphSessionId={claimsSigilMorph ? model.id : undefined}
      />
      <div className="flex min-w-0 flex-col gap-2">
        {/* A heading, not a styled <span> (ADR-0094). An <h2> by default: My Sessions heads its
            list with nothing but the page's <h1>, so an <h3> there skipped a level — and
            `HistoryBrowser` already titles the same list-item role at this rank. A group that
            carries its own heading passes `level={3}`. */}
        <Title className="truncate font-display text-base font-semibold text-text-primary">
          {model.displayName}
        </Title>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={model.badgeVariant} className="capitalize">
            {model.trainingType}
          </Badge>
          {/* A performed date is honest record data (History shows it too) — not the forbidden
              calendar "today" (ADR-0001). Train only. */}
          {model.lastPerformedOn ? (
            <span className="label-mono text-[10px] text-text-muted">
              Last trained {model.lastPerformedOn}
            </span>
          ) : null}
          {/* The Author credit (library only), never blank (the model resolved the fallback). */}
          {model.authorName ? (
            <span className="label-mono text-[10px] text-text-muted">
              by {model.authorName}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-4 transition-colors hover:border-cyan/40",
        // Glow Edge (CONTEXT: Favorite): a favorited row wears the soft cyan glow.
        isFavorite && "glow-favorite",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {model.detailHref ? (
          <Link
            {...NAV_FORWARD}
            href={model.detailHref}
            className="flex min-w-0 flex-1 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan/60"
          >
            {heading}
          </Link>
        ) : (
          heading
        )}
        {/* Start deep-links straight into the plan's Live Session (the concurrency guard lives in
            LiveSessionScreen, ADR-0012). Deliberately `secondary`: a Start that repeats once per
            row is never the list's primary emphasis. The label names the row for screen readers. */}
        <Link
          {...NAV_FORWARD}
          href={model.startHref}
          aria-label={model.startLabel}
          className={buttonVariants({ variant: "secondary", className: "shrink-0" })}
        >
          <Play className="h-4 w-4" aria-hidden />
          Start
        </Link>
      </div>

      {/* The plan's first movements (≤ 3, CONTEXT: Recent Sessions) — a preview of what Start runs,
          drawn from the plan's Exercise Prescriptions, never the last record. Train only. */}
      {model.previewExercises.length > 0 ? (
        <p className="truncate font-mono text-[12px] text-text-secondary">
          {model.previewExercises.join(" · ")}
        </p>
      ) : null}

      {showFactRow ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="label-mono inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
            <Dumbbell className="h-3.5 w-3.5 text-text-muted" aria-hidden />
            {model.exerciseCount}{" "}
            {model.exerciseCount === 1 ? "exercise" : "exercises"}
          </span>
          {/* The Logged Count signal (CONTEXT: Logged Count): "Trained N×" when performed, so an
              already-trained plan is spotted at a glance. Delete is withheld then and lives in the
              action sheet only for a never-performed plan. */}
          <div className="flex items-center gap-2">
            {loggedBadge ? (
              <Badge
                variant="muted"
                className="uppercase"
                title="Logged performances of this session"
              >
                {loggedBadge}
              </Badge>
            ) : null}
            {/* The ⋯ trigger ends the fact row rather than sitting beside Start: the title
                truncates, and every pixel beside Start is a character of the authored name. A
                closed card spends no line on its rare actions, and the sheet is a modal, so
                nothing here grows when it opens. */}
            {actions}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
