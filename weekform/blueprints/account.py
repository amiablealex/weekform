"""Everything behind an account: history, settings, export, deletion."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from flask import (Blueprint, Response, flash, redirect, render_template,
                   request, url_for)

from ..models import AccountDeletion, Goal, Preset, User, Week, db
from ..security import (csrf_ok, current_user, log_out, login_required,
                        verify_password)

bp = Blueprint("account", __name__, url_prefix="/account")


@bp.get("")
@login_required
def history():
    return render_template("account/history.html",
                           user=current_user(),
                           welcome=request.args.get("welcome") == "1")


@bp.get("/goals")
@login_required
def goals():
    """The only place goals are created, edited or deleted.

    The page itself is empty markup; goalspage.js fills it from /api/goals. The
    server does not render a goal, because it does not know what one contains.
    """
    return render_template("account/goals.html", user=current_user())


@bp.get("/presets")
@login_required
def presets():
    """Rename and delete preset weeks.

    Presets are created on the front page, where there is a week to make one
    from. Building one here would mean a second day picker on a page with no
    strip to preview it against.
    """
    return render_template("account/presets.html", user=current_user())


@bp.get("/settings")
@login_required
def settings():
    user = current_user()
    saved = db.session.scalar(
        db.select(db.func.count(Week.id)).where(Week.user_id == user.id)
    ) or 0
    goals = db.session.scalar(
        db.select(db.func.count(Goal.id)).where(Goal.user_id == user.id)
    ) or 0
    presets = db.session.scalar(
        db.select(db.func.count(Preset.id)).where(Preset.user_id == user.id)
    ) or 0
    return render_template("account/settings.html", user=user, saved=saved,
                           goals=goals, presets=presets)


@bp.get("/export")
@login_required
def export():
    """Everything held about this account, in one file."""
    user = current_user()
    weeks = db.session.scalars(
        db.select(Week).where(Week.user_id == user.id).order_by(Week.week_start)
    ).all()
    goals = db.session.scalars(
        db.select(Goal).where(Goal.user_id == user.id).order_by(Goal.created_at)
    ).all()
    presets = db.session.scalars(
        db.select(Preset).where(Preset.user_id == user.id).order_by(Preset.created_at)
    ).all()

    document = {
        "account": {
            "email": user.email,
            "created": user.created_at.isoformat(),
            "consented": user.consented_at.isoformat(),
        },
        "weeks": [
            {
                "week_start": week.week_start.isoformat(),
                "updated": week.updated_at.isoformat(),
                **json.loads(week.payload),
            }
            for week in weeks
        ],
        "goals": [
            {
                "created": goal.created_at.isoformat(),
                "updated": goal.updated_at.isoformat(),
                **json.loads(goal.payload),
            }
            for goal in goals
        ],
        "presets": [
            {
                "created": preset.created_at.isoformat(),
                "updated": preset.updated_at.isoformat(),
                **json.loads(preset.payload),
            }
            for preset in presets
        ],
        "note": "This is everything weekform holds about this account.",
    }

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return Response(
        json.dumps(document, indent=2),
        mimetype="application/json",
        headers={"Content-Disposition": f'attachment; filename="weekform-{stamp}.json"'},
    )


@bp.post("/delete")
@login_required
def delete():
    if not csrf_ok():
        return redirect(url_for("account.settings"))

    user = current_user()
    if not verify_password(user.password_hash, request.form.get("password", "")):
        flash("That password is not right.")
        return redirect(url_for("account.settings"))

    # A bare timestamp survives, so churn is visible. Nothing identifying does.
    db.session.add(AccountDeletion())
    db.session.delete(user)          # weeks and reset tokens cascade
    db.session.commit()

    log_out()
    return render_template("account/deleted.html")
