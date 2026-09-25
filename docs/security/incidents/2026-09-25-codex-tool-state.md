# Codex tool-state exposure remediation

- **Source finding:** `docs/research/audit/2026-09-24.md` rank 1
- **Introduced by:** `a19fde3bfa2eb61485481ac7ee831991af85b8c6`
- **Remediation base:** `a4021906c353f4e1c478bfb51a74c64ede2fb566`

No credential values are recorded in this document.

## Inspection

The tracked `.codex` tree contained 220 files (about 73 MB), including OAuth
state, session transcripts, shell snapshots, caches, SQLite databases, and WAL
files. Gitleaks 8.30.1 scanned an exported `HEAD` snapshot with full redaction
and reported 48 findings:

- 34 JWT findings. The OpenAI access and ID tokens and the observed ephemeral
  gateway tokens were expired by 25 September 2026.
- 13 generic findings, all classified as non-secret identifiers, public Clerk
  configuration, or prose after inspecting redacted match context.
- One Artifactory-shaped false positive inside encoded image data.

The opaque OpenAI refresh token has no inspectable expiry and still requires
account-side revocation. Removing the file or running local `codex logout` is
not evidence of revocation.

## Containment

- Remove the complete `.codex` tree from Git tracking without deleting local
  runtime state.
- Root-ignore `/.codex/`.
- Reject any pushed tip that still tracks `.codex`.
- Scan outgoing commits locally and every pushed commit range in CI with
  Gitleaks, including merge second parents.
- Enable GitHub native push protection and verify it with GitHub's documented
  dummy secret after repository-owner authentication is restored.

## History decision

Do not rewrite history solely for the credential after provider-side
revocation is verified. GitHub recommends revocation first and notes that it
can make a disruptive rewrite unnecessary. This repository has more than 400
descendant commits plus multiple retained refs, so a rewrite has substantial
recontamination and coordination cost.

Revisit that decision if account-side revocation cannot be verified or if a
later privacy review finds non-revocable confidential material in the session
or database artifacts. In that case, remove the entire `.codex` path from all
refs with `git-filter-repo`, coordinate collaborator cleanup, and ask GitHub
Support to purge cached views and affected pull-request references.

## Closure evidence still required

- [ ] Provider-side revocation confirmed; the exposed refresh credential can
  no longer mint access.
- [ ] The cleanup commit is present on every retained branch whose tip still
  contains `.codex`.
- [ ] GitHub native secret scanning and push protection are enabled.
- [ ] A GitHub push containing the official dummy secret is rejected without
  creating a remote ref.
