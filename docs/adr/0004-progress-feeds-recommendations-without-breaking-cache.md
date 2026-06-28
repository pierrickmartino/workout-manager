# 0004 — Progress feeds recommendations without breaking the cache

The idea doc (§7) says logged data "can then be used to adjust future AI recommendations." Taken literally — feeding each user's detailed history into generation — this conflicts with ADR 0003, where generation is cached by a coarse key that excludes per-user specifics: every history is unique, so the cache would never hit. Recommendations are therefore adjusted through three mechanisms, only one of which uses AI.

**1. Deterministic in-Program Progression (no AI).** A cached Program's recommended load is a *starting* number. As the user logs Sets, a progression rule adjusts the recommended load for upcoming Prescriptions of that Exercise (e.g. all reps hit at low perceived effort → increase load; missed reps → hold or reduce). This is the primary "adjusts over time" mechanism, costs no AI, and mutates only the user's own copy — the cached artifact is untouched.

**2. Folding progress into the coarse Profile.** Logged progress updates the Fitness Profile snapshot — chiefly the **Fitness Level**. Because the cache key reads the coarsened Profile, a user who has progressed simply starts hitting the cache at the appropriate level for their *next* Program. History thus influences future generations indirectly, through the coarse key, and caching keeps working.

**3. Detailed history-aware AI generation is deferred past v1.** Passing raw logs into the model for bespoke generation is exactly what breaks caching and inflates cost. Mechanisms 1 and 2 deliver "adjusts over time" without it.

**Fitness Level is a 1–10 score held per training type.** A user can be Level 8 at strength and Level 2 at yoga. The cache key uses the level for the type being generated, so per-type levels *sharpen* the key (yoga plans keyed by yoga level) rather than polluting it. The 10-point scale also makes mechanism 2 continuous — users advance one notch at a time instead of waiting for a rare beginner→intermediate jump.

## Consequences

- A 1–10 per-type level fragments the cache ~3× more on the level dimension than a 3-bucket scale. Accepted: the level key stays small and discrete, and finer personalization plus smoother progression are judged worth the lower hit rate.

## Considered Options

- **History-aware AI generation in v1** — rejected: bypasses the cache and inflates cost; deferred instead.
- **Single overall Fitness Level** — rejected: mislabels cross-disciplinary users and pollutes the cache key (a strength-Level-8 user would be served Level-8 yoga plans).
