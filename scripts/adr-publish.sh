#!/usr/bin/env bash
# adr-publish.sh — create a new ADR, save locally AND push to Pokelo
#
# Usage:
#   ./scripts/adr-publish.sh "Short decision title"
#
# Reads POKELO_TOKEN and POKELO_PROJECT_ID from .env (root of monorepo).
# Opens $EDITOR for the ADR body, then saves to docs/adr/ and publishes to Pokelo.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADR_DIR="$REPO_ROOT/docs/adr"
ENV_FILE="$REPO_ROOT/.env"

# ── Load token from .env ────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  POKELO_TOKEN="${POKELO_TOKEN:-$(grep -E '^POKELO_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"' ')}"
  POKELO_PROJECT_ID="${POKELO_PROJECT_ID:-$(grep -E '^POKELO_PROJECT_ID=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"' ')}"
fi

POKELO_TOKEN="${POKELO_TOKEN:-}"
POKELO_PROJECT_ID="${POKELO_PROJECT_ID:-d5fb3b0f-a5e5-44ca-9ec0-d3cc4f50963a}"
POKELO_BASE="${POKELO_BASE:-https://rag.bearly.pro/v1}"

# ── ADR folder parent ID in Pokelo ──────────────────────────────────────────
# "📁 ADR — Architecture Decision Records" folder
POKELO_ADR_FOLDER="${POKELO_ADR_FOLDER:-fc8c2e6b-3412-471f-a0d0-435099594c10}"

# ── Next ADR number ─────────────────────────────────────────────────────────
LAST=$(ls "$ADR_DIR"/[0-9]*.md 2>/dev/null | grep -oE '[0-9]{4}' | sort -n | tail -1 || echo "0000")
NEXT=$(printf "%04d" $(( 10#$LAST + 1 )))

# ── Title ───────────────────────────────────────────────────────────────────
TITLE="${1:-}"
if [[ -z "$TITLE" ]]; then
  echo "Usage: $0 \"Short decision title\""
  exit 1
fi

SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
FILENAME="${NEXT}-${SLUG}.md"
FILEPATH="$ADR_DIR/$FILENAME"
DATE=$(date +%Y-%m-%d)

# ── Write template ──────────────────────────────────────────────────────────
cat > "$FILEPATH" <<EOF
# ${NEXT} — ${TITLE}

- **Status:** Accepted
- **Date:** ${DATE}
- **Deciders:** $(git config user.name 2>/dev/null || echo "?")

## Context

<!-- What is the issue, problem or opportunity being addressed? -->

## Decision

<!-- What was decided and why? -->

## Consequences

<!-- What becomes easier, harder, or possible as a result? -->

## Considered alternatives

<!-- What other options were considered and why were they rejected? -->
EOF

# ── Open editor ─────────────────────────────────────────────────────────────
EDITOR="${EDITOR:-${VISUAL:-vi}}"
echo "Opening $EDITOR — save and close to publish."
$EDITOR "$FILEPATH"

# ── Publish to Pokelo ────────────────────────────────────────────────────────
if [[ -z "$POKELO_TOKEN" ]]; then
  echo "⚠️  POKELO_TOKEN not set in .env — skipping Pokelo publish."
  echo "✅  ADR saved locally: $FILEPATH"
  exit 0
fi

CONTENT=$(cat "$FILEPATH")
FULL_TITLE="${NEXT} — ${TITLE}"

PAYLOAD=$(node -e "
const c = process.argv[1];
const t = process.argv[2];
const pid = process.argv[3];
const date = new Date().toISOString().slice(0,10);
console.log(JSON.stringify({
  jsonrpc: '2.0', id: 1,
  method: 'tools/call',
  params: {
    name: 'create_adr',
    arguments: { projectId: pid, title: t, contentMd: c, status: 'approved', decisionDate: date }
  }
}));
" "$CONTENT" "$FULL_TITLE" "$POKELO_PROJECT_ID")

RESPONSE=$(curl -s -X POST "$POKELO_BASE/mcp" \
  -H "Authorization: Bearer $POKELO_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$PAYLOAD")

DOC_ID=$(echo "$RESPONSE" | grep -o '"documentId":"[^"]*"' | head -1 | cut -d'"' -f4)

if [[ -n "$DOC_ID" ]]; then
  echo "✅  ADR saved locally:  $FILEPATH"
  echo "✅  ADR published to Pokelo: $DOC_ID"
else
  echo "✅  ADR saved locally:  $FILEPATH"
  echo "⚠️  Pokelo publish failed — check token. Response: $(echo "$RESPONSE" | head -c 200)"
fi
