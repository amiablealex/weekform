# Explicit, so nothing has to be guessed about how this is built or started.

FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_ROOT_USER_ACTION=ignore

WORKDIR /app

# Dependencies first, so a code change does not reinstall them.
COPY requirements.txt ./
RUN pip install -r requirements.txt

COPY . .
RUN chmod +x start.sh \
    && useradd --create-home app \
    && chown -R app:app /app
USER app

# Deliberately no EXPOSE. Railway derives a service's target port from EXPOSE
# when it is present, while separately injecting PORT — and if those two
# disagree, the container binds one port while health checks hit another and
# the deploy never goes healthy. With no EXPOSE, PORT is the single answer.

CMD ["./start.sh"]
