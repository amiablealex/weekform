// ---------------------------------------------------------------------------
// weekform — bottom sheet
//
// Every control below is generated from CATEGORIES in tokens.js. Adding an
// activity type, a sub-type or a preset label is a data change; nothing in this
// file needs touching for it to appear in the picker.
// ---------------------------------------------------------------------------

import { CATEGORIES, PALETTE, LIMITS, MAX_PER_DAY, UNITS,
         category, subType, resolve, labelFor, metaFor, needsLabel } from './tokens.js';
import { iconBadgeSvg } from './icons.js';
import { daysOf, formatRangeShort, relativeName, addWeeks, toISO, mondayOf } from './week.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday',
  'Friday', 'Saturday', 'Sunday'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// --- sheet shell -----------------------------------------------------------

let root = null;
let lastFocus = null;

function ensureRoot() {
  if (root) return root;
  root = el('div', 'sheet-root');
  root.hidden = true;
  root.innerHTML = `
    <div class="sheet-backdrop" data-close></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet-grip" aria-hidden="true"></div>
      <header class="sheet-head">
        <h2 class="sheet-title" id="sheet-title"></h2>
        <button type="button" class="sheet-close" data-close aria-label="Close">Done</button>
      </header>
      <div class="sheet-body"></div>
    </section>`;
  document.body.appendChild(root);

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !root.hidden) close();
  });
  return root;
}

function open(title, build) {
  const node = ensureRoot();
  lastFocus = document.activeElement;
  node.querySelector('.sheet-title').textContent = title;
  const body = node.querySelector('.sheet-body');
  body.innerHTML = '';
  build(body);
  node.hidden = false;
  document.body.classList.add('sheet-open');
  requestAnimationFrame(() => {
    node.classList.add('is-open');
    const first = body.querySelector('button, input');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus();
  });
}

export function close() {
  if (!root || root.hidden) return;
  root.classList.remove('is-open');
  document.body.classList.remove('sheet-open');
  const finish = () => { root.hidden = true; };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
  else setTimeout(finish, 180);
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

function setTitle(text) {
  ensureRoot().querySelector('.sheet-title').textContent = text;
}

// --- shared pieces ---------------------------------------------------------

function badge(iconId, palette, size = 40) {
  const wrap = el('span', 'badge');
  wrap.innerHTML = iconBadgeSvg(iconId, palette.glyph, palette.fill, 0.5, size);
  return wrap;
}

function chipRow(options, selected, onPick, className = '') {
  const row = el('div', `chips ${className}`);
  options.forEach((opt) => {
    const chip = el('button', 'chip', opt.label);
    chip.type = 'button';
    if (opt.value === selected) chip.classList.add('is-on');
    chip.addEventListener('click', () => onPick(opt.value));
    row.appendChild(chip);
  });
  return row;
}

function defaultUnit(catId, subId) {
  // Distance is the natural first guess for the things people measure in
  // distance, time for everything else.
  if (catId === 'cardio' && ['run', 'bike', 'swim'].includes(subId)) return 'km';
  return 'min';
}

// --- day sheet -------------------------------------------------------------

export function openDay(index, state, onChange) {
  const date = daysOf(state.weekStart)[index];
  const heading = `${DAY_NAMES[index]} ${date.getDate()}`;
  open(heading, (body) => renderDayRoot(body, index, state, onChange, heading));
}

function renderDayRoot(body, index, state, onChange, heading) {
  setTitle(heading);
  body.innerHTML = '';
  const entries = state.days[index];

  if (entries.length) {
    const list = el('ul', 'entry-list');
    entries.forEach((activity, position) => {
      const res = resolve(activity);
      const item = el('li', 'entry');
      item.appendChild(badge(res.icon, res.colours, 36));

      const text = el('div', 'entry-text');
      const cat = category(activity.cat);
      const sub = subType(activity.cat, activity.sub);
      const name = cat.subs.length > 1 ? sub.label : cat.label;
      text.appendChild(el('span', 'entry-name', name));
      const detail = [labelFor(activity).toLowerCase(), metaFor(activity)]
        .filter(Boolean).join(' · ');
      if (detail) text.appendChild(el('span', 'entry-detail', detail));
      item.appendChild(text);

      const remove = el('button', 'entry-remove');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${name}`);
      remove.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">' +
        '<path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round"/></svg>';
      remove.addEventListener('click', () => {
        entries.splice(position, 1);
        onChange();
        renderDayRoot(body, index, state, onChange, heading);
      });
      item.appendChild(remove);
      list.appendChild(item);
    });
    body.appendChild(list);
  }

  if (entries.length >= MAX_PER_DAY) {
    body.appendChild(el('p', 'sheet-note',
      `Two activities is the limit for one day.`));
    return;
  }

  if (entries.length) body.appendChild(el('h3', 'sheet-sub', 'Add another'));
  body.appendChild(categoryGrid((catId) => {
    renderDetail(body, index, state, onChange, heading, catId);
  }));
}

function categoryGrid(onPick) {
  const grid = el('div', 'cat-grid');
  CATEGORIES.forEach((cat) => {
    const tile = el('button', 'cat-tile');
    tile.type = 'button';
    tile.appendChild(badge(cat.subs[0].icon, PALETTE[cat.palette], 44));
    tile.appendChild(el('span', 'cat-name', cat.label));
    tile.addEventListener('click', () => onPick(cat.id));
    grid.appendChild(tile);
  });
  return grid;
}

// --- activity detail -------------------------------------------------------

function renderDetail(body, index, state, onChange, heading, catId) {
  const cat = category(catId);
  const draft = {
    cat: catId,
    sub: cat.subs[0].id,
    tag: '',
    custom: '',
    amount: '',
    unit: defaultUnit(catId, cat.subs[0].id),
  };

  const paint = () => {
    setTitle(cat.label);
    body.innerHTML = '';
    const sub = subType(catId, draft.sub);
    const colours = PALETTE[cat.palette];

    const back = el('button', 'sheet-back', 'Back');
    back.type = 'button';
    back.addEventListener('click', () =>
      renderDayRoot(body, index, state, onChange, heading));
    body.appendChild(back);

    // Live preview of the circle being built.
    const preview = el('div', 'detail-preview');
    preview.appendChild(badge(sub.icon, colours, 76));
    const caption = labelFor({ ...draft, custom: draft.custom.trim() });
    const meta = cat.meta ? metaFor(draft) : '';
    const line = [caption, meta].filter(Boolean).join(' · ');
    preview.appendChild(el('span', 'detail-caption', line || cat.label));
    body.appendChild(preview);

    if (cat.subs.length > 1) {
      body.appendChild(el('h3', 'sheet-sub', 'Type'));
      body.appendChild(chipRow(
        cat.subs.map((s) => ({ value: s.id, label: s.label })),
        draft.sub,
        (value) => {
          draft.sub = value;
          draft.tag = '';
          draft.custom = '';
          draft.unit = defaultUnit(catId, value);
          paint();
        },
      ));
    }

    const tags = sub.tags || [];
    if (tags.length || sub.custom) {
      body.appendChild(el('h3', 'sheet-sub', 'Label'));
      const options = tags.map((t) => ({ value: t, label: t }));
      if (sub.custom && !sub.requiresLabel) options.push({ value: 'custom', label: 'Custom' });
      if (options.length) {
        body.appendChild(chipRow(options, draft.tag, (value) => {
          draft.tag = draft.tag === value ? '' : value;
          if (draft.tag !== 'custom') draft.custom = '';
          paint();
        }));
      }
    }

    const wantsText = sub.requiresLabel || draft.tag === 'custom' ||
      (sub.custom && !(sub.tags || []).length);
    if (wantsText) {
      const field = el('input', 'text-field');
      field.type = 'text';
      field.maxLength = LIMITS.label;
      field.placeholder = sub.requiresLabel ? 'Name it' : 'Your label';
      field.value = draft.custom;
      field.setAttribute('aria-label', 'Label');
      field.addEventListener('input', () => {
        draft.custom = field.value;
        const caption2 = body.querySelector('.detail-caption');
        const live = labelFor({ ...draft, custom: draft.custom.trim() });
        if (caption2) {
          caption2.textContent = [live, cat.meta ? metaFor(draft) : '']
            .filter(Boolean).join(' · ') || cat.label;
        }
        save.disabled = blocked();
      });
      body.appendChild(field);
    }

    if (cat.meta) {
      body.appendChild(el('h3', 'sheet-sub', 'How much (optional)'));
      const amountRow = el('div', 'amount-row');
      const amount = el('input', 'text-field amount');
      amount.type = 'number';
      amount.inputMode = 'decimal';
      amount.min = '0';
      amount.step = 'any';
      amount.placeholder = '0';
      amount.value = draft.amount;
      amount.setAttribute('aria-label', 'Amount');
      amount.addEventListener('input', () => {
        draft.amount = amount.value;
        const caption2 = body.querySelector('.detail-caption');
        if (caption2) {
          const live = labelFor({ ...draft, custom: draft.custom.trim() });
          caption2.textContent = [live, metaFor(draft)].filter(Boolean).join(' · ') || cat.label;
        }
      });
      amountRow.appendChild(amount);
      amountRow.appendChild(chipRow(
        [...UNITS.time, ...UNITS.distance].map((u) => ({ value: u, label: u })),
        draft.unit,
        (value) => { draft.unit = value; paint(); },
        'units',
      ));
      body.appendChild(amountRow);
    }

    const blocked = () => needsLabel({ ...draft, custom: draft.custom.trim() }) &&
      !draft.custom.trim();

    const save = el('button', 'btn btn-primary sheet-save', 'Add');
    save.type = 'button';
    save.disabled = blocked();
    save.addEventListener('click', () => {
      const activity = { cat: draft.cat, sub: draft.sub };
      if (draft.tag && draft.tag !== 'custom') activity.tag = draft.tag;
      if (draft.tag === 'custom') activity.tag = 'custom';
      const text = draft.custom.trim();
      if (text) activity.custom = text;
      const value = Number(draft.amount);
      if (cat.meta && Number.isFinite(value) && value > 0) {
        activity.amount = value;
        activity.unit = draft.unit;
      }
      state.days[index].push(activity);
      onChange();
      close();
    });
    body.appendChild(save);
  };

  paint();
}

// --- week sheet ------------------------------------------------------------

export function openWeek(state, onChange) {
  open('Choose a week', (body) => {
    const today = new Date();
    const current = toISO(mondayOf(today));
    const list = el('div', 'week-list');

    // Eight weeks back, two forward. Enough to catch up on a missed month
    // without turning into a date picker.
    for (let offset = 2; offset >= -8; offset--) {
      const weekStart = addWeeks(current, offset);
      const row = el('button', 'week-row');
      row.type = 'button';
      if (weekStart === state.weekStart) row.classList.add('is-on');
      row.appendChild(el('span', 'week-range', formatRangeShort(weekStart)));
      const name = relativeName(weekStart, today);
      if (name) row.appendChild(el('span', 'week-rel', name));
      row.addEventListener('click', () => {
        state.weekStart = weekStart;
        onChange();
        close();
      });
      list.appendChild(row);
    }
    body.appendChild(list);
  });
}

// --- title sheet -----------------------------------------------------------

export function openTitle(state, onChange) {
  open('Title', (body) => {
    const field = el('input', 'text-field');
    field.type = 'text';
    field.maxLength = LIMITS.title;
    field.value = state.title;
    field.placeholder = 'My Week';
    field.setAttribute('aria-label', 'Strip title');
    body.appendChild(field);

    const save = el('button', 'btn btn-primary sheet-save', 'Save');
    save.type = 'button';
    const commit = () => {
      state.title = field.value.trim() || 'My Week';
      onChange();
      close();
    };
    save.addEventListener('click', commit);
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
    body.appendChild(save);
    setTimeout(() => { field.focus(); field.select(); }, 60);
  });
}
