"""weekform — application factory.

The server does very little on purpose. The strip is built, rendered and
exported entirely in the browser; nothing about anybody's week is ever sent
here. Flask serves the shell, counts how many strips get shared, and shows that
count behind a password.
"""

from __future__ import annotations

import os

from flask import Flask

from .config import Config
from .models import db
from .security import configure_session, csrf_token, current_user


def create_app(config_object: type[Config] | None = None) -> Flask:
    app = Flask(
        __name__,
        static_folder="../static",
        static_url_path="/static",
        template_folder="templates",
    )
    app.config.from_object(config_object or Config)

    if not app.config.get("SECRET_KEY"):
        if app.config.get("DEBUG"):
            # Local development should not need ceremony. Sessions will not
            # survive a restart, which is fine and obvious.
            app.config["SECRET_KEY"] = "development-only"
            app.logger.warning("SECRET_KEY unset; using a throwaway development key")
        else:
            raise RuntimeError(
                "SECRET_KEY is not set. It signs the session cookie, so without "
                "it anyone could forge a login. Set it and redeploy."
            )

    configure_session(app)
    db.init_app(app)
    with app.app_context():
        try:
            db.create_all()
        except Exception:
            # A database that is missing or still waking up should not stop the
            # site coming up. Making strips needs no database at all — only the
            # share counter does — so the page stays useful and /api/healthz
            # reports the problem instead of the container dying at boot.
            app.logger.exception("could not prepare the database")

    from .blueprints.main import bp as main_bp
    from .blueprints.api import bp as api_bp
    from .blueprints.admin import bp as admin_bp
    from .blueprints.auth import bp as auth_bp
    from .blueprints.account import bp as account_bp
    from .blueprints.sync import bp as sync_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(account_bp)
    app.register_blueprint(sync_bp)

    # Templates need both of these on nearly every page.
    app.jinja_env.globals["csrf_token"] = csrf_token
    app.jinja_env.globals["current_user"] = current_user

    @app.after_request
    def security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        return response

    return app


# Convenience for `flask run` and for gunicorn's "weekform:app" form.
if os.environ.get("FLASK_RUN_FROM_CLI") or os.environ.get("WEEKFORM_EAGER_APP"):
    app = create_app()
