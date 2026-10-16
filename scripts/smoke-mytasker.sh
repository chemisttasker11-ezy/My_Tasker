#!/usr/bin/env bash
set -euo pipefail
if [ "$#" -ne 1 ]; then echo "Usage: bash scripts/smoke-mytasker.sh https://ACTUAL_MY_TASKER_HOST" >&2; exit 2; fi
BASE="${1%/}"
case "$BASE" in https://*) ;; *) echo "Use the public HTTPS URL" >&2; exit 2;; esac
curl --fail --silent --show-error --location --max-time 15 "$BASE/healthz/" | grep -q '"status": "ok"'
curl --fail --silent --show-error --location --max-time 15 "$BASE/api/config/" | grep -q 'captcha_site_key'
curl --fail --silent --show-error --location --max-time 15 "$BASE/" | grep -qi '<html'
echo "Public My Tasker HTTPS, SPA and public configuration endpoints responded. This does not certify real CAPTCHA, SMTP or admin MFA."
