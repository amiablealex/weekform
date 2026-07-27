"""The page itself."""

from __future__ import annotations

from flask import Blueprint, Response, render_template

bp = Blueprint("main", __name__)


@bp.get("/")
def index() -> str:
    return render_template("index.html")


@bp.get("/privacy")
def privacy() -> str:
    return render_template("privacy.html")


@bp.get("/robots.txt")
def robots() -> Response:
    # The admin page holds no personal data, but there is no reason to index it.
    body = ("User-agent: *\n"
            "Disallow: /admin\n"
            "Disallow: /account\n"
            "Disallow: /reset\n"
            "Allow: /\n")
    return Response(body, mimetype="text/plain")
