# Model-routed development workflow

Use this workflow for a change to Workout Manager. The issue, code, and review record are the handoff between tools. This guide routes development assistants; it does **not** change the models used by Workout Manager's own AI generation (`AI_PROVIDER` / `AI_MODEL`).

## One-time setup

1. Keep `CLAUDE.md` as the repository map, `CONTEXT.md` as the domain language, `REVIEW.md` as the invariant checklist, and relevant `docs/adr/` files as decisions. `AGENTS.md` points Codex to them; avoid copying their contents into prompts.
2. Make Matt Pocock's skills available in each tool you will use. In Codex, run `npx skills@latest add mattpocock/skills`, select the skills below and Codex as the target. In Claude Code, either use its managed plugin (`claude plugins install mattpocock-skills`) **or** select Claude Code in the `npx skills` installer. Choose one installation method for Claude Code to avoid duplicate skills. If the skills are already installed, keep that installation. Run `/setup-matt-pocock-skills` once per tool/repository when needed; choose GitHub as issue tracker and `docs/` for documents. Confirm availability with the tool's skills list before relying on a skill name. See the [upstream installation guide](https://github.com/mattpocock/skills#installation-30-second-setup).
3. Select the model per **session**, not as a global repository default. Codex: `codex -m gpt-6-astra` for specification/review, or `codex -m gpt-6-sol` for an OpenAI-only implementation. Claude Code: `claude --model sonnet` for implementation; confirm the active model with `/model`. Aliases and account availability can change.
4. Authenticate each CLI with its subscription if that is how you intend to pay. API keys and gateways may use separate metered billing. Check the active credential and usage dashboard before a long run.

## Default route

| Stage | Model and tool | Skills / evidence | Exit condition |
| --- | --- | --- | --- |
| Specify | Astra in Codex | Read repository context; you invoke `/grill-with-docs` if requirements are ambiguous, then `/to-spec` after setup to publish the agreed spec as a GitHub issue | One issue links affected journeys, acceptance criteria, edge cases, non-goals, and relevant ADRs |
| Slice (if needed) | Astra or Sol in Codex | You invoke `/to-tickets` for work too large for one focused PR | Each ticket has an independently testable result and dependencies |
| Implement | Claude Sonnet in Claude Code | Read the issue and repository context; use `/tdd` for behavior changes; run the narrow relevant checks | Small branch, passing tests, implementation notes, and a PR/diff against a recorded base commit |
| Review | Astra in Codex, fresh session | Review against the issue, `REVIEW.md`, `CONTEXT.md`, ADRs, and `git diff <base>...HEAD`; use `/code-review` for consequential changes if available | Prioritized findings with file/line, impact and evidence; any blocker is fixed and rechecked |

Use one implementing model at a time for a given branch. Do not pass a long chat transcript to the next tool: hand over the issue URL, branch name, base SHA, changed files, checks, and unresolved decisions. Keep CI and human review as merge gates. For a typo or isolated documentation change, skip the spec and second-model review; for auth, user data, generation safety, or a domain invariant, keep the full route.

Matt's `/implement` skill already finishes by calling `/code-review`, which can spawn two parallel review agents. If you invoke `/implement`, count that review as an implementation-stage check and only request an additional Astra review for a consequential diff or a suspected gap. The default route above uses `/tdd` without `/implement` so the final review can be assigned deliberately to Astra. `/code-review` needs a **fixed point and spec source**; give it both explicitly instead of paying for discovery or waiting for a clarification.

## Prompts for each handoff

Replace the bracketed fields. These are prompts for interactive sessions, not unattended scripts.

### 1. Specification — Codex, Astra

> Read `CLAUDE.md`, `CONTEXT.md`, `REVIEW.md`, and the ADRs relevant to [feature]. Inspect the current code for [journey]. If my intended behavior is ambiguous, tell me to invoke `/grill-with-docs`; when clarified, tell me to invoke `/to-spec` to create a GitHub issue. Include the current behavior, user outcome, acceptance criteria, failure and offline cases where relevant, affected domain invariants, explicit exclusions, and verification steps. Keep the implementation small enough for one PR or propose `/to-tickets`. Record the issue URL and main-branch SHA. Do not implement yet.

### 2. Implementation — Claude Code, Sonnet

> Implement [issue URL] on a feature branch based on [base SHA]. Read `CLAUDE.md`, `CONTEXT.md`, `REVIEW.md`, and only the relevant ADRs and source files. Respect the plan/record split, unperformed-tail rule, sensitive-constraint cache bypass, and the seams described in `CLAUDE.md` where this change touches them. Use `/tdd` at behavioral seams. Keep the diff limited to the issue. Run the focused backend/frontend checks and report commands and results. Produce a handoff with branch, base SHA, changed files, remaining risks, and any decision that differs from the spec. Do not merge.

### 3. Independent review — Codex, Astra

> Review [branch or PR] against fixed point [base SHA] and spec [issue URL]. Read `REVIEW.md`, `CONTEXT.md`, relevant ADRs, and the changed code. Use `/code-review` if available; otherwise perform its standards and spec checks directly. Focus on correctness, authorization, offline/retry behavior where applicable, test coverage of changed behavior, and contradictions with the spec. Cite each finding with a file and line, consequence, and the evidence that establishes it. Distinguish blockers from suggestions. Run focused checks only to resolve a concrete uncertainty. Do not rewrite the feature during review.

### 4. Fix and close

Give actionable blockers back to the implementing session with the review link. Fix them there, rerun relevant checks, and ask Astra to verify the *new diff since the reviewed commit*; do not rereview the entire codebase. Record the final SHA, CI result, and any accepted residual risk in the PR.

## Subscription and usage policy

- **Existing Claude subscription:** try Astra → Sonnet → Astra. This spreads work across the two included allowances, but a second subscription is an added fixed cost; included limits are not interchangeable.
- **No Claude subscription:** try Astra → GPT-6 Sol → Astra first. The same skills can be installed for Codex. Add Claude Pro only if Sonnet materially improves your measured throughput, reliability, or usage headroom.
- **High-volume, narrow tasks:** try a focused lower-cost model (for example GPT-6 Luna) for classification, file discovery, or mechanical edits; escalate if it fails an acceptance criterion. Do not use Astra for repeated formatting, every test failure, or routine retries.
- **Budget rule:** restrict the first Astra pass to a finished spec and the second to a bounded diff. Start the review in a fresh session with an explicit base SHA. Avoid a second independent review after an exhaustive `/implement` review unless risk justifies it. Prefer standard speed and default reasoning effort, increasing effort only for a hard decision.
- **Compare after two weeks:** for each change record model, stage, time, subscription or metered spend, whether a limit interrupted work, review blockers, and rework cycles. Compare cost per *accepted* change and completion time, not token prices alone. Check live plan limits before changing subscriptions.

Subscription access does not grant API credits automatically. Anthropic documents `/usage` for subscriber allowance; OpenAI documents the Work/Codex usage dashboard and shared allowance. Do not put provider API keys, CLI credentials, or application `AI_PROVIDER` settings into this workflow file.

## Sources to revisit when models or billing change

- [Matt Pocock skills installation and skill map](https://github.com/mattpocock/skills)
- [OpenAI model selection](https://learn.chatgpt.com/docs/models) and [Codex pricing and usage](https://learn.chatgpt.com/docs/pricing)
- [Claude Code model configuration](https://code.claude.com/docs/en/model-config), [usage tracking](https://code.claude.com/docs/en/costs), and [subscription pricing](https://claude.com/pricing)
