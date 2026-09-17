# Migrate Workout Manager from Railway to a Hostinger VPS

This tutorial moves the existing app to a single Ubuntu VPS using Docker Compose and Caddy for HTTPS. It includes a rehearsal, a short maintenance window for the final database copy, and rollback instructions. Commands are intended for a human operator; no infrastructure is changed by adding this document.

Written against this repository and provider documentation on **17 September 2026**. Replace example domains, IP addresses, repository URLs, and secrets before running commands. Run server commands in **Bash** as the `deploy` user unless marked otherwise.

## 1. Understand the target setup

```text
Browser → HTTPS :443 → Caddy → web:3000 → api:8000 → PostgreSQL:5432
                                              ↘ Redis:6379 ← RQ worker
Clerk remains hosted by Clerk; AI requests still go to your chosen provider.
```

| Service | Purpose | Public ports | Persistent storage |
|---|---|---|---|
| Caddy | HTTPS termination and reverse proxy | 80, 443 | Certificates and configuration |
| web | Next.js frontend and server routes | None | Built image |
| api | FastAPI backend | None | PostgreSQL |
| worker | RQ worker consuming `generation` | None | PostgreSQL and Redis |
| db | PostgreSQL | None | Docker volume |
| redis | Generation cache and job queue | None | Docker volume with AOF |

The frontend calls the API server-side through `API_URL=http://api:8000`; do not create a public API domain or route `/api/*` directly to FastAPI. Next.js owns its own API routes. The worker handles generation, exercise enrichment, and backfills on the same queue.

The root [`docker-compose.yml`](../../docker-compose.yml) is a development starting point: it publishes database/cache/application ports, uses example database credentials, and includes a separate Langfuse stack. Use the standalone production file below instead of merging it with that file.

**Planning assumption:** for a small deployment without Langfuse, start evaluating a VPS with 2 vCPU, 4 GB RAM, and enough SSD space for the database, Docker builds, and multiple backups. This is an engineering estimate, not a measured requirement; inspect Railway memory/storage usage first. Next.js builds can need more headroom than steady-state traffic. Choose the plan from measured usage and current Hostinger offerings, and allow for growth. A single VPS has no automatic failover.

## 2. Prepare the migration inventory

Before purchasing or switching DNS:

- Record the Git commit currently running on Railway, all service start commands, environment variable overrides, PostgreSQL/Redis versions, database size, and any additional services or volumes actually deployed.
- Save the current DNS records and Railway deployment identifiers. Lower the app record's TTL to around 300 seconds at least one old TTL before cutover.
- Keep the **same Clerk instance** and keys. App records are keyed by Clerk user IDs; creating another Clerk instance does not migrate those identities.
- Keep the current custom domain if possible. A Railway-owned `*.up.railway.app` hostname cannot be transferred to Hostinger; you need a domain you control.
- Choose a maintenance window after measuring a rehearsal dump, restore, and build. This procedure is not zero downtime.
- Export secrets to a password manager or another secure location. Do not commit them, paste them into tickets, or copy your workstation's entire checkout, which may contain `.env` files.
- Inventory Langfuse separately if deployed; see section 13 before deleting any Railway volumes.

Use Railway's PostgreSQL query tool or a connected SQL client to record:

```sql
SHOW server_version;
SELECT pg_size_pretty(pg_database_size(current_database()));
SELECT extname, extversion FROM pg_extension;
SELECT version_num FROM alembic_version;
```

This guide's database example uses **PostgreSQL 16**, matching the repository. If Railway uses a different major version, match that version for the migration and use its corresponding official image/storage layout. PostgreSQL 18+ images have different volume layout expectations; do not blindly change only `16` in the YAML. Install required extensions before restoring. Avoid combining this move with a database major upgrade. A `pg_dump` client cannot dump a server newer than its own major version. See [PostgreSQL's dump compatibility documentation](https://www.postgresql.org/docs/16/app-pgdump.html).

## 3. Provision and secure the VPS

In Hostinger hPanel, provision a **fresh Ubuntu 24.04 LTS VPS**, select a region near your users, add your SSH public key, and record its IP. This tutorial assumes a plain OS image rather than a hosting control panel. Reinstalling an existing VPS erases its contents. Hostinger documents the initial flow in its [VPS setup guide](https://www.hostinger.com/tutorials/how-to-set-up-vps).

On your workstation:

```bash
ssh root@YOUR_VPS_IP
```

As root on the VPS:

```bash
apt update
apt upgrade -y
apt install -y sudo git curl ca-certificates ufw openssl
adduser deploy
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

Keep that session open. In a second workstation terminal, verify `ssh deploy@YOUR_VPS_IP` works and `sudo -v` succeeds. Then, as `deploy`, configure SSH:

```bash
sudo tee /etc/ssh/sshd_config.d/00-workout-hardening.conf >/dev/null <<'SSH'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
SSH
sudo sshd -t
sudo sshd -T | grep -E 'permitrootlogin|passwordauthentication|kbdinteractiveauthentication'
```

Confirm the effective settings say `no`, then run `sudo systemctl reload ssh` and test a new connection before closing the root session. Keep Hostinger's web console available for recovery.

Allow SSH before enabling the host firewall:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
```

Also configure and attach Hostinger's managed firewall: allow TCP 22 from your administration IP where practical, and TCP 80/443 from anywhere; deny other unsolicited inbound traffic. Apply the equivalent policy for IPv6 if enabled. Leave outbound DNS, HTTPS, and other required service traffic available. See [Hostinger's firewall instructions](https://www.hostinger.com/support/4805502-how-to-set-up-a-firewall-at-vps/).

Docker-published ports can bypass UFW rules, which is why only Caddy publishes ports in this guide. See [Docker's firewall limitations](https://docs.docker.com/engine/install/ubuntu/#firewall-limitations).

## 4. Install Docker Engine and Compose

For the fresh Ubuntu 24.04 server, install from Docker's apt repository:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<'APT'
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
APT
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo docker run --rm hello-world
sudo docker compose version
```

These steps assume no conflicting Docker packages were preinstalled. For another Ubuntu release or an existing installation, follow [Docker's official installation instructions](https://docs.docker.com/engine/install/ubuntu/). Commands below use `sudo docker`; adding a user to the Docker group also grants effective root access.

## 5. Check out the deployed release

Use a read-only GitHub deploy key for a private repository, or another authenticated Git method. Verify GitHub's SSH host fingerprint before accepting it; do not place an access token in the clone URL.

```bash
sudo install -d -o deploy -g deploy -m 750 /opt/workout-manager
sudo install -d -o deploy -g deploy -m 700 /opt/workout-config
sudo install -d -o deploy -g deploy -m 700 /opt/workout-backups
git clone git@github.com:YOUR_ACCOUNT/YOUR_REPOSITORY.git /opt/workout-manager
cd /opt/workout-manager
git checkout YOUR_RAILWAY_COMMIT_SHA
```

Deploy the same revision first. An infrastructure migration is easier to validate without simultaneous application/schema changes.

**Build-context check:** the API Dockerfile copies its entire build context, and its current `.dockerignore` does not exclude `.env`. Use this clean clone and keep all server secrets in `/opt/workout-config`, outside both build contexts. Ensure neither `apps/api` nor `apps/web` contains secret files before building. If you customize ignore rules later, exclude `.env` and `.env.*` while allowing example files as needed.

## 6. Create production environment variables

```bash
umask 077
openssl rand -hex 32
nano /opt/workout-config/production.env
```

Use the generated hex string as `POSTGRES_PASSWORD`. Hex avoids URL-encoding problems in the database URL. Put the following into the file and replace placeholders with your existing production values:

```dotenv
POSTGRES_PASSWORD=REPLACE_WITH_RANDOM_HEX
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_REPLACE
CLERK_SECRET_KEY=sk_live_REPLACE
CLERK_ISSUER=https://YOUR_EXISTING_CLERK_ISSUER
CLERK_JWKS_URL=https://YOUR_EXISTING_CLERK_ISSUER/.well-known/jwks.json
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=REPLACE_IF_SELECTED
OPENAI_API_KEY=
GOOGLE_API_KEY=
OPENROUTER_API_KEY=
AI_MODEL=
ADMIN_ROLE_CLAIM=role
ADMIN_ROLE_VALUE=admin
STRONG_SESSIONS_PER_LEVEL=3
LANGFUSE_HOST=
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
```

Set `AI_PROVIDER`, its corresponding key, `AI_MODEL`, and any custom settings to the values actually used on Railway. Blank `AI_MODEL` selects the repository default. Only the selected provider needs a key. Do not use the Railway database or Redis URLs on the new deployment. Keep the Clerk issuer exactly as configured today, without appending a trailing slash.

```bash
chmod 600 /opt/workout-config/production.env
```

If a secret contains `$` or `#`, single-quote its value according to Compose dotenv syntax. This file is read by Compose, not sourced by Bash. Avoid printing fully resolved Compose configuration because it contains secrets; use `config --quiet` to validate.

The Clerk publishable key must be supplied **at build time** as well as runtime. Changing it requires rebuilding `web`; the secret key stays runtime-only. When changing domains, configure the existing Clerk instance's domain, redirect URLs, OAuth callback settings, and DNS records as required by [Clerk's production deployment guide](https://clerk.com/docs/guides/development/deployment/production). Never redirect Clerk's own DNS records to the VPS.

## 7. Create the production Compose file

Save this as `/opt/workout-config/compose.production.yml`. Its absolute build paths intentionally match section 5.

```yaml
name: workout-production

x-logging: &logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"

x-app-env: &app-env
  DATABASE_URL: postgresql+psycopg://workout:${POSTGRES_PASSWORD:?required}@db:5432/workout
  REDIS_URL: redis://redis:6379/0
  CLERK_ISSUER: ${CLERK_ISSUER:?required}
  CLERK_JWKS_URL: ${CLERK_JWKS_URL:?required}
  AI_PROVIDER: ${AI_PROVIDER:-anthropic}
  ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
  OPENAI_API_KEY: ${OPENAI_API_KEY:-}
  GOOGLE_API_KEY: ${GOOGLE_API_KEY:-}
  OPENROUTER_API_KEY: ${OPENROUTER_API_KEY:-}
  AI_MODEL: ${AI_MODEL:-}
  ADMIN_ROLE_CLAIM: ${ADMIN_ROLE_CLAIM:-role}
  ADMIN_ROLE_VALUE: ${ADMIN_ROLE_VALUE:-admin}
  STRONG_SESSIONS_PER_LEVEL: ${STRONG_SESSIONS_PER_LEVEL:-3}
  LANGFUSE_HOST: ${LANGFUSE_HOST:-}
  LANGFUSE_PUBLIC_KEY: ${LANGFUSE_PUBLIC_KEY:-}
  LANGFUSE_SECRET_KEY: ${LANGFUSE_SECRET_KEY:-}

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    logging: *logging
    environment:
      POSTGRES_USER: workout
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?required}
      POSTGRES_DB: workout
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U workout -d workout"]
      interval: 5s
      timeout: 3s
      retries: 20

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    logging: *logging
    command: ["redis-server", "--appendonly", "yes", "--appendfsync", "everysec", "--maxmemory-policy", "noeviction"]
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 20

  api:
    image: workout-api:${APP_RELEASE:?required}
    build: /opt/workout-manager/apps/api
    restart: unless-stopped
    logging: *logging
    environment: *app-env
    # Run migrations explicitly before starting API or worker.
    command: ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 20s

  worker:
    image: workout-api:${APP_RELEASE:?required}
    restart: unless-stopped
    logging: *logging
    environment: *app-env
    command: ["sh", "-c", "exec rq worker --url \"$$REDIS_URL\" generation"]
    stop_grace_period: 15m
    depends_on:
      api:
        condition: service_healthy

  web:
    image: workout-web:${APP_RELEASE:?required}
    build:
      context: /opt/workout-manager/apps/web
      args:
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:?required}
    restart: unless-stopped
    logging: *logging
    environment:
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:?required}
      CLERK_SECRET_KEY: ${CLERK_SECRET_KEY:?required}
      API_URL: http://api:8000
    depends_on:
      api:
        condition: service_healthy

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    logging: *logging
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /opt/workout-config/caddy:/etc/caddy:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - web

volumes:
  pgdata:
  redisdata:
  caddy_data:
  caddy_config:
```

`$$REDIS_URL` is intentional: Compose passes a literal `$` to the worker shell. The API normally runs migrations in `docker-entrypoint.sh`; this configuration overrides that command, uses IPv4 on the VPS network, and makes migrations a separate controlled step.

All services use Compose's private bridge network and retain outbound access for Clerk and AI providers. Redis has no public port and must never be exposed; RQ data is trusted internal application data. The example database role is also the bootstrap administrator; a separate least-privilege runtime role is a possible later hardening step.

Create a wrapper so every command uses the right project, file, and secrets:

```bash
mkdir -p /home/deploy/bin
cat > /home/deploy/bin/workout-compose <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail
export APP_RELEASE="$(cat /opt/workout-config/release)"
exec sudo --preserve-env=APP_RELEASE docker compose \
  --env-file /opt/workout-config/production.env \
  -f /opt/workout-config/compose.production.yml "$@"
SCRIPT
chmod 700 /home/deploy/bin/workout-compose
git -C /opt/workout-manager rev-parse HEAD > /opt/workout-config/release
export PATH="/home/deploy/bin:$PATH"
workout-compose config --quiet
workout-compose build api web
workout-compose up -d db redis
workout-compose ps
```

Add `export PATH="/home/deploy/bin:$PATH"` to `~/.bashrc` for future sessions. Do not use bare `docker compose up` from the repository root. Keep the same project name and volume names across releases. Never run `down -v` on production: it deletes persistent volumes.

Tags above identify the release; existing Dockerfiles do not fully pin all dependencies/base images. Retain the actual built images for rollback and consider pushing immutable images to a private registry later. Do not rebuild an old tag and assume it reproduces the old image.

## 8. Rehearse the PostgreSQL transfer

Keep Railway serving users during the rehearsal. The rehearsal backup will become stale; section 10 replaces it after all Railway writes stop.

In Railway, locate the PostgreSQL service's **public connection URL**. Enable its TCP proxy/public networking if necessary and remove temporary exposure after migration. The `*.railway.internal` address is not reachable from the VPS. See [Railway PostgreSQL networking](https://docs.railway.com/databases/postgresql) and its [backup/restore guide](https://docs.railway.com/guides/postgres-backups-restores).

On the VPS, prompt for the URL without putting it in shell history. Use a regular `postgresql://` URL for PostgreSQL tools, not SQLAlchemy's `postgresql+psycopg://` scheme:

```bash
read -rsp 'Railway public PostgreSQL URL: ' RAILWAY_DATABASE_URL
printf '\n'
export PGDATABASE="$RAILWAY_DATABASE_URL"
export PGSSLMODE=require
unset RAILWAY_DATABASE_URL
sudo --preserve-env=PGDATABASE,PGSSLMODE docker run --rm \
  -e PGDATABASE -e PGSSLMODE postgres:16-alpine \
  pg_dump --format=custom --no-owner --no-acl \
  > /opt/workout-backups/railway-rehearsal.dump
unset PGDATABASE PGSSLMODE
chmod 600 /opt/workout-backups/railway-rehearsal.dump
```

Stop if the dump command fails; a redirected file can exist even after failure. `sslmode=require` encrypts transport; use `verify-full` and the appropriate CA if your Railway connection supports certificate verification. Do not disable TLS merely to bypass a connection error.

Restore into the **new, empty VPS database**, before any migrations or app startup:

```bash
workout-compose exec -T db pg_restore --list \
  < /opt/workout-backups/railway-rehearsal.dump > /opt/workout-backups/rehearsal-contents.txt
workout-compose exec -T db pg_restore \
  -U workout -d workout --no-owner --no-acl --exit-on-error --single-transaction \
  < /opt/workout-backups/railway-rehearsal.dump
workout-compose exec -T db psql -U workout -d workout -c 'ANALYZE;'
workout-compose run --rm --no-deps api alembic upgrade head
workout-compose run --rm --no-deps api alembic current
workout-compose up -d api worker web
```

Check every command's exit status before continuing. Compare exact row counts for critical tables (profiles, workout history, protocols, exercises) on both databases, using the actual table names from `\dt`; estimates in database statistics are not sufficient. For example:

```bash
workout-compose exec -T db psql -U workout -d workout -c '\dt'
workout-compose exec -T db psql -U workout -d workout -c 'SELECT count(*) FROM profile;'
```

Record restore time, schema version, counts, database size, and any extension issues. Rehearsal AI tests can incur provider charges. Rehearsal writes on the VPS will be discarded by the final restore.

## 9. Configure HTTPS and test before cutover

Create `/opt/workout-config/caddy/Caddyfile` (create the `caddy` directory first):

```caddyfile
app.example.com {
    reverse_proxy web:3000
}
```

Replace the hostname with your final app domain. Caddy obtains and renews certificates when DNS and public reachability are correct; its `/data` volume must persist. HTTP validation needs port 80 and TLS validation needs port 443. See [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https).

For an HTTPS rehearsal, use `preview.example.com` in the Caddyfile, create its A record pointing to the VPS, and configure Clerk to permit that hostname where supported by your existing instance. Do not create another Clerk instance just for migration testing. Start Caddy:

```bash
workout-compose up -d caddy
workout-compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile
workout-compose logs --tail=100 caddy api worker web
```

If Clerk's production domain policy prevents preview sign-in, complete infrastructure checks now and perform authenticated checks during cutover on the original domain. Another option is a DNS-challenge certificate with a suitable Caddy DNS plugin; this tutorial's stock image does not configure that. A local hosts-file override alone does not make public certificate validation reach the VPS.

Check internal API connectivity separately:

```bash
workout-compose exec -T api python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/health').read().decode())"
workout-compose exec -T web node -e "fetch('http://api:8000/health').then(async r => { console.log(r.status, await r.text()); if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
workout-compose exec -T db pg_isready -U workout -d workout
workout-compose exec -T redis redis-cli ping
workout-compose exec -T worker sh -c 'rq info --url "$REDIS_URL"'
```

`/health` only returns a static API response; it does **not** validate database connectivity, authentication, or a working worker. When authentication is available, test existing-user sign-in, existing workout history, creating/updating a workout, and one uncached generation that completes through the worker. Check exercise enrichment if used. Open the PWA on mobile and refresh an existing installed app.

## 10. Perform the final cutover

### A. Stop Railway writes and drain jobs

1. Announce maintenance and disable automatic Railway deployments for the window.
2. Stop the Railway **web and API** services so neither the custom domain nor the Railway-generated hostname can accept writes. Also stop any cron jobs, administrative scripts, or other writers. A DNS change alone does not freeze writes.
3. Leave the Railway worker running until accepted work finishes. In a shell **inside the Railway worker container**, run `rq info --url "$REDIS_URL"` and inspect its logs.
4. Inspect queue registries as well; an empty queue alone does not prove all work has finished. Run this Python snippet in that container:

   ```python
   import os
   from redis import Redis
   from rq import Queue
   from rq.registry import (
       StartedJobRegistry, DeferredJobRegistry,
       ScheduledJobRegistry, FailedJobRegistry,
   )
   connection = Redis.from_url(os.environ["REDIS_URL"])
   queue = Queue("generation", connection=connection)
   print("queued", queue.count)
   for registry in (StartedJobRegistry, DeferredJobRegistry,
                    ScheduledJobRegistry, FailedJobRegistry):
       print(registry.__name__, registry("generation", connection=connection).get_job_ids())
   ```

5. Require zero queued/started/deferred/scheduled jobs. Investigate failed jobs and resolve or explicitly record their disposition. Generation jobs can enqueue enrichment work, so recheck after active jobs finish. If jobs remain, postpone the final copy or explicitly plan their recovery; do not silently abandon them.
6. Stop the Railway worker and verify no other process can write to Railway PostgreSQL or Redis. Keep the databases running for export and rollback.

This procedure starts with **fresh Redis** on the VPS after draining the old queue. Cached generation results and old job polling handles do not transfer; users may need to refresh/retry a completed request, and initial cache misses can cost extra AI calls. PostgreSQL data is retained. If preserving Redis state is mandatory, use a separate tested Redis snapshot/restore procedure with matching versions and all writers stopped; do not copy an active queue casually.

### B. Make the final database dump

Repeat section 8's hidden URL prompt and dump command, using `/opt/workout-backups/railway-final.dump` as the output filename. Check success, list its contents with `pg_restore --list`, and retain it securely. This dump must be taken **after** the Railway worker has stopped.

### C. Replace the VPS rehearsal database

The following commands intentionally delete **only the rehearsal database on the VPS**. Confirm the wrapper targets `workout-production` and Railway remains frozen. Do not point these commands at Railway.

```bash
workout-compose stop caddy web worker api
workout-compose exec -T db dropdb -U workout --if-exists workout
workout-compose exec -T db createdb -U workout -O workout workout
workout-compose exec -T db pg_restore \
  -U workout -d workout --no-owner --no-acl --exit-on-error --single-transaction \
  < /opt/workout-backups/railway-final.dump
workout-compose exec -T db psql -U workout -d workout -c 'ANALYZE;'
```

Clear **only VPS rehearsal Redis**, while the app is stopped, because cached protocol IDs could reference discarded rehearsal records:

```bash
workout-compose exec -T redis redis-cli FLUSHALL
workout-compose run --rm --no-deps api alembic upgrade head
workout-compose run --rm --no-deps api alembic current
workout-compose up -d api worker web
```

Do not proceed on a restore or migration error. Repeat row-count comparisons against the now-frozen Railway database and the internal checks from section 9.

### D. Switch DNS and open the app

1. Change the Caddyfile to your final hostname if you used a preview hostname.
2. At your authoritative DNS provider, replace the app's Railway CNAME/A record with an **A record to the VPS IPv4 address**. Hostinger need not host your DNS. Remove stale AAAA records, or update them only if IPv6 is configured and reachable on the VPS. Do not change mail records or nameservers unnecessarily.
3. Start Caddy: `workout-compose up -d caddy`. If already running after a config change, use `workout-compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile`.
4. Wait for authoritative/public DNS resolution and certificate issuance. Check `workout-compose logs --tail=100 caddy` and visit `https://app.example.com`.
5. Repeat authenticated end-to-end checks on the final domain. Confirm a new workout persists after refresh and an uncached generation completes.
6. Test on a second network/mobile connection. Keep Railway's web/API/worker stopped throughout DNS propagation so stale clients cannot create divergent data.

If your DNS provider has a proxy feature, begin with DNS-only mode to simplify certificate/network diagnosis. Re-enable proxying later with verified end-to-end TLS. Existing service workers or cached pages may need a full refresh, but the server-side write freeze remains necessary.

## 11. Rollback decision

**Before the VPS accepts production writes:** stop VPS web/API/worker, restore the original DNS record, and restart Railway API, worker, and web using the recorded revision/settings. Railway still has the authoritative data from the freeze. Allow for DNS propagation; keep VPS writes disabled.

**After the VPS accepts writes:** the Railway database is stale. Do not simply restore DNS and reopen Railway. Enter maintenance on the VPS, drain its queue, stop all writers, take a fresh VPS dump, and plan/test a restore into Railway (preferably a new database). Verify schema compatibility, row counts, and application behavior before changing DNS and reopening writes. Alternatively fix the VPS in place. Returning to the old frozen snapshot would discard post-cutover workouts and requires an explicit data-loss decision.

Keep the old Railway databases and service configuration for a chosen observation period, for example 48–72 hours. Keep the final dump longer according to your backup policy. Once the new app, backups, and restore drill are verified, remove unused Railway services/volumes and temporary networking and review billing; stopped compute may still leave billable storage. Remove obsolete DNS records and revoke migration-only credentials.

## 12. Backups, updates, and routine operation

### Automated PostgreSQL backups

A named volume survives container replacement; it is not an off-server backup. Create `/opt/workout-config/backup-postgres.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077
export APP_RELEASE="$(cat /opt/workout-config/release)"
backup_file="/opt/workout-backups/workout-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker compose --env-file /opt/workout-config/production.env \
  -f /opt/workout-config/compose.production.yml \
  exec -T db pg_dump -U workout -d workout --format=custom --no-owner --no-acl \
  > "${backup_file}.partial"
test -s "${backup_file}.partial"
mv "${backup_file}.partial" "$backup_file"
```

Install and run it as root, then schedule it:

```bash
sudo chown root:root /opt/workout-config/backup-postgres.sh
sudo chmod 700 /opt/workout-config/backup-postgres.sh
sudo /opt/workout-config/backup-postgres.sh
sudo crontab -e
```

Add this line (03:15 in the VPS's configured timezone):

```cron
15 3 * * * /opt/workout-config/backup-postgres.sh >> /var/log/workout-backup.log 2>&1
```

Set up encrypted off-server copying to storage you control, with credentials separate from application keys; until that is done, a lost VPS can lose every backup. Choose retention and backup frequency from your acceptable data-loss window: daily dumps can lose almost 24 hours. For example, retain 7 daily and 4 weekly verified off-server copies. Monitor backup age and failures externally; cron output alone is not an alert. Securely back up production config, the release identifier, and Caddy state too. Use provider snapshots as an additional recovery layer, not a substitute for tested logical backups.

Test a restore into an isolated database, never over the live one:

```bash
workout-compose exec -T db createdb -U workout workout_restore_test
workout-compose exec -T db pg_restore \
  -U workout -d workout_restore_test --no-owner --no-acl --exit-on-error --single-transaction \
  < /opt/workout-backups/REPLACE_WITH_BACKUP_FILENAME.dump
workout-compose exec -T db psql -U workout -d workout_restore_test -c 'SELECT count(*) FROM profile;'
workout-compose exec -T db dropdb -U workout workout_restore_test
```

Verify additional critical tables and schema versions before dropping the test database. Periodically perform a full restore drill on a separate VPS, including configuration and application startup. Redis AOF protects normal restarts but can lose recent writes after a crash; it is not a substitute for queue recovery or backups if pending-job preservation matters.

### Deploying a later app version

1. Record the existing release file and retain its images. Fetch and check out the new commit. Update `/opt/workout-config/release` to that commit SHA.
2. Run `workout-compose build api web` while the old containers continue serving. If a build fails, restore the old release file and investigate.
3. Enter maintenance by stopping Caddy/web/API, let the worker finish its queue, inspect registries, then stop the worker. Take a database backup.
4. Run `workout-compose run --rm --no-deps api alembic upgrade head`.
5. Start `workout-compose up -d api worker web caddy` and repeat health/authentication/generation checks.

A failed migration is a stop condition. Rolling back images does not undo a schema migration; assess compatibility and restore the pre-update database only with a deliberate plan for any subsequent writes. Avoid automatic database major-version upgrades or volume deletion. Pin infrastructure image digests after rehearsal for controlled upgrades, and update them through a tested maintenance process.

### Operating checks

```bash
workout-compose ps
workout-compose logs --tail=200 api worker web caddy
sudo docker stats --no-stream
df -h
free -h
sudo systemctl status docker
```

Set up external HTTPS uptime monitoring and alerts for disk space, memory pressure, backup freshness, and queued/failed RQ jobs. Keep Ubuntu security updates enabled and schedule reboots when required. Reboot once during rehearsal and verify all services return; `unless-stopped` restarts running services after reboot but intentionally stopped services remain stopped. An unhealthy container is not automatically restarted solely because its health check fails.

## 13. Optional Langfuse migration

The core Compose file intentionally omits Langfuse. Leaving its three app variables blank selects the repository's no-op recorder. If monitoring is required, complete this branch before considering the migration finished.

Langfuse in this repository uses **six additional services**: web, worker, its own PostgreSQL, ClickHouse, Redis, and MinIO. See [`langfuse.md`](./langfuse.md) for the existing setup, retention, and per-model pricing. Budget and load-test additional resources; the core sizing estimate does not cover it.

Choose one path:

- Keep an existing reachable Langfuse deployment temporarily and configure its URL/keys on both API and worker. A Railway private hostname cannot be used from the VPS; provide a secured reachable endpoint.
- Deploy Langfuse separately on the VPS or another host, using its supported production configuration. Give it separate volumes/databases, strong secrets, HTTPS for ingestion, and restricted operator access.
- Start a new monitoring instance and retain/export the old history separately if that is acceptable.

To preserve history, inventory and migrate **all** required stores together, including ClickHouse and object storage, using a version-matched procedure from the Langfuse deployment documentation linked in the existing guide. Copying only its PostgreSQL database is insufficient. Preserve encryption keys/salts and project credentials, drain ingestion before the final copy, validate traces and model costs, and reapply the documented retention/erasure controls. Do not delete the old stack until that validation is complete.

## 14. Troubleshooting

| Symptom | Check and fix |
|---|---|
| Caddy returns 502 | Check `web` logs, its startup, and proxy target `web:3000`; verify private API health separately. |
| Certificate issuance fails | Check A/AAAA records, authoritative DNS, ports 80/443, CAA restrictions, and any DNS proxy. Wait for propagation rather than repeatedly deleting Caddy state. |
| Sign-in fails or creates an apparently new profile | Verify the original Clerk instance, domain configuration, build-time publishable key, runtime secret, issuer, and JWKS URL. |
| API cannot connect to PostgreSQL | Use `postgresql+psycopg://` for the app and service name `db`; URL-encode non-hex passwords. Changing `POSTGRES_PASSWORD` does not change an existing database role's password. |
| Generation remains pending | Inspect worker logs, `rq info`, registries, provider credentials, and that API/worker share Redis DB 0 and queue `generation`. |
| Restore reports existing relations | App migrations or an earlier restore populated the target; use the explicit rehearsal reset procedure only on the intended VPS database. |
| Build exits 137 / process killed | Check memory and kernel OOM logs; increase resources or build on CI for the VPS architecture. |
| App cannot reach Clerk/AI | Check outbound HTTPS/DNS, system time, and provider keys. Do not mark the whole Compose network `internal: true` without an egress design. |
| Disk fills | Inspect Docker logs, images, backups, PostgreSQL and Redis growth; preserve rollback images and live volumes when cleaning up. |

## Completion checklist

- [ ] Same production Clerk identities and application data verified.
- [ ] Final database dump taken after all Railway writes stopped.
- [ ] Queue drained; failed/deferred work accounted for.
- [ ] DNS and HTTPS work on desktop, mobile, and an installed PWA.
- [ ] Existing history, a new saved workout, and uncached generation tested.
- [ ] Only SSH and Caddy ports reachable from outside.
- [ ] Backup schedule, encrypted off-server storage, alerts, and restore drill verified.
- [ ] Reboot recovery tested; release/configuration and rollback images retained.
- [ ] Langfuse migrated or its temporary disposition documented.
- [ ] Railway retired only after the observation period and rollback decision.
