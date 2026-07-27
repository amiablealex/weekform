# Railway will use this in preference to guessing.
#
# The previous deploy failed because a package.json sat at the repo root purely
# to satisfy the test runner, and the builder concluded this was a Node project.
# An explicit Dockerfile removes the detection heuristics altogether.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first so a code change does not reinstall them.
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . .

RUN useradd --create-home --shell /usr/sbin/nologin app \
    && chown -R app:app /app
USER app

EXPOSE 8000

# Shell form so ${PORT} expands. Railway injects it; 8000 is for running the
# image locally.
CMD gunicorn "weekform:create_app()" \
      --bind "0.0.0.0:${PORT:-8000}" \
      --workers 2 --threads 4 --timeout 30 --access-logfile -
