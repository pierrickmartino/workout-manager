// The admin home's dashboard shape at the shell's wide width (ADR-0088, ADR-0142): a
// full-width row of summary tiles over two columns, Publishing beside Operations. Below `lg:`
// it is a plain stacked column. It is a component rather than classes inline on the page for
// the reason `home-columns.tsx` gives: `audit/wide.mjs` and `audit/reflow.mjs` mount the
// *same* grid in their `admin-home` journey, so they measure this layout, not a copy of it.
//
// Below `lg:` the admin home must look exactly as it did before it became a dashboard, so:
//   - the tiles row is `hidden lg:flex` — it is server-rendered markup with no client JS, so
//     hiding it costs nothing, and on a phone the page shows the same sections as before;
//   - source order is Publishing then Operations, which is the order the narrow admin home has
//     always had. The wide layout keeps that order left-to-right instead of reordering with
//     CSS, so the focus and reading order match what is drawn.
export function AdminDashboardColumns({
  tiles,
  publishing,
  operations,
}: {
  tiles: React.ReactNode;
  publishing: React.ReactNode;
  operations: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-6">
      {/* One tile group per child; with a second group (#769) they share the row equally. */}
      <div className="hidden lg:flex lg:items-start lg:gap-6">{tiles}</div>
      {/* `grid-cols-2` is Tailwind's own `minmax(0,1fr)` track, never bracket syntax, and
          `min-w-0` on each column stops an authored name widening its grid item (ADR-0085). */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">{publishing}</div>
        <div className="flex min-w-0 flex-col gap-6">{operations}</div>
      </div>
    </div>
  );
}
