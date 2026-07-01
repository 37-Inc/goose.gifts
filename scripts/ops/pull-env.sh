#!/usr/bin/env bash
# Bootstrap production env vars from Vercel into .env.local.
# Requires: VERCEL_TOKEN (create at https://vercel.com/account/tokens).
# Usage: ./scripts/ops/pull-env.sh [output-file]
set -euo pipefail

: "${VERCEL_TOKEN:?VERCEL_TOKEN is required (https://vercel.com/account/tokens)}"
OUT="${1:-.env.local}"

api() {
  curl -sS -H "Authorization: Bearer $VERCEL_TOKEN" "https://api.vercel.com$1"
}

json() { # json <expr> — evaluate a JS expression against stdin JSON
  node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log($1)})"
}

# Collect scopes: personal (no teamId) plus every team on the account.
SCOPES=("")
TEAM_IDS=$(api "/v2/teams" | json "(j.teams||[]).map(t=>t.id).join(' ')" || true)
for t in $TEAM_IDS; do SCOPES+=("$t"); done

# Find the goose.gifts project across scopes.
PROJECT_ID="" TEAM_QS=""
for scope in "${SCOPES[@]}"; do
  qs=""; [ -n "$scope" ] && qs="&teamId=$scope"
  match=$(api "/v9/projects?search=goose$qs" \
    | json "((j.projects||[])[0]||{}).id||''" || true)
  if [ -n "$match" ]; then
    PROJECT_ID="$match"; TEAM_QS="$qs"
    name=$(api "/v9/projects/$PROJECT_ID?${qs#&}" | json "j.name" || echo "?")
    echo "Found project: $name ($PROJECT_ID)" >&2
    break
  fi
done
[ -n "$PROJECT_ID" ] || { echo "ERROR: no project matching 'goose' found in any scope" >&2; exit 1; }

# Pull decrypted production env vars.
RESP=$(api "/v9/projects/$PROJECT_ID/env?decrypt=true${TEAM_QS}")
echo "$RESP" | json "
  (j.envs||[])
    .filter(e => (e.target||[]).includes('production'))
    .map(e => e.value === undefined || e.value === null
      ? '# UNREADABLE (sensitive): ' + e.key
      : e.key + '=' + e.value)
    .join('\n')
" > "$OUT"

TOTAL=$(grep -c '=' "$OUT" || true)
MISSING=$(grep -c '^# UNREADABLE' "$OUT" || true)
echo "Wrote $TOTAL vars to $OUT ($MISSING unreadable/sensitive — listed as comments)" >&2
if [ "$MISSING" -gt 0 ]; then
  echo "Sensitive vars cannot be read via API; ask the owner for those values:" >&2
  grep '^# UNREADABLE' "$OUT" >&2
fi
