// Home's two-column shape at the shell's wide width (ADR-0088), and a plain stacked column
// below `lg:`. This exists as a component rather than as classes inline on the page for one
// reason: `audit/wide.mjs`'s `home` journey renders the *same* grid, so the sweep measures
// Home's real layout instead of a copy of it that would drift.
//
// Source order is the rendered order below `lg:` — `main` then `rail` — which is exactly the
// order the narrow Home has always had, so converting Home moved nothing on a phone.
export function HomeColumns({
  main,
  rail,
}: {
  main: React.ReactNode;
  rail: React.ReactNode;
}): React.JSX.Element {
  return (
    // `items-start` stops the rail stretching to match the taller left column. The tracks are
    // Tailwind's own `grid-cols-3`, never bracket syntax, so `reflow-policy.ts` needs no
    // exemption for a desktop-only grid (ADR-0088).
    <div className="flex flex-col gap-7 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
      {/* `min-w-0` on both columns is load-bearing, and its absence was a measured defect, not
          a precaution: a grid item's automatic minimum is its content, so the 120-character
          unbroken Session name in the training route — which ends in a `truncate`, i.e.
          `white-space: nowrap` — made this item 1,499px wide and the document 3,326px at a
          1,440px viewport. `grid-cols-3` is already `minmax(0,1fr)` and could shrink; the
          *items* could not. Third time this escape hatch has been the fix (ADR-0085's
          `<fieldset>`, ADR-0088's flex content column, now here). */}
      <div className="flex min-w-0 flex-col gap-7 lg:col-span-2">{main}</div>
      <div className="flex min-w-0 flex-col gap-4">{rail}</div>
    </div>
  );
}
