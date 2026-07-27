"""Sign up, sign in, sign out, and password reset."""

from __future__ import annotations

from datetime import datetime, timezone

from flask import (Blueprint, current_app, flash, redirect, render_template,
                   request, session, url_for)

from ..mail import is_configured as email_configured, send_reset_link
from ..models import PasswordReset, User, db
from ..security import (client_key, csrf_ok, current_user, email_problem,
                        hash_password, hash_reset_token, log_in, log_out,
                        new_reset_token, password_problem, rate_limited,
                        reset_expiry, verify_password)

bp = Blueprint("auth", __name__)


def _safe_next(raw: str | None) -> str:
    """Only ever redirect within this site."""
    if raw and raw.startswith("/") and not raw.startswith("//"):
        return raw
    return url_for("account.history")


@bp.get("/signup")
def signup_form():
    if current_user():
        return redirect(url_for("account.history"))
    return render_template("auth/signup.html")


@bp.post("/signup")
def signup():
    if not csrf_ok():
        return redirect(url_for("auth.signup_form"))

    if rate_limited(client_key("signup"), limit=10, window=3600):
        flash("Too many attempts. Try again later.")
        return render_template("auth/signup.html"), 429

    email = User.normalise_email(request.form.get("email", ""))
    password = request.form.get("password", "")
    consented = request.form.get("consent") == "yes"

    problem = email_problem(email) or password_problem(password)
    if not consented:
        problem = problem or "Tick the box to continue."
    if problem:
        flash(problem)
        return render_template("auth/signup.html", email=email), 400

    if db.session.scalar(db.select(User).where(User.email == email)):
        flash("That address already has an account.")
        return render_template("auth/signup.html", email=email), 400

    now = datetime.now(timezone.utc)
    user = User(email=email, password_hash=hash_password(password),
                created_at=now, consented_at=now, last_seen_at=now)
    db.session.add(user)
    db.session.commit()

    log_in(user)
    return redirect(url_for("account.history", welcome=1))


@bp.get("/login")
def login():
    if current_user():
        return redirect(url_for("account.history"))
    return render_template("auth/login.html", next=request.args.get("next", ""))


@bp.post("/login")
def login_submit():
    if not csrf_ok():
        return redirect(url_for("auth.login"))

    email = User.normalise_email(request.form.get("email", ""))
    password = request.form.get("password", "")
    destination = request.form.get("next", "")

    # Limited by address and by account, so neither a single source nor a single
    # target can be ground down.
    if rate_limited(client_key("login"), limit=20) or \
            rate_limited(f"login-user:{email}", limit=10):
        flash("Too many attempts. Try again shortly.")
        return render_template("auth/login.html", email=email, next=destination), 429

    user = db.session.scalar(db.select(User).where(User.email == email))
    if not user or not verify_password(user.password_hash, password):
        # One message for both cases, so this does not become a way to find out
        # which addresses are registered.
        flash("That email and password do not match.")
        return render_template("auth/login.html", email=email, next=destination), 401

    log_in(user)
    return redirect(_safe_next(destination))


@bp.post("/logout")
def logout():
    if csrf_ok():
        log_out()
    return redirect(url_for("main.index"))


@bp.get("/forgot")
def forgot_form():
    return render_template("auth/forgot.html", available=email_configured())


@bp.post("/forgot")
def forgot():
    if not csrf_ok():
        return redirect(url_for("auth.forgot_form"))

    email = User.normalise_email(request.form.get("email", ""))
    limited = rate_limited(client_key("forgot"), limit=8, window=3600) or \
        rate_limited(f"forgot-user:{email}", limit=4, window=3600)

    if not limited:
        user = db.session.scalar(db.select(User).where(User.email == email))
        if user:
            token, token_hash = new_reset_token()
            db.session.add(PasswordReset(user_id=user.id, token_hash=token_hash,
                                         expires_at=reset_expiry()))
            db.session.commit()
            link = url_for("auth.reset_form", token=token, _external=True)
            sent, detail = send_reset_link(user.email, link)
            if not sent:
                current_app.logger.error("reset email not sent: %s", detail)
        else:
            # Logged without the address: knowing a request landed on an
            # unknown account is the useful part, and keeping the address is
            # not.
            current_app.logger.info("reset requested for an address with no account")
    else:
        current_app.logger.info("reset request rate limited")

    # The same answer whether or not that address exists, so this page cannot be
    # used to discover who has an account.
    return render_template("auth/forgot_sent.html")


def _live_reset(token: str) -> PasswordReset | None:
    record = db.session.scalar(
        db.select(PasswordReset).where(PasswordReset.token_hash == hash_reset_token(token))
    )
    if not record or record.used_at is not None:
        return None
    expires = record.expires_at
    if expires.tzinfo is None:                 # SQLite hands back naive values
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        return None
    return record


@bp.get("/reset/<token>")
def reset_form(token: str):
    if not _live_reset(token):
        return render_template("auth/reset_dead.html"), 400
    return render_template("auth/reset.html", token=token)


@bp.post("/reset/<token>")
def reset(token: str):
    if not csrf_ok():
        return redirect(url_for("auth.reset_form", token=token))

    record = _live_reset(token)
    if not record:
        return render_template("auth/reset_dead.html"), 400

    password = request.form.get("password", "")
    problem = password_problem(password)
    if problem:
        flash(problem)
        return render_template("auth/reset.html", token=token), 400

    user = record.user
    user.password_hash = hash_password(password)
    record.used_at = datetime.now(timezone.utc)

    # Every other outstanding link for this account dies with it.
    for other in user.resets:
        if other.used_at is None:
            other.used_at = record.used_at
    db.session.commit()

    log_in(user)
    return redirect(url_for("account.history"))
