"""Security primitives.

Small and deliberate rather than a framework. Everything here is either a thin
wrapper over Werkzeug or twenty lines of standard practice, and each piece is
commented with what it defends against.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import current_app, g, redirect, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from .models import User, db

SESSION_KEY = "uid"
CSRF_KEY = "csrf"

# Long enough not to be a nuisance for a weekly habit; short enough that an
# abandoned session on a shared device does not last forever.
SESSION_DAYS = 90

# NCSC and NIST both say length beats composition rules, so there is one rule.
MIN_PASSWORD_LENGTH = 10


# --- passwords -------------------------------------------------------------

def hash_password(raw: str) -> str:
    return generate_password_hash(raw)


def verify_password(stored_hash: str, raw: str) -> bool:
    return check_password_hash(stored_hash, raw)


def password_problem(raw: str) -> str | None:
    """A human-readable reason the password is unacceptable, or None."""
    if not raw or len(raw) < MIN_PASSWORD_LENGTH:
        return f"Use at least {MIN_PASSWORD_LENGTH} characters."
    if len(raw) > 200:
        return "That is longer than 200 characters."
    return None


def email_problem(raw: str) -> str | None:
    email = User.normalise_email(raw)
    if not email or "@" not in email or "." not in email.split("@")[-1]:
        return "Enter an email address."
    if len(email) > 255 or email.startswith("@") or email.endswith("@"):
        return "Enter an email address."
    return None


# --- sessions --------------------------------------------------------------

def log_in(user: User) -> None:
    # A fresh session id on login, so a token captured beforehand is useless.
    session.clear()
    session[SESSION_KEY] = user.id
    session.permanent = True
    user.last_seen_at = datetime.now(timezone.utc)
    db.session.commit()


def log_out() -> None:
    session.clear()


def current_user() -> User | None:
    """The signed-in user, resolved once per request."""
    if "user" in g:
        return g.user
    uid = session.get(SESSION_KEY)
    g.user = db.session.get(User, uid) if uid else None
    if uid and g.user is None:
        session.clear()          # the account was deleted under us
    return g.user


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if current_user() is None:
            return redirect(url_for("auth.login", next=request.path))
        return view(*args, **kwargs)

    return wrapped


# --- CSRF ------------------------------------------------------------------
# Session cookies are SameSite=Lax, which already blocks cross-site form posts.
# This is the second layer, because the cost is one hidden field.

def csrf_token() -> str:
    token = session.get(CSRF_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        session[CSRF_KEY] = token
    return token


def csrf_ok() -> bool:
    sent = request.form.get("csrf") or request.headers.get("X-CSRF-Token") or ""
    expected = session.get(CSRF_KEY) or ""
    return bool(expected) and hmac.compare_digest(sent, expected)


# --- rate limiting ---------------------------------------------------------
# Per worker rather than global. Redis would be sturdier, but this is enough to
# make online password guessing pointless, which is what it is for.

_buckets: dict[str, deque] = defaultdict(deque)


def rate_limited(key: str, limit: int, window: float = 300.0) -> bool:
    now = time.monotonic()
    seen = _buckets[key]
    while seen and now - seen[0] > window:
        seen.popleft()
    if len(seen) >= limit:
        return True
    seen.append(now)
    if len(_buckets) > 8192:
        _buckets.clear()
    return False


def client_key(prefix: str) -> str:
    address = request.headers.get("X-Forwarded-For", request.remote_addr or "?")
    return f"{prefix}:{address.split(',')[0].strip()}"


# --- reset tokens ----------------------------------------------------------

RESET_VALID_HOURS = 2


def new_reset_token() -> tuple[str, str]:
    """Returns (token to email, hash to store). The token is never persisted."""
    token = secrets.token_urlsafe(32)
    return token, hashlib.sha256(token.encode()).hexdigest()


def hash_reset_token(token: str) -> str:
    return hashlib.sha256((token or "").encode()).hexdigest()


def reset_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=RESET_VALID_HOURS)


def configure_session(app) -> None:
    app.config.update(
        PERMANENT_SESSION_LIFETIME=timedelta(days=SESSION_DAYS),
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=not app.config.get("DEBUG", False),
        SESSION_COOKIE_NAME="weekform_session",
    )
