#!/usr/bin/env bash
set -euo pipefail

PROPERTY_ID="${GOOSE_GA4_PROPERTY_ID:-507421709}"
SA_KEY="${GOOSE_GA4_SA_KEY:-${GOOSE_GSC_SA_KEY:-$HOME/.config/gcloud/goose-gifts-search-console-sa.json}}"
readonly_scope="https://www.googleapis.com/auth/analytics.readonly"

usage() {
  cat <<'USAGE' >&2
Usage:
  scripts/ops/ga4.sh events [start-date] [end-date] [row-limit]
  scripts/ops/ga4.sh traffic [start-date] [end-date] [row-limit]
  scripts/ops/ga4.sh landing-pages [start-date] [end-date] [row-limit]
  scripts/ops/ga4.sh event <event-name> [start-date] [end-date] [row-limit]

Dates may be YYYY-MM-DD or GA relative dates such as 30daysAgo/today.
The default GA4 property is 507421709 (goose.gifts).
Set GOOSE_GA4_PROPERTY_ID or GOOSE_GA4_SA_KEY to override.
USAGE
}

token() {
  if [[ ! -f "$SA_KEY" ]]; then
    echo "Missing service account key: $SA_KEY" >&2
    exit 1
  fi
  GOOGLE_APPLICATION_CREDENTIALS="$SA_KEY" \
    gcloud auth application-default print-access-token --scopes="$readonly_scope" 2>/dev/null
}

json() {
  python3 -m json.tool
}

body() {
  local start_date="$1"
  local end_date="$2"
  local dimensions="$3"
  local metrics="$4"
  local row_limit="$5"
  local event_name="${6:-}"

  python3 - "$start_date" "$end_date" "$dimensions" "$metrics" "$row_limit" "$event_name" <<'PY'
import json
import sys

start_date, end_date, dimensions, metrics, row_limit, event_name = sys.argv[1:]
payload = {
    "dateRanges": [{"startDate": start_date, "endDate": end_date}],
    "dimensions": [{"name": name} for name in dimensions.split(",") if name],
    "metrics": [{"name": name} for name in metrics.split(",") if name],
    "limit": int(row_limit),
}

if event_name:
    payload["dimensionFilter"] = {
        "filter": {
            "fieldName": "eventName",
            "stringFilter": {"matchType": "EXACT", "value": event_name},
        }
    }

print(json.dumps(payload))
PY
}

run_report() {
  local start_date="$1"
  local end_date="$2"
  local dimensions="$3"
  local metrics="$4"
  local row_limit="$5"
  local event_name="${6:-}"
  local access_token
  access_token="$(token)"

  curl -sS \
    -H "Authorization: Bearer $access_token" \
    -H "Content-Type: application/json" \
    -X POST "https://analyticsdata.googleapis.com/v1beta/properties/$PROPERTY_ID:runReport" \
    -d "$(body "$start_date" "$end_date" "$dimensions" "$metrics" "$row_limit" "$event_name")" | json
}

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

case "$1" in
  events)
    run_report "${2:-30daysAgo}" "${3:-today}" "eventName" "activeUsers,eventCount" "${4:-25}"
    ;;
  traffic)
    run_report "${2:-30daysAgo}" "${3:-today}" "sessionDefaultChannelGroup,sessionSourceMedium" "activeUsers,sessions,eventCount" "${4:-25}"
    ;;
  landing-pages)
    run_report "${2:-30daysAgo}" "${3:-today}" "landingPagePlusQueryString,pageTitle" "activeUsers,sessions,screenPageViews,eventCount" "${4:-25}"
    ;;
  event)
    if [[ $# -lt 2 ]]; then
      usage
      exit 2
    fi
    run_report "${3:-30daysAgo}" "${4:-today}" "eventName,sessionSourceMedium,landingPagePlusQueryString" "activeUsers,eventCount" "${5:-25}" "$2"
    ;;
  *)
    usage
    exit 2
    ;;
esac
