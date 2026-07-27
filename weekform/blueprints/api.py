"""The counter endpoint, and a health check for the platform."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from flask import Blueprint, current_app, jsonify, request

from ..models import ShareEvent, db

bp = Blueprint("api", __name__, url_prefix="/api")

VALID_KINDS = {"share", "download"}

# A deliberately modest in-process limiter. It is per worker rather than global,
# which is fine for what it defends: a counter with no value to inflate beyond
# vanity. Anything sturdier would mean Redis, and that is a lot of moving parts
# for a number on a private page.
_hits: dict[str, deque] = defaultdict(deque)
_WINDOW = 60.0


def _rate_limited(key: str, limit: int) -> bool:
    now = time.monotonic()
    seen = _hits[key]
    while seen and now - seen[0] > _WINDOW:
        seen.popleft()
    if len(seen) >= limit:
        return True
    seen.append(now)
    if len(_hits) > 4096:            # crude ceiling so this cannot grow forever
        _hits.clear()
    return False


@bp.post("/share")
def record_share():
    payload = request.get_json(silent=True) or {}
    kind = payload.get("kind")
    if kind not in VALID_KINDS:
        kind = "share"

    address = request.headers.get("X-Forwarded-For", request.remote_addr or "?")
    address = address.split(",")[0].strip()

    if _rate_limited(address, current_app.config["SHARE_RATE_LIMIT"]):
        return jsonify(ok=False, error="too many requests"), 429

    try:
        ShareEvent.record(kind)
    except Exception:
        db.session.rollback()
        current_app.logger.exception("could not record a share")
        return jsonify(ok=False), 500

    return jsonify(ok=True)


@bp.get("/healthz")
def healthz():
    """Liveness. Touches nothing.

    This deliberately does not query the database. An earlier version did, and
    when the database was cold the query blocked for thirteen seconds — long
    enough for the platform's health check to time out and refuse to release a
    deploy, while the site itself was serving perfectly. A liveness check that
    can be made slow by a dependency is not a liveness check.

    Database reachability is reported on the admin page, where somebody is
    actually looking, and a broken database already degrades loudly at
    /api/share.
    """
    return jsonify(ok=True)
