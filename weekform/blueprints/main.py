"""The page itself."""

from __future__ import annotations

from flask import Blueprint, Response, current_app, render_template

bp = Blueprint("main", __name__)


def _site() -> str:
    # Always https and always the configured domain. The request cannot be
    # trusted for either: behind Railway's proxy the app sees plain http.
    return f"https://{current_app.config['SITE_DOMAIN']}"


@bp.get("/")
def index() -> str:
    return render_template("index.html")


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
            f"Sitemap: {_site()}/sitemap.xml\n")
    return Response(body, mimetype="text/plain")


@bp.get("/sitemap.xml")
def sitemap() -> Response:
    # One URL, on purpose. Every other page is behind an account or carries
    # noindex from base.html, and a sitemap that lists a noindexed page
    # contradicts itself. A new public page needs adding here and losing that
    # noindex, together.
    body = ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"  <url><loc>{_site()}/</loc></url>\n"
            "</urlset>\n")
    return Response(body, mimetype="application/xml")
