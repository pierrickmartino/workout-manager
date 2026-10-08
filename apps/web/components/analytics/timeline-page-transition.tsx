import { ViewTransition } from "react";

// The Personal Record timeline's page turn (ADR-0122). The pager changes only `?offset=`, so
// the path-keyed RouteTransition stays mounted and never fires; this boundary is keyed on the
// offset instead, so each page of records exits and the next one enters. `Older →` is tagged
// `nav-forward` and arrives from the right, `← Newer` is tagged `nav-back` and arrives from
// the left — the timeline is the app's one ordered sequence, where direction carries position.
// Any other re-render (a revalidation, the first load) has no type and doesn't move.
export function TimelinePageTransition({
  offset,
  children,
}: {
  offset: number;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <ViewTransition
      key={offset}
      default="none"
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
    >
      {children}
    </ViewTransition>
  );
}
