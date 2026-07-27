"""Week sync.

The server treats a week as a blob. It checks that the blob is small, is valid
JSON, and has the two keys the client promises — and then stores it without
looking inside. That is deliberate: activity types, colours and icons stay a
client-side concern, so adding one never requires a deploy on this side.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timezone

from flask import Blueprint, jsonify, request

from ..models import Week, db
from ..security import csrf_ok, current_user

bp = Blueprint("sync", __name__, url_prefix="/api/weeks")

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# A week of seven days holding two activities each encodes to a few hundred
# bytes. This leaves room to spare while capping what one request can store.
MAX_PAYLOAD_BYTES = 8 * 1024


def _parse_week_start(raw: str) -> date | None:
    if not ISO_DATE.match(raw or ""):
        return None
    try:
        parsed = date.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.weekday() != 0:
        return None                      # weeks start on Monday, always
    if not (date(2000, 1, 1) <= parsed <= date(2100, 1, 1)):
        return None
    return parsed


def _require_user():
    user = current_user()
    if user is None:
        return None, (jsonify(ok=False, error="not signed in"), 401)
    if request.method != "GET" and not csrf_ok():
        return None, (jsonify(ok=False, error="bad token"), 403)
    return user, None


@bp.get("")
def list_weeks():
    user, failure = _require_user()
    if failure:
        return failure

    rows = db.session.scalars(
        db.select(Week).where(Week.user_id == user.id).order_by(Week.week_start)
    ).all()

    weeks = {}
    for row in rows:
        try:
            weeks[row.week_start.isoformat()] = json.loads(row.payload)
        except ValueError:
            continue                     # unreadable row, skip rather than fail
    return jsonify(ok=True, weeks=weeks)


@bp.put("/<week_start>")
def save_week(week_start: str):
    user, failure = _require_user()
    if failure:
        return failure

    monday = _parse_week_start(week_start)
    if monday is None:
        return jsonify(ok=False, error="bad week"), 400

    raw = request.get_data(cache=False)
    if len(raw) > MAX_PAYLOAD_BYTES:
        return jsonify(ok=False, error="too large"), 413

    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        return jsonify(ok=False, error="bad json"), 400

    if not isinstance(body, dict) or "days" not in body:
        return jsonify(ok=False, error="bad shape"), 400

    payload = json.dumps({
        "title": body.get("title", ""),
        "days": body.get("days", []),
    }, separators=(",", ":"))

    existing = db.session.scalar(
        db.select(Week).where(Week.user_id == user.id, Week.week_start == monday)
    )
    if existing:
        existing.payload = payload
        existing.updated_at = datetime.now(timezone.utc)
    else:
        db.session.add(Week(user_id=user.id, week_start=monday, payload=payload))

    user.last_seen_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(ok=True)


@bp.delete("/<week_start>")
def delete_week(week_start: str):
    user, failure = _require_user()
    if failure:
        return failure

    monday = _parse_week_start(week_start)
    if monday is None:
        return jsonify(ok=False, error="bad week"), 400

    existing = db.session.scalar(
        db.select(Week).where(Week.user_id == user.id, Week.week_start == monday)
    )
    if existing:
        db.session.delete(existing)
        db.session.commit()
    return jsonify(ok=True)
