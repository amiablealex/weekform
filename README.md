# weekform

A tool that turns a week of training into one wide image you can drop straight
into a group chat. Seven circles, Monday to Sunday, one per day. No accounts, no
feed, no streaks.

**weekform.app**

---

## Accounts

Optional, and the tool is complete without one. Signed out, nothing is uploaded
and nothing is stored about anybody. Signing in adds one thing: your weeks are
kept server-side too, so they survive a new phone, and a month calendar becomes
available at `/account`.

localStorage stays the working copy either way. The server is a second home for
it, not the source of truth, so the app behaves identically offline. Weeks built
before signing in are uploaded on first sign-in rather than lost. Where both
sides hold the same week, the server wins — it is the copy that followed you
from your last device, and choosing a side beats inventing a merge nobody asked
for.

A week is stored as the same opaque blob the URL fragment carries. The server
checks it is small and well-formed and then stores it without looking inside,
which is why adding an activity type is still a one-file change in `tokens.js`
with no deploy on the server side.

## How it works

The strip is built, drawn and exported entirely in the browser. The canvas on
screen *is* the exported PNG at a different CSS size, so the preview cannot
drift from the file you share. The week itself lives in the URL fragment, which
is never sent in an HTTP request — nobody's training week reaches the server,
and there is nowhere for it to be logged.

The server therefore does three things: serve the page, count how many strips
get shared, and show that count behind a password.

## Running it locally

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export ADMIN_PASSWORD=something          # /admin stays locked without this
flask --app weekform run --debug --host 0.0.0.0 --port 8000
```

Then <http://localhost:8000>, or the Pi's Tailscale address from your phone.
With no `DATABASE_URL` set it writes a SQLite file into the project root.

The render harness still works and needs no Flask at all:

```bash
python3 -m http.server 8000     # then /harness.html
```

## Tests

```bash
node tests/logic.test.mjs
```

147 assertions covering the date rules, duration formatting, taxonomy
resolution, text measurement, per-week storage and the URL state encoding —
including what happens when somebody hand-edits a link.

There are no npm dependencies. The `package.json` in `static/js/` exists only so
Node treats the sibling `.js` files as ES modules, and it lives in that
directory rather than at the repo root on purpose: a root `package.json` makes
build systems conclude this is a Node project. That is exactly how the first
Railway deploy failed.

## Email

Password reset is the only message this app ever sends. No welcome mail, no
digests, nothing to unsubscribe from.

Set up at Resend: add `weekform.app` as a domain, copy the DKIM and SPF records
it gives you into Cloudflare exactly as shown, leave them as DNS-only, and wait
for the domain to verify. Then set `RESEND_API_KEY` and `MAIL_FROM`.

Without a key the app still runs and the reset page says so plainly, rather than
pretending to send something.

## Schema changes

There are no migrations. `create_all` creates missing tables and leaves existing
ones alone, which covers every change so far — including adding accounts to a
live database.

It does not cover altering an existing column, and the first time that is
needed, adopt Alembic then: `pip install Flask-Migrate`, initialise it, generate
one revision, and `flask db stamp head` on the production database so it knows
the current schema is already applied. Deferred deliberately rather than
overlooked — running migrations at container start-up is a failure mode, and it
was not worth adding before it earned its place.

## Deploying to Railway

The repo ships a `Dockerfile`, and Railway uses it in preference to guessing.
That is deliberate — build detection is one more thing that can be wrong at the
least convenient moment.

1. Push to GitHub.
2. New project in Railway, deploy from the repo. It will pick up the Dockerfile
   without further configuration.
3. Add a Postgres service to the same project. `DATABASE_URL` appears
   automatically; the app rewrites the legacy `postgres://` scheme it hands out.
   Without one it falls back to SQLite, which works but is wiped on every
   deploy — fine for a first look, not for keeping a count.
4. Set `SECRET_KEY`. It signs the session cookie, so without it anybody could
   forge a login — the container refuses to start rather than accept a default,
   and says so in the first line of the deploy log. Generate one with
   `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`.
5. Set `ADMIN_USER` and `ADMIN_PASSWORD`. Until `ADMIN_PASSWORD` exists, `/admin`
   returns 503 rather than opening — a deploy that forgets it should not quietly
   publish its own stats.
6. Set `RESEND_API_KEY` and `MAIL_FROM` if you want password reset to work.
7. Point the custom domain at the service and add the CNAME Railway gives you.

To run the image the same way locally:

```bash
docker build -t weekform .
docker run --rm -p 8000:8000 -e ADMIN_PASSWORD=x weekform
```

Health checks hit `/api/healthz`, which touches nothing and answers
immediately. An earlier version queried the database, and when the database was
cold that query blocked for thirteen seconds — long enough for Railway's health
check to time out and refuse the deploy while the site itself was serving
perfectly. A liveness check a dependency can make slow is not a liveness check.

Database reachability is shown on `/admin` instead, and `/api/share` fails
loudly on its own. A database missing at boot is logged rather than fatal: the
strip is built entirely in the browser, so a visitor loses nothing but the
counter.

The Dockerfile has no `EXPOSE` on purpose. Railway derives a service's target
port from `EXPOSE` when present while separately injecting `PORT`, and if the
two disagree the container binds one port while health checks hit another.
Without it, `PORT` is the single answer. `start.sh` logs the port and the
configuration it found before handing over to gunicorn, so the deploy log says
what happened.

Every entry point runs `start.sh`: the Dockerfile's `CMD`, the `Procfile`, and
`startCommand` in `railway.json`. That is not belt and braces for its own sake.
Railway prefers a Procfile over the image's `CMD`, and it runs start commands
without a shell — so a bare `$PORT` in a start command reaches gunicorn as five
literal characters rather than a number. Funnelling every path through one
script means whichever one wins, `PORT` is expanded by the same code.

## Files

```
static/js/tokens.js    palette, geometry, typography, activity taxonomy
static/js/icons.js     13 glyphs as op lists, canvas + SVG renderers
static/js/week.js      Monday-anchored weeks, default-week rule, date formatting
static/js/render.js    the canvas renderer and PNG export
static/js/state.js     validation, URL fragment encoding, local persistence
static/js/sheet.js     the bottom sheet, generated from the taxonomy
static/js/app.js       preview, tap zones, week navigation, share
static/js/sync.js      device-to-account reconciliation
static/js/calendar.js  the month view
static/css/app.css     app chrome
weekform/              Flask app: factory, config, models, security, mail
weekform/blueprints/   main, api, admin, auth, account, sync
harness.html           render harness, no server required
tests/logic.test.mjs   assertions for the pure logic
```

## Design decisions worth knowing

**One renderer.** The preview and the export are the same code on the same
canvas. There is no second drawing path to keep in step.

**Two colour tiers.** Training days get a saturated fill and a white glyph.
Non-training days (rest, illness, vacation) get a pale fill and a deep glyph in
the same hue. Partly forced — a pastel yellow cannot carry a white icon at
readable contrast — and partly deliberate: effort should be loud, absence quiet.

**Filled mass over outlines.** A thin outlined ring inside a circular badge
reads as nothing at small size. Sport is a solid disc with knocked-out seams,
and the doughnut has a bite taken out so its silhouette is not just a circle.

**One glyph per activity, detail as label.** A workout is a dumbbell; which body
part it was is a caption. New sub-types cost nothing to add — chest arrived
without anything being drawn.

**Labels are sized as a row.** All seven captions share one font size, chosen so
the widest fits its column. Sizing each independently left one day's caption
visibly smaller than the rest.

**Two activities per day, not three.** The stacked circle offsets by 22px into a
30px gap between columns. A third would collide with the next day.

**Tap targets are columns, not circles.** At phone width the drawn circles are
about 38px across. The transparent zones over them are the full column, roughly
55×80px, comfortably past the 44px minimum.

**Each week is stored separately.** Weeks are kept on the device keyed by their
Monday, so stepping back to last week shows last week rather than this week's
circles relabelled. Forty weeks are retained, then the oldest are dropped. An
untouched week is not given a slot at all, and a week you clear releases its
slot again. The picker marks weeks that already hold something.

**Empty days render as rest, and say so in the editor.** The day stays empty in
state, and the editor draws a dashed ring over it. The export is drawn on a
separate canvas, so that marker never reaches the image.

**The export is prepared before it is needed.** Safari only allows
`navigator.share()` inside a live user gesture, and awaiting a canvas export
inside the click handler loses it — the share sheet then silently never opens.
The PNG is rendered on every change so the handler stays synchronous.

## Sharing needs HTTPS

`navigator.share` only exists in a secure context, so plain http — a LAN address
or a Tailscale IP during development — always falls back to downloading the PNG.
Most desktop browsers do not implement file sharing at all. The button reads
"Save image" rather than "Share" when that is what will happen.

To test the real share sheet before deploying:

```bash
sudo tailscale serve --bg 8000
```

which serves the app over HTTPS on your tailnet.

## Privacy

Signed out, one table and three columns: when a strip was shared, on which day, and whether it
went through the native share sheet or a download. No addresses, no user agents,
nothing about the strip's contents. The week never leaves the browser, so it
could not be recorded even if somebody wanted it to be.

Signed in, that grows by exactly what it has to: an email address, a password
hash, and the weeks that person chose to save. Weeks are stored as they arrive
and are never read, analysed or profiled — the server does not know what a
doughnut is. Deleting an account removes the account, every saved week and every
outstanding reset token in one transaction, leaving only a bare timestamp so
churn is visible. Everything held can be downloaded from Settings at any time.

Deletion is done twice over — SQLAlchemy removes the child rows itself, and the
foreign keys carry `ON DELETE CASCADE` as a backstop. That is not belt and
braces for its own sake: the first implementation deferred cascading to the
database, and SQLite ignores foreign keys unless explicitly told not to, so
"delete everything" silently left every saved week behind. For a promise that
consequential, one mechanism was not enough.

Fonts currently load from Google's CDN, which does mean visitors' addresses
reach Google. Self-hosting is one script and one line of CSS away if that
matters to you — see `scripts/fetch-fonts.sh`.

## Changing things

Everything visual lives in `static/js/tokens.js`: colours, sizes, spacing, the
domain in the footer, the activity list. The picker is generated from that same
taxonomy, so adding an activity type or a preset label needs no UI changes.

To redraw an icon, edit its op list in `static/js/icons.js`. The ops vocabulary
is documented at the top of that file.
