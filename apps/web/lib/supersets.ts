// The generic Superset structural vocabulary (ADR-0023), shared by the Protocol Builder
// (`protocol-builder.ts`) and the Hand-Authored Session build-and-log screen
// (`hand-authored-session.ts`). A Superset is an ordered group of two or more *contiguous*
// items sharing a group tag, performed round-major with one group-owned round-rest
// denormalized onto every member so it is reorder-stable. These pure functions operate on
// any item carrying the two overlay fields, so both drafts reuse one definition of
// grouping, ungrouping, round-rest editing, contiguity, and per-row layout rather than two
// drifting copies. Every branch returns a new array; the input is never mutated.

// The minimal overlay a Superset operation reads and writes: the shared group tag (`null`
// when solo) and the group-owned round-rest. Concrete draft rows (a builder Prescription,
// an authored exercise) carry more, but the structural operations touch only these.
export interface SupersetMember {
  supersetGroup: string | null;
  roundRestSeconds: number | null;
}

// Move the item at `from` to index `to`, shifting the rest, and return a new array. An
// out-of-range index or a no-op move leaves the order (and identity) unchanged.
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const last = items.length - 1;
  if (from < 0 || from > last || to < 0 || to > last || from === to) {
    return items;
  }
  const reordered = [...items];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);
  return reordered;
}

// Whether every Superset occupies an unbroken run of positions — the invariant the
// reducers maintain on reorder and the deploy gate re-checks (ADR-0023).
export function supersetsAreContiguous(
  items: readonly SupersetMember[],
): boolean {
  const bounds = new Map<string, { first: number; last: number; count: number }>();
  items.forEach((item, index) => {
    const group = item.supersetGroup;
    if (group === null) return;
    const bound = bounds.get(group);
    if (!bound) bounds.set(group, { first: index, last: index, count: 1 });
    else {
      bound.last = index;
      bound.count += 1;
    }
  });
  for (const { first, last, count } of bounds.values()) {
    if (last - first + 1 !== count) return false;
  }
  return true;
}

// Reposition the item at `from` to `to`, but never leave a Superset non-contiguous: a
// move that would split a group is refused and the original list returned unchanged
// (ADR-0023). This is the keyboard/button reorder floor — a move never silently reshapes
// a group. (The Builder's drag path snaps instead; that lives with the DnD helpers.)
export function reorderKeepingContiguous<T extends SupersetMember>(
  items: T[],
  from: number,
  to: number,
): T[] {
  const moved = moveItem(items, from, to);
  return supersetsAreContiguous(moved) ? moved : items;
}

// The first/last positions a Superset occupies, or `null` if the tag is absent.
export function groupSpan(
  items: readonly SupersetMember[],
  group: string,
): { first: number; last: number } | null {
  let first = -1;
  let last = -1;
  items.forEach((item, index) => {
    if (item.supersetGroup === group) {
      if (first < 0) first = index;
      last = index;
    }
  });
  return first < 0 ? null : { first, last };
}

// A fresh Superset tag for a list: one past the largest numeric tag already in use, so a
// new group never collides with an existing one. Tags originate here (the reducers are the
// only authors), so a simple numeric scheme suffices.
export function freshSupersetTag(items: readonly SupersetMember[]): string {
  const used = items
    .map((item) => item.supersetGroup)
    .filter((group): group is string => group !== null)
    .map((group) => Number.parseInt(group, 10))
    .filter((value) => Number.isInteger(value));
  return String(used.length > 0 ? Math.max(...used) + 1 : 1);
}

// Group the item at `position` with the next one into one Superset, unifying any groups
// they already belong to (ADR-0023). The unified group takes the first member's tag (else
// the next's, else a fresh tag) and one round-rest: an existing group's round-rest is
// kept, otherwise the group seeds from `seedRoundRest` (the callers pass the next member's
// own rest). An out-of-range `position` (no next item) leaves the list untouched.
export function groupWithNext<T extends SupersetMember>(
  items: T[],
  position: number,
  seedRoundRest: number | null,
): T[] {
  const first = items[position];
  const next = items[position + 1];
  if (!first || !next) return items;

  const tag = first.supersetGroup ?? next.supersetGroup ?? freshSupersetTag(items);
  const absorbed = new Set<string>();
  if (first.supersetGroup) absorbed.add(first.supersetGroup);
  if (next.supersetGroup) absorbed.add(next.supersetGroup);

  const existingRoundRest =
    (first.supersetGroup ? first.roundRestSeconds : null) ??
    (next.supersetGroup ? next.roundRestSeconds : null);
  const roundRest = existingRoundRest ?? seedRoundRest;

  return items.map((item, index) => {
    const joins =
      index === position ||
      index === position + 1 ||
      (item.supersetGroup !== null && absorbed.has(item.supersetGroup));
    if (!joins) return item;
    return { ...item, supersetGroup: tag, roundRestSeconds: roundRest };
  });
}

// Dissolve the Superset the item at `position` belongs to: clear the tag and round-rest on
// every member, so each member's own (dormant) rest is live again. An item that is not in
// a group leaves the list untouched.
export function ungroup<T extends SupersetMember>(
  items: T[],
  position: number,
): T[] {
  const tag = items[position]?.supersetGroup ?? null;
  if (tag === null) return items;
  return items.map((item) =>
    item.supersetGroup === tag
      ? { ...item, supersetGroup: null, roundRestSeconds: null }
      : item,
  );
}

// Set the group-owned round-rest of the Superset at `position` on every member, so the
// value stays consistent no matter which member the edit came from. A no-op when the item
// is not grouped.
export function editRoundRest<T extends SupersetMember>(
  items: T[],
  position: number,
  roundRestSeconds: number | null,
): T[] {
  const tag = items[position]?.supersetGroup ?? null;
  if (tag === null) return items;
  return items.map((item) =>
    item.supersetGroup === tag ? { ...item, roundRestSeconds } : item,
  );
}

// Clear the tag and round-rest of any Superset left with fewer than two members — a lone
// tag is not a valid group (ADR-0023). The pruning a removal needs so deleting one member
// of a pair never leaves a dangling singleton the deploy gate would later reject. Returns a
// new array; solo items and healthy groups pass through untouched.
export function dissolveSingletonGroups<T extends SupersetMember>(items: T[]): T[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const group = item.supersetGroup;
    if (group !== null) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return items.map((item) => {
    const group = item.supersetGroup;
    if (group !== null && (counts.get(group) ?? 0) < 2) {
      return { ...item, supersetGroup: null, roundRestSeconds: null };
    }
    return item;
  });
}

// One item's Superset display facts, aligned to the list — what a Superset-aware screen
// renders per row (ADR-0023). Solo items carry a null `memberLabel`; a grouped member gets
// its A/B/C badge, whether it opens or closes the group (so the screen brackets the group
// into one visible container), and the group's round-rest. `groupSize` is how many members
// the container wraps — `0` for a solo item, so it renders outside any container.
// `canGroupWithNext` gates the "group with next" control.
export interface SupersetSlot {
  group: string | null;
  memberLabel: string | null;
  isFirstMember: boolean;
  isLastMember: boolean;
  groupSize: number;
  roundRestSeconds: number | null;
  canGroupWithNext: boolean;
}

// Derive the per-item Superset layout for a list. Members of a group are lettered A, B, C…
// in order; the group's first/last members are flagged so the UI can bracket it and place
// the single round-rest field on its last member.
export function supersetLayout(
  items: readonly SupersetMember[],
): SupersetSlot[] {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (item.supersetGroup !== null) {
      totals.set(item.supersetGroup, (totals.get(item.supersetGroup) ?? 0) + 1);
    }
  }

  const ordinals = new Map<string, number>();
  return items.map((item, index) => {
    const group = item.supersetGroup;
    const next = items[index + 1];
    // An item can start/extend a group with its neighbour when one exists and is not
    // already in the *same* group.
    const canGroupWithNext =
      next !== undefined && (group === null || next.supersetGroup !== group);

    if (group === null) {
      return {
        group: null,
        memberLabel: null,
        isFirstMember: false,
        isLastMember: false,
        groupSize: 0,
        roundRestSeconds: null,
        canGroupWithNext,
      };
    }

    const ordinal = ordinals.get(group) ?? 0;
    ordinals.set(group, ordinal + 1);
    const total = totals.get(group) ?? 1;
    return {
      group,
      memberLabel: String.fromCharCode(65 + ordinal),
      isFirstMember: ordinal === 0,
      isLastMember: ordinal === total - 1,
      groupSize: total,
      roundRestSeconds: item.roundRestSeconds,
      canGroupWithNext,
    };
  });
}
