An online web tool for generating a nice shareable image strip summarising a week of workouts.

Made because I wanted it for myself, to share my fitness progress to group chats in a way that wasn't simply flooding the channel with every workout.

**[weekform.app](https://weekform.app)**

<img width="2160" height="840" alt="strip" src="https://github.com/user-attachments/assets/6c7afd58-bb18-46a7-8690-587e1bcb2b8e" />

And here's the stuff that Claude generated for this project:

# weekform

Turns a week of training into one wide image for a group chat. Seven circles,
Monday to Sunday. No feed, no streaks, no accounts required.

With an account there is also a calendar of past weeks, goals — simple weekly
rules drawn under your week and worked out as you type — and a few preset weeks
to start from.

The browser does the work: the canvas on screen *is* the exported PNG, and weeks
live in `localStorage` and the URL fragment. Flask serves the page, counts
shares, and — for signed-in users — stores weeks as opaque blobs it never reads.

## Run it

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export SECRET_KEY=anything-local ADMIN_PASSWORD=pw
flask --app weekform run --debug --host 0.0.0.0 --port 8000
```

No `DATABASE_URL` means a SQLite file in the project root.

The renderer has its own harness needing no server — `python3 -m http.server
8000`, then `/harness.html`.

```bash
node tests/logic.test.mjs     # 279 assertions, no dependencies
python3 tests/server.test.py  # 150 assertions, no test runner
```

## Deploy

Railway builds from the `Dockerfile`. Attach a Postgres service, then set:

| Variable | |
|---|---|
| `SECRET_KEY` | Required. Signs the session cookie; the app refuses to start without it. |
| `ADMIN_USER` / `ADMIN_PASSWORD` | `/admin` returns 503 until the password is set. |
| `RESEND_API_KEY` / `MAIL_FROM` | Password reset. Sending address must be on a Resend-verified domain. |
| `DATABASE_URL` | Set automatically by Railway. |

Health checks hit `/api/healthz`. `/admin` has a test-send button for diagnosing
email.

Note: `navigator.share` needs HTTPS, so over plain http the button reads "Save
image" and downloads instead. That is expected in development.

## Files

```
static/js/tokens.js    palette, geometry, typography, activity taxonomy
static/js/icons.js     13 glyphs as op lists, canvas + SVG renderers
static/js/render.js    the canvas renderer and PNG export
static/js/week.js      Monday-anchored weeks and date formatting
static/js/state.js     validation, URL encoding, local storage
static/js/sheet.js     the picker, generated from the taxonomy
static/js/app.js       preview, tap zones, share
static/js/sync.js      device-to-account reconciliation
static/js/calendar.js  the month view
weekform/              Flask: factory, config, models, security, mail, blueprints
harness.html           renderer harness, no server needed
tests/logic.test.mjs   assertions for the pure logic
tests/server.test.py   assertions for the server, against throwaway SQLite
```

## Privacy

Signed out, nothing is uploaded. One number is counted when a strip is shared:
that it happened.

Signed in, stored data is an email address, a password hash, the weeks you save,
any goals you set and any presets you keep — never read, never sold, never
shared. Whether a goal is met is worked out in your browser and never leaves it. Deleting an account removes
everything at once. Everything held can be downloaded from Settings.

Full statement at `/privacy`.

## Changing things

Everything visual lives in `static/js/tokens.js` — colours, sizes, the domain in
the footer, the activity list. The picker is generated from that same taxonomy,
so adding an activity type needs no UI changes. To redraw an icon, edit its op
list in `static/js/icons.js`.

**`CLAUDE.md` is the file to read before making changes.** It holds the
invariants, which file to touch for a given task, the traps that have already
cost a deploy, and the known gaps. `docs/CLAUDE_PROJECT_INSTRUCTIONS.md` has the
workflow for working on this with an AI assistant.
