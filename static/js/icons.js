// ---------------------------------------------------------------------------
// weekform — icon suite
//
// Every glyph is drawn inside a square design box spanning -22..+22 (ICON_UNIT
// = 44 units across). The renderer scales that box to whatever size it needs,
// so all geometry below is resolution-independent.
//
// Ops vocabulary. Two colours are in play: `glyph` (the mark) and `badge` (the
// circle behind it). Ops prefixed with k paint in the badge colour, which is
// how detail gets knocked out of a filled shape — the doughnut's bite, the
// abs on the core torso, the sprinkles.
//
//   ['f',  d]                fill path
//   ['fe', d]                fill path, even-odd rule (rings)
//   ['s',  d, w]             stroke path
//   ['ks', d, w]             stroke path, knocked out
//   ['fc', cx, cy, r]        fill circle
//   ['kc', cx, cy, r]        fill circle, knocked out
//   ['sc', cx, cy, r, w]     stroke circle
//   ['fr', x, y, w, h, r]    fill rounded rect
//   ['g',  degrees, [ops]]   rotate a nested group
//
// To redesign a glyph, edit its op list. Nothing else needs to change.
// ---------------------------------------------------------------------------

export const ICON_UNIT = 44;

export const ICONS = {
  run: [
    ['f', 'M-20 10 L-17.5 -3 Q-16.5 -9 -11 -9 L-6 -9 L-2 -4 L13 0.5 Q19 2.5 19 7 L19 10 Z'],
    ['ks', 'M-19.5 4.5 H18.5', 2.6],
    ['ks', 'M-13 -3 L-7.5 -6', 2.2],
  ],

  bike: [
    ['sc', -11, 7, 8, 3.4],
    ['sc', 11, 7, 8, 3.4],
    ['s', 'M-11 7 L-2 -6 H8', 3.4],
    ['s', 'M-2 -6 L11 7', 3.4],
    ['s', 'M-5.5 7 L-2 -6', 3.4],
    ['s', 'M-6.5 -9 H-1', 3.4],
    ['s', 'M8 -6 L12.5 -10', 3.4],
  ],

  swim: [
    ['fc', -8, -10, 4.6],
    ['s', 'M-16 -1 Q-6 -4 1 -8 Q8 -12 16 -15', 3.4],
    ['s', 'M-16 -1 L-4 1', 3.4],
    ['s', 'M-19 9 Q-14 5 -9 9 Q-4 13 1 9 Q6 5 11 9 Q14 11.5 18 9', 3.4],
    ['s', 'M-19 17 Q-14 13 -9 17 Q-4 21 1 17', 3.4],
  ],

  // Top half of a figure: head, torso, both arms bent up at the elbow, waist.
  upper: [
    ['fc', 0, -15, 5.6],
    ['s', 'M0 -8 V7', 8.5],
    ['s', 'M-13 5 L-13 -4 L-4.5 -7.5', 5.5],
    ['s', 'M13 5 L13 -4 L4.5 -7.5', 5.5],
    ['s', 'M-7.5 11.5 H7.5', 6],
  ],

  core: [
    ['fr', -13, -17, 26, 34, 10],
    ['ks', 'M0 -12 V12', 2.6],
    ['ks', 'M-9.5 -4 H9.5', 2.6],
    ['ks', 'M-9.5 4 H9.5', 2.6],
  ],

  // Bottom half of a figure: pelvis, both legs bent at the knee, feet.
  lower: [
    ['s', 'M-8 -13 H8', 7],
    ['s', 'M-8 -13 L-11 -2 L-5 3 L-7 14 L-12.5 14', 5.5],
    ['s', 'M8 -13 L11 -2 L5 3 L7 14 L12.5 14', 5.5],
  ],

  hiit: [
    ['fr', -5, -19, 10, 5.5, 2.5],
    ['sc', 0, 4, 14, 3.6],
    ['s', 'M0 4 V-4', 3.6],
    ['s', 'M0 4 L7 8', 3.6],
    ['s', 'M0 -10 V-13.5', 3.6],
    ['s', 'M11.5 -6.5 L15 -10', 3.6],
  ],

  mobility: [
    ['fc', 0, -14, 4.6],
    ['s', 'M0 -9 V0', 3.4],
    ['s', 'M-16 4 Q-8 -5 0 0 Q8 -5 16 4', 3.4],
    ['s', 'M-14 8 Q0 18 14 8', 3.4],
    ['s', 'M-14 8 Q0 12 14 8', 3.4],
  ],

  // A jersey, not a ball. A round icon inside a round badge has no silhouette.
  sport: [
    ['f', 'M-8 -15 L-19 -9.5 L-14.5 0.5 L-9 -2 L-9 17 L9 17 L9 -2 L14.5 0.5 L19 -9.5 L8 -15 Q0 -8.5 -8 -15 Z'],
  ],

  rest: [
    ['s', 'M-17 0 H-3 L-17 14 H-3', 4],
    ['s', 'M-0.5 -11 H10 L-0.5 -1 H10', 3.5],
    ['s', 'M12.5 -19 H19.5 L12.5 -12 H19.5', 3],
  ],

  illness: [
    ['g', -32, [
      ['fr', -20, -7.5, 40, 15, 7.5],
      ['ks', 'M-8 -6.5 V6.5', 1.8],
      ['ks', 'M8 -6.5 V6.5', 1.8],
      ['kc', -4, -3.2, 1.7], ['kc', 0, -3.2, 1.7], ['kc', 4, -3.2, 1.7],
      ['kc', -4, 3.2, 1.7], ['kc', 0, 3.2, 1.7], ['kc', 4, 3.2, 1.7],
    ]],
  ],

  // Sun offset up-left to leave room for a small suitcase at lower right.
  vacation: [
    ['fc', -4, -6, 7.5],
    ['s', 'M7 -6 H12', 3.2],
    ['s', 'M3.78 -13.78 L7.31 -17.31', 3.2],
    ['s', 'M-4 -17 V-22', 3.2],
    ['s', 'M-11.78 -13.78 L-15.31 -17.31', 3.2],
    ['s', 'M-15 -6 H-20', 3.2],
    ['s', 'M-11.78 1.78 L-15.31 5.31', 3.2],
    ['s', 'M-4 5 V10', 3.2],
    ['fr', 6, 6.5, 13.5, 10, 2.5],
    ['s', 'M10.5 6.5 V4 Q10.5 2.6 12 2.6 H13.5 Q15 2.6 15 4 V6.5', 1.9],
    ['ks', 'M6.5 11.5 H19.5', 1.7],
  ],

  doughnut: [
    ['fe', 'M0 -17 A17 17 0 1 1 0 17 A17 17 0 1 1 0 -17 Z M0 -6.5 A6.5 6.5 0 1 0 0 6.5 A6.5 6.5 0 1 0 0 -6.5 Z'],
    ['kc', 13, -13, 8.5],
    ['ks', 'M-10 -7 L-6.5 -9.5', 2.4],
    ['ks', 'M-12.5 4 L-9.5 6.5', 2.4],
    ['ks', 'M-1 11 L2.5 12.5', 2.4],
    ['ks', 'M9 6 L12 3', 2.4],
  ],

  beer: [
    ['f', 'M-12 -9 L-9 17 H7 L10 -9 Z'],
    ['f', 'M-13 -9 Q-13 -16 -7 -14 Q-4 -19 2 -16 Q9 -17 9.5 -9 Z'],
    ['s', 'M11 -4 Q19 -4 19 3 Q19 9 11.5 9', 3.4],
    ['ks', 'M-12.4 -8 H10', 2.4],
    ['kc', -5, 2, 1.7],
    ['kc', 2, 8, 1.7],
  ],

  // Fallback for user-defined sub-types that have no glyph of their own.
  custom: [
    ['f', 'M0 -18 Q2.5 -5 18 0 Q2.5 5 0 18 Q-2.5 5 -18 0 Q-2.5 -5 0 -18 Z'],
  ],
};

// --- canvas renderer -------------------------------------------------------

function roundRectPath(x, y, w, h, r) {
  const p = new Path2D();
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  p.closePath();
  return p;
}

function circlePath(cx, cy, r) {
  const p = new Path2D();
  p.arc(cx, cy, r, 0, Math.PI * 2);
  return p;
}

function runOps(ctx, ops, glyph, badge) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const op of ops) {
    const kind = op[0];
    switch (kind) {
      case 'f':
        ctx.fillStyle = glyph;
        ctx.fill(new Path2D(op[1]));
        break;
      case 'fe':
        ctx.fillStyle = glyph;
        ctx.fill(new Path2D(op[1]), 'evenodd');
        break;
      case 's':
        ctx.strokeStyle = glyph;
        ctx.lineWidth = op[2];
        ctx.stroke(new Path2D(op[1]));
        break;
      case 'ks':
        ctx.strokeStyle = badge;
        ctx.lineWidth = op[2];
        ctx.stroke(new Path2D(op[1]));
        break;
      case 'fc':
        ctx.fillStyle = glyph;
        ctx.fill(circlePath(op[1], op[2], op[3]));
        break;
      case 'kc':
        ctx.fillStyle = badge;
        ctx.fill(circlePath(op[1], op[2], op[3]));
        break;
      case 'sc':
        ctx.strokeStyle = glyph;
        ctx.lineWidth = op[4];
        ctx.stroke(circlePath(op[1], op[2], op[3]));
        break;
      case 'fr':
        ctx.fillStyle = glyph;
        ctx.fill(roundRectPath(op[1], op[2], op[3], op[4], op[5]));
        break;
      case 'g':
        ctx.save();
        ctx.rotate((op[1] * Math.PI) / 180);
        runOps(ctx, op[2], glyph, badge);
        ctx.restore();
        break;
    }
  }
}

/**
 * Draw an icon centred on (cx, cy) at a given pixel size.
 * @param size - the width the -22..+22 design box should occupy.
 */
export function drawIcon(ctx, id, cx, cy, size, glyph, badge) {
  const ops = ICONS[id];
  if (!ops) return;
  const scale = size / ICON_UNIT;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  runOps(ctx, ops, glyph, badge);
  ctx.restore();
}

// --- SVG renderer ----------------------------------------------------------
// Same op data, emitted as markup. Used for UI chrome, the favicon and the
// picker sheet, so the DOM and the canvas can never drift apart.

function opsToSvg(ops, glyph, badge) {
  const out = [];
  const cap = 'stroke-linecap="round" stroke-linejoin="round"';
  for (const op of ops) {
    switch (op[0]) {
      case 'f':
        out.push(`<path d="${op[1]}" fill="${glyph}"/>`);
        break;
      case 'fe':
        out.push(`<path d="${op[1]}" fill="${glyph}" fill-rule="evenodd"/>`);
        break;
      case 's':
        out.push(`<path d="${op[1]}" fill="none" stroke="${glyph}" stroke-width="${op[2]}" ${cap}/>`);
        break;
      case 'ks':
        out.push(`<path d="${op[1]}" fill="none" stroke="${badge}" stroke-width="${op[2]}" ${cap}/>`);
        break;
      case 'fc':
        out.push(`<circle cx="${op[1]}" cy="${op[2]}" r="${op[3]}" fill="${glyph}"/>`);
        break;
      case 'kc':
        out.push(`<circle cx="${op[1]}" cy="${op[2]}" r="${op[3]}" fill="${badge}"/>`);
        break;
      case 'sc':
        out.push(`<circle cx="${op[1]}" cy="${op[2]}" r="${op[3]}" fill="none" stroke="${glyph}" stroke-width="${op[4]}"/>`);
        break;
      case 'fr':
        out.push(`<rect x="${op[1]}" y="${op[2]}" width="${op[3]}" height="${op[4]}" rx="${op[5]}" fill="${glyph}"/>`);
        break;
      case 'g':
        out.push(`<g transform="rotate(${op[1]})">${opsToSvg(op[2], glyph, badge)}</g>`);
        break;
    }
  }
  return out.join('');
}

/** A complete <svg> badge: coloured circle with the glyph centred on it. */
export function iconBadgeSvg(id, glyph, badge, fill = 0.5, px = 100) {
  const ops = ICONS[id];
  if (!ops) return '';
  const r = 46;
  const scale = (fill * r * 2) / ICON_UNIT;
  return `<svg viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true">` +
    `<circle cx="50" cy="50" r="${r}" fill="${badge}"/>` +
    `<g transform="translate(50,50) scale(${scale})">${opsToSvg(ops, glyph, badge)}</g>` +
    `</svg>`;
}

/** Just the glyph, no badge — for use on neutral UI surfaces. */
export function iconGlyphSvg(id, glyph, badge, px = 24) {
  const ops = ICONS[id];
  if (!ops) return '';
  return `<svg viewBox="-22 -22 44 44" width="${px}" height="${px}" aria-hidden="true">` +
    opsToSvg(ops, glyph, badge) + `</svg>`;
}
