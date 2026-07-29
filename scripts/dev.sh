#!/usr/bin/env bash
#
# Development server. Production does not come through here — Railway runs
# start.sh, which is the only entry point that expands $PORT itself.
#
#   scripts/dev.sh          → http://0.0.0.0:8000
#   scripts/dev.sh 8001     → a different port
#
set -euo pipefail

cd "$(dirname "$0")/.."

PORT_ARG="${1:-8000}"

# Obviously fake defaults, so that a real key is never quietly inherited from
# here. The app refuses to start without SECRET_KEY, which is the real backstop.
export SECRET_KEY="${SECRET_KEY:-dev-only-not-a-real-key}"
export ADMIN_USER="${ADMIN_USER:-admin}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-dev}"

# Use the venv without needing it activated first.
FLASK=flask
if [ -x .venv/bin/flask ]; then
  FLASK=.venv/bin/flask
fi

echo "weekform dev on http://0.0.0.0:${PORT_ARG}  (admin: ${ADMIN_USER} / ${ADMIN_PASSWORD})"
exec "$FLASK" --app weekform run --debug --host 0.0.0.0 --port "$PORT_ARG"
