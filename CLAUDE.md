# Working on weekform

Context for an AI assistant picking this up cold. Humans should read `README.md`
first — this file assumes it and does not repeat it.

## What it is

A tool that turns a week of training into one wide PNG for a group chat. Seven
circles, Monday to Sunday. It is a calculator, not an app: no feed, no streaks,
no encouragement. Accounts are optional and everything works without one.

## Architecture in one breath

The browser does the work. `render.js` draws the strip on a canvas that *is* the
exported image, `tokens.js` holds every design decision, and `state.js` keeps
weeks in `localStorage` and in the URL fragment. Flask serves the page, counts
shares, stores week blobs for signed-in users, and shows an admin page. The
server never looks inside a week.

## Invariants

These are load-bearing. Breaking one is a decision to raise explicitly, not a
detail to slip into an unrelated change.

1. **One renderer.** The preview and the export are the same code on the same
   canvas at different CSS sizes. Never add a second drawing path — that is how
   preview and output drift apart.
2. **`tokens.js` is the single source of design truth.** Colours, geometry,
   typography, the activity taxonomy, the domain in the footer. No hex codes or
   magic numbers anywhere else.
3. **The picker is generated from `CATEGORIES`.** Adding an activity type, a
   sub-type or a preset label must be a data change in `tokens.js` and nothing
   else. If a change to the taxonomy requires editing `sheet.js`, the design is
   wrong.
4. **The server never parses week payloads.** It checks size and shape, then
   stores the blob. This is what keeps activity types a client-side concern.
5. **Circles mean activities.** Every other surface in the UI is a 10px
   rectangle. The only exceptions are the status dot in the week picker and the
   three-dot app icon.
6. **Two colour tiers.** Training days: saturated fill, white glyph.
   Non-training days (rest, illness, vacation): tinted fill, deep same-hue
   glyph. Partly forced by contrast, partly deliberate — effort should be loud
   and absence quiet.
7. **No build step and no npm dependencies.** Vanilla ES modules served
   directly. `package.json` lives in `static/js/`, never at the repo root.
8. **The signed-out path must keep working.** `localStorage` is the working
   copy; the server is a second home for it. Nothing may require an account or a
   network.
9. **Deletion must actually delete.** ORM cascade *and* database cascade. See
   the traps below for why both.

## Where to change what

| To do this | Edit only |
|---|---|
| Add or change an activity type, sub-type, preset label | `static/js/tokens.js` |
| Redraw an icon | `static/js/icons.js` (op list at the top explains the vocabulary) |
| Change strip colours, sizes, spacing, the footer domain | `static/js/tokens.js` |
| Change how the strip is drawn | `static/js/render.js` |
| Change the picker's behaviour | `static/js/sheet.js` |
| Change week maths or date formatting | `static/js/week.js` |
| Change what is stored or how links encode | `static/js/state.js` |
| Change sync behaviour | `static/js/sync.js` |
| Add a route | a blueprint in `weekform/blueprints/` |
| Change the data model | `weekform/models.py` — and read the migrations note in README |

## Verify before delivering anything

```bash
node tests/logic.test.mjs        # 147 assertions, pure logic, no dependencies
python3 -m http.server 8000      # then /harness.html to look at the renderer
flask --app weekform run --debug # needs SECRET_KEY and ADMIN_PASSWORD set
```

There is no Python test suite yet. That is the largest known gap — see below.
Until it exists, any change to `auth.py`, `sync.py` or the models needs to be
exercised by hand against a throwaway SQLite database before it ships.

A useful habit that has caught real bugs here: check that every named import
resolves and that every element id referenced in JS exists in its template.
Neither is caught by a syntax check.

## Traps already hit

Each of these cost a deploy or a release. Do not reintroduce them.

- **`package.json` at the repo root** makes build systems classify this as a
  Node project, install nothing Python, and fail at start. It lives in
  `static/js/` so Node still treats the modules as ESM.
- **A bare `$PORT` in a start command.** Railway runs start commands without a
  shell, so `$PORT` arrives as five literal characters. Every entry point —
  Dockerfile `CMD`, `Procfile`, `railway.json` — must go through `start.sh`,
  which expands it itself.
- **`EXPOSE` in the Dockerfile.** Railway derives the service's target port from
  it while separately injecting `PORT`. When they disagree the container binds
  one port and health checks hit another. There is deliberately no `EXPOSE`.
- **A health check that queries the database.** A cold database made
  `/api/healthz` block for thirteen seconds, which failed deploys while the site
  was serving perfectly. It now touches nothing.
- **`passive_deletes=True` with SQLite.** SQLite ignores foreign keys unless
  switched on, so account deletion silently left every saved week behind. Both
  cascades now exist, plus a `PRAGMA foreign_keys=ON` listener.
- **Default `urllib` User-Agent.** Resend's API sits behind Cloudflare, which
  rejects `Python-urllib/...` with a 403 and error code 1010 before the request
  reaches the provider. A real User-Agent is set in `mail.py`.
- **Measuring canvas text without tracking applied.** Native `ctx.letterSpacing`
  affects drawing but not a naive measurement, so labels overflowed their column
  and collided. `measure()` in `render.js` handles both paths; keep them
  agreeing.
- **Assuming fonts are ready.** Canvas silently substitutes a fallback rather
  than waiting. Every weight is requested explicitly before the first paint.

## Conventions

- Comments explain **why**, not what. A comment restating the code is noise; a
  comment recording a decision or a trap is the most valuable line in the file.
- British English throughout, in code comments and user-facing copy.
- UI copy is minimal and factual. No marketing, no encouragement, no exclamation
  marks. If a sentence could appear in a fitness app's onboarding, delete it.
- A new dependency needs a reason. There are five, all in `requirements.txt`,
  and none on the client.
- Prefer deleting to adding. This has stayed good by refusing things.

## Known gaps

Roughly in order of how likely they are to matter.

1. **No Python tests.** Auth, sync isolation, reset and deletion were verified
   by hand. Nothing guards them now. Highest-value work available.
2. **The SQLite fallback is dangerous now.** If `DATABASE_URL` goes missing the
   app boots on SQLite on an ephemeral disk, works fine, and loses every account
   on the next deploy. Consider making it fatal outside debug.
3. **No migrations.** `create_all` handles new tables, not altered columns.
   Adopt Alembic before it is needed urgently, not during.
4. **Rate limits are per worker.** Two workers means double the stated limit.
5. **No email verification at sign-up.** Someone can register an address that is
   not theirs; the real owner can reclaim it by resetting. Deliberate, not an
   oversight.
6. **Sync conflicts resolve silently**, server-wins on load. Correct for a
   personal log, wrong if this ever became collaborative.
7. **Fonts load from Google's CDN.** Named in the privacy page.
   `scripts/fetch-fonts.sh` removes the third party.

## Deliberately not built

Do not propose these without being asked: streaks, badges, leaderboards, social
features, notifications, analytics, onboarding, more than two activities per
day, AI-generated encouragement, a mobile app.

The value of this thing is that it does one job and stops.
