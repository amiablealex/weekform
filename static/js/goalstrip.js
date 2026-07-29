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
//
// One more rule on top of both: on the current week, everything after today is
// drawn faded. It is the same treatment for dots and for the chart, so there is
// no third case to invent, and it is the whole of what the cards say about
// time. Marking where today falls is factual; anything derived from it — days
// left, behind schedule — is the encouragement machinery this app refuses.
// ---------------------------------------------------------------------------

import { GEO, GOAL, columnCentres } from './tokens.js';
import { evaluate, activeGoals } from './goals.js';
import { todayIndex } from './week.js';

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

/** Wrap markup so it reads as provisional. Empty in, empty out. */
function faded(markup) {
  return markup ? `<g opacity="${GOAL.futureAlpha}">${markup}</g>` : '';
}

function dotPlot(result, today) {
  const ink = inkFor(result.colours);
  const mid = GOAL.plotH / 2;
  const span = (result.marks - 1) * GOAL.dotPitch;

  const dots = (from, to) => {
    const out = [];
    for (let day = from; day <= to; day++) {
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
  };

  if (today < 0) return dots(0, 6);
  return dots(0, today) + faded(dots(today + 1, 6));
}

/**
 * The area and line for one run of columns.
 *
 * A single-column run still draws: a zero-length segment with a round cap is a
 * dot, which is what Monday should look like on a Monday. It gets no area,
 * because a polygon of zero width is nothing.
 */
function chartRun(series, from, to, ink, base, x, y) {
  if (to < from) return '';
  const points = [];
  for (let i = from; i <= to; i++) points.push(`${x(i)} ${y(series[i])}`);

  const out = [];
  if (to > from) {
    out.push(`<path d="M${x(from)} ${base} L${points.join(' L')} L${x(to)} ${base} Z" ` +
             `fill="${ink}" opacity="${GOAL.areaAlpha}"/>`);
  }
  const line = `M${points.join(' L')}` + (to === from ? ` L${points[0]}` : '');
  out.push(`<path d="${line}" fill="none" stroke="${ink}" ` +
           `stroke-width="${GOAL.lineW}" stroke-linecap="round" stroke-linejoin="round"/>`);
  return out.join('');
}

function areaPlot(result, today) {
  const ink = inkFor(result.colours);
  const base = GOAL.plotH - GOAL.plotPad;
  const top = GOAL.plotPad;
  const height = base - top;
  const y = (value) => (base - value * height).toFixed(1);
  const x = (i) => cols[i].toFixed(1);

  // The week's floor and ceiling. The ceiling is the target: the line is capped
  // there, so an overshoot fills the card and says so in the header. Both stay
  // solid — they are the frame, not the data.
  const frame =
    `<line x1="${GEO.padX}" y1="${base}" x2="${GEO.width - GEO.padX}" y2="${base}" ` +
      `stroke="${pending()}" stroke-width="2"/>` +
    `<line x1="${GEO.padX}" y1="${top}" x2="${GEO.width - GEO.padX}" y2="${top}" ` +
      `stroke="${ink}" stroke-width="2" opacity="0.28"/>`;

  if (today < 0) {
    return frame + chartRun(result.series, 0, 6, ink, base, x, y);
  }
  // The run leaves today rather than starting after it, so the segment that
  // projects forward is faded along with what it projects into. On a Sunday
  // there is nothing to project into and the whole week is settled.
  return frame +
    chartRun(result.series, 0, today, ink, base, x, y) +
    (today < 6 ? faded(chartRun(result.series, today, 6, ink, base, x, y)) : '');
}

/**
 * A hairline where today falls, so the change in opacity has an edge.
 * `todayIndex` returns -1 for any week that is not this one, which is exactly
 * the guard wanted here: a past week is settled and a future week has not
 * started, and neither should be drawn as half provisional.
 */
function todayRule(today) {
  if (today < 0) return '';
  const at = cols[today].toFixed(1);
  return `<line x1="${at}" y1="${GOAL.plotPad / 2}" x2="${at}" ` +
    `y2="${GOAL.plotH - GOAL.plotPad / 2}" stroke="${pending()}" ` +
    `stroke-width="2" stroke-dasharray="4 7"/>`;
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

export function goalCard(goal, state, today = todayIndex(state.weekStart)) {
  const result = evaluate(goal, state);
  // Normalised once here so the plots can simply ask whether it is negative.
  // `null < 0` is false in JavaScript, which is exactly the sort of thing that
  // would otherwise get through and throw on cols[null].
  const at = Number.isInteger(today) && today >= 0 && today <= 6 ? today : -1;

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
    todayRule(at) +
    (result.useDots ? dotPlot(result, at) : areaPlot(result, at)) +
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
  const today = todayIndex(state.weekStart);   // once, not once per card
  host.innerHTML = '';
  host.hidden = active.length === 0;
  for (const goal of active) host.appendChild(goalCard(goal, state, today));
}
