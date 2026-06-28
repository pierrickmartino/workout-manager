# 0002 — Shared Exercise catalog with name-based dedup and provenance

Exercises live in **one global catalog shared across all users**. When the AI invents a movement that is not already present, it is stored and enriched once — for everyone — rather than per user. Exercise Prescriptions inside Sessions reference these catalog entries; the catalog Exercise is the reusable definition, the Prescription is its use in one Session.

Identity is by **normalized name** (lowercase/trim/canonicalize): same normalized string means same Exercise. This is deterministic and adds **no AI call per catalog write**, deliberately favoring the cost goal (§6 of the idea doc) over perfect deduplication. The accepted consequence is that near-synonyms ("Bulgarian Split Squat" vs "Rear-Foot-Elevated Split Squat") may enter as separate Exercises in v1. This is tolerated on purpose: progress tracking degrades gracefully into two histories rather than risking a wrong merge, and duplicates can be reconciled later by a curation/merge pass or embedding-based dedup without redesign.

Every Exercise carries a **Provenance** flag (`ai_generated` vs `curated`) so unvalidated AI content is auditable and can be reviewed — important given the domain's caution around injury, rehabilitation, and postpartum cases.

## Considered Options

- **Semantic/AI dedup at write time** — rejected for v1: adds an AI call per novel exercise, directly fighting the §6 cost goal.
- **Curated canonical taxonomy up front** — rejected for v1: too much upfront authoring; the provenance flag lets us grow toward this incrementally.
