# CLAUDE.md

Operational map for working in this repo productively with no additional context.
Read this first, then [`GLOSSARY.md`](./GLOSSARY.md) for the domain **language** and
[`docs/adr/`](./docs/adr) for the **why** behind every invariant. When you change
behaviour, [`REVIEW.md`](./REVIEW.md) is the checklist your change must survive.

> **Keeping this file small.** It loads into every session. A new rule gets **one line**
> here or in a path-scoped file under `.claude/rules/`: trigger → rule (guard · ADR). The
> reasoning and the incident that motivated it go in the ADR, never here.

## What this is

An AI-assisted app for creating, following, and tracking fitness workouts. The
domain's cardinal rule: a **plan** (what the AI prescribes) and a **record** (what
the user actually did) are never the same thing. Most of the design falls out of
keeping those two separate. See `GLOSSARY.md`.

## Layout

Monorepo with two deployables under `apps/`:

- **`apps/api`** — FastAPI backend (Python 3.14, SQLModel/Postgres, Alembic,
  Redis/RQ for async generation). Domain-driven layout:
  - `app/domain/` — pure domain logic (no I/O): one-rep-max, progression,
    readiness, streak, achievements, volume, load, completion… Unit-test heaven.
  - `app/repositories/` — the **Repository pattern** seam; all DB access goes
    through these. Business logic depends on the interface, not SQLModel.
  - `app/routes/` — HTTP endpoints (thin; delegate to domain/services).
  - `app/generation/` — AI generation: the LLM **port/factory** (see Seams),
    caching, RQ worker/job queue, protocol/session/substitute generators.
  - `app/logbook/`, `app/protocols/`, `app/live/`, `app/adoption/`,
    `app/substitution/` — feature services.
  - `app/quality/terminology_guard.py` — executable terminology tripwire (below).
- **`apps/web`** — Next.js App Router PWA (React 19, Clerk auth, Tailwind).
  - `app/` — routes/pages (server components fetch server-side; JWT never
    reaches the browser). `components/` — UI, incl. the `pulse/` design system.
  - `lib/` — view-model mappers with co-located `*.test.ts` (the frontend's
    logic lives here, deliberately, so it's unit-testable without a browser),
    and the `*-policy.ts` guards that sweep components for the frontend rules.
  - `audit/` — browser journeys (`reflow.mjs` at 320px and 200% text, `wide.mjs`
    at 1440px, `charts.mjs`) that verify what the static guards can only declare.

## Run & test

Everything in the test suites is **offline** — SQLite, injected JWKS, a fake LLM.
No live Postgres/Redis/Clerk needed to run tests.

```bash
# Backend
cd apps/api
pip install -e ".[dev]"           # or: uv venv && uv pip install -e ".[dev]"
pytest --cov --cov-report=term-missing
ruff check --fix .                # lint: unused names, import order (CI blocks on it)

# Frontend
cd apps/web
npm ci
npm test                          # node --test over lib/*.test.ts (incl. the policy guards)

# Full stack (needs Clerk keys in .env — see README.md)
docker compose up --build         # api runs `alembic upgrade head` on start
```

CI (`.github/workflows/ci.yml`) runs both suites on every push/PR.

## Architectural seams — route through these, don't bypass them

- **Response envelope** (`app/envelope.py`): every endpoint returns
  `{success, data, error}` (+ `meta` when paginated). Use `success_envelope` /
  `error_envelope`; never hand-roll a response shape.
- **Repository pattern** (`app/repositories/`): all persistence goes through a
  repository. Don't reach into SQLModel sessions from routes/domain.
- **LLM port + factory** (`app/generation/llm/port.py`, `factory.py`, ADR-0006):
  *every* AI call goes through the one `StructuredLLM.complete` seam, which
  returns raw JSON **text** — each generator does its own `parse_*` validation.
  Construct providers only via `build_llm_client`. Tests inject a fake LLM.
- **Two-layer generation cache** (ADR-0003): immutable Generated content keyed by
  a **coarse** normalized tuple; users **adopt-by-copy** and mutate only their
  own copy.

## Load-bearing invariants (violating these is a bug, not a style nit)

These are enforced by review (`REVIEW.md`) and, where mechanizable, by tests.

- **Read-time projections, never stored ledgers**: XP, Operator Level, Streak,
  Achievements, and Personal Records are computed from Logged Sessions/Sets at
  read time. No `xp` column, no unlock table, no write hooks (ADR-0018/0019).
- **Safety cache bypass**: a user with any **Sensitive Constraint** (injury,
  rehab, postpartum, medical) is *never* served cached/shared generation — always
  a fresh generation (ADR-0003). This is a safety rule, not an optimization.
- **Edits touch only the un-performed tail**: a performed Session is settled
  record and is never rewritten or reordered (ADR-0020).
- **Self-paced, calendar-free**: there is no "today". No dated schedules, no
  recovery %, no daily streak (ADR-0001). Readiness is a 3-state signal, not a
  score.
- **`Load` is a typed value** (absolute / bodyweight / %1RM / qualitative /
  range), never a bare kg number (GLOSSARY 'Load').
- **Completion Outcome gates advancement**: only a *Completed* Logged Session
  advances a Protocol to its Next Session (ADR-0013).
- **Live Session is ephemeral / client-side** until finished (ADR-0012).
- **Estimated 1RM / PR** only from absolute-Load sets in a trustworthy rep range.

## Terminology discipline

`GLOSSARY.md` is the law for naming; each term lists the words to **_Avoid_**. A
subset of hard regressions is enforced by `app/quality/terminology_guard.py`
(runs as a pytest test). When you retire or rename a **domain** term, add it to
the guard's `BANNED_TERMS` registry (one line). Renaming a private identifier, or
splitting a term into qualified readings while the umbrella survives (ADR-0112),
earns no entry — padding the registry dulls the signal it protects.

## Conventions

Full rules in [`.claude/rules/`](./.claude/rules). The load-bearing ones:

- **Immutability** — return new objects; never mutate in place.
- **Small, cohesive files** (200–400 lines typical, 800 max) organized by
  feature/domain, not by type.
- **Tests-first**, 80% coverage bar; AAA structure with behavior-describing
  names. Domain logic belongs in `app/domain/` (pure) so it's trivially testable.
- **Conventional commits** (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`,
  `chore:`).
- **Exact dependency versions in `apps/web/package.json`** (no `^`); upgrade with
  `npm install <pkg>@<version>`. `apps/api/pyproject.toml` deliberately keeps `>=`
  floors: it has no lockfile, and several floors are documented security minimums.
- Explicit error handling; validate at system boundaries; no hardcoded secrets
  (env vars only).

## Where to make a change

- New/changed domain rule → `app/domain/` (+ unit test) → surface via a
  service/route → update `GLOSSARY.md` if it introduces or shifts a term → write
  an ADR if it's an architectural decision.
- New endpoint → `app/routes/`, return via the envelope, back it with a
  repository, add an endpoint test.
- New AI generation → go through the LLM port; add a `parse_*` boundary; test
  with the fake LLM.
- New Exercise Prescription field → add it to the spine in
  `app/repositories/prescription_mapping.py` (`PrescriptionDraft` + its ORM
  column) and classify it in the authorship partition;
  `tests/test_prescription_spine.py` fails if a projection forgets it (ADR-0069).
- Frontend logic → put it in `apps/web/lib/` as a view-model with a `*.test.ts`,
  keep components thin.
- Anything in `apps/web` → the frontend rules in
  [`.claude/rules/web/frontend.md`](./.claude/rules/web/frontend.md) load
  automatically when you touch those files. The `lib/*-policy.ts` guards fail
  closed, so a broken rule shows up in `npm test`.
- A bundle-size claim → measure it:
  `.next/server/app/<route>/page_client-reference-manifest.js` lists a route's
  client chunks. A green guard is not a measurement.
