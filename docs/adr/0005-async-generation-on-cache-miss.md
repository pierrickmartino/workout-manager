# 0005 — Generation is async on cache-miss; Redis backs cache + queue

AI generation runs off the HTTP request path. The idea doc (§8) lists Redis and RQ as "only if needed"; this decision resolves them to **needed**.

A generation request checks the cache first:

- **Cache hit** → return immediately and **Adopt** by copy. No job, no queue, instant. This is the common case the §6 cache is designed to make frequent.
- **Cache miss** → enqueue an **RQ** job and return a job id. The mobile PWA polls (or subscribes) for completion. When the job finishes, the Generated artifact is stored in the cache and Adopted.

**Redis backs both** the §6 generation cache and the RQ job queue.

Chosen over synchronous generation because a fully-enumerated multi-week Program (ADR 0001) is a long LLM call, and holding an HTTP connection open for it is fragile — especially for the mobile-first PWA (§8) where connections drop. All cache-misses route through the single async path to keep one predictable mechanism (KISS), rather than special-casing lighter generations as synchronous.

## Considered Options

- **Synchronous generation in v1, async later** — rejected: request timeouts and dropped mobile connections during long generations make it fragile from day one, and retrying a failed long generation wastes AI spend.
