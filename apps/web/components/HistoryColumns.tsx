// History's Month view at the shell's wide width (ADR-0088, ADR-0138): the month grid in a
// sticky column beside the list, so a reader changes day or month without scrolling back up.
// Below `lg:` it is a plain stacked column — the grid above the list, in source order — which
// is exactly the narrow Month view as it was before this layout existed, so nothing moves on a
// phone. The audit journeys mount `HistoryBrowser`, and so this component, rather than a copy.
//
// The wide layout adds no action: the same grid and the same cards, arranged side by side.
export function HistoryColumns({
  grid,
  list,
}: {
  grid: React.ReactNode;
  list: React.ReactNode;
}): React.JSX.Element {
  return (
    // Flex, not bracket tracks, so `reflow-policy.ts` needs no exemption for a desktop-only
    // layout (ADR-0088). `items-start` keeps the grid column its own height, which is what
    // lets it stick while the longer list scrolls past it.
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* The grid keeps the width it was designed at — the narrow shell token — and sticks
          below the sticky header (3.5rem) with the page's own 1.5rem of air. */}
      <div className="min-w-0 lg:sticky lg:top-20 lg:w-shell lg:shrink-0">{grid}</div>
      {/* `min-w-0` because a flex item's automatic minimum is its content (ADR-0085): an
          unbroken authored name in a card would otherwise widen the column past the frame. */}
      <div className="min-w-0 lg:flex-1">{list}</div>
    </div>
  );
}
