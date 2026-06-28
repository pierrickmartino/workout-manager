# Workout Manager

AI-assisted application for creating, following, and tracking fitness workouts.
See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary and [`docs/adr`](./docs/adr)
for architectural decisions.

## Walking skeleton (Slice 1)

The thinnest end-to-end path is in place:

- **web** (`apps/web`) — Next.js App Router PWA. A user signs in with **Clerk**;
  the session lives in a secure HTTP-only cookie (no tokens in `localStorage`).
- **api** (`apps/api`) — FastAPI. Verifies the Clerk JWT via **JWKS**, then
  get-or-creates a minimal **Fitness Profile** (keyed by Clerk user id, with a
  single `display_name` field) through a repository interface, returning a
  consistent response envelope.
- **db** — PostgreSQL; the `profile` table is created by an Alembic migration.
- **redis** — present for the generation cache / RQ job queue used by later slices.

The dashboard is a server component: it gets the Clerk token server-side and
calls `GET /api/profile`, so the JWT is verified API-side and the profile
round-trips through Postgres before rendering.

## Setup (human-in-the-loop)

1. Create a Clerk application at <https://dashboard.clerk.com>.
2. Copy `.env.example` to `.env` and fill in:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`
   - `CLERK_ISSUER` (the `iss` of your Clerk session tokens) and
     `CLERK_JWKS_URL` (`{issuer}/.well-known/jwks.json`)
3. Bring everything up:

   ```bash
   docker compose up --build
   ```

   - web → <http://localhost:3000>
   - api → <http://localhost:8000> (`/health`, `/api/profile`)

   The api container runs `alembic upgrade head` on start.

## Backend development

```bash
cd apps/api
uv venv && source .venv/bin/activate
uv pip install -e ".[dev]"
pytest --cov          # unit/integration tests with coverage
alembic upgrade head  # apply migrations (needs DATABASE_URL)
```

The test suite verifies JWKS JWT verification, the Profile repository (against
both an in-memory fake and the real SQLModel implementation on SQLite), the
response envelope, and the `GET /api/profile` endpoint end to end with injected
JWKS — all offline, no live Clerk or Postgres required.

## Frontend development

```bash
cd apps/web
npm install
cp .env.local.example .env.local   # fill in Clerk keys + API_URL
npm run dev
```
