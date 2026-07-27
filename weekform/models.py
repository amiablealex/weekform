"""Data model.

There is one table and it holds three things: when a strip was shared, on which
day, and whether it went out through the native share sheet or a download. No
addresses, no user agents, and nothing at all about what the strip contained —
the week never leaves the browser, so it could not be recorded here even if
somebody wanted it to be.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func

db = SQLAlchemy()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ShareEvent(db.Model):
    __tablename__ = "share_events"

    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False,
                           default=_utcnow, index=True)
    # Stored explicitly rather than derived, so grouping by day is one portable
    # query instead of a dialect-specific date function.
    day = db.Column(db.Date, nullable=False, index=True,
                    default=lambda: _utcnow().date())
    kind = db.Column(db.String(16), nullable=False, default="share")

    @staticmethod
    def record(kind: str) -> "ShareEvent":
        event = ShareEvent(kind=kind)
        db.session.add(event)
        db.session.commit()
        return event


def total_shares() -> int:
    return db.session.scalar(db.select(func.count(ShareEvent.id))) or 0


def shares_since(days: int) -> int:
    cutoff = date.today() - timedelta(days=days - 1)
    return db.session.scalar(
        db.select(func.count(ShareEvent.id)).where(ShareEvent.day >= cutoff)
    ) or 0


def daily_counts(days: int = 30) -> list[tuple[date, int]]:
    """Every day in the window, including the quiet ones."""
    cutoff = date.today() - timedelta(days=days - 1)
    rows = db.session.execute(
        db.select(ShareEvent.day, func.count(ShareEvent.id))
        .where(ShareEvent.day >= cutoff)
        .group_by(ShareEvent.day)
    ).all()
    found = {row[0]: row[1] for row in rows}
    return [(cutoff + timedelta(days=i), found.get(cutoff + timedelta(days=i), 0))
            for i in range(days)]


def counts_by_kind() -> dict[str, int]:
    rows = db.session.execute(
        db.select(ShareEvent.kind, func.count(ShareEvent.id)).group_by(ShareEvent.kind)
    ).all()
    return {row[0]: row[1] for row in rows}
