import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  findStylesheetMotion,
  findViewTransitionCallbacks,
  formatStylesheetMotion,
  offSwitchGaps,
  STYLESHEET_MOTION_EXEMPTIONS,
  VIEW_TRANSITION_PSEUDOS,
} from "./view-transition-motion-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function sourcesEndingWith(suffix: string): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(suffix))
      .map((entry) => `${directory}/${entry}`));
}

function read(file: string): string {
  return readFileSync(resolve(webRoot, file), "utf8");
}

const OFF_SWITCH = `@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-image-pair(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}`;

// --- The off switch -------------------------------------------------------

test("accepts an off switch that turns every view-transition pseudo-element's animation off", () => {
  // Arrange & Act
  const gaps = offSwitchGaps(OFF_SWITCH);
  // Assert
  assert.deepEqual(gaps, []);
});

test("reports every pseudo-element when the stylesheet has no off switch at all", () => {
  // Arrange: fail closed — the browser's default view transition moves things with no CSS.
  const css = `@layer base { body { color: red; } }`;
  // Act
  const gaps = offSwitchGaps(css);
  // Assert
  assert.deepEqual(gaps, [...VIEW_TRANSITION_PSEUDOS]);
});

test("reports a pseudo-element the off switch forgets", () => {
  // Arrange
  const css = OFF_SWITCH.replace("  ::view-transition-image-pair(*),\n", "");
  // Act
  const gaps = offSwitchGaps(css);
  // Assert
  assert.deepEqual(gaps, ["::view-transition-image-pair(*)"]);
});

test("rejects an off switch that only shortens the animation instead of removing it", () => {
  // Arrange: ADR-0082 — movement is turned off, not sped up.
  const css = OFF_SWITCH.replace("animation: none !important;", "animation-duration: 0s !important;");
  // Act
  const gaps = offSwitchGaps(css);
  // Assert
  assert.deepEqual(gaps, [...VIEW_TRANSITION_PSEUDOS]);
});

test("rejects an off switch without !important, which a more specific transition class would beat", () => {
  // Arrange
  const css = OFF_SWITCH.replace("animation: none !important;", "animation: none;");
  // Act
  const gaps = offSwitchGaps(css);
  // Assert
  assert.deepEqual(gaps, [...VIEW_TRANSITION_PSEUDOS]);
});

test("rejects an off switch outside the reduced-motion media query", () => {
  // Arrange: unconditional, it would kill the animation for everyone — the wrong rule.
  const css = OFF_SWITCH.replace("@media (prefers-reduced-motion: reduce)", "@layer base");
  // Act
  const gaps = offSwitchGaps(css);
  // Assert
  assert.deepEqual(gaps, [...VIEW_TRANSITION_PSEUDOS]);
});

// --- Movement declared in a stylesheet ------------------------------------

test("accepts animation on view-transition pseudo-elements, which the off switch reaches", () => {
  // Arrange
  const css = `${OFF_SWITCH}
::view-transition-old(.nav-forward) { animation: 150ms ease-in both slide-out-left; }
html::view-transition-new(.nav-forward):only-child { animation-name: slide-in-right; }`;
  // Act
  const violations = findStylesheetMotion(css, "app/globals.css");
  // Assert
  assert.deepEqual(violations, []);
});

test("reports an animation on an ordinary selector, which the off switch cannot reach", () => {
  // Arrange
  const css = `.spinner { animation: spin 1s linear infinite; }`;
  // Act
  const violations = findStylesheetMotion(css, "app/globals.css");
  // Assert
  assert.deepEqual(violations, [{ file: "app/globals.css", line: 1, selector: ".spinner", property: "animation", kind: "unguarded" }]);
  assert.match(formatStylesheetMotion(violations), /app\/globals\.css:1 — \.spinner \{ animation \}/);
});

test("reports a selector list that mixes a view-transition pseudo-element with an ordinary element", () => {
  // Arrange
  const css = `::view-transition-old(*), .card { animation: fade 1s; }`;
  // Act
  const violations = findStylesheetMotion(css, "a.css");
  // Assert
  assert.deepEqual(violations.map(({ kind }) => kind), ["unguarded"]);
});

test("accepts movement scoped to users who accept it with a no-preference media query", () => {
  // Arrange: the stylesheet spelling of `motion-safe:`.
  const css = `@media (prefers-reduced-motion: no-preference) { .spinner { animation: spin 1s infinite; } }`;
  // Act
  const violations = findStylesheetMotion(css, "a.css");
  // Assert
  assert.deepEqual(violations, []);
});

test("reports movement declared under the reduced-motion preference itself", () => {
  // Arrange: like `motion-reduce:animate-spin`, it moves *because* the preference is set.
  const css = `@media (prefers-reduced-motion: reduce) { ::view-transition-old(*) { animation: spin 1s; } }`;
  // Act
  const violations = findStylesheetMotion(css, "a.css");
  // Assert
  assert.deepEqual(violations.map(({ kind }) => kind), ["declared-under-reduce"]);
});

test("reports an !important view-transition animation, which could outrank the off switch", () => {
  // Arrange: `(.slide)` is more specific than `(*)`, so two !important rules resolve to it.
  const css = `${OFF_SWITCH}
::view-transition-old(.slide) { animation: slide-out 200ms !important; }`;
  // Act
  const violations = findStylesheetMotion(css, "a.css");
  // Assert
  assert.deepEqual(violations.map(({ kind, selector }) => [kind, selector]), [["outranks-off-switch", "::view-transition-old(.slide)"]]);
});

test("classifies stylesheet transitions by whether their property list can move something", () => {
  // Arrange
  const css = `
.a { transition: transform 200ms; }
.b { transition: all 200ms; }
.c { transition: 200ms ease; }
.d { transition-property: opacity, translate; }
.e { transition: color 150ms, opacity 150ms; }
.f { transition-property: background-color; }
.g { transition: none; }`;
  // Act
  const violations = findStylesheetMotion(css, "a.css");
  // Assert: colour and opacity move nothing (ADR-0082); a bare duration means `all`.
  assert.deepEqual(violations.map(({ selector }) => selector), [".a", ".b", ".c", ".d"]);
});

test("ignores the off switch, keyframe bodies and animations that are turned off", () => {
  // Arrange: a keyframe's `transform` is movement only once something applies it.
  const css = `${OFF_SWITCH}
@keyframes pulse-sweep { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
.still { animation: none; animation-name: none; }`;
  // Act
  const violations = findStylesheetMotion(css, "a.css");
  // Assert
  assert.deepEqual(violations, []);
});

test("holds an @apply'd Tailwind utility to the same pairing rule as a class string", () => {
  // Arrange
  const css = `
.a { @apply h-4 animate-spin; }
.b { @apply animate-spin motion-reduce:animate-none; }
.c { @apply motion-safe:transition-transform transition-colors; }`;
  // Act
  const violations = findStylesheetMotion(css, "a.css");
  // Assert
  assert.deepEqual(violations.map(({ selector, property }) => [selector, property]), [[".a", "@apply animate-spin"]]);
});

// --- Movement declared in JavaScript --------------------------------------

test("reports a ViewTransition callback, whose Web Animations escape the CSS off switch", () => {
  // Arrange
  const source = `import { ViewTransition } from "react";
export const A = () => (
  <ViewTransition
    onEnter={(instance) => instance.new.animate([{ opacity: 0 }], 200)}
    enter="fade-in"
  >
    <div />
  </ViewTransition>
);`;
  // Act
  const violations = findViewTransitionCallbacks(source, "a.tsx");
  // Assert
  assert.deepEqual(violations, [{ file: "a.tsx", line: 4, prop: "onEnter" }]);
});

test("accepts a ViewTransition that animates through class names only", () => {
  // Arrange
  const source = `import { ViewTransition } from "react";
export const A = () => <ViewTransition default="none" enter={{ "nav-forward": "slide-in" }}><div /></ViewTransition>;`;
  // Act
  const violations = findViewTransitionCallbacks(source, "a.tsx");
  // Assert
  assert.deepEqual(violations, []);
});

// --- The app's own sources -------------------------------------------------

test("the app stylesheet turns every view transition off under the reduced-motion preference", () => {
  // Arrange & Act
  const gaps = offSwitchGaps(read("app/globals.css"));
  // Assert
  assert.deepEqual(gaps, [], `app/globals.css has no reduced-motion off switch for: ${gaps.join(", ")}`);
});

test("no stylesheet declares movement that survives the reduced-motion preference", () => {
  // Arrange
  const files = sourcesEndingWith(".css");
  // Act
  const violations = files.flatMap((file) => findStylesheetMotion(read(file), file));
  // Assert
  assert.equal(violations.length, 0, `\n${formatStylesheetMotion(violations)}\n`);
  assert.ok(files.includes("app/globals.css"), "expected the sweep to reach app/globals.css");
});

test("no ViewTransition animates through a JavaScript callback", () => {
  // Arrange
  const files = sourcesEndingWith(".tsx");
  // Act
  const violations = files.flatMap((file) => findViewTransitionCallbacks(read(file), file));
  // Assert
  assert.deepEqual(violations, []);
  assert.ok(files.length > 100, `expected the sweep to cover the component tree, saw ${files.length} files`);
});

test("every stylesheet motion exemption carries a reason a reviewer can weigh", () => {
  // Arrange & Act & Assert: the registry ships empty; an entry must justify itself.
  const stylesheets = sourcesEndingWith(".css");
  for (const exemption of STYLESHEET_MOTION_EXEMPTIONS) {
    assert.ok(exemption.reason.trim().length > 0, `${exemption.file}: ${exemption.selector} has no reason`);
    assert.ok(stylesheets.includes(exemption.file), `${exemption.file} is not a swept stylesheet`);
  }
});
