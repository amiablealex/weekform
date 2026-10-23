"""The page itself, and the few around it that anybody may read."""

from __future__ import annotations

from flask import Blueprint, Response, render_template

from ..security import public_url

bp = Blueprint("main", __name__)

# The pages a search engine is told about. Each must also override the
# `indexing` block in base.html, or it goes out with noindex and the sitemap
# contradicts itself; the server suite checks both halves.
PUBLIC_PAGES = ("/", "/about")


@bp.get("/")
def index() -> str:
    return render_template("index.html")


@bp.get("/about")
def about() -> str:
    return render_template("about.html")


@bp.get("/privacy")
def privacy() -> str:
    return render_template("privacy.html")


@bp.get("/robots.txt")
def robots() -> Response:
    # The admin page holds no personal data, but there is no reason to index it.
    # The sign-in pages are deliberately not listed: they carry noindex from
    # base.html, and a crawler kept out by robots.txt never gets to read it.
    body = ("User-agent: *\n"
            "Disallow: /admin\n"
            "Disallow: /account\n"
            "Disallow: /reset\n"
            "Disallow: /api/\n"
            "Allow: /\n"
            "\n"
            f"Sitemap: {public_url('/sitemap.xml')}\n")
    return Response(body, mimetype="text/plain")


@bp.get("/sitemap.xml")
def sitemap() -> Response:
    urls = "".join(f"  <url><loc>{public_url(path)}</loc></url>\n" for path in PUBLIC_PAGES)
    body = ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"{urls}"
            "</urlset>\n")
    return Response(body, mimetype="application/xml")
