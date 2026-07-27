// ---------------------------------------------------------------------------
// weekform — calendar
//
// A month at a time, each row a week. The circles are the same colours and
// glyphs as the strip, drawn from the same data, so the calendar reads as the
// same object seen from further away rather than a second design.
// ---------------------------------------------------------------------------

import { resolve } from './tokens.js';
import { iconBadgeSvg } from './icons.js';
import { toISO, mondayOf, formatRangeShort } from './week.js';
import { sanitise, encodeState, loadWeek, storedWeekStarts } from './state.js';
import { fetchAll, isSignedIn } from './sync.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const host = document.getElementById('calendar');
const title = document.getElementById('cal-title');
const note = document.getElementById('cal-note');

let weeks = {};              // weekStart -> { title, days }
let cursor = new Date();     // any date inside the month on show

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Server first when signed in, falling back to whatever is on the device. */
async function load() {
  const local = {};
  for (const weekStart of storedWeekStarts()) {
    const stored = loadWeek(weekStart);
    if (stored) local[weekStart] = { title: stored.title, days: stored.days };
  }

  if (!isSignedIn()) return local;

  try {
    const remote = await fetchAll();
    return { ...local, ...remote };
  } catch {
    return local;
  }
}

function dayMark(weekStart, index) {
  const week = weeks[weekStart];
  const entries = week && week.days ? week.days[index] : null;
  if (!entries || !entries.length) return null;
  const resolved = resolve(entries[0]);
  if (!resolved) return null;
  return resolved;
}

function render() {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  title.textContent = `${MONTHS[month]} ${year}`;
  host.innerHTML = '';

  const header = el('div', 'cal-dow');
  DOW.forEach((letter) => header.appendChild(el('span', null, letter)));
  host.appendChild(header);

  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = mondayOf(first);
  const today = toISO(new Date());

  let filled = 0;
  for (let offset = 0; ; offset += 7) {
    const rowStart = new Date(start);
    rowStart.setDate(rowStart.getDate() + offset);
    if (rowStart > last) break;

    const weekStart = toISO(rowStart);
    const row = el('button', 'cal-week');
    row.type = 'button';
    if (weeks[weekStart]) {
      row.classList.add('has-data');
      filled += 1;
    }
    row.setAttribute('aria-label', `Open week of ${formatRangeShort(weekStart)}`);

    for (let i = 0; i < 7; i++) {
      const date = new Date(rowStart);
      date.setDate(date.getDate() + i);

      const cell = el('div', 'cal-day');
      if (date.getMonth() !== month) cell.classList.add('is-outside');
      if (toISO(date) === today) cell.classList.add('is-today');

      cell.appendChild(el('span', 'cal-num', String(date.getDate())));

      const mark = dayMark(weekStart, i);
      if (mark) {
        const badge = el('span', 'cal-mark');
        badge.innerHTML = iconBadgeSvg(mark.icon, mark.colours.glyph,
          mark.colours.fill, 0.52, 34);
        cell.appendChild(badge);
      } else {
        cell.appendChild(el('span', 'cal-empty'));
      }
      row.appendChild(cell);
    }

    row.addEventListener('click', () => open(weekStart));
    host.appendChild(row);
  }

  note.textContent = filled
    ? 'Tap any week to open it.'
    : 'Nothing saved this month. Tap a week to start one.';
}

/**
 * Open a week in the editor by handing it over in the URL fragment — the same
 * mechanism a shared link uses, so there is no second way in to maintain.
 */
function open(weekStart) {
  const stored = weeks[weekStart];
  const state = sanitise({
    title: stored ? stored.title : undefined,
    weekStart,
    days: stored ? stored.days : undefined,
  });
  window.location.href = `/#${encodeState(state)}`;
}

function step(months) {
  cursor = new Date(cursor.getFullYear(), cursor.getMonth() + months, 1);
  render();
}

document.getElementById('cal-prev').addEventListener('click', () => step(-1));
document.getElementById('cal-next').addEventListener('click', () => step(1));

render();
load().then((all) => {
  weeks = all;
  render();
});
