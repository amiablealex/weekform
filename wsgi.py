"""Entry point for WSGI servers that want a module-level application."""

from weekform import create_app

app = create_app()
