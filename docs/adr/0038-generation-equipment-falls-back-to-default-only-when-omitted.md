# Generation equipment falls back to Default Equipment only when omitted

A generation request's equipment is now a nullable list rather than a plain
list defaulting to empty. When a request **omits** equipment (`null`), the
user's **Default Equipment** from the Fitness Profile is resolved in as the
**Available Equipment** for that generation — before the coarse cache key is
computed, so two requests with the same effective equipment still share the
cache. When a request **states** equipment, that value is honored literally —
including an **explicitly empty** list, which is a real bodyweight-only choice,
not an absence. This is what makes "generate a bodyweight-only plan" expressible
for a user who has saved Default Equipment; collapsing `null` and `[]` back into
one empty-means-default rule would silently remove that ability. The rule applies
to both the multi-week Protocol path and the standalone Session path.

## Consequences

- The API boundary carries `equipment: list[str] | None`; the `None ≠ []`
  distinction is load-bearing and must not be "tidied" into
  `Field(default_factory=list)`.
- The effective (Available) equipment is resolved once at the route, injected
  into the generation request, and read by both the generator and the cache key,
  so the two never diverge.
