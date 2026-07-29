"""Data model.

Signed out, nothing is stored about anybody: `share_events` counts strips and
holds no addresses, no user agents and nothing about what a strip contained.

Signing in changes that, and only by what it has to. An account is an email
address, a password hash, the weeks that person chose to save, any goals they
set, and any preset weeks they keep. A week is
stored as the same opaque blob the URL fragment already carries — the server
never parses it, never looks inside it, and does not know what a doughnut is.
That is partly principle and partly design: activity types stay a client-side
concern, so adding one never needs a migration.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import event, func
from sqlalchemy.engine import Engine

db = SQLAlchemy()


@event.listens_for(Engine, "connect")
def _enforce_sqlite_foreign_keys(dbapi_connection, _record):
    """SQLite ignores foreign keys unless asked not to.

    Without this, local development quietly behaves differently from production
    on exactly the operations where a difference matters most.
    """
    if dbapi_connection.__class__.__module__.startswith("sqlite3"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_utcnow)
    # When the storage notice at sign-up was agreed to. Kept because being able
    # to say when somebody consented is the whole point of asking.
    consented_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_utcnow)
    last_seen_at = db.Column(db.DateTime(timezone=True), nullable=True)

    # Cascade is handled by the ORM rather than left to the database.
    # `passive_deletes=True` defers to the database's own ON DELETE CASCADE,
    # and SQLite ignores foreign keys unless they are explicitly switched on —
    # so deleting an account left every saved week behind. For a promise as
    # consequential as "this removes everything", it is done twice: SQLAlchemy
    # deletes the children itself, and the ON DELETE CASCADE below stays as a
    # backstop for anything that reaches the tables another way.
    weeks = db.relationship("Week", back_populates="user",
                            cascade="all, delete-orphan")
    goals = db.relationship("Goal", back_populates="user",
                            cascade="all, delete-orphan")
    presets = db.relationship("Preset", back_populates="user",
                              cascade="all, delete-orphan")
    resets = db.relationship("PasswordReset", back_populates="user",
                             cascade="all, delete-orphan")

    @staticmethod
    def normalise_email(raw: str) -> str:
        return (raw or "").strip().lower()


class Week(db.Model):
    """One saved week. `payload` is opaque JSON, never inspected by the server."""

    __tablename__ = "weeks"
    __table_args__ = (
        db.UniqueConstraint("user_id", "week_start", name="uq_week_per_user"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer,
                        db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    week_start = db.Column(db.Date, nullable=False, index=True)
    payload = db.Column(db.Text, nullable=False)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False,
                           default=_utcnow, onupdate=_utcnow)

    user = db.relationship("User", back_populates="weeks")


class Goal(db.Model):
    """One goal. `payload` is opaque JSON, never inspected by the server.

    A row per goal rather than one document per user, so two open tabs cannot
    lose each other's edits, and so deleting one goal is a delete rather than a
    rewrite of the whole set.

    The server knows a goal has an id, a name and some parts. It does not know
    what a part is, which keeps the activity taxonomy a client-side concern
    exactly as it is for weeks.
    """

    __tablename__ = "goals"
    __table_args__ = (
        db.UniqueConstraint("user_id", "goal_id", name="uq_goal_per_user"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer,
                        db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    goal_id = db.Column(db.String(16), nullable=False)
    payload = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False,
                           default=_utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False,
                           default=_utcnow, onupdate=_utcnow)

    user = db.relationship("User", back_populates="goals")


class Preset(db.Model):
    """One preset week. `payload` is opaque JSON, never inspected by the server.

    A preset holds the same `days` structure a week does, so this table is the
    weeks table with a name instead of a date. It is kept separate rather than
    flagged on `weeks`, because a preset has no place in the calendar and a
    saved week has no name.
    """

    __tablename__ = "presets"
    __table_args__ = (
        db.UniqueConstraint("user_id", "preset_id", name="uq_preset_per_user"),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer,
                        db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    preset_id = db.Column(db.String(16), nullable=False)
    payload = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False,
                           default=_utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False,
                           default=_utcnow, onupdate=_utcnow)

    user = db.relationship("User", back_populates="presets")


class PasswordReset(db.Model):
    """A single-use reset link.

    Only a hash of the token is kept, so a copy of this table is not a set of
    working reset links.
    """

    __tablename__ = "password_resets"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer,
                        db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    token_hash = db.Column(db.String(64), nullable=False, unique=True, index=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_utcnow)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    used_at = db.Column(db.DateTime(timezone=True), nullable=True)

    user = db.relationship("User", back_populates="resets")


class AccountDeletion(db.Model):
    """A timestamp and nothing else, so churn is visible without keeping anyone."""

    __tablename__ = "account_deletions"

    id = db.Column(db.Integer, primary_key=True)
    deleted_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_utcnow)


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


# --- account metrics -------------------------------------------------------

def total_users() -> int:
    return db.session.scalar(db.select(func.count(User.id))) or 0


def users_since(days: int) -> int:
    cutoff = _utcnow() - timedelta(days=days)
    return db.session.scalar(
        db.select(func.count(User.id)).where(User.created_at >= cutoff)
    ) or 0


def active_users(days: int = 30) -> int:
    cutoff = _utcnow() - timedelta(days=days)
    return db.session.scalar(
        db.select(func.count(User.id)).where(User.last_seen_at >= cutoff)
    ) or 0


def users_with_weeks() -> int:
    return db.session.scalar(
        db.select(func.count(func.distinct(Week.user_id)))
    ) or 0


def total_weeks() -> int:
    return db.session.scalar(db.select(func.count(Week.id))) or 0


def total_goals() -> int:
    return db.session.scalar(db.select(func.count(Goal.id))) or 0


def total_presets() -> int:
    return db.session.scalar(db.select(func.count(Preset.id))) or 0


def total_deletions() -> int:
    return db.session.scalar(db.select(func.count(AccountDeletion.id))) or 0
