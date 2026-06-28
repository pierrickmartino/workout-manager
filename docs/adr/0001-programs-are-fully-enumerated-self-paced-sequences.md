# 0001 — Programs are fully-enumerated, self-paced sequences

A Program enumerates every Session for every week up front, rather than repeating a weekly template. This makes per-week progression and deload weeks first-class (Week-2-Push and Week-5-Push are genuinely distinct Sessions) at the cost of larger AI generations, which the caching layer (see §6 of the idea doc) is intended to absorb. The user sets the number of weeks.

Sessions are followed as a **self-paced ordered sequence**: the "next" session is simply the next un-performed one. There is **no calendar binding in v1** — Week/Day labels are descriptive, not date commitments — which deliberately avoids missed-session reconciliation and calendar reshuffling. Reminders or calendar binding can layer on later without changing the model.

Plans and records are modeled as separate concepts: Program / Session / Exercise Prescription describe what was *prescribed*; Logged Session / Logged Set describe what was actually *performed*. The same plan can be performed many times, each producing its own record.
