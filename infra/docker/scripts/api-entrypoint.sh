#!/bin/sh
# DWES API entrypoint. The bind-mounted volumes (/app/data = auth + dwes_auth.sqlite,
# /app/uploads = drawings) are owned by the host, so the non-root app user can't write to
# them by default (SQLITE_CANTOPEN). Fix ownership as root, then drop privileges to `dwes`.
# No application logic, no database/schema operations here.
set -e
for d in /app/data /app/uploads; do
  mkdir -p "$d"
  chown -R dwes:dwes "$d" 2>/dev/null || true
done
exec gosu dwes "$@"
