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


def create_app(config_object: type[Config] | None = None) -> Flask:
    app = Flask(
        __name__,
        static_folder="../static",
        static_url_path="/static",
        template_folder="templates",
    )
    app.config.from_object(config_object or Config)

    db.init_app(app)
    with app.app_context():
        db.create_all()

    from .blueprints.main import bp as main_bp
    from .blueprints.api import bp as api_bp
    from .blueprints.admin import bp as admin_bp

    app.register_blueprint(main_bp)
    app.register_blueprint(api_bp)
    app.register_blueprint(admin_bp)

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
