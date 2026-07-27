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
let trackingSupport = null;
function supportsTracking() {
  if (trackingSupport === null) {
    trackingSupport = typeof CanvasRenderingContext2D !== 'undefined' &&
      'letterSpacing' in CanvasRenderingContext2D.prototype;
  }
  return trackingSupport;
}

function fontString(spec, sizeOverride) {
  const family = spec.font === 'display' ? FONTS.display : FONTS.body;
  const size = sizeOverride || spec.size;
  return `${spec.weight} ${size}px ${family}, ${FONTS.fallback}`;
}

function measure(ctx, text, tracking) {
  const w = ctx.measureText(text).width;
  if (!tracking || supportsTracking()) return w;
  return w + tracking * Math.max(0, [...text].length - 1);
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
 * Shrink then truncate so text fits `maxWidth`. Custom labels are user input
 * and can be any length; the strip must not break because of one long word.
 */
function fitText(ctx, text, spec, maxWidth, minSize) {
  ctx.save();
  let size = spec.size;
  ctx.font = fontString(spec, size);
  while (size > minSize && measure(ctx, text, spec.tracking) > maxWidth) {
    size -= 1;
    ctx.font = fontString(spec, size);
  }
  let out = text;
  while (out.length > 1 && measure(ctx, out, spec.tracking) > maxWidth) {
    out = out.slice(0, -1);
  }
  ctx.restore();
  return { text: out.trim(), size };
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
  const { width: W, height: H, padX } = GEO;

  ctx.save();
  ctx.fillStyle = INK.paper;
  ctx.fillRect(0, 0, W, H);

  // --- masthead ---
  const title = (state.title || BRAND.defaultTitle).toUpperCase();
  const titleMax = W - padX * 2;
  const fittedTitle = fitText(ctx, title, TYPE.title, titleMax, 26);
  drawText(ctx, fittedTitle.text, padX, GEO.titleY, TYPE.title,
    INK.title, 'left', fittedTitle.size);

  drawText(ctx, formatRange(state.weekStart), padX, GEO.subtitleY,
    TYPE.subtitle, INK.subtitle, 'left');

  // --- day columns ---
  const centres = columnCentres();
  const pitch = (W - padX * 2) / 7;
  const r = GEO.circleR;
  const cy = GEO.circleY;

  centres.forEach((cx, i) => {
    drawText(ctx, DAY_LETTERS[i], cx, GEO.dayLabelY, TYPE.dayLabel,
      INK.dayLabel, 'center');

    const entries = (state.days && state.days[i]) || [];
    const list = entries.length ? entries.slice(0, 2) : [REST];
    const primary = list[0];
    const secondary = list[1] || null;

    const pRes = resolve(primary);
    if (!pRes) return;

    if (secondary) {
      const sRes = resolve(secondary);
      if (sRes) {
        // Stacked circle sits behind, offset up and to the right.
        circle(ctx, cx + GEO.stackDX, cy + GEO.stackDY, r, sRes.colours.fill);
        // A paper-coloured ring keeps the two readable when their colours are
        // close — two orange circles would otherwise merge into one blob.
        circle(ctx, cx, cy, r + 2.5, INK.paper);
      }
    }

    circle(ctx, cx, cy, r, pRes.colours.fill);

    const meta = pRes.acceptsMeta ? metaFor(primary) : '';
    const iconSize = (meta ? GEO.iconFillWithMeta : GEO.iconFillSolo) * r * 2;
    const iconY = cy + (meta ? GEO.iconLiftWithMeta : 0);
    drawIcon(ctx, pRes.icon, cx, iconY, iconSize,
      pRes.colours.glyph, pRes.colours.fill);

    if (meta) {
      // Keep the duration inside the circle's chord at this height.
      const chord = 2 * Math.sqrt(Math.max(1, r * r - GEO.metaY * GEO.metaY)) - 8;
      const fitted = fitText(ctx, meta, TYPE.meta, chord, 14);
      drawText(ctx, fitted.text, cx, cy + GEO.metaY, TYPE.meta,
        pRes.colours.glyph, 'center', fitted.size);
    }

    const label = labelFor(primary);
    if (label) {
      const fitted = fitText(ctx, label, TYPE.label, pitch - 8, 13);
      drawText(ctx, fitted.text, cx, GEO.labelY, TYPE.label,
        pRes.colours.label, 'center', fitted.size);
    }
  });

  // --- watermark ---
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

export { PALETTE, GEO };
