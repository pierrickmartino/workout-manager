// PROTOTYPE — throwaway. Question: on the Session detail page, with Favorite folded into the ⋯
// action sheet and the ⋯ moved to the top-right corner, does the favorited state still need a
// visible marker once its star button is gone, and which one?
//
// Variants of the page header on the existing `/sessions/[id]` route, switchable via `?variant=`
// (current | A | B | C). Only the header subtree swaps; data fetching stays in page.tsx. In every
// variant the ⋯ is pinned top right (it never wraps under a long title) and Favorite is the
// sheet's first row.
//   A  Quiet corner — nothing outside the sheet says "favorited"; badges + byline under the title.
//   B  Star pip     — a small cyan star rides the ⋯ trigger when favorited; badges stay beside
//                     the title.
//   C  Glow Edge    — the sigil wears the cyan Glow Edge My Sessions uses for a favorited row,
//                     plus a FAVORITE chip in the meta row.

import Link from "next/link";
import { ArrowRight } from "@/components/pulse/icons";

import { RenameSessionControl } from "@/components/RenameSessionControl";
import { ShareSessionControl } from "@/components/ShareSessionControl";
import { DuplicateButton } from "@/components/DuplicateButton";
import { DeleteSessionControl } from "@/components/DeleteSessionControl";
import {
  ActionSheetItemText,
  ActionSheetSeparator,
  actionSheetItemClass,
} from "@/components/pulse/action-sheet-item";
import { Overline } from "@/components/pulse/overline";
import { WorkoutSigil } from "@/components/pulse/workout-sigil";
import { Badge } from "@/components/ui/badge";
import { BasedOnNote } from "@/components/BasedOnNote";
import { submitDeleteSession } from "@/app/sessions/[id]/actions";
import { appendFrom } from "@/lib/back-target";
import { NAV_FORWARD } from "@/lib/nav-direction";
import { DELETE_DISABLED_HINT, type sessionDeleteView } from "@/lib/session-delete";
import type { sessionNameView } from "@/lib/session-name";
import type { sessionAuthorView } from "@/lib/session-author";
import type { sessionFavoriteView } from "@/lib/session-favorite";
import type { WorkoutSession } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import { SessionActionsMenu } from "./session-menu";

export const HEADER_VARIANTS = [
  { key: "current", name: "Today" },
  { key: "A", name: "Quiet corner" },
  { key: "B", name: "Star pip on ⋯" },
  { key: "C", name: "Glow Edge + chip" },
] as const;

export interface HeaderVariantProps {
  variant: string;
  session: WorkoutSession;
  nameView: ReturnType<typeof sessionNameView>;
  authorView: ReturnType<typeof sessionAuthorView>;
  favoriteView: ReturnType<typeof sessionFavoriteView>;
  deleteView: ReturnType<typeof sessionDeleteView>;
}

export function HeaderVariant(props: HeaderVariantProps) {
  if (props.variant === "A") return <VariantA {...props} />;
  if (props.variant === "B") return <VariantB {...props} />;
  return <VariantC {...props} />;
}

// --- A: [overline + title | ⋯] — the ⋯ squares off the overline's line; meta row underneath.
function VariantA(props: HeaderVariantProps) {
  const { session, authorView } = props;
  return (
    <>
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Overline>PULSE // SESSION</Overline>
          <h1 className="text-balance font-display text-2xl font-bold leading-tight tracking-tight text-text-primary">
            <Title {...props} />
          </h1>
        </div>
        <div className="-mt-2 -mr-2 shrink-0">
          <Menu {...props} />
        </div>
      </header>
      <div className="-mt-4 flex flex-wrap items-center gap-2">
        <TypeBadges session={session} />
        {authorView.showByline ? <Byline authorView={authorView} /> : null}
      </div>
      <BasedOnNote lineage={session.curated_lineage} />
    </>
  );
}

// --- B: ⋯ floats in the page's corner, out of the header's flow; star pip when favorited.
function VariantB(props: HeaderVariantProps) {
  const { session, authorView } = props;
  return (
    <>
      <div className="relative">
        <div className="absolute -top-2 -right-2 z-10">
          <Menu {...props} showFavoritePip />
        </div>
        <header className="flex flex-wrap items-center justify-between gap-4 pr-10">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Overline>PULSE // SESSION</Overline>
            <h1 className="text-balance font-display text-2xl font-bold leading-tight tracking-tight text-text-primary">
              <Title {...props} />
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <TypeBadges session={session} />
          </div>
        </header>
      </div>
      {authorView.showByline ? (
        <div className="-mt-4">
          <Byline authorView={authorView} />
        </div>
      ) : null}
      <BasedOnNote lineage={session.curated_lineage} />
    </>
  );
}

// --- C: same corner as A, but the favorited state is carried by the sigil's Glow Edge + a chip.
function VariantC(props: HeaderVariantProps) {
  const { session, authorView, favoriteView } = props;
  const favorited = favoriteView.show && favoriteView.isFavorite;
  return (
    <>
      <header className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Overline>PULSE // SESSION</Overline>
          <h1 className="text-balance font-display text-2xl font-bold leading-tight tracking-tight text-text-primary">
            <Title {...props} glow={favorited} />
          </h1>
        </div>
        <div className="-mt-2 -mr-2 shrink-0">
          <Menu {...props} />
        </div>
      </header>
      <div className="-mt-4 flex flex-wrap items-center gap-2">
        {favorited ? (
          <Badge variant="cyan" title="Favorite">
            ★ FAVORITE
          </Badge>
        ) : null}
        <TypeBadges session={session} />
        {authorView.showByline ? <Byline authorView={authorView} /> : null}
      </div>
      <BasedOnNote lineage={session.curated_lineage} />
    </>
  );
}

// --- Shared leaves (presentation only; each variant owns its own layout).

function Title({ session, nameView, glow = false }: HeaderVariantProps & { glow?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <span className={cn("inline-flex shrink-0 rounded-md", glow && "glow-favorite")}>
      <WorkoutSigil
        seedId={session.id}
        exerciseCount={session.prescriptions.length}
        trainingType={session.training_type}
        size={48}
        morphSessionId={session.id}
      />
      </span>
      <span className="min-w-0">{nameView.displayName}</span>
    </span>
  );
}

function TypeBadges({ session }: { session: WorkoutSession }) {
  return (
    <>
      <Badge variant="magenta" className="capitalize">
        {session.training_type}
      </Badge>
      <Badge variant="cyan">{session.duration_minutes} MIN</Badge>
    </>
  );
}

function Byline({ authorView }: { authorView: HeaderVariantProps["authorView"] }) {
  return (
    <p
      className={`font-sans text-[13px] ${
        authorView.isNamed ? "text-text-secondary" : "text-text-muted italic"
      }`}
    >
      {authorView.byline}
    </p>
  );
}

// The ⋯ sheet: Favorite first (when offered), then today's rows unchanged.
function Menu({
  session,
  nameView,
  favoriteView,
  deleteView,
  showFavoritePip = false,
}: HeaderVariantProps & { showFavoritePip?: boolean }) {
  return (
    <SessionActionsMenu
      sessionId={session.id}
      isFavorite={favoriteView.show ? favoriteView.isFavorite : null}
      showFavoritePip={showFavoritePip}
    >
      {session.is_protocol_member ? null : (
        <RenameSessionControl
          sessionId={session.id}
          displayName={nameView.displayName}
          isUserNamed={nameView.isUserNamed}
          editValue={nameView.editValue}
        />
      )}
      {session.is_protocol_member ? null : <ShareSessionControl sessionId={session.id} />}
      {session.is_protocol_member ? null : <DuplicateButton sessionId={session.id} />}
      <Link
        {...NAV_FORWARD}
        href={appendFrom("/sessions/new", `/sessions/${session.id}`)}
        className={actionSheetItemClass()}
      >
        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        <ActionSheetItemText label="Generate another" description="Ask for a new standalone session" />
      </Link>
      {deleteView.show ? (
        <>
          <ActionSheetSeparator />
          <DeleteSessionControl
            sessionId={session.id}
            action={submitDeleteSession}
            disabledHint={deleteView.canDelete ? null : DELETE_DISABLED_HINT}
          />
        </>
      ) : null}
    </SessionActionsMenu>
  );
}
