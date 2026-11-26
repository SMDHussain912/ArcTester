#!/usr/bin/env bash
set -euo pipefail

: "${ARCTESTER_WEB_URL:?Set ARCTESTER_WEB_URL to the deployed web origin}"
: "${ARCTESTER_API_URL:?Set ARCTESTER_API_URL to the deployed API origin}"

normalize_origin() {
  local value="$1"
  value="${value%/}"
  if [[ ! "$value" =~ ^https:// ]]; then
    echo "Expected an HTTPS origin, received: $value" >&2
    exit 2
  fi
  printf '%s' "$value"
}

WEB_ORIGIN="$(normalize_origin "$ARCTESTER_WEB_URL")"
API_ORIGIN="$(normalize_origin "$ARCTESTER_API_URL")"
WEB_TMP="$(mktemp)"
API_TMP="$(mktemp)"
trap 'rm -f "$WEB_TMP" "$API_TMP"' EXIT

echo "Checking deployed web shell: $WEB_ORIGIN"
web_code="$(curl --location --silent --show-error --output "$WEB_TMP" --write-out '%{http_code}' --max-time 30 "$WEB_ORIGIN/")"
test "$web_code" = "200" || { echo "Web returned HTTP $web_code" >&2; exit 1; }
grep -Eiq '<html|<!doctype html' "$WEB_TMP" || { echo "Web response is not an HTML shell" >&2; exit 1; }
grep -Eiq '<title[^>]*>[^<]+' "$WEB_TMP" || { echo "Web shell has no non-empty document title" >&2; exit 1; }

echo "Checking deployed API health: $API_ORIGIN/health"
api_code="$(curl --location --silent --show-error --output "$API_TMP" --write-out '%{http_code}' --max-time 30 "$API_ORIGIN/health")"
test "$api_code" = "200" || { echo "API health returned HTTP $api_code" >&2; cat "$API_TMP" >&2; exit 1; }
grep -Eiq '"(status|ok)"[[:space:]]*:[[:space:]]*("ok"|true)' "$API_TMP" || {
  echo "API health response did not contain an expected healthy status" >&2
  cat "$API_TMP" >&2
  exit 1
}

echo "Hosted smoke checks passed."
