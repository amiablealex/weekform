"""A single private page showing how much the thing is being used."""

from __future__ import annotations

import hmac
from functools import wraps

from flask import Blueprint, Response, current_app, render_template

from ..models import counts_by_kind, daily_counts, db, shares_since, total_shares

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
                               last_7=0, last_30=0, by_kind={}, days=[], peak=0)
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
    )
