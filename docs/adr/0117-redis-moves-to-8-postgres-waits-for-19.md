# 0117 — Redis moves to 8; Postgres stays on 16 until 19

**Status:** proposed. The Redis half ships with this change. The Postgres half is a
recommendation on research Q6 (2026-10-05) and needs the owner's sign-off.

Both datastores float on a major tag: `redis:7-alpine` and `postgres:16-alpine`. Research Q6
asked whether to move them. The two answers differ because the two moves cost very
different amounts.

## Redis: move to 8 now

Our Redis holds only the Generation Cache (ADR-0003) and the RQ queue (ADR-0005), both
rebuildable. Nothing durable lives there, so a major costs little. Checked on 2026-10-07:

- `redis:8-alpine` (8.10.2) with the VPS guide's flags (`--appendonly yes`, `noeviction`):
  `RedisCacheStore` round-trips a UTF-8 payload, and an RQ job runs pending → worker →
  complete through `RqJobQueue.get_state`, on redis-py 8.1.0 and RQ 2.12.0.
- A volume written by `redis:7-alpine` (7.4.11) with AOF loads in place under 8.10.2. A cached
  key and a queued job both survive, so the deploy is an image swap with no flush.
- 8.x is the line that receives the 2025–2026 security fixes (research Sec #8). The bundled
  modules (search, JSON, bloom, time series) load by default and are unused.
- Redis 8 is tri-licensed RSALv2 / SSPLv1 / AGPLv3. We run it unmodified as an internal,
  unexposed service, so none of the three licenses asks anything of us.

`langfuse-redis` stays on 7. It belongs to the Langfuse stack (ADR-0039) and follows
Langfuse's self-hosting requirements, not ours.

## Postgres: stay on 16, then go straight to 19

PostgreSQL 16 is supported until November 2028, and the image is patched (16.15+ on
re-pull). A major is not an image swap:

- It needs the dump-and-restore path in `docs/deployment/hostinger-vps.md`. That means
  downtime, a `pg_dump` client at least as new as the server, and a restore drill (TASKS §7
  §14, still open).
- The 18+ images change the data-volume layout (`PGDATA` under a versioned path), so changing
  `16` in the YAML alone is wrong, as the VPS guide already warns.
- 18 has nothing we need. We use no feature newer than 16.

**Recommendation:** keep 16. Plan a single 16 → 19 migration once 19 is GA and has had its
first minor release, alongside the backup restore drill so the migration also tests it.
Going through 18 would mean two migrations for no gain.

## Consequences

- Only `docker-compose.yml`'s app `redis` service and the VPS / Railway guides change. On
  Railway the managed Redis plugin picks its own version, so check it there.
- An existing VPS install keeps its own Compose file, so it moves to 8 only through the
  guide's "Moving an existing install to Redis 8" steps. The move is one-way for the data:
  Redis 7 can't read Redis 8's RDB format (version 15), so a rollback starts Redis 7 on an
  empty volume after draining the queue.
- When 19.1 ships, open the migration ticket: the dump with a 19 client, the new volume
  layout, `alembic upgrade head` against a restored copy, and the restore drill.
- If the owner prefers 18 now, the same ticket applies with 18 in place of 19.
