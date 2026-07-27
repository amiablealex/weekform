# weekform

A tool that turns a week of training into one wide image you can drop straight
into a group chat. Seven circles, Monday to Sunday, one per day. No accounts, no
feed, no streaks.

**weekform.app**

---

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

128 assertions covering the date rules, duration formatting, taxonomy
resolution, text measurement and the URL state encoding — including what
happens when somebody hand-edits a link. No npm dependencies; `package.json`
exists only so Node treats the `.js` files as modules.

## Deploying to Railway

1. Push to GitHub.
2. New project in Railway, deploy from the repo. Nixpacks reads
   `requirements.txt` and `Procfile` without further configuration.
3. Add a Postgres service to the same project. `DATABASE_URL` appears
   automatically; the app rewrites the legacy `postgres://` scheme it hands out.
4. Set `ADMIN_USER` and `ADMIN_PASSWORD`. Until `ADMIN_PASSWORD` exists, `/admin`
   returns 503 rather than opening — a deploy that forgets it should not quietly
   publish its own stats.
5. Point the custom domain at the service and add the CNAME Railway gives you.

Health checks hit `/api/healthz`, which also confirms the database is reachable.

## Files

```
static/js/tokens.js    palette, geometry, typography, activity taxonomy
static/js/icons.js     13 glyphs as op lists, canvas + SVG renderers
static/js/week.js      Monday-anchored weeks, default-week rule, date formatting
static/js/render.js    the canvas renderer and PNG export
static/js/state.js     validation, URL fragment encoding, local persistence
static/js/sheet.js     the bottom sheet, generated from the taxonomy
static/js/app.js       preview, tap zones, week navigation, share
static/css/app.css     app chrome
weekform/              Flask app: factory, config, model, three blueprints
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

**Empty days render as rest, and say so in the editor.** The day stays empty in
state, and the editor draws a dashed ring over it. The export is drawn on a
separate canvas, so that marker never reaches the image.

**The export is prepared before it is needed.** Safari only allows
`navigator.share()` inside a live user gesture, and awaiting a canvas export
inside the click handler loses it — the share sheet then silently never opens.
The PNG is rendered on every change so the handler stays synchronous.

## Privacy

One table, three columns: when a strip was shared, on which day, and whether it
went through the native share sheet or a download. No addresses, no user agents,
nothing about the strip's contents. The week never leaves the browser, so it
could not be recorded even if somebody wanted it to be.

Fonts currently load from Google's CDN, which does mean visitors' addresses
reach Google. Self-hosting is one script and one line of CSS away if that
matters to you — see `scripts/fetch-fonts.sh`.

## Changing things

Everything visual lives in `static/js/tokens.js`: colours, sizes, spacing, the
domain in the footer, the activity list. The picker is generated from that same
taxonomy, so adding an activity type or a preset label needs no UI changes.

To redraw an icon, edit its op list in `static/js/icons.js`. The ops vocabulary
is documented at the top of that file.
