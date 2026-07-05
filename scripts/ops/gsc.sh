#!/usr/bin/env bash
set -euo pipefail

SITE="${GOOSE_GSC_SITE:-https://www.goose.gifts/}"
SA_KEY="${GOOSE_GSC_SA_KEY:-$HOME/.config/gcloud/ereps-seo-sa.json}"

readonly_scope="https://www.googleapis.com/auth/webmasters.readonly,https://www.googleapis.com/auth/cloud-platform"
write_scope="https://www.googleapis.com/auth/webmasters,https://www.googleapis.com/auth/cloud-platform"

usage() {
  cat <<'USAGE' >&2
Usage:
  scripts/ops/gsc.sh sites
  scripts/ops/gsc.sh analytics <start-date> <end-date> [dimensions] [row-limit]
  scripts/ops/gsc.sh inspect <url>
  scripts/ops/gsc.sh sitemaps
  scripts/ops/gsc.sh submit-sitemap [sitemap-url]

Dates use YYYY-MM-DD. The default property is https://www.goose.gifts/.
Set GOOSE_GSC_SA_KEY or GOOSE_GSC_SITE to override.
USAGE
}

token() {
  local scopes="$1"
  if [[ ! -f "$SA_KEY" ]]; then
    echo "Missing service account key: $SA_KEY" >&2
    exit 1
  fi
  GOOGLE_APPLICATION_CREDENTIALS="$SA_KEY" \
    gcloud auth application-default print-access-token --scopes="$scopes" 2>/dev/null
}

encode() {
  python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$1"
}

json() {
  python3 -m json.tool
}

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

case "$1" in
  sites)
    access_token="$(token "$readonly_scope")"
    curl -sS -H "Authorization: Bearer $access_token" \
      "https://searchconsole.googleapis.com/webmasters/v3/sites" | json
    ;;
  analytics)
    if [[ $# -lt 3 ]]; then
      usage
      exit 2
    fi
    start_date="$2"
    end_date="$3"
    dimensions="${4:-query}"
    row_limit="${5:-25}"
    encoded_site="$(encode "$SITE")"
    access_token="$(token "$readonly_scope")"
    curl -sS -H "Authorization: Bearer $access_token" \
      -H "Content-Type: application/json" \
      -X POST "https://searchconsole.googleapis.com/webmasters/v3/sites/$encoded_site/searchAnalytics/query" \
      -d "{\"startDate\":\"$start_date\",\"endDate\":\"$end_date\",\"dimensions\":[\"$dimensions\"],\"rowLimit\":$row_limit,\"dataState\":\"all\"}" | json
    ;;
  inspect)
    if [[ $# -lt 2 ]]; then
      usage
      exit 2
    fi
    access_token="$(token "$readonly_scope")"
    curl -sS -H "Authorization: Bearer $access_token" \
      -H "Content-Type: application/json" \
      -X POST "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect" \
      -d "{\"inspectionUrl\":\"$2\",\"siteUrl\":\"$SITE\"}" | json
    ;;
  sitemaps)
    encoded_site="$(encode "$SITE")"
    access_token="$(token "$readonly_scope")"
    curl -sS -H "Authorization: Bearer $access_token" \
      "https://searchconsole.googleapis.com/webmasters/v3/sites/$encoded_site/sitemaps" | json
    ;;
  submit-sitemap)
    sitemap="${2:-https://www.goose.gifts/sitemap.xml}"
    encoded_site="$(encode "$SITE")"
    encoded_sitemap="$(encode "$sitemap")"
    access_token="$(token "$write_scope")"
    response_file="$(mktemp)"
    status="$(
      curl -sS -o "$response_file" -w '%{http_code}' \
        -H "Authorization: Bearer $access_token" \
        -X PUT "https://searchconsole.googleapis.com/webmasters/v3/sites/$encoded_site/sitemaps/$encoded_sitemap"
    )"
    if [[ -s "$response_file" ]]; then
      json < "$response_file"
    else
      printf '{\n  "ok": %s,\n  "status_code": %s\n}\n' "$([[ "$status" =~ ^2 ]] && echo true || echo false)" "$status"
    fi
    rm -f "$response_file"
    if [[ ! "$status" =~ ^2 ]]; then
      exit 1
    fi
    ;;
  *)
    usage
    exit 2
    ;;
esac
