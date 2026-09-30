// The shell's wide-width threshold, as a media query a Client Component can ask about.
//
// It is the *same* 64rem as Tailwind's `lg:` (ADR-0088), stated once here so a component that
// must gate on the breakpoint in JavaScript cannot drift from the CSS that lays it out. `rem`
// deliberately: at 200% text this matches at 2048 CSS px, so a reader who has doubled their
// text keeps the narrow treatment, exactly as the CSS does.
export const WIDE_VIEWPORT_REM = 64;

export const WIDE_VIEWPORT_QUERY = `(min-width: ${WIDE_VIEWPORT_REM}rem)`;
