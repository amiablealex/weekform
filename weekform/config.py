"""Configuration, entirely from the environment.

Locally you need nothing set at all — it falls back to a SQLite file beside the
project. On Railway, DATABASE_URL arrives automatically once a Postgres service
is attached; only the admin credentials need setting by hand.
"""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _database_uri() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()
    if not url:
        return f"sqlite:///{PROJECT_ROOT / 'weekform.db'}"

    # Railway and Heroku both hand out the historic `postgres://` scheme, which
    # SQLAlchemy 2 no longer recognises, and neither names a driver.
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _bool(name: str, default: bool = False) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _engine_options() -> dict:
    options: dict = {"pool_pre_ping": True}
    if _database_uri().startswith("postgresql"):
        # Without a connect timeout, a database that is cold or unreachable
        # leaves every gunicorn worker blocked on the socket during start-up.
        # The container then looks alive while answering nothing, which is
        # indistinguishable from a crash until you read the logs.
        options["connect_args"] = {"connect_timeout": 5}
    return options


class Config:
    SQLALCHEMY_DATABASE_URI = _database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = _engine_options()

    # Signs the session cookie. Anyone who knows it can forge a login, so a
    # deployment without one refuses to start rather than accepting a default.
    SECRET_KEY = os.environ.get("SECRET_KEY", "")

    ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

    SITE_DOMAIN = os.environ.get("SITE_DOMAIN", "weekform.app")

    # Password reset is the only message this app ever sends.
    RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
    MAIL_FROM = os.environ.get("MAIL_FROM", "weekform <noreply@weekform.app>")

    # Requests per minute per address to the counter endpoint.
    SHARE_RATE_LIMIT = int(os.environ.get("SHARE_RATE_LIMIT", "30"))

    DEBUG = _bool("FLASK_DEBUG")
