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
# `grep` exits 1 when the variable is absent, and under `set -e` that killed the
# whole script silently (exit 1, no output) — so a missing POKELO_TOKEN meant no
# ADR at all instead of the documented "saved locally, publish skipped".
# Keep the `|| true`: it is what makes the local-only path reachable.
if [[ -f "$ENV_FILE" ]]; then
  POKELO_TOKEN="${POKELO_TOKEN:-$(grep -E '^POKELO_TOKEN=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"' ' || true)}"
  POKELO_PROJECT_ID="${POKELO_PROJECT_ID:-$(grep -E '^POKELO_PROJECT_ID=' "$ENV_FILE" | cut -d= -f2- | tr -d '"'"'"' ' || true)}"
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

FULL_TITLE="${NEXT} — ${TITLE}"

# Node reads the ADR file itself, and the `-e` program stays on ONE line.
# Both matter on Windows: the node shim (Volta) truncates every argument at its
# first newline, so passing the markdown through argv silently delivered only the
# first line — curl then posted a body Pokelo rejected as "Parse error".
# Do not "tidy" this back into a multi-line -e with the content as an argument;
# keep the file path (single-line) as the argument instead.
PAYLOAD_FILE=$(mktemp)
trap 'rm -f "$PAYLOAD_FILE"' EXIT
node -e "const fs=require('fs');const c=fs.readFileSync(process.argv[1],'utf8');const t=process.argv[2];const pid=process.argv[3];const date=new Date().toISOString().slice(0,10);console.log(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'create_adr',arguments:{projectId:pid,title:t,contentMd:c,status:'approved',decisionDate:date}}}));" "$FILEPATH" "$FULL_TITLE" "$POKELO_PROJECT_ID" > "$PAYLOAD_FILE"

# --data @file, not --data "$PAYLOAD": the body is kilobytes of JSON and must not
# travel through Windows argument conversion.
RESPONSE=$(curl -s -X POST "$POKELO_BASE/mcp" \
  -H "Authorization: Bearer $POKELO_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data @"$PAYLOAD_FILE")

# Pokelo answers with an SSE stream whose payload is JSON *inside* a text field,
# so the id arrives as \"documentId\":\"…\" — a pattern anchored on plain quotes
# never matched and every successful publish was reported as a failure. Anchor on
# the key name and take the UUID that follows; works escaped or not.
# The `|| true` is the other half: same `set -e` + grep trap as the .env read
# above — without it a missing id kills the script before it can print why.
DOC_ID=$(printf '%s' "$RESPONSE" | grep -oE 'documentId[\\":]*[0-9a-fA-F-]{36}' | head -1 | grep -oE '[0-9a-fA-F-]{36}' || true)

if [[ -n "$DOC_ID" ]]; then
  echo "✅  ADR saved locally:  $FILEPATH"
  echo "✅  ADR published to Pokelo: $DOC_ID"
else
  echo "✅  ADR saved locally:  $FILEPATH"
  echo "⚠️  Pokelo publish failed — check token. Response: $(echo "$RESPONSE" | head -c 200)"
fi
