"""The page itself."""

from __future__ import annotations

from flask import Blueprint, Response, render_template

bp = Blueprint("main", __name__)


@bp.get("/")
def index() -> str:
    return render_template("index.html")


@bp.get("/robots.txt")
def robots() -> Response:
    # The admin page holds no personal data, but there is no reason to index it.
    body = "User-agent: *\nDisallow: /admin\nAllow: /\n"
    return Response(body, mimetype="text/plain")
