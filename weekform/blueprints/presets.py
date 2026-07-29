"""Preset storage.

The same bargain as weeks and goals: small, valid JSON, carrying the keys the
client promises, stored without being read. A preset holds a `days` structure
this side has never parsed and is not going to start parsing now.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from ..models import Preset, db
from ..security import csrf_ok, current_user

bp = Blueprint("presets", __name__, url_prefix="/api/presets")

PRESET_ID = re.compile(r"^[a-z0-9]{4,16}$")

# A full week of seven days holding two activities each is a few hundred bytes,
# the same as the sync endpoint stores. This leaves room to spare.
MAX_PAYLOAD_BYTES = 8 * 1024

# Mirrors LIMITS.presets in tokens.js. Three is a design decision rather than a
# storage one, but unlike the goals cap it needs no knowledge of what is inside
# a payload, so this side can hold the same line.
MAX_PRESETS = 3


def _require_user():
    user = current_user()
    if user is None:
        return None, (jsonify(ok=False, error="not signed in"), 401)
    if request.method != "GET" and not csrf_ok():
        return None, (jsonify(ok=False, error="bad token"), 403)
    return user, None


@bp.get("")
def list_presets():
    user, failure = _require_user()
    if failure:
        return failure

    rows = db.session.scalars(
        db.select(Preset)
        .where(Preset.user_id == user.id)
        .order_by(Preset.created_at, Preset.id)
    ).all()

    presets = []
    for row in rows:
        try:
            body = json.loads(row.payload)
        except ValueError:
            continue                     # unreadable row, skip rather than fail
        if isinstance(body, dict):
            body["id"] = row.preset_id   # the row key wins over whatever is inside
            presets.append(body)
    return jsonify(ok=True, presets=presets)


@bp.put("/<preset_id>")
def save_preset(preset_id: str):
    user, failure = _require_user()
    if failure:
        return failure

    if not PRESET_ID.match(preset_id or ""):
        return jsonify(ok=False, error="bad id"), 400

    raw = request.get_data(cache=False)
    if len(raw) > MAX_PAYLOAD_BYTES:
        return jsonify(ok=False, error="too large"), 413

    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        return jsonify(ok=False, error="bad json"), 400

    if not isinstance(body, dict) or "days" not in body:
        return jsonify(ok=False, error="bad shape"), 400

    body["id"] = preset_id
    payload = json.dumps(body, separators=(",", ":"))

    existing = db.session.scalar(
        db.select(Preset).where(Preset.user_id == user.id,
                                Preset.preset_id == preset_id)
    )
    if existing:
        existing.payload = payload
        existing.updated_at = datetime.now(timezone.utc)
    else:
        held = db.session.scalar(
            db.select(db.func.count(Preset.id)).where(Preset.user_id == user.id)
        ) or 0
        if held >= MAX_PRESETS:
            return jsonify(ok=False, error="too many presets"), 409
        db.session.add(Preset(user_id=user.id, preset_id=preset_id, payload=payload))

    user.last_seen_at = datetime.now(timezone.utc)
    db.session.commit()
    return jsonify(ok=True)


@bp.delete("/<preset_id>")
def delete_preset(preset_id: str):
    user, failure = _require_user()
    if failure:
        return failure

    if not PRESET_ID.match(preset_id or ""):
        return jsonify(ok=False, error="bad id"), 400

    existing = db.session.scalar(
        db.select(Preset).where(Preset.user_id == user.id,
                                Preset.preset_id == preset_id)
    )
    if existing:
        db.session.delete(existing)
        db.session.commit()
    return jsonify(ok=True)
