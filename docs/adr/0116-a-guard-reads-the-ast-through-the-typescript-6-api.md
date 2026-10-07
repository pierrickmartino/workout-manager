# 0116 — A guard reads the AST through the TypeScript 6 API

TypeScript 7 is the native Go port. Its `typescript` package ships the `tsc` binary and a
`version` export, but no JavaScript compiler API: `createSourceFile`, `forEachChild`,
`transpileModule` and the `is*` node predicates are gone.

Twenty-one files under `apps/web/lib/` use that API. They are the `*-policy.ts` guards, which read
components through the AST rather than searching text (ADR-0094, ADR-0098, ADR-0109), plus
`tsx-harness.ts` and a few tests that transpile a component to render it. On `typescript@7.0.2`
they no longer type-check, and at run time they would throw on the first call.

## Decision

- `typescript` is pinned at 7.x. It is the compiler `npm run typecheck`, the CI type-check job and
  `next build` run.
- Code that walks or transpiles TypeScript imports `ts` from **`@typescript/typescript6`**, the
  6.x API package Microsoft publishes alongside 7. It is a devDependency and never reaches a
  bundle.
- The upgrade went through 6.0.3 first, with a blocking `tsc --noEmit` CI job added before
  either bump.

## Consequences

- A new guard that writes `import ts from "typescript"` fails `npm run typecheck`, because the
  package has no such exports, so the mistake can't pass CI.
- The guards parse with the 6.x grammar. Syntax that only 7 accepts would parse differently in a
  guard than in the compiler. When that matters, move the guards to the native API once it is
  stable.
- `next build` type-checks in about 1.3s, down from 12s on 6.0.3.
