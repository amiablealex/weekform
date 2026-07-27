// ---------------------------------------------------------------------------
// weekform — renderer
//
// One drawing path, used for both the on-screen preview and the exported PNG.
// The preview *is* the export at a different CSS size, so the two cannot drift.
//
// State shape:
//   {
//     title: 'My Week',
//     weekStart: '2026-07-20',              // ISO Monday
//     days: [ [activity, activity?], ... ]  // exactly 7 entries, 0-2 each
//   }
//   activity = { cat, sub, tag?, custom?, amount?, unit? }
//
// An empty day renders as a rest day. That is a rendering decision, not a data
// one: the day stays empty in state so the URL and the UI can tell the
// difference between "nothing here" and "I chose to rest".
// ---------------------------------------------------------------------------

import { BRAND, PALETTE, INK, FONTS, TYPE, GEO, DAY_LETTERS,
         columnCentres, resolve, labelFor, metaFor } from './tokens.js';
import { drawIcon } from './icons.js';
import { formatRange } from './week.js';

const REST = { cat: 'rest', sub: 'rest' };

// Native canvas letter-spacing lands correct kerning; the manual fallback draws
// glyph by glyph, which loses kerning pairs but keeps old browsers legible.
function supportsTracking() {
  return typeof CanvasRenderingContext2D !== 'undefined' &&
    'letterSpacing' in CanvasRenderingContext2D.prototype;
}

function fontString(spec, sizeOverride) {
  const family = spec.font === 'display' ? FONTS.display : FONTS.body;
  const size = sizeOverride || spec.size;
  return `${spec.weight} ${size}px ${family}, ${FONTS.fallback}`;
}

/**
 * Width of `text` as it will actually be drawn, tracking included.
 *
 * The subtlety that bit once: when the canvas supports letterSpacing natively,
 * drawText applies it, so measuring without it under-reports by roughly one
 * tracking unit per character. Labels then overflowed their column and
 * collided with the neighbouring day. Both paths below return the same number
 * drawText will produce.
 */
function measure(ctx, text, tracking) {
  if (!tracking) return ctx.measureText(text).width;
  if (supportsTracking()) {
    const prev = ctx.letterSpacing || '0px';
    ctx.letterSpacing = `${tracking}px`;
    const w = ctx.measureText(text).width;
    ctx.letterSpacing = prev;
    return w - tracking;   // discount the trailing gap, as drawText does
  }
  return ctx.measureText(text).width + tracking * Math.max(0, [...text].length - 1);
}

/**
 * Draw text with tracking. `align` is 'left' | 'center' | 'right'.
 * Returns the drawn width.
 */
function drawText(ctx, text, x, y, spec, colour, align = 'left', sizeOverride) {
  if (!text) return 0;
  ctx.save();
  ctx.font = fontString(spec, sizeOverride);
  ctx.fillStyle = colour;
  ctx.textBaseline = 'alphabetic';

  const tracking = spec.tracking || 0;

  if (supportsTracking()) {
    ctx.letterSpacing = `${tracking}px`;
    const w = ctx.measureText(text).width;
    // Native tracking appends spacing after the final glyph; discount it so
    // centred and right-aligned text sits where the geometry says it should.
    const visual = w - tracking;
    ctx.textAlign = 'left';
    const startX = align === 'center' ? x - visual / 2 : align === 'right' ? x - visual : x;
    ctx.fillText(text, startX, y);
    ctx.restore();
    return visual;
  }

  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, cursor, y);
    cursor += widths[i] + tracking;
  });
  ctx.restore();
  return total;
}

/**
 * The largest size at which every one of `texts` fits `maxWidth`.
 *
 * Sizing the row as a whole rather than each item independently is why the
 * labels under the circles stay visually consistent: one long label pulls the
 * whole row down a point rather than sitting there noticeably smaller than its
 * neighbours.
 */
function fitSize(ctx, texts, spec, maxWidth, minSize) {
  const real = texts.filter(Boolean);
  if (!real.length) return spec.size;
  ctx.save();
  let size = spec.size;
  const widest = () => {
    ctx.font = fontString(spec, size);
    return Math.max(...real.map((t) => measure(ctx, t, spec.tracking)));
  };
  while (size > minSize && widest() > maxWidth) size -= 1;
  ctx.restore();
  return size;
}

/** Last resort if a string still overruns at the minimum size. */
function truncateTo(ctx, text, spec, size, maxWidth) {
  ctx.save();
  ctx.font = fontString(spec, size);
  let out = text;
  while (out.length > 1 && measure(ctx, out, spec.tracking) > maxWidth) {
    out = out.slice(0, -1);
  }
  ctx.restore();
  return out.trim();
}

function circle(ctx, cx, cy, r, colour) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
}

// ---------------------------------------------------------------------------

/** Draw the whole strip into a 2D context already scaled to logical units. */
export function drawStrip(ctx, state) {
  const { width: W, padX } = GEO;
  const centres = columnCentres();
  const pitch = (W - padX * 2) / 7;
  const r = GEO.circleR;
  const cy = GEO.circleY;

  // Labels are centred on their column but must not reach into the next one.
  // The margin is generous on purpose: two labels that merely fail to overlap
  // still read as one run-on string.
  const labelMax = pitch - 18;
  const metaMax = 2 * Math.sqrt(Math.max(1, r * r - GEO.metaY * GEO.metaY)) - 8;

  ctx.save();
  ctx.fillStyle = INK.paper;
  ctx.fillRect(0, 0, W, GEO.height);

  // --- pass one: work out what each day holds --------------------------------
  const days = centres.map((cx, i) => {
    const entries = (state.days && state.days[i]) || [];
    const list = entries.length ? entries.slice(0, 2) : [REST];
    const primary = list[0];
    const res = resolve(primary);
    if (!res) return null;
    return {
      cx,
      primary,
      secondary: list[1] ? resolve(list[1]) : null,
      colours: res.colours,
      icon: res.icon,
      meta: res.acceptsMeta ? metaFor(primary) : '',
      label: labelFor(primary),
    };
  });

  // One size for the whole row, chosen so the widest entry fits. Sizing each
  // label independently leaves one day's caption visibly smaller than the rest.
  const labelSize = fitSize(ctx, days.map((d) => d && d.label), TYPE.label, labelMax, 13);
  const metaSize = fitSize(ctx, days.map((d) => d && d.meta), TYPE.meta, metaMax, 14);

  // --- masthead --------------------------------------------------------------
  const title = (state.title || BRAND.defaultTitle).toUpperCase();
  const titleSize = fitSize(ctx, [title], TYPE.title, W - padX * 2, 26);
  drawText(ctx, truncateTo(ctx, title, TYPE.title, titleSize, W - padX * 2),
    padX, GEO.titleY, TYPE.title, INK.title, 'left', titleSize);

  drawText(ctx, formatRange(state.weekStart), padX, GEO.subtitleY,
    TYPE.subtitle, INK.subtitle, 'left');

  // --- pass two: draw the columns -------------------------------------------
  days.forEach((day, i) => {
    drawText(ctx, DAY_LETTERS[i], centres[i], GEO.dayLabelY, TYPE.dayLabel,
      INK.dayLabel, 'center');
    if (!day) return;
    const { cx } = day;

    if (day.secondary) {
      // Stacked circle sits behind, offset up and to the right.
      circle(ctx, cx + GEO.stackDX, cy + GEO.stackDY, r, day.secondary.colours.fill);
      // A paper-coloured ring keeps the two readable when their colours are
      // close — two orange circles would otherwise merge into one blob.
      circle(ctx, cx, cy, r + 2.5, INK.paper);
    }

    circle(ctx, cx, cy, r, day.colours.fill);

    const iconSize = (day.meta ? GEO.iconFillWithMeta : GEO.iconFillSolo) * r * 2;
    const iconY = cy + (day.meta ? GEO.iconLiftWithMeta : 0);
    drawIcon(ctx, day.icon, cx, iconY, iconSize, day.colours.glyph, day.colours.fill);

    if (day.meta) {
      drawText(ctx, truncateTo(ctx, day.meta, TYPE.meta, metaSize, metaMax),
        cx, cy + GEO.metaY, TYPE.meta, day.colours.glyph, 'center', metaSize);
    }

    if (day.label) {
      drawText(ctx, truncateTo(ctx, day.label, TYPE.label, labelSize, labelMax),
        cx, GEO.labelY, TYPE.label, day.colours.label, 'center', labelSize);
    }
  });

  // --- watermark -------------------------------------------------------------
  drawText(ctx, BRAND.domain, W - padX, GEO.footerY, TYPE.footer,
    INK.footer, 'right');

  ctx.restore();
}

/** Size a canvas for the strip and draw into it. */
export function renderStrip(canvas, state, scale = GEO.exportScale) {
  canvas.width = GEO.width * scale;
  canvas.height = GEO.height * scale;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawStrip(ctx, state);
  return canvas;
}

/** Render to a detached canvas — used for export without touching the preview. */
export function renderToCanvas(state, scale = GEO.exportScale) {
  const c = document.createElement('canvas');
  return renderStrip(c, state, scale);
}

export function toBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))),
      'image/png');
  });
}

/**
 * Load every font/weight combination the renderer uses.
 *
 * `document.fonts.ready` alone is not enough: a weight that has not been used
 * in the DOM may still be unloaded when the canvas asks for it, and canvas
 * silently substitutes a fallback rather than waiting. Every combination is
 * requested explicitly.
 */
export async function loadFonts() {
  if (!document.fonts) return;
  const wanted = Object.values(TYPE).map((spec) => {
    const family = spec.font === 'display' ? FONTS.display : FONTS.body;
    return `${spec.weight} ${spec.size}px ${family}`;
  });
  await Promise.all([...new Set(wanted)].map((f) =>
    document.fonts.load(f).catch(() => {})));
  await document.fonts.ready;
}

// Exported for tests. Measurement drifting out of step with drawing is the one
// bug this file has actually shipped, so it is worth asserting directly.
export { measure, fitSize, truncateTo, supportsTracking };

export { PALETTE, GEO };
