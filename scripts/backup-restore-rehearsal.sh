#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ "${1:-}" != "--execute" || $# -gt 1 ]]; then
  cat <<'HELP'
ArcTester PostgreSQL backup/restore rehearsal (safe preview by default)

Preview:
  DATABASE_URL=... RESTORE_DATABASE_URL=... scripts/backup-restore-rehearsal.sh

Execute after reviewing both URLs and preparing an empty *rehearsal* database:
  DATABASE_URL=... RESTORE_DATABASE_URL=... scripts/backup-restore-rehearsal.sh --execute

The script never creates or drops databases, never requests automatic object
deletions during restore, and never deletes or overwrites an existing backup file.
HELP
  exit 0
fi

: "${DATABASE_URL:?Set DATABASE_URL to the source PostgreSQL database}"
: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to an empty rehearsal database}"

command -v psql >/dev/null 2>&1 || { echo "psql is required" >&2; exit 1; }
command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is required" >&2; exit 1; }
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore is required" >&2; exit 1; }

source_identity="$(psql "$DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 \
  -c "SELECT current_database() || '@' || COALESCE(inet_server_addr()::text, 'local') || ':' || COALESCE(inet_server_port()::text, 'local')")"
target_identity="$(psql "$RESTORE_DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 \
  -c "SELECT current_database() || '@' || COALESCE(inet_server_addr()::text, 'local') || ':' || COALESCE(inet_server_port()::text, 'local')")"
target_database="$(psql "$RESTORE_DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 -c "SELECT current_database()")"

if [[ "$source_identity" == "$target_identity" ]]; then
  echo "Refusing to restore into the source database." >&2
  exit 1
fi

if [[ "${target_database,,}" != *rehearsal* ]]; then
  echo "Refusing target '$target_database': its database name must contain 'rehearsal'." >&2
  exit 1
fi

target_table_count="$(psql "$RESTORE_DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")"
if [[ "$target_table_count" != "0" ]]; then
  echo "Refusing target '$target_database': public schema is not empty." >&2
  exit 1
fi

table_counts() {
  local database_url="$1"
  local table_names
  local table_name
  local row_count

  table_names="$(psql "$database_url" -X -A -t -q -v ON_ERROR_STOP=1 \
    -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name")"
  while IFS= read -r table_name; do
    [[ -n "$table_name" ]] || continue
    row_count="$(psql "$database_url" -X -A -t -q -v ON_ERROR_STOP=1 \
      -c "SELECT count(*) FROM public.\"$table_name\"")"
    printf '%s=%s\n' "$table_name" "$row_count"
  done <<< "$table_names"
}

source_counts="$(table_counts "$DATABASE_URL")"
backup_dir="${BACKUP_DIR:-$PWD/backups}"
backup_file="${BACKUP_FILE:-$backup_dir/arctester-$(date -u +%Y%m%dT%H%M%SZ).dump}"
mkdir -p "$(dirname "$backup_file")"

if [[ -e "$backup_file" || -L "$backup_file" ]]; then
  echo "Refusing to overwrite existing backup file: $backup_file" >&2
  exit 1
fi

pg_dump --format=custom --no-owner --no-acl --file="$backup_file" "$DATABASE_URL"
pg_restore --list "$backup_file" >/dev/null
pg_restore --exit-on-error --no-owner --no-privileges --dbname="$RESTORE_DATABASE_URL" "$backup_file"

restored_counts="$(table_counts "$RESTORE_DATABASE_URL")"
if [[ "$source_counts" != "$restored_counts" ]]; then
  echo "Restore row counts differ from the source. Keep the rehearsal database for investigation." >&2
  diff -u <(printf '%s\n' "$source_counts") <(printf '%s\n' "$restored_counts") || true
  exit 1
fi

printf 'Backup created: %s\n' "$backup_file"
printf 'Restore completed into rehearsal database: %s\n' "$target_database"
printf 'Row counts match for all public base tables.\n'
