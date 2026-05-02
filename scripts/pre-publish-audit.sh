#!/bin/bash
# Pre-publish security audit — run before every git push (via pre-push hook)
# and manually before the very first push.
#
# Exits non-zero if any finding is detected.
# Usage: bash scripts/pre-publish-audit.sh

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
FOUND=0

RED='\033[0;31m'
YEL='\033[1;33m'
GRN='\033[0;32m'
NC='\033[0m'

echo "=== rMoney pre-publish audit ==="
echo ""

# ── 1. Key-shaped strings in tracked working tree ─────────────────────────────

KEY_PATTERN='(api[_-]?key|apikey|secret|access_token|client_secret)\s*[=:]\s*["'"'"']?[A-Za-z0-9_\/+\-]{32,}'

echo "Scanning working tree for API keys..."

TREE_HITS=$(git -C "$ROOT" ls-files | \
  xargs grep -PlE "$KEY_PATTERN" 2>/dev/null || true)

if [ -n "$TREE_HITS" ]; then
  echo -e "${RED}FAIL${NC} — possible API key in tracked files:"
  echo "$TREE_HITS"
  FOUND=1
else
  echo -e "${GRN}OK${NC}"
fi

echo ""

# ── 2. Key-shaped strings in full git history ──────────────────────────────────

if git -C "$ROOT" rev-parse HEAD >/dev/null 2>&1; then
  echo "Scanning git history for API keys..."

  HISTORY_HITS=$(git -C "$ROOT" log --all -p | \
    grep -PlE "^\+.*$KEY_PATTERN" 2>/dev/null || true)

  if [ -n "$HISTORY_HITS" ]; then
    echo -e "${RED}FAIL${NC} — possible API key in commit history:"
    echo "$HISTORY_HITS" | head -20
    FOUND=1
  else
    echo -e "${GRN}OK${NC}"
  fi
else
  echo -e "${YEL}SKIP${NC} — no git history yet"
fi

echo ""

# ── 3. Files that should not be tracked ───────────────────────────────────────

echo "Checking for sensitive tracked files..."

SENSITIVE=$(git -C "$ROOT" ls-files | \
  grep -E '\.(csv|rmy|env|stronghold)$' || true)

if [ -n "$SENSITIVE" ]; then
  echo -e "${RED}FAIL${NC} — sensitive files are tracked by git:"
  echo "$SENSITIVE"
  FOUND=1
else
  echo -e "${GRN}OK${NC}"
fi

echo ""

# ── 4. .gitignore sanity check ────────────────────────────────────────────────

echo "Checking .gitignore..."

if [ ! -f "$ROOT/.gitignore" ]; then
  echo -e "${RED}FAIL${NC} — .gitignore is missing"
  FOUND=1
else
  MISSING=""
  for pat in "*.csv" "*.rmy" "*.env" "*.stronghold" "node_modules/"; do
    grep -q "$pat" "$ROOT/.gitignore" || MISSING="$MISSING $pat"
  done
  if [ -n "$MISSING" ]; then
    echo -e "${YEL}WARN${NC} — .gitignore may be missing patterns:$MISSING"
  else
    echo -e "${GRN}OK${NC}"
  fi
fi

echo ""

# ── Result ────────────────────────────────────────────────────────────────────

if [ "$FOUND" -eq 1 ]; then
  echo -e "${RED}=== AUDIT FAILED — fix the issues above before pushing ===${NC}"
  exit 1
else
  echo -e "${GRN}=== Audit passed ===${NC}"
fi
