#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

REPO="https://github.com/corvaith/ossobun-app.git"
ENV_FILE="${OSSOBUN_ENV_FILE:-/root/.hermes/.env}"
HELPER="/root/.hermes/scripts/ossobun-git-credential.sh"

if ! grep -q "^OSSOBUN_TOKEN=" "$ENV_FILE" 2>/dev/null; then
  echo "error: OSSOBUN_TOKEN not found in $ENV_FILE" >&2
  exit 1
fi

if [ ! -d .git ]; then
  git init -b main
  git config user.name "corvaith"
  git config user.email "corvaith@users.noreply.github.com"
  git remote add origin "$REPO"
fi

git config --local credential.helper "!$HELPER"

MESSAGE="${1:-update: sync ossobun changes}"

git add -A

if git diff --cached --quiet; then
  echo "nothing to commit — working tree already matches HEAD"
else
  git commit -m "$MESSAGE"
fi

git push -u origin main
echo "pushed to $REPO"
