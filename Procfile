# Points at the same script as the Dockerfile's CMD, deliberately.
#
# Railway will use a Procfile as the start command in preference to the image's
# CMD, and it runs that command without a shell — so a bare `$PORT` in here
# reaches gunicorn as the literal four characters "$PORT" rather than a number.
# Every entry point therefore goes through start.sh, which expands PORT itself.
web: ./start.sh
