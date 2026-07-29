// ---------------------------------------------------------------------------
// weekform — the presets page
//
// Renames, deletes, and builds a preset from a week already on record. It does
// not build one from scratch: that would mean a second day picker on a page
// with no strip to preview it against, which is how two pickers start to differ.
// Picking a week you already made is a different thing entirely.
//
// This is the entry point the front page links to. The week sheet on the front
// page is the shortcut for anyone who has found it; this is the way anybody
// else arrives.
// ---------------------------------------------------------------------------

import { LIMITS, resolve } from './tokens.js';
import { iconBadgeSvg } from './icons.js';
import { describePreset, candidateWeeks, presetFromWeek } from './presets.js';
import { fetchPresets, savePreset, removePreset } from './presetsync.js';
import { openNameSheet } from './presetsheet.js';
import { openSheet, setCloseLabel, el } from './sheet.js';
import { loadWeek, storedWeekStarts } from './state.js';
import { fetchAll, isSignedIn } from './sync.js';
import { formatRangeShort, relativeName } from './week.js';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const list = document.getElementById('preset-list');
const addBtn = document.getElementById('preset-add');
const note = document.getElementById('preset-note');

let presets = [];
let weeks = [];

/** Server first when signed in, falling back to the device. Same as the calendar. */
async function loadWeeks() {
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

function miniWeek(days) {
  const row = el('div', 'preset-week');
  days.forEach((day, i) => {
    const cell = el('div', 'preset-day');
    const mark = el('span', 'preset-mark');
    const first = day[0];
    if (first) {
      const res = resolve(first);
      if (res) mark.innerHTML = iconBadgeSvg(res.icon, res.colours.glyph,
        res.colours.fill, 0.5, 26);
    }
    cell.appendChild(mark);
    cell.appendChild(el('span', 'preset-dow', DAY_LETTERS[i]));
    row.appendChild(cell);
  });
  return row;
}

// --- creating --------------------------------------------------------------

function chooseWeek() {
  openSheet('Save a week as a preset', (body) => {
    setCloseLabel('Cancel');

    if (!weeks.length) {
      body.appendChild(el('p', 'sheet-note',
        'No weeks with anything in them yet. Build one first.'));
      return;
    }

    body.appendChild(el('p', 'sheet-note', 'Which week?'));
    const rows = el('div', 'week-list');
    weeks.forEach((week) => {
      const row = el('button', 'week-row');
      row.type = 'button';
      row.setAttribute('aria-label', `Use ${formatRangeShort(week.weekStart)}`);

      const left = el('div', 'week-left');
      left.appendChild(el('span', null, formatRangeShort(week.weekStart)));
      const detail = [relativeName(week.weekStart), week.title]
        .filter(Boolean).join(' · ');
      if (detail) left.appendChild(el('span', 'week-rel', detail));
      row.appendChild(left);
      row.appendChild(el('span', 'preset-count',
        `${week.count} activit${week.count === 1 ? 'y' : 'ies'}`));

      // Straight to the next step rather than close-then-open: the sheet stays
      // put and swaps its contents, so there is no slide-down and back up.
      row.addEventListener('click', () => nameAndSave(week));
      rows.appendChild(row);
    });
    body.appendChild(rows);
  });
}

function nameAndSave(week) {
  openNameSheet({
    title: 'Save as a preset',
    note: 'The activities are kept. The title is not.',
    initial: week.title || '',
    action: 'Save preset',
    onSave: async (name) => {
      const preset = presetFromWeek(week, name);
      if (!preset) return;
      try {
        await savePreset(preset);
        presets.push(preset);
        paint();
      } catch {
        note.textContent = 'That could not be saved. Check your connection.';
      }
    },
  });
}

// --- rows ------------------------------------------------------------------

function rename(preset) {
  openNameSheet({
    title: 'Rename preset',
    initial: preset.name,
    action: 'Save',
    onSave: async (name) => {
      try {
        await savePreset({ ...preset, name });
        preset.name = name;
        paint();
      } catch {
        note.textContent = 'That could not be saved. Check your connection.';
      }
    },
  });
}

function row(preset) {
  const item = el('div', 'preset-item');

  const head = el('div', 'preset-item-head');
  const open = el('button', 'preset-rename');
  open.type = 'button';
  open.textContent = preset.name;
  open.setAttribute('aria-label', `Rename ${preset.name}`);
  open.addEventListener('click', () => rename(preset));
  head.appendChild(open);

  // Two taps, not a modal — the same pattern as everywhere else here.
  let armed = false;
  let timer = null;
  const drop = el('button', 'goal-drop', 'Delete');
  drop.type = 'button';
  drop.addEventListener('click', async () => {
    if (!armed) {
      armed = true;
      drop.textContent = 'Sure?';
      drop.classList.add('is-armed');
      timer = setTimeout(() => {
        armed = false;
        drop.textContent = 'Delete';
        drop.classList.remove('is-armed');
      }, 3000);
      return;
    }
    clearTimeout(timer);
    try {
      await removePreset(preset.id);
      presets = presets.filter((p) => p.id !== preset.id);
      paint();
    } catch {
      note.textContent = 'That could not be saved. Check your connection.';
    }
  });
  head.appendChild(drop);
  item.appendChild(head);

  item.appendChild(el('p', 'preset-count', describePreset(preset)));
  item.appendChild(miniWeek(preset.days));
  return item;
}

function paint() {
  list.innerHTML = '';
  if (!presets.length) {
    list.appendChild(el('p', 'goal-empty', 'No presets yet.'));
  } else {
    presets.forEach((preset) => list.appendChild(row(preset)));
  }

  const full = presets.length >= LIMITS.presets;
  addBtn.hidden = full;
  note.textContent = full
    ? `${LIMITS.presets} presets is the limit.`
    : 'Applying a preset fills an empty week. You can also save one from the ' +
      'week menu on the front page.';
}

addBtn.addEventListener('click', chooseWeek);

(async () => {
  try {
    const [held, weekMap] = await Promise.all([fetchPresets(), loadWeeks()]);
    presets = held;
    weeks = candidateWeeks(weekMap);
  } catch {
    note.textContent = 'Your presets could not be loaded. Try again shortly.';
  }
  paint();
})();
