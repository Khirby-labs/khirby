#!/usr/bin/env bash
# Clone first-party plugins into ./plugins (gitignored).
# Repo: https://github.com/Khirby-labs/plugins
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="$ROOT/plugins"
REPO="${KHIRBY_PLUGINS_REPO:-git@github.com:Khirby-labs/plugins.git}"

if [ -d "$TARGET/.git" ]; then
  echo "plugins/ already a git checkout — pull"
  git -C "$TARGET" pull --ff-only
  exit 0
fi

if [ -e "$TARGET" ] && [ "$(ls -A "$TARGET" 2>/dev/null | wc -l)" -gt 0 ]; then
  echo "plugins/ exists and is not empty (and not a git repo). Move it aside and re-run."
  exit 1
fi

git clone "$REPO" "$TARGET"
echo "Cloned plugins into plugins/"
