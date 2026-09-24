# Workout Manager

Workout Manager is a mobile-friendly, AI-assisted training app for planning sessions, recording what you actually did, and following your progress. You can generate a multi-week **Protocol** or a standalone **Session**, build a reusable Session by hand, or log training without a plan.

A Protocol and a Session describe what you intend to do. A **Logged Session** records what you performed. Keeping plans and records separate lets you reuse a Session and compare performances over time. See [CONTEXT.md](./CONTEXT.md) for the full domain glossary.

## What the app does

- **Plan training:** generate a self-paced, multi-week Protocol with progression, generate one standalone Session, or build and edit a Session yourself. Completed Protocol Sessions are preserved while the remaining plan can be edited.
- **Train and log:** run a Live Session with set tracking, prior-performance context and rest timers; log a past workout without a plan; review and correct your history.
- **Explore and reuse:** browse the shared Exercise Catalog, save standalone Sessions, duplicate them, and share a Session through a revocable link that gives the recipient an independent copy.
- **Review progress:** see training history, volume, distance, muscle coverage, strength trends, personal records, streaks and achievements. Figures are derived from logged work.
- **Use it on mobile:** the Next.js app is installable as a PWA and shows an offline fallback. Authenticated pages and training records require a connection; they are not cached for offline viewing.

Training types currently include strength, cardio, HIIT, yoga and mobility. The Fitness Profile captures the information used to tailor generation. AI generation supports Anthropic, OpenAI, Google and OpenRouter; only the selected provider needs an API key.

## Stack

| Part | Implementation |
| --- | --- |
| Web | Next.js App Router, React, TypeScript, Tailwind CSS, Clerk |
| API | FastAPI, Python, SQLModel, Alembic |
| Data | PostgreSQL; Redis for generation cache and RQ jobs |
| Background jobs | RQ worker for asynchronous generation |
| Optional monitoring | Self-hosted Langfuse for AI usage |

The web app calls the API from the Next.js server with a Clerk session token. The API verifies the token against Clerk's JWKS. Database changes are applied with Alembic when the API container starts.

## Run locally with Docker

You need Docker with Compose, a [Clerk application](https://dashboard.clerk.com), and an API key for one supported AI provider.

1. Copy the root environment template:

   ```bash
   cp .env.example .env
   ```

2. In `.env`, set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Set `CLERK_ISSUER` to the `iss` value of your Clerk session token and `CLERK_JWKS_URL` to that issuer's `/.well-known/jwks.json` URL.
3. Select `AI_PROVIDER` (`anthropic`, `openai`, `google` or `openrouter`) and set its corresponding API key. `AI_MODEL` is optional.
4. For the core stack, set `LANGFUSE_HOST=` in `.env` to disable monitoring. Leave the nonempty Langfuse bootstrap placeholders from the template in place for Compose variable validation, even though the Langfuse services will not start.
5. Start the five app services from the repository root:

   ```bash
   docker compose up --build db redis api worker web
   ```

Open the app at <http://localhost:3000>. The API health endpoint is <http://localhost:8000/health> and interactive API docs are at <http://localhost:8000/docs>. New users complete onboarding after signing in. The default host ports are 3000 (web), 8000 (API), 5432 (Postgres) and 6379 (Redis); override them with `WEB_PORT`, `API_PORT`, `DB_PORT` and `REDIS_PORT` in `.env` if needed.

> The selected AI provider key is needed for generation. The app also has a full optional Langfuse stack in `docker-compose.yml`. To run monitoring, replace all Langfuse placeholder credentials with generated secrets, restore `LANGFUSE_HOST=http://langfuse-web:3000`, and follow [the Langfuse setup guide](./docs/deployment/langfuse.md). A bare `docker compose up --build` starts that monitoring stack as well.

## Develop and test

The test suites use local fakes and SQLite; they do not require live Clerk, Postgres, Redis or an AI provider.

```bash
# API
cd apps/api
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pytest --cov --cov-report=term-missing
```

```bash
# Web (from the repository root)
cd apps/web
npm ci
npm test
```

For a separate web development server, copy `apps/web/.env.local.example` to `apps/web/.env.local`, fill in Clerk's keys, and set `API_URL` to the running API (usually `http://localhost:8000`). Then run `npm run dev`. To verify a production build, run `npm run build` with the Clerk environment variables configured. The web build uses Node.js 22 in Docker and CI. The API uses Python 3.11 in Docker.

## Repository map

- `apps/web/`: pages, UI components, PWA assets and frontend view models.
- `apps/api/app/routes/`: HTTP endpoints; `domain/`: training rules and calculations; `repositories/`: persistence; `generation/`: AI providers, cache and jobs.
- `apps/api/app/alembic/`: database migrations.
- `docs/adr/`: architectural decisions; [CONTEXT.md](./CONTEXT.md): product terminology; [CLAUDE.md](./CLAUDE.md): developer map.
- `docs/deployment/`: [Railway](./docs/deployment/railway.md), [Hostinger VPS](./docs/deployment/hostinger-vps.md) and [Langfuse](./docs/deployment/langfuse.md) guides.

The project is licensed under [MIT](./LICENSE).
