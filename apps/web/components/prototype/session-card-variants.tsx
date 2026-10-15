"use client";

// PROTOTYPE — throwaway (branch `prototype/session-card-unify`). Never merge to main.
//
// Question: what should ONE Session card look like on both Train ("Pick up again") and My
// Sessions? Baseline is Train's card, plus: tap the card to open the Session, a ⋯ for Favorite,
// "Last trained" on a row of its own, and the exercise count.
//
// Three variants on the existing routes, switchable via `?variant=` (`now` = today's card):
//   A  Train card+   — today's Train card, whole card tappable, ⋯ beside Start, meta rows below
//   B  Dense row     — no card chrome; one meta line; icon-only Start; built for long lists
//   C  Stat tile     — stats strip (last trained / exercises / trained ×N), full-width Start
//
// Favorite calls the real `submitToggleFavorite` (the same action My Sessions already uses) with a
// local optimistic flip, since Train is not revalidated by that action.

import { useActionState, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

import { Dumbbell, Play } from "@/components/pulse/icons";
import { submitToggleFavorite, type ToggleFavoriteState } from "@/app/sessions/actions";
import { ActionSheet } from "@/components/pulse/action-sheet";
import { FavoriteSheetItem } from "@/components/FavoriteSheetItem";
import { WorkoutSigil } from "@/components/pulse/workout-sigil";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { formatLongDate } from "@/lib/date-format";
import { loggedCountBadge } from "@/lib/session-delete";
import { NAV_FORWARD } from "@/lib/nav-direction";
import { cn } from "@/lib/utils";
import {
  PrototypeSwitcher,
  currentVariantKey,
  type PrototypeVariant,
} from "@/components/prototype/prototype-switcher";
import type { ProtoCardModel } from "@/components/prototype/session-card-model";

export const SESSION_CARD_VARIANTS: readonly PrototypeVariant[] = [
  { key: "A", name: "Train card+" },
  { key: "B", name: "Dense row" },
  { key: "C", name: "Stat tile" },
  { key: "now", name: "Current card" },
];

export function useSessionCardVariant(): string {
  const params = useSearchParams();
  return currentVariantKey(new URLSearchParams(params.toString()), SESSION_CARD_VARIANTS);
}

// The switch a list renders: the baseline (`now`) is whatever the page rendered before.
export function SessionCardList({
  models,
  level,
  baseline,
  heading,
}: {
  models: ProtoCardModel[];
  level: 2 | 3;
  baseline: React.ReactNode;
  heading?: React.ReactNode;
}): React.JSX.Element {
  const variant = useSessionCardVariant();
  return (
    <>
      {variant === "now" ? (
        baseline
      ) : (
        <div className="flex flex-col gap-2">
        {heading}
        <ol className={cn("flex list-none flex-col p-0", variant === "B" ? "gap-0" : "gap-3")}>
          {models.map((model) => (
            <li key={model.id}>
              <PrototypeSessionCard model={model} level={level} variant={variant} />
            </li>
          ))}
        </ol>
        </div>
      )}
      <PrototypeSwitcher variants={SESSION_CARD_VARIANTS} />
    </>
  );
}

interface CardProps {
  model: ProtoCardModel;
  level: 2 | 3;
  isFavorite: boolean;
  menu: React.ReactNode;
}

function PrototypeSessionCard({
  model,
  level,
  variant,
}: {
  model: ProtoCardModel;
  level: 2 | 3;
  variant: string;
}): React.JSX.Element {
  const [isFavorite, setIsFavorite] = useState(model.isFavorite);
  const [state, action, pending] = useActionState<ToggleFavoriteState, FormData>(
    submitToggleFavorite,
    { error: null },
  );
  const toggle = useCallback(() => {
    const form = new FormData();
    form.set("session_id", String(model.id));
    form.set("favorite", isFavorite ? "false" : "true");
    setIsFavorite((value) => !value);
    action(form);
  }, [action, isFavorite, model.id]);

  const menu = (
    <ActionSheet label={`Actions for ${model.displayName}`} title={model.displayName}>
      <FavoriteSheetItem isFavorite={isFavorite} onToggle={toggle} pending={pending} />
    </ActionSheet>
  );
  const props: CardProps = { model, level, isFavorite, menu };

  return (
    <div>
      {variant === "A" ? <VariantA {...props} /> : null}
      {variant === "B" ? <VariantB {...props} /> : null}
      {variant === "C" ? <VariantC {...props} /> : null}
      {state.error ? (
        <p role="alert" className="mt-1 font-mono text-[12px] text-magenta">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

// ---- shared bits (copy only; layout stays per variant) --------------------------------------

function lastTrainedText(model: ProtoCardModel): string {
  return model.lastPerformedOn
    ? `Last trained ${formatLongDate(model.lastPerformedOn)}`
    : "Not trained yet";
}

function exercisesText(count: number): string {
  return `${count} ${count === 1 ? "exercise" : "exercises"}`;
}

// The whole-card tap target: the title link's ::after stretches over the positioned card, and the
// controls above it (`relative z-10`) stay independently clickable — no link nested in a link.
const STRETCHED_LINK =
  "after:absolute after:inset-0 after:rounded-md after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-cyan/60";

function TitleLink({
  model,
  level,
  className,
}: {
  model: ProtoCardModel;
  level: 2 | 3;
  className?: string;
}): React.JSX.Element {
  const Title = level === 3 ? "h3" : "h2";
  return (
    <Title className={cn("min-w-0 font-display font-semibold text-text-primary", className)}>
      <Link {...NAV_FORWARD} href={model.detailHref} className={STRETCHED_LINK}>
        {model.displayName}
      </Link>
    </Title>
  );
}

// ---- A: Train card+ ------------------------------------------------------------------------

function VariantA({ model, level, isFavorite, menu }: CardProps): React.JSX.Element {
  const trained = loggedCountBadge(model.loggedCount);
  return (
    <Card
      className={cn(
        "relative flex flex-col gap-3 p-4 transition-colors hover:border-cyan/40",
        isFavorite && "glow-favorite",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <WorkoutSigil
            seedId={model.id}
            exerciseCount={model.exerciseCount}
            trainingType={model.trainingType}
            size={44}
          />
          <div className="flex min-w-0 flex-col gap-2">
            <TitleLink model={model} level={level} className="break-words text-base" />
            <div>
              <Badge variant={model.badgeVariant} className="capitalize">
                {model.trainingType}
              </Badge>
            </div>
          </div>
        </div>
        {/* Start alone beside the title (⋯ moved to the bottom row) so the name keeps its width. */}
        <Link
          {...NAV_FORWARD}
          href={model.startHref}
          aria-label={`Start ${model.displayName}`}
          className={buttonVariants({ variant: "secondary", className: "relative z-10 shrink-0" })}
        >
          <Play className="h-4 w-4" aria-hidden />
          Start
        </Link>
      </div>

      {/* "Last trained" on a row of its own, never wrapping under the badge. */}
      <p className="label-mono truncate text-[10px] text-text-muted">{lastTrainedText(model)}</p>

      {model.previewExercises.length > 0 ? (
        <p className="truncate font-mono text-[12px] text-text-secondary">
          {model.previewExercises.join(" · ")}
        </p>
      ) : null}

      {/* Bottom row, no divider above it: exercise count · Trained N× · ⋯ */}
      <div className="flex items-center justify-between gap-2">
        <span className="label-mono inline-flex items-center gap-1.5 text-[11px] text-text-secondary">
          <Dumbbell className="h-3.5 w-3.5 text-text-muted" aria-hidden />
          {exercisesText(model.exerciseCount)}
        </span>
        <div className="relative z-10 -my-1 -mr-2 flex items-center gap-1">
          {trained ? (
            <Badge variant="muted" className="uppercase">
              {trained}
            </Badge>
          ) : null}
          {menu}
        </div>
      </div>
    </Card>
  );
}

// ---- B: Dense row --------------------------------------------------------------------------

function VariantB({ model, level, isFavorite, menu }: CardProps): React.JSX.Element {
  return (
    <div
      className={cn(
        "relative flex items-center gap-3 border-b border-border px-1 py-3 transition-colors hover:bg-surface",
        isFavorite && "glow-favorite rounded-md",
      )}
    >
      <WorkoutSigil
        seedId={model.id}
        exerciseCount={model.exerciseCount}
        trainingType={model.trainingType}
        size={36}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <TitleLink model={model} level={level} className="break-words text-[15px]" />
        {/* Everything on one line, most important first: last trained · count · type. */}
        <p className="label-mono truncate text-[10px] text-text-muted">
          {lastTrainedText(model)}
          {" · "}
          {exercisesText(model.exerciseCount)}
          {" · "}
          <span className="capitalize">{model.trainingType}</span>
        </p>
        {model.previewExercises.length > 0 ? (
          <p className="truncate font-mono text-[11px] text-text-secondary">
            {model.previewExercises.join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="relative z-10 flex shrink-0 items-center">
        <Link
          {...NAV_FORWARD}
          href={model.startHref}
          aria-label={`Start ${model.displayName}`}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
        >
          <Play className="h-5 w-5 text-cyan" aria-hidden />
        </Link>
        {menu}
      </div>
    </div>
  );
}

// ---- C: Stat tile --------------------------------------------------------------------------

function VariantC({ model, level, isFavorite, menu }: CardProps): React.JSX.Element {
  const stats: [string, string][] = [
    ["Last trained", model.lastPerformedOn ? formatLongDate(model.lastPerformedOn) : "—"],
    ["Exercises", String(model.exerciseCount)],
    ["Trained", `${model.loggedCount}×`],
  ];
  return (
    <Card
      className={cn(
        "relative flex flex-col gap-4 p-4 transition-colors hover:border-cyan/40",
        isFavorite && "glow-favorite",
      )}
    >
      <div className="flex items-start gap-3">
        <WorkoutSigil
          seedId={model.id}
          exerciseCount={model.exerciseCount}
          trainingType={model.trainingType}
          size={56}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <TitleLink model={model} level={level} className="break-words text-lg" />
          <div>
            <Badge variant={model.badgeVariant} className="capitalize">
              {model.trainingType}
            </Badge>
          </div>
        </div>
        <div className="relative z-10 -mt-1 -mr-1">{menu}</div>
      </div>

      {model.previewExercises.length > 0 ? (
        <p className="truncate font-mono text-[12px] text-text-secondary">
          {model.previewExercises.join(" · ")}
        </p>
      ) : null}

      <dl className="grid grid-cols-3 divide-x divide-border rounded-sm border border-border">
        {stats.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1 px-2 py-2">
            <dt className="label-mono truncate text-[9px] text-text-muted">{label}</dt>
            <dd className="break-words font-mono text-[13px] text-text-primary">{value}</dd>
          </div>
        ))}
      </dl>

      <Link
        {...NAV_FORWARD}
        href={model.startHref}
        aria-label={`Start ${model.displayName}`}
        className={buttonVariants({ variant: "secondary", className: "relative z-10 w-full" })}
      >
        <Play className="h-4 w-4" aria-hidden />
        Start
      </Link>
    </Card>
  );
}
