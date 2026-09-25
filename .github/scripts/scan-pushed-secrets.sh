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
