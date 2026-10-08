// The direction a navigation travels in the app's hierarchy (ADR-0121). A link spreads one of
// these onto `<Link>`: `transitionTypes` tells React which way to slide, and the DOM attribute
// lets the navigation guard read the same direction off an intercepted `<a>`, where the
// `<Link>` prop no longer exists. Untagged navigations — tab to tab, a query swap, a
// server-action redirect — carry no type and swap instantly.
//
// Imported by components, so it stays free of anything heavier than constants.

export const NAV_DIRECTION_ATTRIBUTE = "data-nav-direction";

const DIRECTIONS = { "nav-forward": true, "nav-back": true } as const;

export type NavDirection = keyof typeof DIRECTIONS;

export interface NavDirectionProps {
  readonly transitionTypes: string[];
  readonly [NAV_DIRECTION_ATTRIBUTE]: NavDirection;
}

function navDirectionProps(direction: NavDirection): NavDirectionProps {
  return { transitionTypes: [direction], [NAV_DIRECTION_ATTRIBUTE]: direction };
}

// Deeper into the hierarchy: list → detail → edit.
export const NAV_FORWARD = navDirectionProps("nav-forward");
// Back out of it. `BackLink` is the one place this is spread.
export const NAV_BACK = navDirectionProps("nav-back");

export function parseNavDirection(value: string | null): NavDirection | null {
  return value !== null && Object.hasOwn(DIRECTIONS, value) ? (value as NavDirection) : null;
}
