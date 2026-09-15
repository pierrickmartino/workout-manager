# polish.pen review — decisions & backlog

Companion to [`polish-ui-ux-review.md`](./polish-ui-ux-review.md). That file is an outside
UI/UX review conducted from **screenshots only**, without the project's domain context. This
file is the disposition of it: what we decided, what the review got right, what it got wrong
about our domain, what turned out to be already fixed, and the prioritized work that remains.

Produced by a `/grill-with-docs` session (grilling + domain-modeling). The domain glossary
([`CONTEXT.md`](../../CONTEXT.md)) and ADRs won every conflict; the review was mined for the real
usability problem under each conflict.

## Posture (how to read the review)

- The review is **advisory**. On any conflict with an enforced term, ADR, or the
  `terminology_guard`, the domain wins — but the finding is not dismissed: it names a real
  confusion we solve *within* the domain.
- The review's screenshots **predate the current build**. Several headline data-integrity
  findings are already fixed in code. **Standing rule: verify every data-integrity finding
  against the current build before treating it as a bug.**

## Already resolved — do not re-implement (verify only)

| Review finding | Current build | Evidence |
| --- | --- | --- |
| §07 / UX-01 · Volume axis non-monotonic (P1) | Y anchored `[0,'auto']`, monotonic `tickCount` | `apps/web/components/pulse/volume-chart.tsx:49-58` |
| §01 · "week strip = tiny dots"; `1/32` vs `0/32` conflated | Dots retired; named-stops route with `WEEK n/total`, `position` and `completedCount` kept separate | `apps/web/lib/home-view.ts:56-81` |
| §01 · "XP has two unexplained totals" | `OperatorLevel` curve + shared `LevelBadge` render total-XP + within-level | `apps/web/lib/home-view.ts:162-190`, `components/pulse/level-badge.tsx` |
| §08 · "`111 kg` doesn't identify the metric" | Record rows render "142 kg est. 1RM" / "bodyweight × N" via the shared record-row | `apps/web/lib/home-view.ts:200-228`, `lib/strength-analytics-view.ts` |

## Decision ledger

### Framing
- **Deliverable:** decisions (CONTEXT/ADR) + this backlog. No code this session.
- **Scope:** all 12 screens walked.

### Cross-cutting conventions
| # | Decision |
| --- | --- |
| Q4 | **Vocabulary.** Domain terms *are* the UI terms (Protocol / Session / Logged Session). The defect is leaked synonyms ("training", "workout") and flat hierarchy — purge and structure, never rename. Captured in `CONTEXT.md` intro. |
| Q5 | **One record-row.** A single shared `record-row` view-model in `apps/web/lib/`, consumed by My Sessions, Analytics, and Strength: name-first (full width), result via the typed `Load`/`Quantity` formatters, date/comparison trailing. |
| Q6 | **Action hierarchy.** Primary action (Start / Save / Edit) at the **top** of every task page; sticky-bottom only as a per-screen, tested enhancement (bottom nav + software keyboard make it conditional). |
| Q7 | **Chart honesty.** Every chart states unit + aggregation + window; zero baseline for magnitude bars, line/dot with an explicit range for focused strength. |
| Q8 | **Load placeholder is kind-aware** (no "60 kg" hint on a push-up). A push-up arriving as `absolute` Load is an **upstream generation** finding, not a builder default. |

### Per-screen decisions
| # | Screen | Decision |
| --- | --- | --- |
| Q9 | 02 | **Creation IA.** Noun + clarifier: "Generate a Protocol · multiple weeks", "Generate a Session · one workout", "Build a Session · by hand", "Log a past workout". Returning users see Current Protocol / Recent Sessions before the create block. |
| Q10 | 04 | **Non-absolute Load at log time.** Show the prescribed target (`% 1RM` / "Moderate") **and** a resolved "≈ N kg (est.)" *only* when an Estimated 1RM exists — never implying a known working weight. User still logs the actual absolute Load. |
| Q11+Q14 | 06, 11 | **Equipment vocabulary.** New curated-closed **Equipment** term + alias map, applied as a **read-time projection** with an honest **Unmapped/Other** bucket. Drives the catalog facet and the profile multi-select. → **ADR-0077**, new `CONTEXT.md` term. |
| Q12 | 09 | **Profile weight vs reading.** On a new weight reading, **offer** to update profile weight — never auto-sync (auto-sync would silently mutate a generation input from a history entry). Store canonical kg per reading. |
| Q13 | 11 | **Fitness Level.** Keep the self-rated **seed** (confirmed self-seeded, `ProfileForm.tsx:111`); replace bare 1–10 inputs with anchored labels / experience categories that map to the stored 1–10 per training type. |

### Backlog decisions (stated during grilling, no veto)
- **§04 Superset** → render as **one round-rest group** (members numbered as a round); kills the "Superset A/B + lone Round rest" confusion. *Dictated by the Superset definition.*
- **§08 Muscle balance** → one **distinct hue per Muscle Group** + a numeric breakdown; never hue-alone. *The Muscle Atlas already requires distinct hues — verify the palette in `lib/chart-theme.ts` / `components/analytics/`.*
- **§08 Strength length** → add an **exercise selector / compact summary** so the latest result is visible without scrolling 6 charts + 20 rows.
- **§03 "Trained 1×"** → phrase as performances logged (e.g. "1 session logged"), **not** "Completed once": **Logged Count** includes Incomplete performances, so "completed" would be wrong.
- **§03 "By Pierrick"** → suppress the **Author** line in My Sessions (personal library); keep it on Redeemed / Shared Sessions.
- **§03 same-name Sessions** → already differentiated by the **Workout Signature** (distinct sigils) + Logged Count + last-performed; surface those, and the existing rename path (Session Name). No new mechanism.
- **§06 "NEW" badge** → define as **never-performed-by-this-user**, not new-to-catalog (Catalog Completeness is not user-facing).
- **§07 Muscle coverage** → "No mapped shoulder sets" wording + disclose the Unclassified share. *The Unclassified honesty rule.*
- **§10 Settings grouping** → **Appearance** (Mode) vs **Workout preferences** (Weight Unit, Keep Screen Awake). *Matches the Interface Preference taxonomy.*
- **§11 Constraint copy** → frame around **Sensitive Constraint** (safety) vs **Preference / Limitation**, and how each steers generation.
- **§12 Admin** → skin "Published/Active" states the **global, next-visit** scope with an explicit apply; catalog-health bar becomes a **labeled readiness breakdown** (Stub / Listable / Enriched) with a legend; add running / failed / retry states for backfill.

## Prioritized implementation backlog

Priorities: **P1** mislead or obstruct a core task · **P2** material usability · **P3** polish.
Every item is domain-aligned; none renames a term.

### P1 — correctness & containment (verify against build first)
1. **Mobile containment** (§05 builder, §09 metric history; UX-02). Reproduce overflow at 320 / 375 / 390 / 430 CSS px and 200% zoom; make fields stack and let nested flex/grid children shrink. *Verify still present before fixing.*
2. **Builder Load placeholder** (Q8, §05). Kind-aware placeholder in `PrescriptionFieldStack.tsx:332-339` (blank / "added kg" for Bodyweight, "60 kg" only for Absolute).
3. **Push-up prescribed as absolute kg** (Q8, §05). File as a **generation-parse** finding — the AI should prescribe the correct `Load` kind; not a builder default.

### P2 — clarity & IA
4. **Creation IA** (Q9, §02) — noun + clarifier; returning-user precedence.
5. **One record-row view-model** (Q5, §03/§07/§08) — new `apps/web/lib/record-row.ts` (+ `*.test.ts`); migrate the three surfaces onto it.
6. **Top-of-page primary action** (Q6, §04/§05/§10) — Start / Save / Edit above the fold.
7. **Chart unit + aggregation + window labels** (Q7, §07/§08).
8. **Superset one-group render** (§04) and **non-absolute Load resolution** (Q10, §04).
9. **Equipment vocabulary** (Q11/Q14, ADR-0077) — `app.domain.equipment.classify_equipment` + alias map; catalog facet + profile multi-select.
10. **Metric history** (§09) — offer profile-weight update (Q12); store a unit per reading; consistent localized dates.
11. **Fitness Level anchors** (Q13, §11).
12. **Strength analytics** (§08) — exercise selector; distinct Muscle-Group hues + numeric breakdown.
13. **Catalog filters** (§06) — collapse secondary filters behind a labeled count; active-filter chips + reset; preserve filter state on return.
14. **Settings grouping** (§10); **admin** skin scope + catalog-health legend + backfill states (§12).

### P3 — polish
15. "Trained 1×" wording (§03); suppress Author in My Sessions (§03); "NEW" semantics (§06); short muscle summary in catalog rows vs full anatomy in detail (§06); consistent date display (§09).

### Coverage checklist (missing states — the review's journeys table)
Treat as an **app-state coverage checklist**, not board work: for generate / perform / build / browse /
track / settings / admin, ensure pending, empty, success, error/retry, and unsaved-edit states exist and
recover input. Validate keyboard/focus, 44×44 touch targets, and Contrast Floor at device size in both
Modes (the domain already enforces the Contrast Floor as an invariant — ADR-0070).

## Deferred: terminology-guard entry (Q4)

A guard entry for leaked UI synonyms is **specified here, not yet committed**. The guard's
`test_current_tree_has_no_terminology_violations` requires a clean tree, so the entry must land
**with** the copy audit that removes the offending strings — committing the pattern first would fail
CI, and fixing the copy is implementation work (deferred this session). It must also stay conservative:
`terminology_guard.py:79-81` deliberately excludes common words ("workout", "training") because they
collide with legitimate usage ("Training Type", "Workout Signature", prose).

**Ready-to-apply, once the synonym audit enumerates the exact offending UI strings:** register
`BannedTerm`s that match only the **quoted display-label** forms of a concept synonym (the pattern the
existing `"Amount"` entry uses — `re.compile(r"[\"']…[\"']")`), e.g. a UI label string of
"Completed workout" / "Completed session" for a Logged Session, or a bare "training" used as a create
label for a Session/Protocol. Never a bare-word regex. Guidance string points at this file and
`CONTEXT.md` (Q4).

## Artifacts produced this session
- `CONTEXT.md` — new **Equipment** term; intro note that glossary terms are the user-facing labels.
- `docs/adr/0077-equipment-is-a-curated-read-time-vocabulary.md`.
- This decisions & backlog document.
