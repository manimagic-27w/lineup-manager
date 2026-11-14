#!/usr/bin/env bash
# Copies the app's database (the "public" schema) from one Neon/Postgres database to another,
# then compares row counts table by table. Run it in Terminal on your Mac:
#
#     bash scripts/migrate-db.sh
#
# It asks for the SOURCE (old) and DESTINATION (new) connection strings and hides what you type,
# so nothing lands in your shell history. The source is only read, never changed. The destination
# should be a brand-new, empty database. Use the DIRECT connection string (not the pooled one).
set -euo pipefail

# Homebrew's libpq keeps pg_dump/pg_restore/psql out of the normal PATH.
for d in /opt/homebrew/opt/libpq/bin /usr/local/opt/libpq/bin /opt/homebrew/bin; do
  [ -d "$d" ] && PATH="$d:$PATH"
done
for tool in pg_dump pg_restore psql; do
  command -v "$tool" >/dev/null || { echo "Missing $tool. Install it with:  brew install libpq"; exit 1; }
done

clean() { # drop options that sometimes break command-line tools, and use the DIRECT host (no -pooler)
  printf '%s' "$1" | sed -E 's/[&?]channel_binding=require//; s/\?$//; s#(@[^/:?]+)-pooler#\1#'
}

read -r -s -p "SOURCE (old) connection string: " SRC_RAW; echo
read -r -s -p "DESTINATION (new) connection string: " DST_RAW; echo
SRC="$(clean "$SRC_RAW")"
DST="$(clean "$DST_RAW")"
[ -n "$SRC" ] && [ -n "$DST" ] || { echo "Both connection strings are required."; exit 1; }

host() { printf '%s' "$1" | sed -E 's#^[a-z]+://[^@]*@([^/:?]+).*#\1#'; }
SRC_HOST="$(host "$SRC")"; DST_HOST="$(host "$DST")"
echo "Source:      $SRC_HOST"
echo "Destination: $DST_HOST"
[ "$SRC_HOST" != "$DST_HOST" ] || { echo "Source and destination are the same database. Stopping."; exit 1; }

psql "$SRC" -Atc "select 1" >/dev/null || { echo "Can't connect to the SOURCE."; exit 1; }
psql "$DST" -Atc "select 1" >/dev/null || { echo "Can't connect to the DESTINATION."; exit 1; }

existing="$(psql "$DST" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
if [ "$existing" != "0" ]; then
  echo "The destination already has $existing table(s) in the public schema."
  echo "Use a brand-new, empty database (or empty it first). Stopping so nothing is overwritten."
  exit 1
fi

read -r -p "Is the app quiet (no one saving lineups or stats right now)? Type yes to copy: " ok
[ "$ok" = "yes" ] || { echo "Cancelled."; exit 1; }

FILE="$(mktemp -t lineup-db-XXXXXX).dump"
trap 'rm -f "$FILE"' EXIT
echo "Dumping the source..."
pg_dump "$SRC" --schema=public --format=custom --no-owner --no-acl --file="$FILE"
echo "Restoring into the destination..."
# The dump re-creates the "public" schema, which every new database already has - skip just that entry.
LIST="$(mktemp -t lineup-db-list-XXXXXX)"
trap 'rm -f "$FILE" "$LIST"' EXIT
pg_restore --list "$FILE" | grep -v -E '^[0-9]+; [0-9]+ [0-9]+ SCHEMA - public( |$)' > "$LIST"
pg_restore --dbname="$DST" --no-owner --no-acl --exit-on-error --use-list="$LIST" "$FILE"

echo "Comparing row counts..."
tables="$(psql "$SRC" -Atc "select tablename from pg_tables where schemaname='public' order by 1")"
bad=0
printf '%-32s %10s %10s\n' TABLE SOURCE DEST
for t in $tables; do
  a="$(psql "$SRC" -Atc "select count(*) from public.\"$t\"")"
  b="$(psql "$DST" -Atc "select count(*) from public.\"$t\"" 2>/dev/null || echo MISSING)"
  mark=""; [ "$a" = "$b" ] || { mark="  <-- DIFFERENT"; bad=1; }
  printf '%-32s %10s %10s%s\n' "$t" "$a" "$b" "$mark"
done
if [ "$bad" = "0" ]; then
  echo; echo "All tables match. The copy is complete."
else
  echo; echo "Some tables differ. Do NOT switch the app over; paste this output back to Claude."
  exit 1
fi
