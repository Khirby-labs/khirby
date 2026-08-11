#!/usr/bin/env bash
# Tag a release of @khirby/plugin-sdk + @khirby/plugin-host to npm (GitHub Actions).
#
# Tag formats (push to origin):
#   khirby-plugins@1.0.0  — publish both (recommended)
#   plugin-sdk@1.0.1      — publish only @khirby/plugin-sdk
#   plugin-host@1.0.1     — publish only @khirby/plugin-host
#
# Bump versions in packages/plugin-*/package.json before tagging.
# Workflow: .github/workflows/npm-publish.yml
# Required GitHub secret: NPM_TOKEN

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
if [ -z "$TAG" ]; then
  echo "Usage: $0 <tag>"
  echo "Example: $0 khirby-plugins@1.0.0"
  exit 1
fi

case "$TAG" in
  khirby-plugins@*|plugin-sdk@*|plugin-host@*) ;;
  *)
    echo "Unexpected tag '$TAG' (expected khirby-plugins@… / plugin-sdk@… / plugin-host@…)"
    exit 1
    ;;
esac

git status --porcelain | grep -q . && {
  echo "Working tree is dirty — commit changes before tagging."
  exit 1
}

git tag -a "$TAG" -m "Release $TAG"
git push origin "HEAD"
git push origin "$TAG"
echo "Pushed $TAG — watch Publish npm packages on GitHub Actions."
