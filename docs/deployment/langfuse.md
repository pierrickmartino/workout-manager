# Standing up self-hosted Langfuse

How to run and configure a **self-hosted [Langfuse](https://langfuse.com)**
instance for this app's operational AI-usage monitoring (ADR-0039, PRD #270).
This is the operator infrastructure the recorder emits into and where the
health-data lifecycle is enforced.

> **Scope: infrastructure + configuration, not app code.** The application side
> already shipped in #273 — the `LangfuseGenerationCallRecorder`, the factory
> selection, and the worker flush all exist. This slice **stands up and
> configures a running Langfuse instance** and wires three environment variables
> into the `api` and `worker` services. It changes no generator, route, or
> domain code.

## Why self-hosted (not Langfuse Cloud)

Generation prompts carry **Sensitive Constraints** — injury, rehab, postpartum,
medical (health data). The safety cache bypass (ADR-0003) exists precisely so
those prompts get a fresh generation rather than a shared/cached one; sending
them to a third-party SaaS would undo that posture. Self-hosting keeps **all
prompt and output text on the operator's own infrastructure**, which is the
reason the recorder captures the full prompt/output by default instead of a
bare token count.

Two lifecycle controls bound the standing health-data liability, both configured
below: a **90-day retention window** and per-user erasure via
`delete_user_traces` (the recorder operation from #273, keyed on the stamped
`user_id`).

---

## How the app selects the recorder

`build_llm_client` picks the recorder the same way it picks a provider — from
config, fail-closed to the no-op:

- All **three** of `LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`
  present → the `LangfuseGenerationCallRecorder` is selected and real
  `Generation Call`s land in Langfuse.
- Any one missing → `langfuse_configured()` is `false`, the **no-op recorder** is
  used, and nothing networks (this keeps the offline test suite offline).

See `apps/api/app/config.py` (`langfuse_configured()`) and
`apps/api/app/generation/llm/factory.py` (`build_recorder`).

> ⚠️ **All three or nothing.** Setting only the host, or only one key, still
> resolves to the no-op recorder — you'll see *no* traces and *no* error. If
> generations aren't appearing, verify all three are set on **both** the `api`
> and `worker` services (see [troubleshooting](#if-somethings-wrong)).

---

## What you're adding to the stack

Self-hosted Langfuse (v3) is its own small stack. Per the issue it runs
**alongside** the app with **its own datastore** — do not point it at the app's
`db`/`redis`.

| Service | Purpose | Public? |
|---|---|---|
| `langfuse-web` | Langfuse UI + ingestion API (the `LANGFUSE_HOST` target) | operator-only |
| `langfuse-worker` | Async ingestion/processing of batched events | no |
| `langfuse-db` (Postgres) | Langfuse's own transactional store | no |
| `clickhouse` | Traces/observations/scores analytics store | no |
| `langfuse-redis` (redis/valkey) | Langfuse's queue/cache | no |
| `minio` (S3-compatible) | Event/media blob storage | no |

> The `langfuse-web` UI must be reachable by **you, the operator**, but it is not
> part of the product surface — nothing in the PWA links to it. Keep it off the
> public internet (VPN / private network / IP allowlist / auth-proxy). It is not
> the `web` service.

---

## Step 1 — Add Langfuse to `docker-compose.yml`

Append the Langfuse services and their datastores. This is adapted from the
official Langfuse self-host compose; the load-bearing part is that
`langfuse-web` reads `LANGFUSE_INIT_*` so the org, project, and API keys are
created deterministically on first boot (no click-ops to get keys).

```yaml
  # --- Self-hosted Langfuse (ADR-0039). Its own datastore; never the app's. ---
  langfuse-web:
    image: langfuse/langfuse:3
    depends_on:
      langfuse-db:
        condition: service_healthy
    ports:
      - "${LANGFUSE_PORT:-3001}:3000"   # operator-only UI; keep off public internet
    environment:
      DATABASE_URL: postgresql://postgres:postgres@langfuse-db:5432/langfuse
      CLICKHOUSE_URL: http://clickhouse:8123
      CLICKHOUSE_MIGRATION_URL: clickhouse://clickhouse:9000
      CLICKHOUSE_USER: clickhouse
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD:?set in .env}
      REDIS_HOST: langfuse-redis
      REDIS_PORT: 6379
      LANGFUSE_S3_EVENT_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: minio
      LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: ${MINIO_PASSWORD:?set in .env}
      LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "true"
      LANGFUSE_S3_EVENT_UPLOAD_REGION: auto
      SALT: ${LANGFUSE_SALT:?set in .env}
      ENCRYPTION_KEY: ${LANGFUSE_ENCRYPTION_KEY:?32-byte hex; set in .env}
      NEXTAUTH_SECRET: ${LANGFUSE_NEXTAUTH_SECRET:?set in .env}
      NEXTAUTH_URL: http://localhost:${LANGFUSE_PORT:-3001}
      # Deterministic bootstrap: create org/project + the keys the app will use.
      LANGFUSE_INIT_ORG_ID: workout-manager
      LANGFUSE_INIT_PROJECT_ID: workout-manager
      LANGFUSE_INIT_PROJECT_PUBLIC_KEY: ${LANGFUSE_PUBLIC_KEY:?set in .env}
      LANGFUSE_INIT_PROJECT_SECRET_KEY: ${LANGFUSE_SECRET_KEY:?set in .env}

  langfuse-worker:
    image: langfuse/langfuse-worker:3
    depends_on:
      langfuse-db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://postgres:postgres@langfuse-db:5432/langfuse
      CLICKHOUSE_URL: http://clickhouse:8123
      CLICKHOUSE_MIGRATION_URL: clickhouse://clickhouse:9000
      CLICKHOUSE_USER: clickhouse
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD:?set in .env}
      REDIS_HOST: langfuse-redis
      REDIS_PORT: 6379
      LANGFUSE_S3_EVENT_UPLOAD_BUCKET: langfuse
      LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: http://minio:9000
      LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: minio
      LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: ${MINIO_PASSWORD:?set in .env}
      LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: "true"
      LANGFUSE_S3_EVENT_UPLOAD_REGION: auto
      SALT: ${LANGFUSE_SALT:?set in .env}
      ENCRYPTION_KEY: ${LANGFUSE_ENCRYPTION_KEY:?set in .env}

  langfuse-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: langfuse
    volumes:
      - langfuse_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 10

  clickhouse:
    image: clickhouse/clickhouse-server:24
    environment:
      CLICKHOUSE_USER: clickhouse
      CLICKHOUSE_PASSWORD: ${CLICKHOUSE_PASSWORD:?set in .env}
    volumes:
      - clickhouse_data:/var/lib/clickhouse
    healthcheck:
      test: ["CMD-SHELL", "wget --spider -q localhost:8123/ping || exit 1"]
      interval: 5s
      timeout: 3s
      retries: 10

  langfuse-redis:
    image: redis:7-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio
    entrypoint: sh
    command: -c 'mkdir -p /data/langfuse && minio server /data'
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: ${MINIO_PASSWORD:?set in .env}
    volumes:
      - minio_data:/data
```

Add the new named volumes next to the existing `pgdata`:

```yaml
volumes:
  pgdata:
  langfuse_pgdata:
  clickhouse_data:
  minio_data:
```

> ℹ️ Pin these image tags to a specific Langfuse release for reproducible
> deploys; `:3` tracks the v3 line. Check the
> [Langfuse self-host docs](https://langfuse.com/self-hosting) for the current
> recommended compose before a production rollout — the datastore set (Postgres,
> ClickHouse, Redis, S3) is stable, but individual env keys evolve.

---

## Step 2 — Add the environment variables

### 2a. App side — three vars, on `api` **and** `worker`

Add the Langfuse block to **both** the `api` and `worker` services in
`docker-compose.yml` (the worker generates the majority of calls on a cache
miss, so it must record too):

```yaml
      LANGFUSE_HOST: ${LANGFUSE_HOST:-}
      LANGFUSE_PUBLIC_KEY: ${LANGFUSE_PUBLIC_KEY:-}
      LANGFUSE_SECRET_KEY: ${LANGFUSE_SECRET_KEY:-}
```

Because the app talks to Langfuse over the compose network, `LANGFUSE_HOST`
points at the `langfuse-web` service, not `localhost`:

### 2b. `.env`

Add to your `.env` (and document them in `.env.example`):

```bash
# --- Operational AI-usage monitoring: self-hosted Langfuse (ADR-0039) ---
# All THREE are required together for the app to record; any missing => no-op.
# The app -> Langfuse call is server-to-server over the compose network, so the
# host is the langfuse-web service name, not localhost.
LANGFUSE_HOST=http://langfuse-web:3000
LANGFUSE_PUBLIC_KEY=pk-lf-replace-me
LANGFUSE_SECRET_KEY=sk-lf-replace-me

# --- Langfuse's own infrastructure secrets (not consumed by the app) ---
CLICKHOUSE_PASSWORD=replace-me
MINIO_PASSWORD=replace-me
LANGFUSE_SALT=replace-me
# ENCRYPTION_KEY must be 32 bytes hex: `openssl rand -hex 32`
LANGFUSE_ENCRYPTION_KEY=replace-me-64-hex-chars
LANGFUSE_NEXTAUTH_SECRET=replace-me
# LANGFUSE_PORT=3001   # host port for the operator-only UI
```

Generate the secrets — never hardcode them:

```bash
openssl rand -hex 32   # LANGFUSE_ENCRYPTION_KEY (must be 32-byte hex)
openssl rand -base64 32 # SALT / NEXTAUTH_SECRET / passwords
```

The `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` you invent here are consumed
in two places: the app uses them to authenticate, and `langfuse-web` uses the
same values via `LANGFUSE_INIT_PROJECT_*` to **create** that key pair on first
boot — so they match with no manual copy-paste from the UI.

> ⚠️ **`LANGFUSE_HOST` differs by environment.** Inside compose it's
> `http://langfuse-web:3000`. If the app runs outside compose (e.g. local dev
> against a compose Langfuse), it's `http://localhost:${LANGFUSE_PORT:-3001}`.
> On Railway/managed hosts it's the Langfuse service's private URL.

---

## Step 3 — First boot

```bash
docker compose up --build
```

On first boot `langfuse-web` runs its own migrations against `langfuse-db` and
ClickHouse, then bootstraps the org/project/keys from `LANGFUSE_INIT_*`. Open
the UI at `http://localhost:${LANGFUSE_PORT:-3001}`, create your operator login,
and confirm the **workout-manager** project exists with the public/secret key
pair you set.

---

## Step 4 — Configure the 90-day retention window

Bound the standing health-data liability while keeping recent monitoring intact.
In the Langfuse UI:

**Project → Settings → Data Retention → set 90 days.**

Retention is pure Langfuse project config (no app change). Older traces —
including their captured prompts — are purged automatically past the window.
This is the coarse, time-based control; per-user erasure (`delete_user_traces`,
#273) is the fine-grained, on-demand control that complements it.

---

## Step 5 — Configure per-model prices

The app emits **tokens + model name only** and never carries a pricing table
(so a provider price change never goes stale in code). Langfuse computes cost
from model definitions you create once.

In the Langfuse UI: **Project → Settings → Models → New model definition**, one
per model the deployment uses. Match the exact model names the app emits (from
`DEFAULT_MODELS` in `apps/api/app/config.py`, or your `AI_MODEL` override):

| Model name (match exactly) | Provider | Set input price | Set output price |
|---|---|---|---|
| `claude-opus-4-8` | Anthropic | per input token | per output token |
| `gpt-5.5` | OpenAI | per input token | per output token |
| `gemini-3.1-pro` | Google | per input token | per output token |

For each definition:

- **Match pattern:** the exact model string above (an exact match, or an anchored
  regex like `^claude-opus-4-8$`) — it must equal what the recorder sends as
  `model`.
- **Usage unit / keys:** `TOKENS`, with `input` and `output` — these are exactly
  the keys the recorder emits (see `_usage` in
  `apps/api/app/generation/monitoring/langfuse_recorder.py`).
- **Prices:** the current per-input-token and per-output-token price from the
  provider's pricing page. Put the real numbers in here — they are the single
  source of truth for cost.

> ℹ️ Only configure the model(s) your `AI_PROVIDER` actually runs. If you switch
> providers or override `AI_MODEL`, add a matching model definition or cost will
> render as zero for the unrecognized model.

---

## Step 6 — Verify end-to-end

1. Sign in to the PWA and trigger an AI generation that **misses** the cache (a
   cache hit is adopt-by-copy and produces no `Generation Call` by design).
2. Because generation is async on a cache miss (ADR-0005), the RQ `worker`
   processes it and calls `flush()` at job end — so the trace appears shortly
   after the job completes, not instantly.
3. In the Langfuse UI, open **Traces**. You should see one flat trace per call
   (one trace, one generation under it) showing:
   - the **prompt** (system + user) and the model **output** text,
   - **input/output tokens** and the **model** name,
   - **cost** rendered (proves Step 5's prices matched the model name),
   - **`user_id`** = the originating `clerk_user_id` (unattributed for
     non-user calls like catalog enrichment),
   - metadata: `generator_kind`, `provider`, `outcome`, `latency_ms`.

That single trace with prompt/output, tokens, model, cost, and `user_id`
satisfies the acceptance criteria in #276.

### If something's wrong

| Symptom | Likely cause |
|---|---|
| No traces at all, no error | One of the three `LANGFUSE_*` vars unset → the app fell back to the **no-op** recorder. All three required, on **both** `api` and `worker`. |
| Traces from the API but not from generations | The `worker` is missing the `LANGFUSE_*` vars — it builds its own client and records independently of `api`. |
| Traces appear but **cost is 0 / blank** | No model definition matches the emitted model name, or the match pattern is wrong (Step 5). Compare the trace's `model` field to your definition. |
| App logs a Langfuse/network error but generations still succeed | Expected — recording is **best-effort**; a recorder/flush failure is swallowed-and-logged and never fails a generation (ADR-0039). Fix the Langfuse connection, but generation is unaffected. |
| Worker calls missing after a job | The worker flush isn't running / can't reach Langfuse; batched events are lost on process exit. Check `worker.py` `flush()` and `LANGFUSE_HOST` reachability from the worker. |
| `langfuse-web` crashes on boot | A required Langfuse infra secret is unset (`ENCRYPTION_KEY` must be 32-byte hex), or ClickHouse/MinIO/Redis isn't healthy yet. |
| Cache **hits** show no trace | Correct and intended — only cache misses are metered `Generation Call`s. |

---

## Production notes

- **Managed hosts (Railway, etc.).** See [`railway.md`](./railway.md) for the
  app services. Langfuse's six components map the same way — private services
  plus their own managed Postgres/Redis (and ClickHouse/object storage from a
  provider). Set `LANGFUSE_HOST` to the Langfuse service's **private** URL, and
  keep the Langfuse UI off the public internet (VPN / auth-proxy / IP allowlist).
- **Its own datastore.** Never point Langfuse at the app's `db`/`redis`. Keeping
  the datastores separate is what lets the 90-day purge and per-user erasure act
  on monitoring data without touching product data.
- **Per-user erasure.** `delete_user_traces(clerk_user_id)` (recorder port, #273)
  erases a specific user's captured prompts on demand, complementing the 90-day
  window. Wire it into a future account-deletion flow.
- **Secrets hygiene.** All Langfuse credentials come from env vars only. Rotate
  anything that leaks; the app's `LANGFUSE_SECRET_KEY` and Langfuse's own
  `ENCRYPTION_KEY`/`SALT` are the sensitive ones.

## References

- ADR-0039 — [`docs/adr/0039-ai-usage-monitoring-via-self-hosted-langfuse.md`](../adr/0039-ai-usage-monitoring-via-self-hosted-langfuse.md)
- PRD #270 · Recorder implementation #273 · This slice #276
- App wiring: `apps/api/app/config.py`,
  `apps/api/app/generation/llm/factory.py`,
  `apps/api/app/generation/monitoring/langfuse_recorder.py`,
  `apps/api/app/generation/worker.py`
- Upstream: [Langfuse self-hosting](https://langfuse.com/self-hosting)
