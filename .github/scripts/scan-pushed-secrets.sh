#!/usr/bin/env bash
set -euo pipefail

zero_oid=0000000000000000000000000000000000000000
head_oid=${GITHUB_SHA:?GITHUB_SHA is required}

if [[ ${GITHUB_EVENT_NAME:?GITHUB_EVENT_NAME is required} == pull_request ]]; then
  base_oid=$(jq -r '.pull_request.base.sha' "$GITHUB_EVENT_PATH")
  head_oid=$(jq -r '.pull_request.head.sha' "$GITHUB_EVENT_PATH")
else
  base_oid=$(jq -r '.before' "$GITHUB_EVENT_PATH")
fi

# A force-push rewrites the ref, so the push event's `.before` names a commit the branch no
# longer reaches — and `actions/checkout` fetches only reachable history, so the object is
# absent from the runner's clone. `git rev-list "$base_oid..$head_oid"` then exits 128 and,
# under `set -e`, fails the job having scanned nothing at all. Treat an absent base exactly as
# a brand-new branch and let the merge-base fallback below pick the range: that scans every
# commit the branch introduces, a *superset* of the push range, so the control is widened
# rather than silenced. A ref whose base is genuinely unreachable must never read as clean.
if [[ -n $base_oid && $base_oid != "$zero_oid" ]] &&
  ! git cat-file -e "${base_oid}^{commit}" 2>/dev/null; then
  base_oid=$zero_oid
fi

if [[ $base_oid == "$zero_oid" ]]; then
  default_branch=$(jq -r '.repository.default_branch' "$GITHUB_EVENT_PATH")
  base_oid=$(git merge-base "$head_oid" "origin/$default_branch" || true)
fi
if [[ -n $base_oid ]]; then
  scan_range="$base_oid..$head_oid"
  introduced_commits=$(git rev-list "$scan_range")
else
  scan_range=$head_oid
  introduced_commits=$(git rev-list "$head_oid")
fi

for commit_oid in $introduced_commits; do
  if git ls-tree -r --name-only "$commit_oid" -- .codex | grep -q .; then
    echo "commit $commit_oid introduces forbidden .codex runtime state" >&2
    exit 1
  fi
done

gitleaks git . \
  --config .gitleaks.toml \
  --log-opts "$scan_range" \
  --no-banner \
  --redact
