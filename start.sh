#!/bin/sh
# Container entrypoint.
#
# Exists mostly so the deploy log says what the process actually did before it
# hands over to gunicorn. A container that fails silently is far more expensive
# to debug than these four lines of output.
set -e

PORT="${PORT:-8000}"

echo "weekform: binding 0.0.0.0:${PORT}"
if [ -n "${DATABASE_URL}" ]; then
  echo "weekform: DATABASE_URL is set"
else
  echo "weekform: no DATABASE_URL — falling back to SQLite, which is wiped on redeploy"
fi
if [ -n "${ADMIN_PASSWORD}" ]; then
  echo "weekform: admin configured"
else
  echo "weekform: ADMIN_PASSWORD unset — /admin will stay closed"
fi

# exec so gunicorn becomes PID 1 and receives stop signals directly.
exec gunicorn "weekform:create_app()" \
  --bind "0.0.0.0:${PORT}" \
  --workers 2 --threads 4 \
  --timeout 30 \
  --access-logfile - --error-logfile - --log-level info
