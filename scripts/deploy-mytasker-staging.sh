#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ENV_FILE="$ROOT/env/mytasker.staging.env"
COMPOSE="$ROOT/docker-compose.staging.yml"
if [[ ! -f "$ENV_FILE" ]]; then echo "Missing dedicated env/mytasker.staging.env" >&2; exit 2; fi
if [[ $(stat -c %a "$ENV_FILE") != 600 ]]; then echo "Set chmod 600 on environment file" >&2; exit 2; fi
if [[ $(stat -c %a "$(dirname "$ENV_FILE")") != 700 ]]; then echo "Set chmod 700 on env directory" >&2; exit 2; fi
dc() { docker compose --env-file "$ENV_FILE" -f "$COMPOSE" "$@"; }
dc config --quiet
# Build the reviewed application before replacing it.
dc build --pull web
dc up -d db
BACKUP_DIR="/opt/backups/mytasker/staging"
install -m 700 -d "$BACKUP_DIR"
NOW="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="$BACKUP_DIR/predeploy-${NOW}.dump"
dc exec -T db pg_dump -U mytasker -d mytasker -Fc > "$BACKUP"
chmod 600 "$BACKUP"
pg_restore --list "$BACKUP" >/dev/null
dc run --rm --no-deps web python /app/server/manage.py migrate --noinput
dc up -d --no-deps web
dc ps
dc exec -T web python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8000/healthz/',timeout=10).read().decode())"
echo "Container healthy. Now verify public HTTPS, CAPTCHA, SMTP delivery, MFA and cross-account isolation before inviting testers."
echo "Recoverable PostgreSQL snapshot: $BACKUP"
