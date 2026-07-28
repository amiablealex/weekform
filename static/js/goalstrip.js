// ---------------------------------------------------------------------------
// weekform — goal cards
//
// One card per active goal, under the strip. Drawn as SVG in the same 1080-wide
// coordinate space as the strip itself, so the day marks sit directly beneath
// the circles they refer to at any screen width. Nothing here touches the
// canvas: goals are never part of the exported image.
//
// Two shapes, one rule. A goal counting a few whole things is a grid of small
// dots, one column per day. Everything else — every distance, every duration,
// anything counting more than GOAL.maxDots — is a shaded area chart. Green
// appears in exactly one place, the status mark in the header.
// ---------------------------------------------------------------------------

import { GEO, GOAL, columnCentres } from './tokens.js';
import { evaluate, activeGoals } from './goals.js';

const cols = columnCentres();

// Resolved at draw time rather than once, so switching scheme and touching the
// week redraws correctly. app.js also repaints on the media query changing.
const dark = typeof matchMedia === 'function'
  ? matchMedia('(prefers-color-scheme: dark)')
  : null;
const isDark = () => Boolean(dark && dark.matches);
const pending = () => (isDark() ? GOAL.pendingDark : GOAL.pending);
const okColour = () => (isDark() ? GOAL.okDark : GOAL.ok);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The colour a goal's marks are drawn in.
 *
 * The two palette tiers exist because a rest day is quiet — but a tinted fill
 * is so close to the unfilled mark colour that a rest goal would look empty
 * however many rest days were logged. Tinted palettes use their deep label
 * colour here instead, which is the same hue and actually visible.
 */
function inkFor(colours) {
  return colours.tier === 'solid' ? colours.fill : colours.label;
}

// --- plots -----------------------------------------------------------------

function dotPlot(result) {
  const ink = inkFor(result.colours);
  const mid = GOAL.plotH / 2;
  const span = (result.marks - 1) * GOAL.dotPitch;
  const out = [];

  for (let day = 0; day < 7; day++) {
    const done = result.dotSeries[day] || 0;
    for (let m = 0; m < result.marks; m++) {
      // Filled from the bottom up, the way a glass fills.
      const cy = mid + span / 2 - m * GOAL.dotPitch;
      const fill = m < done ? ink : pending();
      out.push(`<circle cx="${cols[day].toFixed(1)}" cy="${cy.toFixed(1)}" ` +
               `r="${GOAL.dotR}" fill="${fill}"/>`);
    }
  }
  return out.join('');
}

function areaPlot(result) {
  const ink = inkFor(result.colours);
  const base = GOAL.plotH - GOAL.plotPad;
  const top = GOAL.plotPad;
  const height = base - top;
  const y = (value) => (base - value * height).toFixed(1);
  const x = (i) => cols[i].toFixed(1);

  const line = result.series.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(v)}`).join(' ');
  const area = `M${x(0)} ${base} ` +
    result.series.map((v, i) => `L${x(i)} ${y(v)}`).join(' ') +
    ` L${x(6)} ${base} Z`;

  return [
    // The week's floor and ceiling. The ceiling is the target: the line is
    // capped there, so an overshoot fills the card and says so in the header.
    `<line x1="${GEO.padX}" y1="${base}" x2="${GEO.width - GEO.padX}" y2="${base}" ` +
      `stroke="${pending()}" stroke-width="2"/>`,
    `<line x1="${GEO.padX}" y1="${top}" x2="${GEO.width - GEO.padX}" y2="${top}" ` +
      `stroke="${ink}" stroke-width="2" opacity="0.28"/>`,
    `<path d="${area}" fill="${ink}" opacity="${GOAL.areaAlpha}"/>`,
    `<path d="${line}" fill="none" stroke="${ink}" stroke-width="${GOAL.lineW}" ` +
      `stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join('');
}

// The one green in the app, and its absence. Bare glyphs rather than badges —
// circles belong to activities, and to a goal's day marks, and to nothing else.
function statusSvg(met) {
  const colour = met ? okColour() : pending();
  const d = met ? 'M4 11.5 L9 16.5 L18 6' : 'M5.5 5.5 L16.5 16.5 M16.5 5.5 L5.5 16.5';
  return `<svg viewBox="0 0 22 22" width="19" height="19" aria-hidden="true">` +
    `<path d="${d}" fill="none" stroke="${colour}" stroke-width="2.6" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// --- card ------------------------------------------------------------------

export function goalCard(goal, state) {
  const result = evaluate(goal, state);

  const card = el('article', 'goal-card');
  const head = el('div', 'goal-head');
  head.appendChild(el('h2', 'goal-name', goal.name));

  const meta = el('div', 'goal-meta');
  meta.appendChild(el('span', 'goal-summary', result.summary));
  const status = el('span', 'goal-status');
  status.innerHTML = statusSvg(result.met);
  meta.appendChild(status);
  head.appendChild(meta);
  card.appendChild(head);

  const plot = el('div', 'goal-plot');
  plot.innerHTML =
    `<svg viewBox="0 0 ${GEO.width} ${GOAL.plotH}" role="img" ` +
    `aria-label="${result.met ? 'Met' : 'Not met'}. ${result.summary}">` +
    (result.useDots ? dotPlot(result) : areaPlot(result)) +
    `</svg>`;
  card.appendChild(plot);

  return card;
}

/**
 * Draw every goal active in this week. Goals set for another range are simply
 * absent — silence is how this app says "nothing to report".
 */
export function renderGoals(host, goals, state) {
  const active = activeGoals(goals, state.weekStart);
  host.innerHTML = '';
  host.hidden = active.length === 0;
  for (const goal of active) host.appendChild(goalCard(goal, state));
}
