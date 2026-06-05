#!/usr/bin/env bash
# Push every variable in .env to Vercel.
#
# Prereqs: you must be logged in (`vercel login`) and the project linked
# (`vercel link`), OR export VERCEL_TOKEN and the script will pass it through.
#
# Usage:
#   bash scripts/push-env-to-vercel.sh                 # -> production preview development
#   bash scripts/push-env-to-vercel.sh production      # -> production only
#
# Re-running is safe: existing values are overwritten (--force).
set -euo pipefail

ENV_FILE=".env"
TARGETS=("${@:-production preview development}")
# shellcheck disable=SC2206
TARGETS=(${TARGETS[@]})

TOKEN_ARG=()
if [ -n "${VERCEL_TOKEN:-}" ]; then
  TOKEN_ARG=(--token "$VERCEL_TOKEN")
fi

[ -f "$ENV_FILE" ] || { echo "No $ENV_FILE found"; exit 1; }

while IFS= read -r line || [ -n "$line" ]; do
  # skip blanks and comments
  [[ -z "${line//[[:space:]]/}" ]] && continue
  [[ "$line" =~ ^[[:space:]]*# ]] && continue
  [[ "$line" != *"="* ]] && continue

  name="${line%%=*}"
  value="${line#*=}"
  # trim whitespace around the name
  name="$(echo -n "$name" | sed 's/[[:space:]]//g')"
  # strip one layer of surrounding single or double quotes
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"

  for target in "${TARGETS[@]}"; do
    echo "→ $name ($target)"
    printf '%s' "$value" | vercel env add "$name" "$target" --force "${TOKEN_ARG[@]}" >/dev/null
  done
done < "$ENV_FILE"

echo "Done. Verify with: vercel env ls"
