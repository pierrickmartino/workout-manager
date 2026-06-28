# 0003 — Two-layer generation cache with coarse keys, adopt-by-copy, and a safety bypass

AI generation is expensive, so generated content is cached and reused across users — but users also mutate their plans (feedback, regeneration, exercise swaps, logging). These two pressures are reconciled with a two-layer model.

**Immutable generated content.** A Generated Program / Generated Session is the immutable AI output for a given set of parameters. It is stored in the cache and shareable across users, and is never mutated.

**Coarse exact-match key.** The cache key is a deliberately *coarsened* normalized tuple: training type, objective, level bucket (beginner/intermediate/advanced), sessions per week, number of weeks, session duration, normalized (sorted) equipment set, and a constraint signature. Continuous profile values (exact age, height, weight) personalize generation but are **left out of the key**. This makes "significant differences" (idea doc §6) a *design-time* decision about key granularity rather than a runtime similarity threshold to tune. Matching is exact on this coarse tuple — no embeddings, no scoring.

**Adopt-by-copy.** A user adopts cached content by deep-copying it into their own mutable Program (and Sessions / Exercise Prescriptions). All per-user mutation — logging, feedback, regeneration, exercise substitution — touches only the user's copy. The cached artifact stays pristine. Duplicated rows per user are negligible next to the AI-call cost the cache saves.

**Hard safety bypass.** Any Sensitive Constraint (injury, rehabilitation, postpartum, flagged medical) triggers a **hard cache bypass**: such a user is never served a shared/cached Program and always gets a fresh generation that can apply the appropriate caution. This turns §1's "remain cautious" and §6's "avoid unsuitable reuse" into one unambiguous safety rule rather than a fuzzy penalty. Specific constraint *types* are stored so generation can tailor its caution; the boolean bypass gate is **derived** from whether any sensitive type is present.

## Considered Options

- **Similarity scoring / embeddings for reuse** — rejected: fuzzy, tunable-by-vibes, adds cost, and a wrong reuse is a safety issue, not just a quality one.
- **Reference a shared Program instead of copying** — rejected: incompatible with per-user mutation (one user's swap/regeneration would affect others).
- **A single opaque "is sensitive" boolean** — rejected: loses the constraint detail generation needs to apply the *right* caution.
