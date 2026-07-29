"""Goal storage.

The same bargain as weeks: the server checks that a goal is small, is valid
JSON, and carries the keys the client promises — then stores it without looking
inside. It does not know what a requirement is, what a category is, or what
counts as met. Adding an activity type therefore still needs no deploy here.

The one thing it does enforce is a ceiling on how many goals an account can
hold, because that is a limit on this side's storage rather than a judgement
about anybody's training.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from ..models import Goal, db
from ..security import csrf_ok, current_user

bp = Blueprint("goals", __name__, url_prefix="/api/goals")

GOAL_ID = re.compile(r"^[a-z0-9]{4,16}$")

# A goal with four parts encodes to a few hundred bytes. This leaves room to
# spare while capping what one request can store.
MAX_PAYLOAD_BYTES = 4 * 1024

# Mirrors LIMITS.storedGoals in tokens.js, and is a storage ceiling rather than
# a design one. How many goals may be active in the *same week* is capped at six
# by the client, and only the client can enforce that: working out what is
# active means reading `from` and `to`, and this side does not read payloads.
MAX_GOALS = 40


def _require_user():
    user = current_user()
    if user is None:
        return None, (jsonify(ok=False, error="not signed in"), 401)
    if request.method != "GET" and not csrf_ok():
        return None, (jsonify(ok=False, error="bad token"), 403)
    return user, None


@bp.get("")
def list_goals():
    user, failure = _require_user()
    if failure:
        return failure

    rows = db.session.scalars(
        db.select(Goal).where(Goal.user_id == user.id).order_by(Goal.created_at, Goal.id)
    ).all()

    goals = []
    for row in rows:
        try:
            body = json.loads(row.payload)
        except ValueError:
            continue                     # unreadable row, skip rather than fail
        if isinstance(body, dict):
            body["id"] = row.goal_id     # the row key wins over whatever is inside
            goals.append(body)
    return jsonify(ok=True, goals=goals)


@bp.put("/<goal_id>")
def save_goal(goal_id: str):
    user, failure = _require_user()
    if failure:
        return failure

    if not GOAL_ID.match(goal_id or ""):
        return jsonify(ok=False, error="bad id"), 400

    raw = request.get_data(cache=False)
    if len(raw) > MAX_PAYLOAD_BYTES:
        return jsonify(ok=False, error="too large"), 413

    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        return jsonify(ok=False, error="bad json"), 400

    if not isinstance(body, dict) or "reqs" not in body or "cat" not in body:
        return jsonify(ok=False, error="bad shape"), 400

    body["id"] = goal_id
    payload = json.dumps(body, separators=(",", ":"))

    existing = db.session.scalar(
        db.select(Goal).where(Goal.user_id == user.id, Goal.goal_id == goal_id)
    )
    if existing:
        existing.payload = payload
        existing.updated_at = datetime.now(timezone.utc)
    else:
        held = db.session.scalar(
            db.select(db.func.count(Goal.id)).where(Goal.user_id == user.id)
        ) or 0
        if held >= MAX_GOALS:
            return jsonify(ok=False, error="too many goals"), 409
        db.session.add(Goal(user_id=user.id, goal_id=goal_id, payload=payload))

    user.last_seen_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(ok=True)


@bp.delete("/<goal_id>")
def delete_goal(goal_id: str):
    user, failure = _require_user()
    if failure:
        return failure

    if not GOAL_ID.match(goal_id or ""):
        return jsonify(ok=False, error="bad id"), 400

    existing = db.session.scalar(
        db.select(Goal).where(Goal.user_id == user.id, Goal.goal_id == goal_id)
    )
    if existing:
        db.session.delete(existing)
        db.session.commit()
    return jsonify(ok=True)
