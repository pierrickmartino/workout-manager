import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findSkeletonRevealViolations } from "./skeleton-reveal-policy.ts";

const webRoot = resolve(import.meta.dirname, "..");

function routeSkeletons(): readonly string[] {
  return readdirSync(resolve(webRoot, "app"), { recursive: true, encoding: "utf8" })
    .filter((entry) => entry === "loading.tsx" || entry.endsWith("/loading.tsx"))
    .map((entry) => `app/${entry}`);
}

function componentSources(): readonly string[] {
  return ["components", "app"].flatMap((directory) =>
    readdirSync(resolve(webRoot, directory), { recursive: true, encoding: "utf8" })
      .filter((entry) => entry.endsWith(".tsx"))
      .map((entry) => `${directory}/${entry}`));
}

function read(file: string): string {
  return readFileSync(resolve(webRoot, file), "utf8");
}

test("accepts a route skeleton that returns a SkeletonPage", () => {
  // Arrange
  const source = `export default function Loading() {
  return (
    <SkeletonPage header={<PageHeader overline="A" title="B" />} gap={6}>
      <Skeleton className="h-4" />
    </SkeletonPage>
  );
}`;
  // Act & Assert
  assert.deepEqual(findSkeletonRevealViolations(source, "app/a/loading.tsx"), []);
});

test("reports a route skeleton whose root is not a SkeletonPage, so it never reveals", () => {
  // Arrange
  const source = `export default function Loading() {
  return (
    <section className="flex flex-col gap-6">
      <PageHeader overline="A" title="B" />
    </section>
  );
}`;
  // Act
  const violations = findSkeletonRevealViolations(source, "app/a/loading.tsx");
  // Assert
  assert.deepEqual(violations, [{ file: "app/a/loading.tsx", line: 3, rule: "route-skeleton-root" }]);
});

test("reports a page header inside a reveal, where it fades over its own live copy", () => {
  // Arrange: the snapshot's anti-aliased edges composite over the identical live text.
  const source = `export const A = () => (
  <SkeletonReveal>
    <div>
      <PageHeader overline="A" title="B" />
    </div>
  </SkeletonReveal>
);`;
  // Act
  const violations = findSkeletonRevealViolations(source, "components/a.tsx");
  // Assert
  assert.deepEqual(violations, [{ file: "components/a.tsx", line: 4, rule: "header-in-reveal" }]);
});

test("does not hold an ordinary component to the route-skeleton rule", () => {
  // Arrange
  const source = `export default function Page() { return <section />; }`;
  // Act & Assert
  assert.deepEqual(findSkeletonRevealViolations(source, "app/a/page.tsx"), []);
});

test("every route skeleton reveals its data and keeps its header live", () => {
  // Arrange
  const skeletons = routeSkeletons();
  // Act
  const violations = componentSources().flatMap((file) => findSkeletonRevealViolations(read(file), file));
  // Assert
  assert.deepEqual(violations, []);
  assert.ok(skeletons.length >= 15, `expected the sweep to reach every loading.tsx, saw ${skeletons.length}`);
});
