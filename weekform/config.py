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


class Config:
    SQLALCHEMY_DATABASE_URI = _database_uri()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}

    # Only used for flash messaging and the like; there are no sessions and no
    # cookies, so this is future-proofing rather than a live secret.
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-only-not-a-secret")

    ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
    ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

    SITE_DOMAIN = os.environ.get("SITE_DOMAIN", "weekform.app")

    # Requests per minute per address to the counter endpoint.
    SHARE_RATE_LIMIT = int(os.environ.get("SHARE_RATE_LIMIT", "30"))

    DEBUG = _bool("FLASK_DEBUG")
