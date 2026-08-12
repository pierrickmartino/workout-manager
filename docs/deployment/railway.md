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

> **Optional: AI-usage monitoring.** Self-hosted Langfuse (ADR-0039) is not
> required to run the app — leave its variables unset and the app records
> nothing (no-op recorder). To deploy it on Railway too, see
> [Step 7](#step-7--optional-self-hosted-langfuse-monitoring); the project-side
> configuration (90-day retention, per-model prices) is the same everywhere and
> lives in [`langfuse.md`](./langfuse.md).

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
  `uvicorn app.main:app --host :: --port 8000`. Leave the start command
  **empty** so this entrypoint runs.

**Networking**
- **Do not** generate a public domain. `apps/web/lib/api.ts` is `server-only`,
  so only the `web` service ever calls the API, over the private network. Keeping
  `api` private removes an attack surface and avoids exposing it to the internet.
- The service listens on `8000`; other services reach it at
  `<api-service-name>.railway.internal:8000` (see [Step 5](#step-5-networking-recap)).

> ⚠️ **Railway's private network is IPv6-only.** The entrypoint binds `::`
> (the IPv6 wildcard) precisely so the API is reachable privately — binding
> `0.0.0.0` (IPv4 only) makes it **unreachable** over the private network, and
> the `web` service's fetch fails. On Linux the `::` socket also accepts IPv4
> (v4-mapped), so Docker Compose service-to-service still works. Do not change
> this back to `0.0.0.0`.

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
worker on the `generation` queue. Use the **exact** `sh -c` form from
`docker-compose.yml` (line 74):

```
sh -c 'rq worker --url "$REDIS_URL" generation'
```

> ⚠️ **The `sh -c '…'` wrapper is mandatory — do not drop it.** Railway does
> **not** run a custom start command through a shell; it tokenizes and execs it
> directly. Without the wrapper, `$REDIS_URL` is passed to the redis client as the
> **literal string `$REDIS_URL`** (never expanded), which has no `redis://` scheme
> and crashes the worker at boot with `Redis URL must specify one of the following
> schemes` — the same error you'd get from an empty value. Wrapping in `sh -c`
> forces a real shell to expand the variable at runtime, exactly as Compose does.
>
> Two independent things must both be true: `REDIS_URL` must be **set**
> (`${{Redis.REDIS_URL}}`, next section — verify it shows a real `redis://…` value
> on the **Variables** tab) **and** **expanded** (this `sh -c` wrapper). Fixing one
> without the other still crashes.

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

# Private URL of the api service — server-side calls only. Reference the api
# service's own private domain so the hostname is always correct regardless of
# what you named the service (a hardcoded `api.railway.internal` fails with
# `ENOTFOUND` if the service isn't literally named `api`).
API_URL=http://${{<api-service-name>.RAILWAY_PRIVATE_DOMAIN}}:8000
```

> ⚠️ **`ENOTFOUND ...railway.internal` = wrong hostname.** Use the
> `${{<api-service-name>.RAILWAY_PRIVATE_DOMAIN}}` reference (substitute the api
> service's actual Railway name) rather than a hardcoded string — Railway resolves
> it to the real private domain. This must be paired with the API binding `::`
> (Step 2): the reference fixes *name resolution*, the IPv6 bind fixes
> *reachability*. Both are required.

> ⚠️ **`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is build-time.** `apps/web/Dockerfile`
> declares `ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `npm run build` inlines it
> into the client bundle while prerendering `ClerkProvider`. Railway exposes
> service variables to the Docker build as build args automatically, so **just
> setting it as a variable is enough** — but it must exist **before** the build,
> and a value change requires a **rebuild** (a redeploy), not just a restart, to
> take effect. `CLERK_SECRET_KEY` stays runtime-only and must **not** be baked in.

---

## Step 5 — Networking recap

- Railway private networking gives every service a `*.railway.internal` DNS name
  based on the **service's name**, and the network is **IPv6-only**. Reference the
  target's own domain — `web` → `api` is
  `http://${{<api-service-name>.RAILWAY_PRIVATE_DOMAIN}}:8000` — so a renamed
  service never breaks the link (a hardcoded `api.railway.internal` fails with
  `ENOTFOUND` unless the service is literally named `api`).
- `api` binds `::` (IPv6 wildcard) from the entrypoint, so it's reachable on the
  IPv6 private network without a public domain. A `0.0.0.0` (IPv4-only) bind would
  resolve but refuse the connection.
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
| `web` page crashes; log shows `fetch failed` / `getaddrinfo ENOTFOUND …railway.internal` | `API_URL` hostname wrong — use `${{<api-service-name>.RAILWAY_PRIVATE_DOMAIN}}`, not a hardcoded `api.railway.internal` (Step 4). |
| `web` resolves `api` but the fetch still fails (connection refused/timeout) | API bound `0.0.0.0` (IPv4) instead of `::`; Railway's private network is IPv6-only (Step 2). |
| `web` throws `Clerk: auth() was called but Clerk can't detect usage of clerkMiddleware()` on a data page | Usually a **cascade** from an uncaught API `fetch` failure re-rendering through the Clerk-wrapped root layout — fix `API_URL` first (rows above). Only if it persists with a working API is it a genuine middleware/matcher issue. |
| `worker` crashes at boot: `Redis URL must specify one of the following schemes` | Two possible causes, often together: (a) start command missing the `sh -c '…'` wrapper, so `$REDIS_URL` is passed literally instead of expanded (Step 3); (b) `REDIS_URL` itself empty/unresolved — reference `${{Redis.REDIS_URL}}`, not `REDIS_PRIVATE_URL` (which doesn't exist). Fix both; verify the resolved value on the Variables tab. |
| Jobs enqueue but never run | `api` and `worker` pointed at different Redis instances (Step 3). |
| JWT verification fails | `CLERK_ISSUER` / `CLERK_JWKS_URL` mismatch with the Clerk instance. |

---

## Step 7 — (Optional) Self-hosted Langfuse monitoring

Operational AI-usage monitoring (ADR-0039). **Skip this entirely** if you don't
want monitoring — the app runs fine without it (the no-op recorder). When you do
want it, deploy Langfuse and point `api`/`worker` at it.

> **Do not hand-build the six services.** Langfuse v3 is a stack of its own —
> Postgres, ClickHouse, Redis, and S3-compatible blob storage behind
> `langfuse-web` + `langfuse-worker` — and wiring them by hand on Railway is
> error-prone (the internal service references have to match every renamed
> service exactly). Use Langfuse's **official one-click Railway template**
> instead; it provisions the whole stack with the internal wiring, volumes, and
> IPv6 binding already correct. The steps below are for that template.
>
> The [`docker-compose.yml`](../../docker-compose.yml) stack in this repo is the
> source of truth for a **local / non-Railway** deployment; the two paths differ
> in exactly one way that matters (see the callout in Step 7.3): compose
> bootstraps the API keys via `LANGFUSE_INIT_*`, while the Railway template has
> you create them in the UI.

### 7.1 — Deploy the Langfuse template

1. Open Langfuse's official Railway guide —
   <https://langfuse.com/self-hosting/deployment/railway> — and click its
   **Deploy on Railway** button (the current template is
   [railway.com/deploy/YJ_Ivb](https://railway.com/deploy/YJ_Ivb), "Langfuse v3
   — Production-Ready Bundle"). Deploy it into a **new Railway project**, kept
   separate from the app project.
2. The template provisions the full stack — `langfuse-web`, `langfuse-worker`,
   Postgres, ClickHouse, Redis, and blob storage (MinIO) — each with its own
   volume and all cross-service variables pre-wired. It generates `SALT`,
   `ENCRYPTION_KEY`, and `NEXTAUTH_SECRET` for you.

> ⚠️ **This satisfies the "its own datastore" rule for free.** The template's
> Postgres/Redis/ClickHouse are brand-new and separate from the app's plugins,
> so the 90-day retention purge and per-user erasure never touch product data.
> Do **not** repoint the template at the app's `Postgres`/`Redis`.

### 7.2 — Create your admin account

The template exposes `langfuse-web` on a Railway domain so you can reach the UI:

1. Confirm `AUTH_DISABLE_SIGNUP` is `false` on the `langfuse-web` service (the
   template's default for first boot).
2. Open the `langfuse-web` public domain and **create your operator account** —
   the first account is the instance admin.
3. **Lock signup back down:** set `AUTH_DISABLE_SIGNUP=true` on `langfuse-web`
   and redeploy, so no one else can self-register on your instance.

> Keep this public domain if the app talks to Langfuse across projects (the
> common case — see Step 7.4); the browser UI and the app's ingestion calls both
> go through it, protected by Langfuse's login and the app's secret key. Only
> remove the public domain if you put Langfuse in the **same** project as the app
> and rely on private networking for both.

### 7.3 — Create the project and API keys

In the Langfuse UI: create an **Organization** and a **Project** (name it
`workout-manager`), then **Project → Settings → API Keys → Create**. Copy the
generated pair:

- **Public key** — `pk-lf-…`
- **Secret key** — `sk-lf-…` (shown once; copy it now)

> ⚠️ **Railway ≠ compose here.** This repo's `docker-compose.yml` bootstraps the
> keys automatically via `LANGFUSE_INIT_PROJECT_PUBLIC_KEY` /
> `LANGFUSE_INIT_PROJECT_SECRET_KEY`. The Railway template does **not** — you
> create the project and keys in the UI (above) and paste them into the app in
> Step 7.4. Don't go looking for `LANGFUSE_INIT_*` in the template.

### 7.4 — Point the app at Langfuse

Back in the **app** project, add these three variables to **both** the `api`
and `worker` services (the worker records the majority of calls — cache-miss
generations run there, ADR-0005), using the keys from Step 7.3:

```
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://<your-langfuse-web-public-domain>
```

**Which host value to use** depends on whether the two projects can talk over a
private network:

- **Different Railway projects (the common case):** private networking does not
  span projects, so use the `langfuse-web` **public HTTPS domain**
  (`https://…up.railway.app` or your custom domain). Traffic is server-to-server
  from `api`/`worker` and authenticated by the secret key; TLS protects it in
  transit. If you removed the public domain in Step 7.2, re-add one (behind
  Langfuse login) or move Langfuse into the app project to use private DNS.
- **Same Railway project:** you may instead use the private domain,
  `http://${{<langfuse-web-service-name>.RAILWAY_PRIVATE_DOMAIN}}:3000`.

> ⚠️ **The name inside `${{ … }}` must be the exact Railway service name.**
> Railway resolves `${{ServiceName.VAR}}` by the service's *actual* name,
> character-for-character. If your Langfuse web service is shown as `langfuse-web`,
> the reference is `${{langfuse-web.RAILWAY_PRIVATE_DOMAIN}}` — not some other
> label. A name that doesn't match resolves to an **empty string** and the app
> silently falls back to the no-op recorder. (This was the bug in an earlier
> draft of this doc: a table service named `langfuse-db` cannot be referenced as
> `${{LangfusePostgres.…}}`.)

> ⚠️ **All three vars, on both services, or nothing records.** A single missing
> var on either `api` or `worker` makes `langfuse_configured()` return false and
> the app uses the no-op recorder — **no traces and no error**. Verify the
> resolved values on each service's **Variables** tab (see the failure table in
> [`langfuse.md`](./langfuse.md#if-somethings-wrong)).

Redeploy `api` and `worker` so they pick up the new variables.

### 7.5 — Configure the project and verify

The remaining setup is host-independent and lives in
[`langfuse.md`](./langfuse.md) — do **Steps 4–6** there:

- **Step 4:** set the **90-day retention window** (Project → Settings → Data
  Retention).
- **Step 5:** add **per-model prices** for `claude-opus-4-8`, `gpt-5.5`, and
  `gemini-3.1-pro` (exact model-name match; unit `TOKENS`, keys `input`/`output`).
- **Step 6:** trigger a cache-miss generation and confirm one flat trace appears
  in Langfuse with prompt/output, tokens, model, **cost**, and `user_id`.

### Cost note

Monitoring is **not** in the app's ~$5–15/mo floor. The Langfuse template adds
ClickHouse (memory-hungry), MinIO, Redis, Postgres, and two Langfuse services —
budget a meaningful increment (commonly **~$20–40+/mo** depending on retention
and trace volume) on top of the app. This is the price of keeping health-data
prompts on your own infrastructure rather than Langfuse Cloud.

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
- **Catalog maintenance:** to lift an existing backlog of name-only **Stub**
  Exercises up to the shared quality bar, run the Stub-enrichment backfill — see
  [`enrichment-backfill.md`](./enrichment-backfill.md) (admin endpoint or CLI).
