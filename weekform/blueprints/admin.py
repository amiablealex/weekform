"""A single private page showing how much the thing is being used."""

from __future__ import annotations

import hmac
from functools import wraps

from flask import (Blueprint, Response, current_app, flash, redirect,
                   render_template, request, url_for)

from ..mail import is_configured as email_configured, send, sender_address
from ..security import csrf_ok
from ..models import (active_users, counts_by_kind, daily_counts, db,
                      shares_since, total_deletions, total_shares, total_users,
                      total_weeks, users_since, users_with_weeks)

bp = Blueprint("admin", __name__)


def _challenge() -> Response:
    return Response(
        "Authentication required.",
        401,
        {"WWW-Authenticate": 'Basic realm="weekform", charset="UTF-8"'},
    )


def requires_admin(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        from flask import request

        expected_user = current_app.config["ADMIN_USER"]
        expected_password = current_app.config["ADMIN_PASSWORD"]

        # An unset password locks the page rather than opening it. Failing shut
        # matters here: a deploy that forgets the variable should not quietly
        # publish its own stats.
        if not expected_password:
            return Response("Admin access is not configured.", 503)

        auth = request.authorization
        if not auth or not auth.username or auth.password is None:
            return _challenge()

        ok_user = hmac.compare_digest(auth.username, expected_user)
        ok_password = hmac.compare_digest(auth.password, expected_password)
        if not (ok_user and ok_password):
            return _challenge()

        return view(*args, **kwargs)

    return wrapped


def _database_ok() -> bool:
    try:
        db.session.execute(db.text("SELECT 1"))
        return True
    except Exception:
        db.session.rollback()
        return False


@bp.get("/admin")
@requires_admin
def dashboard() -> str:
    if not _database_ok():
        return render_template("admin.html", database_ok=False, total=0, today=0,
                               last_7=0, last_30=0, by_kind={}, days=[], peak=0,
                               accounts={},
                               email={"configured": email_configured(),
                                      "sender": sender_address()})
    days = daily_counts(30)
    peak = max((count for _, count in days), default=0)
    return render_template(
        "admin.html",
        database_ok=True,
        total=total_shares(),
        today=shares_since(1),
        last_7=shares_since(7),
        last_30=shares_since(30),
        by_kind=counts_by_kind(),
        days=days,
        peak=peak,
        email={
            "configured": email_configured(),
            "sender": sender_address(),
        },
        accounts={
            "total": total_users(),
            "new_7": users_since(7),
            "new_30": users_since(30),
            "active_30": active_users(30),
            "with_weeks": users_with_weeks(),
            "weeks": total_weeks(),
            "deleted": total_deletions(),
        },
    )


@bp.post("/admin/test-email")
@requires_admin
def test_email():
    """Send one message and report exactly what the provider said.

    Diagnosing delivery through the sign-up and reset flow means creating
    accounts to test a config value. This does the same call directly and puts
    the provider's own answer on screen.
    """
    if not csrf_ok():
        return redirect(url_for("admin.dashboard"))

    recipient = (request.form.get("to") or "").strip()
    if "@" not in recipient:
        flash("Enter an address to send to.")
        return redirect(url_for("admin.dashboard"))

    sent, detail = send(
        recipient,
        "weekform test",
        "This is a test from the weekform admin page. Nothing is wrong.\n",
    )
    flash(f"Sent from {sender_address()} — accepted by the provider."
          if sent else f"Not sent. {detail}")
    return redirect(url_for("admin.dashboard"))
