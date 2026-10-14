# An AI Hand-off is an on-device, previewed text projection of one Logged Session

Hevy 3.1.14 (September 2026) sends a finished workout to ChatGPT or Claude. Research 10-05
Q3 asked whether we want the same, given that it makes it easy to move health data into a
third-party assistant. We do. An **AI Hand-off** turns one Logged Session into plain text,
built for asking an outside AI for a critique of that session. The user sees the full
text before it leaves, and they send it themselves through the device's share sheet or
clipboard. We never call a third party on their behalf, and nothing is stored.

- **On-device only.** The hand-off uses the Web Share sheet, or the clipboard where
  sharing isn't available. There are no prefilled deep links (`chatgpt.com/?q=`,
  `claude.ai/new?q=`): a URL puts health data in browser history and server logs, has a
  length limit, and depends on undocumented vendor parameters. The UI names no vendor:
  the button reads "Send to an AI".
- **Always previewed.** A bottom sheet shows the full read-only text before every send,
  with a permanent line: the text leaves Workout Manager, and the AI app it goes to
  handles it under its own terms. This disclosure is never dismissed, so it needs no
  stored flag.
- **One Logged Session, from the record.** The action lives on the Logged Session
  detail page in history, so the text is built from the stored record. Any past session
  qualifies, of every Training Type and every Completion Outcome; the text states the
  outcome. It is never built from Live Session state, so a finish still waiting in the
  outbox (ADR-0060) has no hand-off until it is recorded.
- **Plan and record never merge.** When the Logged Session was made from a plan, the
  text carries two labelled blocks, *Prescribed* and *Performed*. A plan-less session
  carries *Performed* only.
- **What goes in.** Exercises, sets by their quantity kind, Load by its type in the
  user's Weight Unit, logged Effort, outcome, duration and Set Notes. Also the plan's
  objective when there is a plan, and the user's **Declared** Fitness Level for that
  Training Type. Left out: the exact date, body weight (unless a bodyweight Load needs
  it), the **Effective** Fitness Level, and our Progression decision for the Next
  Session. The last two are internal judgements; offering them for an outside second
  opinion would set two coaches against each other.
- **A lead-in, in plain words.** The text opens with an instruction the user can delete
  ("critique this session…") and speaks plain gym language, not our domain terms. It is a
  translation for an outside reader. GLOSSARY still governs the code and the UI around
  the sheet, and the payload's words do not belong in the terminology guard.
- **Sensitive Constraints never go in automatically, and the caveat is mandatory.** For a
  user with any Sensitive Constraint, the sheet always says the text does not include
  their health constraints, the outside AI doesn't know about them, and their clinician's
  advice comes first. When the profile can't be read, the caveat shows anyway: an unread
  profile can't rule a Sensitive Constraint out, so the hand-off fails safe.
- **A read-time projection.** The text is built in the web app from data the detail page
  already holds (ADR-0018 style). There is no endpoint, no stored copy and no usage log.

**Why the caveat, and why not a block.** ADR-0003's bypass guards against the system
*silently* serving shared content. A hand-off is a deliberate act the user takes with
their own data, which they can already take off the platform whole through Export
(ADR-0062). Blocking it for Sensitive-Constraint users would be paternalistic. The real
danger is ADR-0058's: advice that looks tailored but isn't. An outside AI critiquing a
postpartum or rehab session without knowing that context is exactly that. So, as with a
Redeemed Share, the act is allowed and the caveat is load-bearing.

## Considered options

- **Don't build it; point users at Export.** Rejected: Export is a whole-account file,
  not a per-session question to an assistant, and the data is the user's either way.
- **Deep links, one tap to a named assistant.** Rejected for the URL exposure and
  undocumented parameters above.
- **A toast after finishing.** Rejected for v1: it needs a second builder over unsaved
  client state, which would drift from the record-based one.
- **An opt-in "include my constraints" checkbox.** Rejected for v1: it is the most
  sensitive possible payload, and the user can type the context after reading the caveat.
- **A one-time dismissible disclosure.** Rejected once the preview became mandatory: a
  permanent line costs nothing and needs no per-device or per-account flag.

## Consequences

- **AI Hand-off is a third act, distinct from Export and Share.** Export is whole-account
  portability; Share hands a plan to another user by copy. Neither name fits this.
- **The builder is one tested projection** in `apps/web/lib/`, with fixtures per Training
  Type, plan-linked and plan-less sessions, a partial outcome, and the Sensitive-Constraint
  caveat.
- **Wider hand-offs are a new decision.** Several sessions, a running coaching thread, or
  our Progression's reasoning belong with the conversational coach (TASKS §8), not here.
