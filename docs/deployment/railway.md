# Deploying to Railway

A concrete, service-by-service plan for running this app on
[Railway](https://railway.app) with **no VPS to own or patch**. It maps the five
services in [`docker-compose.yml`](../../docker-compose.yml) onto Railway
resources, and calls out the three things that actually break a first deploy:
the **Postgres driver scheme**, the **build-time Clerk key**, and **private vs.
public networking**.

> Scope: infrastructure only. This changes **no application code** — every
> service builds from the existing per-app `Dockerfile`s as-is.

## What you're deploying

| Compose service | Railway resource | Public? | Notes |
|---|---|---|---|
| `db` (postgres:16) | **Postgres** plugin (managed) | no | Managed, backed up; drop the bundled `db` service. |
| `redis` (redis:7) | **Redis** plugin (managed) | no | Backs both the generation cache and the RQ queue. |
| `api` (FastAPI) | **Service** from `apps/api` | **no** | Called only server-side by `web` — keep it private. |
| `worker` (RQ) | **Service** from `apps/api` | no | Same image/dir as `api`, different start command. |
| `web` (Next.js) | **Service** from `apps/web` | **yes** | The only service with a public domain. |

The `api` and `worker` are **two Railway services built from the same
directory** (`apps/api`) — same Docker image, different start command. Only `api`
runs migrations (see [Migration ordering](#migration-ordering)).

### Cost floor

The RQ `worker` must run 24/7, so it sets the price floor. Postgres, Redis, the
API, and the web front end can all idle cheaply, but the worker cannot scale to
zero. Budget the **~$5/mo Hobby plan** (includes $5 of usage); a low-traffic
deployment typically lands around **$5–15/mo**. Clerk (free tier) and your AI
provider (pay-per-use) bill separately.

---

## Prerequisites

- A Railway account with the **Hobby plan** and the GitHub repo connected.
- A Clerk application (production instance) — publishable key, secret key,
  issuer, and JWKS URL. See [`.env.example`](../../.env.example).
- An API key for your chosen `AI_PROVIDER` (default `anthropic`).

---

## Step 1 — Create the project and managed data stores

1. **New Project → Deploy from GitHub repo**, and pick this repository.
2. Add **Postgres**: *New → Database → Add PostgreSQL*.
3. Add **Redis**: *New → Database → Add Redis*.

Both come up on Railway's **private network**. Reference their connection values
from other services with `${{Postgres.*}}` / `${{Redis.*}}` variables (next
steps) — never paste raw credentials, and never give either a public domain.

Each Postgres plugin exposes `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`,
`PGDATABASE`, `RAILWAY_PRIVATE_DOMAIN`, and a ready-made `DATABASE_URL`
(internal) plus `DATABASE_PUBLIC_URL`. Redis exposes `REDIS_URL` (internal)
plus `REDIS_PUBLIC_URL`.

> ⚠️ **Use the exact variable names above.** `REDIS_URL` and `DATABASE_URL` are
> *already* the private/internal URLs on Railway — there is **no**
> `REDIS_PRIVATE_URL` or `DATABASE_PRIVATE_URL`. Referencing a non-existent
> variable resolves to an **empty string**, which crashes the `worker` at boot
> with `Redis URL must specify one of the following schemes` (see
> [troubleshooting](#if-somethings-wrong)). Prefer these internal variants so
> traffic stays off the metered public proxy.

---

## Step 2 — The `api` service

Create a service from the repo (it may have been auto-created in Step 1).

**Build**
- **Root Directory:** `apps/api`
- **Builder:** Dockerfile (auto-detected — `apps/api/Dockerfile`). The Dockerfile's
  `CMD ["./docker-entrypoint.sh"]` runs `alembic upgrade head` and then
  `uvicorn app.main:app --host 0.0.0.0 --port 8000`. Leave the start command
  **empty** so this entrypoint runs.

**Networking**
- **Do not** generate a public domain. `apps/web/lib/api.ts` is `server-only`,
  so only the `web` service ever calls the API, over the private network. Keeping
  `api` private removes an attack surface and avoids exposing it to the internet.
- The service listens on `8000`; other services reach it at
  `api.railway.internal:8000` (see [Step 5](#step-5-networking-recap)).

**Health check**
- **Health Check Path:** `/health` (defined in `apps/api/app/main.py`). This
  gates rolling deploys so a new instance only takes traffic once it's live.

**Variables** — the critical one is `DATABASE_URL`. Railway's Postgres gives a
`postgresql://…` URL, but `app/config.py` requires the **`postgresql+psycopg://`**
driver scheme. Reconstruct it from the Postgres parts instead of referencing the
plugin's URL verbatim:

```
DATABASE_URL=postgresql+psycopg://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{Postgres.PGDATABASE}}

REDIS_URL=${{Redis.REDIS_URL}}

CLERK_ISSUER=https://<your-app>.clerk.accounts.dev
CLERK_JWKS_URL=https://<your-app>.clerk.accounts.dev/.well-known/jwks.json

AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
# AI_MODEL=            # optional; blank uses the provider default
```

> ⚠️ **The `+psycopg` scheme is mandatory.** A plain `postgresql://` URL makes
> SQLAlchemy pick the wrong (or a missing) driver and the API fails at startup
> or on the first query. This is the #1 first-deploy failure here.

Only the selected provider's key is required; leave the others unset.

---

## Step 3 — The `worker` service

Add a **second service from the same repo**, pointed at the **same directory** as
`api`. It reuses the API image and only overrides how it starts.

**Build**
- **Root Directory:** `apps/api` (identical to `api`).
- **Builder:** Dockerfile.

**Start command (override)** — bypass the migrating entrypoint and run the RQ
worker on the `generation` queue (matches `docker-compose.yml`):

```
rq worker --url "$REDIS_URL" generation
```

> ⚠️ This command passes `--url "$REDIS_URL"` verbatim, so the worker crashes at
> boot if `REDIS_URL` is empty or malformed — Railway runs the start command in a
> shell, and an unset/empty variable expands to `""`, which the redis client
> rejects with `Redis URL must specify one of the following schemes`. Make sure
> `REDIS_URL=${{Redis.REDIS_URL}}` below resolves to a real `redis://…` value on
> this service's **Variables** tab before deploying.

**Networking**
- No public domain, no health check path (it's not an HTTP service).

**Variables** — the worker builds its own LLM client, so it needs the **same DB,
Redis, and AI variables** as `api` (it does **not** need the Clerk web keys):

```
DATABASE_URL=postgresql+psycopg://${{Postgres.PGUSER}}:${{Postgres.PGPASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{Postgres.PGDATABASE}}
REDIS_URL=${{Redis.REDIS_URL}}
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
# AI_MODEL=
```

Point it at the **same Redis** as `api` — the queue the API enqueues onto and the
queue the worker drains must be the same instance.

---

## Step 4 — The `web` service

Create a service from the repo for the front end.

**Build**
- **Root Directory:** `apps/web`
- **Builder:** Dockerfile (`apps/web/Dockerfile`). Multi-stage; `CMD ["npm", "run", "start"]` serves on `3000`.

**Networking**
- **Generate a public domain** (Railway subdomain, or attach your own). This is
  the only publicly reachable service.

**Variables**

```
# Baked into the client bundle at BUILD time (see the build-arg note below).
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...

# Runtime-only secret — never in the client bundle.
CLERK_SECRET_KEY=sk_live_...

# Private URL of the api service — server-side calls only.
API_URL=http://api.railway.internal:8000
```

> ⚠️ **`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is build-time.** `apps/web/Dockerfile`
> declares `ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `npm run build` inlines it
> into the client bundle while prerendering `ClerkProvider`. Railway exposes
> service variables to the Docker build as build args automatically, so **just
> setting it as a variable is enough** — but it must exist **before** the build,
> and a value change requires a **rebuild** (a redeploy), not just a restart, to
> take effect. `CLERK_SECRET_KEY` stays runtime-only and must **not** be baked in.

---

## Step 5 — Networking recap

- Railway private networking gives every service a `*.railway.internal` DNS name.
  `web` → `api` is `http://api.railway.internal:8000`. If you renamed the API
  service, use `http://<service-name>.railway.internal:8000`.
- `api` binds `0.0.0.0:8000` (from the entrypoint), so it's reachable on the
  private network without a public domain.
- Public surface = **`web` only**. `api`, `worker`, `db`, `redis` stay private.

---

## Migration ordering

`alembic upgrade head` must run **exactly once per deploy**, before the API
serves traffic, and must **not** race between `api` and `worker`:

- **`api`** runs migrations because it uses the Dockerfile's default entrypoint
  (`docker-entrypoint.sh` → `alembic upgrade head` → uvicorn). Its `/health`
  check keeps the old instance serving until migrations finish and the new one
  is up.
- **`worker`** overrides the start command (Step 3), so it **skips** the
  entrypoint and never migrates — no double-run, no race.

If you later split migrations into a dedicated one-shot release step, run it
before both `api` and `worker` start and strip the `alembic upgrade head` line
from the API's runtime path. For now, the single-runner-via-`api` model is
correct and needs no code change.

---

## Step 6 — First deploy & verification

1. Trigger a deploy (push to the connected branch, or *Deploy* in the dashboard).
2. Watch the **`api`** logs for `Running database migrations…` → `Starting API
   server…`, then a healthy `/health`.
3. Confirm **`worker`** logs show RQ listening on the `generation` queue.
4. Open the **`web`** public URL, sign in via Clerk, and load the dashboard — a
   server component that calls `GET /api/profile` over the private network, so a
   successful profile render proves the whole `web → api → db` path end to end.
5. Exercise an AI generation flow and confirm the **`worker`** picks the job off
   the queue (proves `api → redis → worker → AI provider`).

### If something's wrong

| Symptom | Likely cause |
|---|---|
| API crashes on boot / DB errors | `DATABASE_URL` missing the `+psycopg` scheme (Step 2). |
| Clerk fails only in the browser | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` unset at build, or changed without a rebuild (Step 4). |
| `web` can't reach `api` | Wrong `API_URL` internal host, or a public domain accidentally added to `api`. |
| `worker` crashes at boot: `Redis URL must specify one of the following schemes` | `REDIS_URL` empty/unresolved — reference `${{Redis.REDIS_URL}}`, not `REDIS_PRIVATE_URL` (which doesn't exist). Check the resolved value on the Variables tab. |
| Jobs enqueue but never run | `api` and `worker` pointed at different Redis instances (Step 3). |
| JWT verification fails | `CLERK_ISSUER` / `CLERK_JWKS_URL` mismatch with the Clerk instance. |

---

## What to set once you're live

- **Auto-deploy:** connect the service(s) to your production branch so pushes
  redeploy. Remember `web` needs a **rebuild** to pick up a changed
  `NEXT_PUBLIC_*` value.
- **Backups:** enable scheduled backups on the Postgres plugin.
- **Scaling:** the `worker` scales by replica count; bump it if the generation
  queue backs up. `api` scales horizontally behind the health check.
- **Secrets hygiene:** keep the default compose credentials (`postgres/postgres`)
  out of production — the managed Postgres generates its own. Never deploy the
  bundled `db` / `redis` compose services alongside the managed plugins.
