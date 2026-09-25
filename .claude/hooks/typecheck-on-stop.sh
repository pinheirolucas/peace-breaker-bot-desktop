#!/usr/bin/env bash
# Stop hook: runs `pnpm typecheck` once at the end of a turn that changed
# TypeScript. Vite and tsup strip types without checking them, so nothing
# else would tell the agent. Exit 2 hands the errors back to Claude.
set -uo pipefail

input=$(cat)
# Already continuing because of this hook: don't loop.
if grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true' <<<"$input"; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

changes=$(git status --porcelain -- '*.ts' '*.tsx' '*.mts' 2>/dev/null)
[ -z "$changes" ] && exit 0

# Skip when the TypeScript changes are the same as at the last clean run.
stamp="$(git rev-parse --git-dir)/claude-typecheck-stamp"
fingerprint=$( { git rev-parse HEAD; git diff HEAD -- '*.ts' '*.tsx' '*.mts'; git ls-files --others --exclude-standard -- '*.ts' '*.tsx' '*.mts' | xargs cat 2>/dev/null; } | shasum | cut -d' ' -f1)
[ -f "$stamp" ] && [ "$(cat "$stamp")" = "$fingerprint" ] && exit 0

if output=$(pnpm --silent typecheck 2>&1); then
  echo "$fingerprint" > "$stamp"
  exit 0
fi

{
  echo "pnpm typecheck failed. Fix these type errors before finishing:"
  echo "$output" | grep -E 'error TS' | head -20
} >&2
exit 2
