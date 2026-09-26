#!/usr/bin/env bash
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/workout-manager-secret-test.XXXXXX")
trap 'rm -rf "$test_root"' EXIT

source_repo=$test_root/source
remote_repo=$test_root/remote.git
mkdir -p "$source_repo"
git init --bare --quiet "$remote_repo"
git -C "$source_repo" init --quiet --initial-branch=main
git -C "$source_repo" config user.name Secret-Test
git -C "$source_repo" config user.email secret-test@example.invalid
git -C "$source_repo" config core.hooksPath .githooks
git -C "$source_repo" remote add origin "$remote_repo"
cp -R "$repo_root/.githooks" "$source_repo/.githooks"
cp "$repo_root/.gitleaks.toml" "$source_repo/.gitleaks.toml"
cp "$repo_root/.gitleaksignore" "$source_repo/.gitleaksignore"

printf 'clean\n' >"$source_repo/README.md"
git -C "$source_repo" add README.md .githooks .gitleaks.toml .gitleaksignore
git -C "$source_repo" commit --quiet -m baseline
git -C "$source_repo" push --quiet --set-upstream origin main
baseline_oid=$(git --git-dir="$remote_repo" rev-parse refs/heads/main)

token_field=access_token
token_value=codex_test_123456789012345678901234567890
printf '{"%s":"%s"}\n' "$token_field" "$token_value" >"$source_repo/representative.json"
git -C "$source_repo" add representative.json
git -C "$source_repo" commit --quiet -m representative-secret

if git -C "$source_repo" push --quiet origin main >/dev/null 2>&1; then
  echo "expected representative-secret push to be blocked" >&2
  exit 1
fi

remote_oid=$(git --git-dir="$remote_repo" rev-parse refs/heads/main)
if [[ $remote_oid != "$baseline_oid" ]]; then
  echo "blocked push unexpectedly changed the remote ref" >&2
  exit 1
fi

git -C "$source_repo" reset --quiet --hard "$baseline_oid"
git -C "$source_repo" checkout --quiet -b secret-side
printf '{"%s":"%s"}\n' "$token_field" "$token_value" >"$source_repo/representative.json"
git -C "$source_repo" add representative.json
git -C "$source_repo" commit --quiet -m second-parent-secret
git -C "$source_repo" checkout --quiet main
printf 'clean merge parent\n' >"$source_repo/clean.txt"
git -C "$source_repo" add clean.txt
git -C "$source_repo" commit --quiet -m clean-parent
before_merge_oid=$(git -C "$source_repo" rev-parse HEAD)
git -C "$source_repo" merge --quiet --no-ff --no-commit secret-side
git -C "$source_repo" rm --force --quiet representative.json
git -C "$source_repo" commit --quiet -m merge-with-secret-removed
merge_oid=$(git -C "$source_repo" rev-parse HEAD)
printf '{"before":"%s","repository":{"default_branch":"main"}}\n' \
  "$before_merge_oid" >"$test_root/push-event.json"

if (cd "$source_repo" && GITHUB_EVENT_NAME=push \
  GITHUB_EVENT_PATH="$test_root/push-event.json" GITHUB_SHA="$merge_oid" \
  "$repo_root/.github/scripts/scan-pushed-secrets.sh" >/dev/null 2>&1); then
  echo "expected second-parent secret to be detected" >&2
  exit 1
fi

git -C "$source_repo" reset --quiet --hard "$baseline_oid"
mkdir -p "$source_repo/.codex"
printf 'runtime state\n' >"$source_repo/.codex/state"
git -C "$source_repo" add --force .codex/state
git -C "$source_repo" commit --quiet -m tracked-tool-state
git -C "$source_repo" rm --quiet .codex/state
git -C "$source_repo" commit --quiet -m remove-tracked-tool-state
removed_state_oid=$(git -C "$source_repo" rev-parse HEAD)
printf '{"before":"%s","repository":{"default_branch":"main"}}\n' \
  "$baseline_oid" >"$test_root/tool-state-event.json"

if (cd "$source_repo" && GITHUB_EVENT_NAME=push \
  GITHUB_EVENT_PATH="$test_root/tool-state-event.json" GITHUB_SHA="$removed_state_oid" \
  "$repo_root/.github/scripts/scan-pushed-secrets.sh" >/dev/null 2>&1); then
  echo "expected add-then-delete .codex history to fail CI scanning" >&2
  exit 1
fi

if git -C "$source_repo" push --quiet origin main >/dev/null 2>&1; then
  echo "expected add-then-delete .codex push to be blocked" >&2
  exit 1
fi

git -C "$source_repo" reset --quiet --hard "$baseline_oid"
mkdir -p "$source_repo/.codex"
printf 'runtime state\n' >"$source_repo/.codex/state"
git -C "$source_repo" add --force .codex/state
git -C "$source_repo" commit --quiet -m tracked-tool-state

if git -C "$source_repo" push --quiet origin main >/dev/null 2>&1; then
  echo "expected tracked .codex push to be blocked" >&2
  exit 1
fi

echo "secret-scanning push checks passed"
