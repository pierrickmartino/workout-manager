# 0014 — Record Session Duration, guarded by an idle-timeout

**Status:** proposed

ADR-0011 dropped "avg time" from Analytics for *no honest basis* — no per-session duration was ever captured. F2's Live Session is the first time the app knows how long a real workout took, so we **record Session Duration** on Logged Sessions performed live: measured from start to **last activity**, deliberately excluding idle gaps, so it reflects time actually training rather than wall-clock time with the phone locked. A gap of inactivity longer than 30 minutes **auto-ends the Live Session as Incomplete** (ADR-0013), preserving the sets done so far. The idle cap is precisely what bounds the duration's dishonesty and gives a future average-workout-time figure an honest basis — **refining ADR-0011's refusal**.

## Considered options

**Not recording duration at all** (treat the elapsed timer as a throwaway live aid) was the initial instinct, because a naive `finish − start` wall-clock number lets a locked phone report a 14-hour "workout." The idle-timeout removes that objection: any duration that survives to be recorded is bounded, so the metric becomes defensible rather than fabricated.

## Consequences

- Session Duration is known only for **live-tracked** performances; it is absent when a performance is logged after the fact through the static form.
- Enforcement is on **resume**, not in the background: a client-only app (ADR-0012) cannot fire a timer while backgrounded, so the 30-minute gap is evaluated on the next foreground — the user experiences "I came back after 40 minutes and it had ended my workout."
- Sub-30-minute interruptions still inflate duration slightly (a 20-minute mid-workout phone call adds 20 minutes); tolerated as bounded noise for v1.
