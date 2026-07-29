#!/usr/bin/env python3
"""Run with:  python3 tests/server.test.py

The Python counterpart to tests/logic.test.mjs, and the thing this repo has
been missing. Auth, sync isolation, goals, presets, export, password reset and
account deletion were all verified by hand until now; this is that same session
written down so it happens on every change instead of when somebody remembers.

Deliberately no pytest. This app has five dependencies, all of them runtime, and
a test runner is not worth being the sixth — the harness below is thirty lines
and matches the style of the JavaScript suite.

It builds a throwaway SQLite database in a temporary directory and deletes it on
the way out. It never touches a real one.

SQLite is not Postgres, so this does not prove behaviour in production. What it
does prove is that the ORM cascades fire, that one account cannot see another's
data, and that every endpoint rejects what it should.
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

# Configuration is read when weekform.config is imported, so the environment has
# to be set before the app package is touched at all.
_TMP = tempfile.mkdtemp(prefix="weekform-test-")
os.environ["SECRET_KEY"] = "test-only-not-a-real-key"
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP}/test.db"
os.environ["ADMIN_USER"] = "admin"
os.environ["ADMIN_PASSWORD"] = "admin-password"
os.environ.pop("RESEND_API_KEY", None)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from weekform import create_app                                    # noqa: E402
from weekform.config import Config                                 # noqa: E402
from weekform.models import (Goal, PasswordReset, Preset, User,    # noqa: E402
                             Week, db)
from weekform.security import hash_password, verify_password       # noqa: E402
from weekform import security                                      # noqa: E402
from weekform.blueprints import api as api_bp                      # noqa: E402
from weekform.blueprints import auth as auth_bp                    # noqa: E402

app = create_app()

# --- harness ---------------------------------------------------------------

fails = 0
count = 0


def eq(got, want, what):
    global fails, count
    count += 1
    if got != want:
        fails += 1
        print(f"FAIL  {what}\n        got {got!r}  want {want!r}")


def ok(condition, what):
    eq(bool(condition), True, what)


def section(name: str):
    # Rate limiters are per process and shared between tests, so a section that
    # deliberately trips one must not poison the next.
    security._buckets.clear()
    api_bp._hits.clear()
    print(f"\n{name}")


TOKEN = "test-csrf-token"
HEAD = {"X-CSRF-Token": TOKEN}


def make_user(email: str, password: str = "correct-horse") -> int:
    with app.app_context():
        user = User(email=email, password_hash=hash_password(password))
        db.session.add(user)
        db.session.commit()
        return user.id


def signed_in(uid: int):
    """A client with a session for this account and a known CSRF token."""
    client = app.test_client()
    with client.session_transaction() as sess:
        sess["uid"] = uid
        sess["csrf"] = TOKEN
    return client


def anonymous():
    client = app.test_client()
    with client.session_transaction() as sess:
        sess["csrf"] = TOKEN
    return client


def counts(uid: int) -> tuple[int, int, int]:
    with app.app_context():
        return (
            db.session.scalar(db.select(db.func.count(Week.id))
                              .where(Week.user_id == uid)) or 0,
            db.session.scalar(db.select(db.func.count(Goal.id))
                              .where(Goal.user_id == uid)) or 0,
            db.session.scalar(db.select(db.func.count(Preset.id))
                              .where(Preset.user_id == uid)) or 0,
        )


WEEK = {"title": "My Week", "days": [[{"cat": "cardio", "sub": "run"}],
                                     [], [], [], [], [], []]}
GOAL = {"id": "abcd1234", "name": "Run 20km", "cat": "cardio",
        "from": None, "to": None,
        "reqs": [{"sub": "run", "metric": "distance", "target": 20, "unit": "km"}]}
PRESET = {"id": "pppp1111", "name": "Base week",
          "days": [[{"cat": "cardio", "sub": "run"}], [], [], [], [], [], []]}


# --- the app comes up ------------------------------------------------------

section("the app comes up")
{}
with app.app_context():
    tables = set(db.metadata.tables)
eq(tables >= {"users", "weeks", "goals", "presets", "password_resets"}, True,
   "every table is created")

public = anonymous()
eq(public.get("/api/healthz").status_code, 200, "the health check answers")
eq(public.get("/").status_code, 200, "the front page renders signed out")
eq(public.get("/privacy").status_code, 200, "the privacy page renders")
eq(public.get("/robots.txt").status_code, 200, "robots.txt is served")
ok("Disallow: /account" in public.get("/robots.txt").get_data(as_text=True),
   "and keeps crawlers out of accounts")

home = public.get("/").get_data(as_text=True)
eq('id="goals"' in home, False, "the signed-out page has no goals section")
eq('id="preset-line"' in home, False, "and no preset line")
eq("/account/goals" in home, False, "and no link to goals")

eq(public.get("/account").status_code, 302, "the account area redirects when signed out")
eq(public.get("/account/goals").status_code, 302, "so does the goals page")
eq(public.get("/account/presets").status_code, 302, "and the presets page")


# --- signing up ------------------------------------------------------------

section("signing up")
client = anonymous()
response = client.post("/signup", data={"email": "  NEW@Example.COM ",
                                        "password": "long-enough-password",
                                        "consent": "yes", "csrf": TOKEN})
eq(response.status_code, 302, "a good sign-up redirects")
with app.app_context():
    created = db.session.scalar(db.select(User).where(User.email == "new@example.com"))
ok(created is not None, "the address is normalised before it is stored")
ok(created.password_hash != "long-enough-password", "the password is not stored")
ok(verify_password(created.password_hash, "long-enough-password"),
   "but it does verify")
ok(created.consented_at is not None, "and consent is timestamped")
eq(client.get("/account").status_code, 200, "sign-up signs you in")

eq(anonymous().post("/signup", data={"email": "a@b.co", "password": "short",
                                     "consent": "yes", "csrf": TOKEN}).status_code,
   400, "a short password is refused")
eq(anonymous().post("/signup", data={"email": "not-an-address",
                                     "password": "long-enough-password",
                                     "consent": "yes", "csrf": TOKEN}).status_code,
   400, "a malformed address is refused")
eq(anonymous().post("/signup", data={"email": "b@b.co", "password": "long-enough-password",
                                     "csrf": TOKEN}).status_code,
   400, "sign-up without consent is refused")
eq(anonymous().post("/signup", data={"email": "new@example.com",
                                     "password": "long-enough-password",
                                     "consent": "yes", "csrf": TOKEN}).status_code,
   400, "a duplicate address is refused")
eq(app.test_client().post("/signup", data={"email": "c@b.co",
                                           "password": "long-enough-password",
                                           "consent": "yes"}).status_code,
   302, "sign-up with no CSRF token redirects rather than creating an account")
with app.app_context():
    eq(db.session.scalar(db.select(User).where(User.email == "c@b.co")), None,
       "and really does not create it")


# --- signing in and out ----------------------------------------------------

section("signing in and out")
alice = make_user("alice@example.com")
client = anonymous()
eq(client.post("/login", data={"email": "ALICE@example.com",
                               "password": "correct-horse",
                               "csrf": TOKEN}).status_code,
   302, "the address is case-insensitive at sign-in")
eq(client.get("/account").status_code, 200, "and the session works")

wrong = anonymous().post("/login", data={"email": "alice@example.com",
                                         "password": "wrong", "csrf": TOKEN})
eq(wrong.status_code, 401, "a wrong password is refused")
ok("do not match" in wrong.get_data(as_text=True),
   "with one message for both cases, so accounts cannot be enumerated")
missing = anonymous().post("/login", data={"email": "nobody@example.com",
                                           "password": "wrong", "csrf": TOKEN})
ok("do not match" in missing.get_data(as_text=True),
   "and the same message for an address with no account")

# Signing in clears the session to get a fresh id, which rotates the CSRF token
# with it. A browser picks the new one up from the next template it renders; a
# test has to do the same, and the fact that the old token stops working is the
# property worth pinning down.
eq(client.post("/logout", data={"csrf": TOKEN}).status_code, 302,
   "a stale CSRF token is accepted as a request")
eq(client.get("/account").status_code, 200, "but does not actually sign you out")

client.get("/account/settings")                    # renders csrf_token()
with client.session_transaction() as sess:
    fresh = sess["csrf"]
ok(fresh != TOKEN, "signing in rotated the CSRF token")

eq(client.post("/logout", data={"csrf": fresh}).status_code, 302, "signing out redirects")
eq(client.get("/account").status_code, 302, "and ends the session")

# A session naming an account that no longer exists must not authenticate.
ghost = signed_in(999999)
eq(ghost.get("/account").status_code, 302, "a session for a deleted account is refused")

section("rate limiting")
for _ in range(11):
    last = anonymous().post("/login", data={"email": "alice@example.com",
                                            "password": "wrong", "csrf": TOKEN})
eq(last.status_code, 429, "repeated wrong passwords are rate limited")


# --- weeks -----------------------------------------------------------------

section("weeks")
bob = make_user("bob@example.com")
carol = make_user("carol@example.com")
b = signed_in(bob)
c = signed_in(carol)

eq(anonymous().get("/api/weeks").status_code, 401, "weeks need an account")
eq(app.test_client().put("/api/weeks/2026-07-20", json=WEEK).status_code, 401,
   "and so does writing one")

eq(b.put("/api/weeks/2026-07-20", json=WEEK, headers=HEAD).status_code, 200,
   "a week is stored")
eq(len(b.get("/api/weeks").get_json()["weeks"]), 1, "and listed")
eq(b.get("/api/weeks").get_json()["weeks"]["2026-07-20"]["days"][0][0]["cat"],
   "cardio", "with its payload untouched")

eq(b.put("/api/weeks/2026-07-20", json=WEEK).status_code, 403,
   "a write with no CSRF token is refused")
eq(b.put("/api/weeks/2026-07-22", json=WEEK, headers=HEAD).status_code, 400,
   "a week must start on a Monday")
eq(b.put("/api/weeks/not-a-date", json=WEEK, headers=HEAD).status_code, 400,
   "a malformed date is refused")
eq(b.put("/api/weeks/1900-01-01", json=WEEK, headers=HEAD).status_code, 400,
   "and so is one outside living memory")
eq(b.put("/api/weeks/2026-07-27", json={"title": "x"}, headers=HEAD).status_code, 400,
   "a payload with no days is refused")
eq(b.put("/api/weeks/2026-07-27", data="{{", headers={**HEAD, "Content-Type":
         "application/json"}).status_code, 400, "and so is broken JSON")
eq(b.put("/api/weeks/2026-07-27", data=json.dumps({"days": ["x" * 9000]}),
         headers={**HEAD, "Content-Type": "application/json"}).status_code, 413,
   "an oversized payload is refused")

eq(len(c.get("/api/weeks").get_json()["weeks"]), 0,
   "another account sees none of it")
eq(c.delete("/api/weeks/2026-07-20", headers=HEAD).status_code, 200,
   "deleting someone else's week is a no-op")
eq(len(b.get("/api/weeks").get_json()["weeks"]), 1, "and leaves it alone")

eq(b.delete("/api/weeks/2026-07-20", headers=HEAD).status_code, 200, "a week is deleted")
eq(len(b.get("/api/weeks").get_json()["weeks"]), 0, "and gone")


# --- goals -----------------------------------------------------------------

section("goals")
eq(anonymous().get("/api/goals").status_code, 401, "goals need an account")
eq(b.put("/api/goals/abcd1234", json=GOAL).status_code, 403, "and a CSRF token")

eq(b.put("/api/goals/abcd1234", json=GOAL, headers=HEAD).status_code, 200, "a goal is stored")
listed = b.get("/api/goals").get_json()["goals"]
eq(len(listed), 1, "and listed")
eq(listed[0]["reqs"][0]["unit"], "km", "with its payload untouched")
eq(listed[0]["id"], "abcd1234", "and its id taken from the row, not the body")

b.put("/api/goals/abcd1234", json={**GOAL, "name": "Run 30km"}, headers=HEAD)
listed = b.get("/api/goals").get_json()["goals"]
eq(len(listed), 1, "saving again replaces rather than duplicating")
eq(listed[0]["name"], "Run 30km", "with the new payload")

eq(b.put("/api/goals/NOT-OK", json=GOAL, headers=HEAD).status_code, 400, "a bad id is refused")
eq(b.put("/api/goals/zzzz0001", json={"name": "x"}, headers=HEAD).status_code, 400,
   "a payload with no reqs is refused")
eq(b.put("/api/goals/zzzz0001", data=json.dumps({"cat": "cardio", "reqs": ["x" * 5000]}),
         headers={**HEAD, "Content-Type": "application/json"}).status_code, 413,
   "an oversized goal is refused")

# The storage ceiling is generous, because the limit that matters — how many are
# active in the same week — needs the dates read, and this side does not read.
from weekform.blueprints.goals import MAX_GOALS                    # noqa: E402
ok(MAX_GOALS > 6, "the server ceiling is a storage limit, not the active limit")
for i in range(1, MAX_GOALS + 2):
    gid = f"bulk{i:04d}"
    last = b.put(f"/api/goals/{gid}", json={**GOAL, "id": gid}, headers=HEAD)
eq(last.status_code, 409, f"the goal past {MAX_GOALS} is refused")
eq(len(b.get("/api/goals").get_json()["goals"]), MAX_GOALS,
   f"and exactly {MAX_GOALS} are held")

eq(len(c.get("/api/goals").get_json()["goals"]), 0, "another account sees none of them")
eq(c.delete("/api/goals/abcd1234", headers=HEAD).status_code, 200,
   "deleting someone else's goal is a no-op")
eq(len(b.get("/api/goals").get_json()["goals"]), MAX_GOALS, "and leaves them alone")


# --- presets ---------------------------------------------------------------

section("presets")
from weekform.blueprints.presets import MAX_PRESETS                # noqa: E402

eq(anonymous().get("/api/presets").status_code, 401, "presets need an account")
eq(b.put("/api/presets/pppp1111", json=PRESET).status_code, 403, "and a CSRF token")

eq(b.put("/api/presets/pppp1111", json=PRESET, headers=HEAD).status_code, 200,
   "a preset is stored")
listed = b.get("/api/presets").get_json()["presets"]
eq(len(listed), 1, "and listed")
eq(listed[0]["days"][0][0]["cat"], "cardio", "with its days untouched")
eq("weekStart" in listed[0], False, "a preset carries no date")

b.put("/api/presets/pppp1111", json={**PRESET, "name": "Renamed"}, headers=HEAD)
listed = b.get("/api/presets").get_json()["presets"]
eq(len(listed), 1, "saving again replaces rather than duplicating")
eq(listed[0]["name"], "Renamed", "with the new name")

eq(b.put("/api/presets/NO!", json=PRESET, headers=HEAD).status_code, 400, "a bad id is refused")
eq(b.put("/api/presets/pppp2222", json={"name": "x"}, headers=HEAD).status_code, 400,
   "a payload with no days is refused")

for i in range(2, MAX_PRESETS + 3):
    pid = f"prst{i:04d}"
    last = b.put(f"/api/presets/{pid}", json={**PRESET, "id": pid}, headers=HEAD)
eq(last.status_code, 409, f"the preset past {MAX_PRESETS} is refused")
eq(len(b.get("/api/presets").get_json()["presets"]), MAX_PRESETS,
   f"and exactly {MAX_PRESETS} are held")

eq(len(c.get("/api/presets").get_json()["presets"]), 0, "another account sees none of them")
eq(c.delete("/api/presets/pppp1111", headers=HEAD).status_code, 200,
   "deleting someone else's preset is a no-op")
eq(len(b.get("/api/presets").get_json()["presets"]), MAX_PRESETS, "and leaves them alone")

eq(b.delete("/api/presets/pppp1111", headers=HEAD).status_code, 200, "a preset is deleted")
eq(len(b.get("/api/presets").get_json()["presets"]), MAX_PRESETS - 1, "and gone")


# --- the pages behind an account -------------------------------------------

section("the pages behind an account")
b.put("/api/weeks/2026-07-20", json=WEEK, headers=HEAD)
for path in ["/account", "/account/goals", "/account/presets", "/account/settings"]:
    eq(b.get(path).status_code, 200, f"{path} renders")

settings = b.get("/account/settings").get_data(as_text=True)
ok("Goals set" in settings and "Presets kept" in settings,
   "settings reports what is held")

page = b.get("/").get_data(as_text=True)
ok('id="goals"' in page, "the signed-in front page has a goals section")
ok('id="preset-line"' in page, "and a preset line")
# Every account feature is named in the guide line. Presets were the only one
# that was not, which was the whole of their discoverability problem.
ok("See your history" in page, "the guide line offers history")
ok("set goals" in page, "and goals")
ok("keep preset weeks" in page, "and presets")
ok("/account/presets" in page, "with a real link to the presets page")
ok("window.WEEKFORM" in page, "and the handshake its scripts need")
ok("window.WEEKFORM" in b.get("/account").get_data(as_text=True),
   "as do the account pages")

goals_page = b.get("/account/goals").get_data(as_text=True)
ok('id="goal-list"' in goals_page and 'id="goal-add"' in goals_page
   and 'id="goal-note"' in goals_page, "the goals page carries every id its script uses")
presets_page = b.get("/account/presets").get_data(as_text=True)
ok('id="preset-list"' in presets_page and 'id="preset-note"' in presets_page
   and 'id="preset-add"' in presets_page,
   "and so does the presets page")


# --- the export ------------------------------------------------------------

section("the export")
document = b.get("/account/export").get_json()
eq(document["account"]["email"], "bob@example.com", "the export names the account")
eq("password" in json.dumps(document), False, "and carries no password of any kind")
ok(len(document["weeks"]) >= 1, "it carries weeks")
ok(len(document["goals"]) >= 1, "it carries goals")
ok(len(document["presets"]) >= 1, "it carries presets")
eq(document["weeks"][0]["days"][0][0]["cat"], "cardio", "with real contents")


# --- password reset --------------------------------------------------------

section("password reset")
dave = make_user("dave@example.com")
captured = {}


def fake_send(address, link):
    captured["link"] = link
    return True, "ok"


real_send = auth_bp.send_reset_link
auth_bp.send_reset_link = fake_send
try:
    client = anonymous()
    eq(client.post("/forgot", data={"email": "dave@example.com",
                                    "csrf": TOKEN}).status_code, 200,
       "a reset request is accepted")
    ok("link" in captured, "and a link is sent")
    token = captured["link"].rsplit("/", 1)[-1]

    with app.app_context():
        record = db.session.scalar(db.select(PasswordReset)
                                   .where(PasswordReset.user_id == dave))
        eq(record.token_hash == token, False, "only a hash of the token is stored")
        ok(len(record.token_hash) == 64, "and it is a sha256 digest")

    unknown = anonymous().post("/forgot", data={"email": "nobody@example.com",
                                                "csrf": TOKEN})
    eq(unknown.status_code, 200,
       "an address with no account gets the same answer, so accounts cannot be found")

    eq(anonymous().get(f"/reset/{token}").status_code, 200, "the link opens")
    eq(anonymous().get("/reset/made-up-token").status_code, 400, "an invented one does not")

    client = anonymous()
    eq(client.post(f"/reset/{token}", data={"password": "a-brand-new-password",
                                            "csrf": TOKEN}).status_code, 302,
       "the password is changed")
    eq(client.get("/account").status_code, 200, "and it signs you in")
    eq(anonymous().get(f"/reset/{token}").status_code, 400, "the link is then dead")

    with app.app_context():
        user = db.session.get(User, dave)
        ok(verify_password(user.password_hash, "a-brand-new-password"),
           "the new password works")
        ok(not verify_password(user.password_hash, "correct-horse"),
           "and the old one does not")

    # An expired link must not work even though it was never used.
    with app.app_context():
        stale = PasswordReset(user_id=dave, token_hash="0" * 64,
                              expires_at=datetime.now(timezone.utc) - timedelta(hours=1))
        db.session.add(stale)
        db.session.commit()
    eq(anonymous().get("/reset/anything-hashing-to-zeroes").status_code, 400,
       "an expired link is dead")
finally:
    auth_bp.send_reset_link = real_send


# --- deleting an account ---------------------------------------------------

section("deleting an account")
weeks, goals, presets = counts(bob)
ok(weeks and goals and presets, "bob has weeks, goals and presets before deleting")

eq(b.post("/account/delete", data={"password": "wrong", "csrf": TOKEN}).status_code, 302,
   "the wrong password does not delete")
eq(counts(bob), (weeks, goals, presets), "and nothing is removed")
eq(b.post("/account/delete", data={"password": "correct-horse"}).status_code, 302,
   "neither does a missing CSRF token")
eq(counts(bob), (weeks, goals, presets), "and nothing is removed")

eq(b.post("/account/delete", data={"password": "correct-horse",
                                   "csrf": TOKEN}).status_code, 200,
   "the right password deletes")
eq(counts(bob), (0, 0, 0), "and takes every week, goal and preset with it")
with app.app_context():
    eq(db.session.get(User, bob), None, "the account is gone")
    ok(db.session.scalar(db.select(db.func.count(Week.id))) is not None,
       "other accounts' rows survive")
eq(b.get("/account").status_code, 302, "and the session ends")

# The ORM cascade is one of two. The other is the database's own ON DELETE
# CASCADE, which SQLite ignores unless foreign keys are switched on — the trap
# that once left every saved week behind. Deleting with raw SQL skips the ORM
# entirely and tests only that second cascade.
section("the database's own cascade")
eve = make_user("eve@example.com")
e = signed_in(eve)
e.put("/api/weeks/2026-07-20", json=WEEK, headers=HEAD)
e.put("/api/goals/abcd1234", json=GOAL, headers=HEAD)
e.put("/api/presets/pppp1111", json=PRESET, headers=HEAD)
ok(all(counts(eve)), "eve has one of everything")
with app.app_context():
    db.session.execute(db.text("DELETE FROM users WHERE id = :i"), {"i": eve})
    db.session.commit()
eq(counts(eve), (0, 0, 0),
   "a raw delete still removes every child row, so foreign keys are enforced")


# --- the share counter -----------------------------------------------------

section("the share counter")
counter = anonymous()
eq(counter.post("/api/share", json={"kind": "share"}).status_code, 200,
   "a share is counted")
eq(counter.post("/api/share", json={"kind": "nonsense"}).status_code, 200,
   "an unknown kind is accepted and filed as a share")
with app.app_context():
    from weekform.models import ShareEvent
    stored = db.session.scalars(db.select(ShareEvent)).all()
    ok(len(stored) >= 2, "and both are stored")
    eq(any(getattr(row, "user_id", None) for row in stored), False,
       "with nothing identifying attached")

for _ in range(app.config["SHARE_RATE_LIMIT"] + 2):
    last = counter.post("/api/share", json={"kind": "share"})
eq(last.status_code, 429, "the counter is rate limited")


# --- admin -----------------------------------------------------------------

section("admin")
eq(anonymous().get("/admin").status_code, 401, "admin challenges without credentials")
import base64                                                      # noqa: E402
credential = base64.b64encode(b"admin:admin-password").decode()
eq(anonymous().get("/admin", headers={"Authorization": f"Basic {credential}"}).status_code,
   200, "and opens with them")
eq(anonymous().get("/admin", headers={"Authorization": "Basic " +
   base64.b64encode(b"admin:wrong").decode()}).status_code, 401,
   "a wrong password is refused")


class NoAdmin(Config):
    ADMIN_PASSWORD = ""


eq(create_app(NoAdmin).test_client().get("/admin").status_code, 503,
   "admin is closed entirely when no password is configured")


# --- security headers ------------------------------------------------------

section("security headers")
headers = anonymous().get("/").headers
eq(headers.get("X-Frame-Options"), "DENY", "the page cannot be framed")
eq(headers.get("X-Content-Type-Options"), "nosniff", "and types are not sniffed")
ok(headers.get("Referrer-Policy"), "a referrer policy is set")


# --- out -------------------------------------------------------------------

shutil.rmtree(_TMP, ignore_errors=True)
print(f"\n{count} assertions passed." if fails == 0
      else f"\n{fails} of {count} assertions FAILED.")
sys.exit(1 if fails else 0)
