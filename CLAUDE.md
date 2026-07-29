# Working on weekform

Context for an AI assistant picking this up cold. Humans should read `README.md`
first — this file assumes it and does not repeat it.

## What it is

A tool that turns a week of training into one wide PNG for a group chat. Seven
circles, Monday to Sunday. It is a calculator, not an app: no feed, no streaks,
no encouragement. Accounts are optional and everything works without one.

Signed in, there is also a calendar of past weeks, a set of goals, and up to
three preset weeks. A goal is a rule about one week, checked against what is on
screen and never stored as a result. That is what keeps it a calculator rather
than a habit tracker. A preset is simply a week somebody already built, kept so
they do not have to build it again.

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
3. **The pickers are generated from `CATEGORIES`.** Adding an activity type, a
   sub-type or a preset label must be a data change in `tokens.js` and nothing
   else. If a change to the taxonomy requires editing `sheet.js` or
   `goalsheet.js`, the design is wrong. Which categories may be a goal is the
   `goals: false` flag on the category, not a list in the builder.
4. **The server never parses week payloads.** It checks size and shape, then
   stores the blob. This is what keeps activity types a client-side concern.
5. **Circles mean activities.** Every other surface in the UI is a 10px
   rectangle. The exceptions are the status dot in the week picker, the
   three-dot app icon, and a goal card's day marks — small dots, roughly a
   fifth of an activity circle, in the same family as the week picker's. A
   goal's met/not-met mark is a bare tick or cross with no circle around it,
   deliberately.
6. **Two colour tiers.** Training days: saturated fill, white glyph.
   Non-training days (rest, illness, vacation): tinted fill, deep same-hue
   glyph. Partly forced by contrast, partly deliberate — effort should be loud
   and absence quiet.
7. **No build step and no npm dependencies.** Vanilla ES modules served
   directly. `package.json` lives in `static/js/`, never at the repo root.
8. **The signed-out path must keep working.** `localStorage` is the working
   copy; the server is a second home for it. Nothing may require an account or a
   network.
9. **Deletion must actually delete.** ORM cascade *and* database cascade, for
   weeks and for goals. See the traps below for why both.
10. **Goals are computed, never recorded.** Whether a goal was met is worked out
   from the week on screen every time it is drawn. Nothing stores an outcome and
   nothing may start to. A record of met and missed weeks is a streak, and
   streaks are on the refused list at the bottom of this file.
11. **Green means one thing.** `GOAL.ok` is the only green in the app and means
   "this goal is met". Goal marks take their category's colour, never green —
   mobility is already green, and a mobility goal drawn in green would look
   permanently complete.
12. **The goal limit is about the page, not about storage.** `LIMITS.activeGoals`
   caps how many goals can be live in the *same week*, because that is what
   governs how much sits under a strip. Holding a year of finished goals costs
   nothing and nobody should have to delete one to make room.
   `LIMITS.storedGoals` is a separate, much larger storage ceiling, and is the
   only one the server can enforce — knowing what is active means reading the
   dates, and the server does not read payloads.
13. **A preset is a week, not a new shape.** It carries the same `days` the
   strip, the fragment and the sync endpoint already use, validated through
   `sanitise()` in `state.js`. It carries no title and no date. If a preset ever
   needs its own validation, something has gone wrong.
14. **Today is marked on goal cards and nowhere else.** On the current week,
   everything after today draws at `GOAL.futureAlpha` with a dashed hairline at
   the column. Past and future weeks get none of it — `todayIndex` returns -1
   and the card draws settled. This must never reach the strip: the canvas *is*
   the exported PNG, so a faded disc would mean the same week exported
   differently depending on which day share was pressed, and the recipient would
   have no way to read it. Cards are where you are in the week; the image is the
   week. Marking today is factual; anything derived from it — days remaining,
   behind schedule — is the encouragement machinery on the refused list.
15. **Every account feature is named in the guide line, and managed from
   Settings.** The quiet line under the strip is the front door — it is how
   anybody discovers history, goals and presets, and the only place on the front
   page that advertises anything. Settings is the hub behind it: goals and
   presets are siblings and sit there as sections. The calendar's header carries
   one link out to Settings and does not grow a list of features. A new account
   feature gets a mention in the guide line and a section in Settings; if it
   seems to need more than that it is asking for a prompt, and prompts are
   onboarding.

## Where to change what

| To do this | Edit only |
|---|---|
| Add or change an activity type, sub-type, preset label | `static/js/tokens.js` |
| Redraw an icon | `static/js/icons.js` (op list at the top explains the vocabulary) |
| Change what a goal means, or how progress is worked out | `static/js/goals.js` — pure, and covered by the test suite |
| Change how a goal card looks | `static/js/goalstrip.js`, sizes in `GOAL` in `tokens.js` |
| Change the goal builder | `static/js/goalsheet.js` (it borrows the sheet shell from `sheet.js`) |
| Change the goals page | `static/js/goalspage.js`, `templates/account/goals.html` |
| Change what a preset is | `static/js/presets.js` — pure, and covered by the test suite |
| Change the preset sheets | `static/js/presetsheet.js` (borrows the shell from `sheet.js`) |
| Change the presets page | `static/js/presetspage.js`, `templates/account/presets.html` |
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
node tests/logic.test.mjs        # 279 assertions, pure logic, no dependencies
python3 tests/server.test.py     # 150 assertions against a throwaway SQLite file
python3 -m http.server 8000      # then /harness.html for the strip and goal cards
flask --app weekform run --debug # needs SECRET_KEY and ADMIN_PASSWORD set
```

Both suites must pass before anything ships. `harness.html` carries goal cases
as well as strips, so a change to a goal card can be looked at without an
account.

`tests/server.test.py` builds a throwaway SQLite database in a temporary
directory, exercises every endpoint through Flask's test client, and deletes it
on the way out. It uses no test runner on purpose: this app has five
dependencies, all runtime, and pytest is not worth being the sixth.

It is not a substitute for looking at the thing in a browser, and SQLite is not
Postgres. What it does guard is that one account cannot see another's data, that
every endpoint rejects what it should, and that deleting an account really does
remove every week, goal and preset — through both cascades.

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
- **A sheet header button that says "Done" over an uncommitted draft.** Filling
  in a run and tapping "Done" threw it away, because only the big button at the
  bottom commits. The header button is now labelled by context — "Done" where
  everything on screen is already applied, "Cancel" where it is not. Any new
  sheet holding a draft must call `setCloseLabel('Cancel')`.
- **Signing in rotates the CSRF token.** `log_in()` clears the session to get a
  fresh id, which takes the token with it. Templates always emit the current
  one, so browsers never notice — but a test that reuses a token from before
  sign-in will find its writes silently ignored rather than refused.

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

1. **No migrations.** `create_all` handles new tables, not altered columns.
   Four tables have now arrived this way and every one of them was free. The
   next change that alters an existing column will not be. Adopt Alembic before
   it is needed urgently, not during. This is now the largest gap.
2. **The SQLite fallback is dangerous.** If `DATABASE_URL` goes missing the app
   boots on SQLite on an ephemeral disk, works fine, and loses every account on
   the next deploy. Consider making it fatal outside debug.
3. **The Python suite runs against SQLite only.** It covers behaviour, not
   dialect. Nothing exercises Postgres before a deploy does.
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

Goals specifically must not grow: no history of which weeks a goal was met, no
"four weeks running", no reminder that a goal is behind, no goals in the
exported image, no goal that spans anything other than one week. Each of those
is the streaks feature arriving by another door.

Also considered and refused, with reasons, so they do not come back around:

- **Multi-week plans as their own thing** (a marathon programme with a target
  per week). The evaluation is trivial; the builder is a spreadsheet in a bottom
  sheet, and the result is a schedule the app holds you to rather than a rule
  you wrote. Consecutive goals already do this.
- **Workout builders** — exercises, sets and reps inside an activity. That is a
  level of hierarchy below the activity, which nothing in the app can render:
  not the strip, not the image, not the calendar, not goals. It would also break
  the fragment, which only works because a week is about 150 characters.
- **Saved activity presets** in the day picker. The saved thing would sit in the
  same row as the sub-types, so `sheet.js` would be generated from `CATEGORIES`
  plus user data and invariant 3 would be gone. Week presets probably cover the
  need anyway.

The value of this thing is that it does one job and stops.
