# weekform

A tool that turns a week of training into one wide image you can drop straight
into a group chat. Seven circles, Monday to Sunday, one per day. No accounts, no
feed, no streaks.

**weekform.app**

---

## Status

Checkpoint 1 of 2. This stage contains the design system and the renderer, plus
a harness to look at them. There is no Flask app yet and nothing to deploy — the
whole thing runs as static files.

- [x] Design tokens, palette, taxonomy
- [x] Icon suite (13 glyphs)
- [x] Week arithmetic and date formatting
- [x] Canvas renderer and PNG export
- [x] Render harness
- [ ] Flask app, picker UI, share sheet, admin, Railway deploy — checkpoint 2

## Running the harness

ES modules will not load from `file://`, so it needs a web server. Any will do:

```bash
cd weekform
python3 -m http.server 8000
```

Then open <http://localhost:8000/harness.html>.

To look at it on your phone, which is the only view that really matters:

```bash
# from the Pi, with Tailscale up
tailscale ip -4
# then browse to http://<that-address>:8000/harness.html
```

## Tests

```bash
node tests/logic.test.mjs
```

Covers the date rules, duration formatting and taxonomy resolution. The visual
side is deliberately not asserted — whether an icon reads as a running shoe is a
question for your eyes, not a test runner. `package.json` exists only so Node
treats the `.js` files as modules; there are no npm dependencies.

## What to look at

Open the harness on your phone and work down this list.

1. **Legibility at chat size.** The phone-width strips at the top are roughly
   how the image arrives in WhatsApp. Can you read the durations inside the
   circles? If not, the height needs to grow beyond 420.
2. **Real compression.** Hit Download on the first strip and post the PNG into
   the actual channel. WhatsApp re-encodes; thin strokes are what suffers.
3. **The redrawn glyphs.** `dumbbell` replaces the three body-part figures and
   `sport` is now a tennis ball rather than a jersey. Neither has been seen at
   final size on a real screen.
4. **The finest details.** The doughnut sprinkles and the dots on the illness
   plaster are the smallest marks in the set. If they turn to mush after
   compression, they should go.
5. **Fonts.** The harness reports whether both faces loaded. If it says they did
   not, everything below it is drawn in a fallback and is not worth judging.
6. **Labels at the cap.** The last test case runs a 22-character title and
   12-character labels, which is what the picker will allow. Nothing should be
   truncated or touching its neighbour at those lengths.

## Layout

```
1080 x 420 logical, exported at 2x (2160 x 840)

  MY WEEK                     <- Bricolage Grotesque, 46
  20th July – 26th July 2026   <- Space Grotesk, 25

   M    T    W    T    F    S    S
  (o)  (o)  (o)  (o)  (o)  (o)  (o)   <- r 54, pitch 138
  EASY           LONG

                              weekform.app
```

## Files

```
static/js/tokens.js    palette, geometry, typography, activity taxonomy
static/js/icons.js     13 glyphs as op lists, canvas + SVG renderers
static/js/week.js      Monday-anchored weeks, default-week rule, date formatting
static/js/render.js    the canvas renderer and PNG export
static/img/            favicon and app icons (three dots)
harness.html           development harness
tests/logic.test.mjs   assertions for the pure logic
```

## Design decisions worth knowing

**One renderer.** The on-screen preview and the exported PNG are the same canvas
at different CSS sizes. There is no separate export path, so the two cannot
drift apart.

**Two colour tiers.** Training days get a saturated fill and a white glyph.
Non-training days (rest, illness, vacation) get a pale fill and a deep glyph in
the same hue. This is partly forced — a pastel yellow cannot carry a white icon
at readable contrast — and partly deliberate: effort should be loud and absence
should be quiet.

**Filled mass over outlines.** A thin outlined ring inside a circular badge
reads as nothing at small size. Sport is a solid disc with knocked-out seams
rather than an outlined football, and the doughnut has a bite taken out of it so
its silhouette is not just another circle.

**One glyph per activity, detail as label.** A workout is a dumbbell; which body
part it was is a label beneath the circle, exactly like a run's character. This
keeps the glyph count low and means new sub-types cost nothing to add — chest
was added without drawing anything.

**Knockout detail.** Icons carry two colours: the glyph and the badge behind it.
Ops prefixed `k` paint in the badge colour, which is how the abs appear on the
core torso and the sprinkles on the doughnut.

**Two activities per day, not three.** The stacked circle offsets by 22px into a
30px gap between columns. A third would either collide with the next day or
force every circle smaller.

**Labels are sized as a row, not individually.** All seven captions share one
font size, chosen so the widest fits its column. Sizing each independently left
one day's caption visibly smaller than the rest.

**Empty days render as rest.** The day stays empty in state, so the app can still
tell "nothing added" from "I chose to rest" — only the picture treats them alike.

## Changing things

Everything visual lives in `static/js/tokens.js`. Colours, sizes, spacing, the
domain in the footer, the activity list. Change a value there and the preview,
the export and (in checkpoint 2) the UI all follow.

To redraw an icon, edit its op list in `static/js/icons.js`. The ops vocabulary
is documented at the top of that file. Nothing else needs to change.
