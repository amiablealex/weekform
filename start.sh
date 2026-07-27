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
if [ -n "${RESEND_API_KEY}" ]; then
  echo "weekform: email configured"
else
  echo "weekform: RESEND_API_KEY unset — password reset will be unavailable"
fi

# Fail here, loudly, rather than inside a worker. SECRET_KEY signs the session
# cookie: without it anybody could forge a login, so there is no safe default.
if [ -z "${SECRET_KEY}" ]; then
  echo "weekform: FATAL — SECRET_KEY is not set."
  echo "weekform: it signs the session cookie. Generate one with:"
  echo "weekform:   python3 -c 'import secrets; print(secrets.token_urlsafe(48))'"
  echo "weekform: then add it as a service variable and redeploy."
  exit 1
fi

# exec so gunicorn becomes PID 1 and receives stop signals directly.
exec gunicorn "weekform:create_app()" \
  --bind "0.0.0.0:${PORT}" \
  --workers 2 --threads 4 \
  --timeout 30 \
  --access-logfile - --error-logfile - --log-level info
