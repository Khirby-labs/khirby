#!/usr/bin/env bash
# Tag a release of @khirby/forms-* packages to npm (GitHub Actions).
#
# Tag formats (push to origin):
#   khirby-forms@0.1.0     — forms-client + forms-ui + payload-forms (recommended)
#   forms-client@0.1.1     — @khirby/forms-client only
#   forms-ui@0.1.0         — @khirby/forms-ui only
#   payload-forms@0.1.0    — @khirby/payload-forms only
#
# Bump versions in packages/*/package.json before tagging.
# Workflow: .github/workflows/npm-publish.yml
# Required GitHub secret: NPM_TOKEN

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAG="${1:-}"
if [ -z "$TAG" ]; then
  echo "Usage: $0 <tag>"
  echo "Example: $0 khirby-forms@0.1.0"
  exit 1
fi

case "$TAG" in
  khirby-forms@*|forms-client@*|forms-ui@*|payload-forms@*) ;;
  *)
    echo "Unexpected tag '$TAG' (expected khirby-forms@… / forms-client@… / forms-ui@… / payload-forms@…)"
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
