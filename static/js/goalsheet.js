// ---------------------------------------------------------------------------
// weekform — goal builder
//
// Every control below is generated from CATEGORIES in tokens.js, the same way
// the day picker is. Adding an activity type, a sub-type or a preset label
// makes it available as a goal with no change to this file; marking a category
// `goals: false` removes it.
//
// It runs inside the sheet from sheet.js rather than a second one of its own,
// so a goal is built the same way an activity is.
// ---------------------------------------------------------------------------

import { PALETTE, LIMITS, UNITS, category, subType } from './tokens.js';
import { openSheet, setSheetTitle, setCloseLabel, chipRow, badge, el,
         close } from './sheet.js';
import { goalCategories, newGoalId, describe, sanitiseGoal } from './goals.js';
import { mondayOf, toISO, parseISO, formatRangeShort } from './week.js';

const ANY = '';
const CUSTOM = '__custom';

const METRIC_LABELS = { count: 'Count', distance: 'Distance', duration: 'Time' };

function defaultUnit(metric) {
  return metric === 'distance' ? 'km' : 'min';
}

/** Preset labels offered for a requirement: those of the chosen sub-type, or
 *  the union across the category when the requirement matches any sub-type. */
function tagsFor(cat, subId) {
  if (subId) return (subType(cat.id, subId).tags || []);
  const seen = [];
  cat.subs.forEach((s) => (s.tags || []).forEach((t) => {
    if (!seen.includes(t)) seen.push(t);
  }));
  return seen;
}

function allowsCustom(cat, subId) {
  if (subId) return Boolean(subType(cat.id, subId).custom);
  return cat.subs.some((s) => s.custom);
}

function blankReq() {
  return {
    sub: ANY,
    labelPick: ANY,
    labelText: '',
    metric: 'count',
    target: '1',
    unit: defaultUnit('count'),
  };
}

function draftFrom(goal, cat) {
  if (!goal) {
    return {
      id: newGoalId(),
      name: '',
      cat: cat.id,
      from: null,
      to: null,
      reqs: [blankReq()],
    };
  }
  const presets = (req) => tagsFor(cat, req.sub || ANY);
  return {
    id: goal.id,
    name: goal.name,
    cat: goal.cat,
    from: goal.from,
    to: goal.to,
    reqs: goal.reqs.map((req) => ({
      sub: req.sub || ANY,
      labelPick: !req.label ? ANY
        : (presets(req).includes(req.label) ? req.label : CUSTOM),
      labelText: req.label && !presets(req).includes(req.label) ? req.label : '',
      metric: req.metric,
      target: String(req.target),
      unit: req.unit || defaultUnit(req.metric),
    })),
  };
}

/** The draft as a goal, ready for sanitiseGoal. */
function toGoal(draft) {
  return {
    id: draft.id,
    name: draft.name.trim(),
    cat: draft.cat,
    from: draft.from,
    to: draft.to,
    reqs: draft.reqs.map((r) => {
      const out = { metric: r.metric, target: Number(r.target) };
      if (r.sub) out.sub = r.sub;
      const label = r.labelPick === CUSTOM ? r.labelText.trim() : r.labelPick;
      if (label) out.label = label;
      if (r.metric !== 'count') out.unit = r.unit;
      return out;
    }),
  };
}

// --- entry points ----------------------------------------------------------

/**
 * Build or edit a goal. `onSave` is handed a sanitised goal; it is responsible
 * for storing it. Adding starts on the category grid, editing goes straight to
 * the form — the category is what fixes a goal's colour, so changing it means
 * building a different goal.
 */
export function openGoalSheet(existing, onSave, checkFit = () => null) {
  if (existing) {
    const cat = category(existing.cat);
    openSheet(cat.label, (body) =>
      form(body, draftFrom(existing, cat), cat, onSave, true, checkFit));
    return;
  }
  openSheet('New goal', (body) => {
    setCloseLabel('Cancel');
    body.appendChild(el('p', 'sheet-note', 'What kind of activity is this goal about?'));
    const grid = el('div', 'cat-grid');
    goalCategories().forEach((cat) => {
      const tile = el('button', 'cat-tile');
      tile.type = 'button';
      tile.appendChild(badge(cat.subs[0].icon, PALETTE[cat.palette], 44));
      tile.appendChild(el('span', 'cat-name', cat.label));
      tile.addEventListener('click', () => {
        body.innerHTML = '';
        form(body, draftFrom(null, cat), cat, onSave, false, checkFit);
      });
      grid.appendChild(tile);
    });
    body.appendChild(grid);
  });
}

// --- the form --------------------------------------------------------------

function form(body, draft, cat, onSave, editing, checkFit) {
  const paint = () => {
    setSheetTitle(editing ? 'Edit goal' : cat.label);
    setCloseLabel('Cancel');
    body.innerHTML = '';

    if (!editing) {
      const back = el('button', 'sheet-back', 'Back');
      back.type = 'button';
      back.addEventListener('click', () => {
        body.innerHTML = '';
        openGoalSheet(null, onSave, checkFit);
      });
      body.appendChild(back);
    }

    // --- name
    body.appendChild(el('h3', 'sheet-sub', 'Name'));
    const name = el('input', 'text-field');
    name.type = 'text';
    name.maxLength = LIMITS.goalName;
    name.value = draft.name;
    name.placeholder = cat.label;
    name.setAttribute('aria-label', 'Goal name');
    name.addEventListener('input', () => {
      draft.name = name.value;
      refreshSave();
    });
    body.appendChild(name);

    // --- requirements
    body.appendChild(el('h3', 'sheet-sub', 'Each week'));

    draft.reqs.forEach((req, index) => {
      body.appendChild(reqBlock(req, index, draft, cat, paint, refreshSave));
    });

    if (draft.reqs.length < LIMITS.reqs) {
      const add = el('button', 'goal-add', 'Add another part');
      add.type = 'button';
      add.addEventListener('click', () => {
        draft.reqs.push(blankReq());
        paint();
      });
      body.appendChild(add);
    }

    // --- active range
    body.appendChild(el('h3', 'sheet-sub', 'Active'));
    const always = draft.from === null && draft.to === null;
    body.appendChild(chipRow(
      [{ value: 'always', label: 'Always' }, { value: 'range', label: 'Date range' }],
      always ? 'always' : 'range',
      (value) => {
        if (value === 'always') { draft.from = null; draft.to = null; }
        else if (draft.from === null && draft.to === null) {
          draft.from = toISO(mondayOf(new Date()));
        }
        paint();
      },
    ));

    if (!always) body.appendChild(rangeBlock(draft, paint));

    // --- preview and save
    const preview = el('p', 'goal-preview');
    body.appendChild(preview);

    const save = el('button', 'btn btn-primary sheet-save', editing ? 'Save' : 'Add goal');
    save.type = 'button';
    save.addEventListener('click', () => {
      const clean = sanitiseGoal(toGoal(draft));
      if (!clean) return;
      onSave(clean);
      close();
    });
    body.appendChild(save);

    function refreshSave() {
      const clean = sanitiseGoal(toGoal(draft));
      if (!clean) {
        save.disabled = true;
        preview.textContent = 'Set an amount for every part.';
        return;
      }
      // The active limit depends on the other goals and on these dates, so it
      // is checked here rather than only being discovered on save.
      const problem = checkFit(clean);
      save.disabled = Boolean(problem);
      preview.textContent = problem || describe(clean);
    }
    refreshSave();
  };

  paint();
}

function reqBlock(req, index, draft, cat, paint, refreshSave) {
  const block = el('div', 'goal-req');

  if (draft.reqs.length > 1) {
    const head = el('div', 'goal-req-head');
    head.appendChild(el('span', 'goal-req-n', `Part ${index + 1}`));
    const drop = el('button', 'goal-req-drop');
    drop.type = 'button';
    drop.setAttribute('aria-label', `Remove part ${index + 1}`);
    drop.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
      '<path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round"/></svg>';
    drop.addEventListener('click', () => {
      draft.reqs.splice(index, 1);
      paint();
    });
    head.appendChild(drop);
    block.appendChild(head);
  }

  // Type
  if (cat.subs.length > 1) {
    const options = [{ value: ANY, label: 'Any' }]
      .concat(cat.subs.map((s) => ({ value: s.id, label: s.label })));
    block.appendChild(chipRow(options, req.sub, (value) => {
      req.sub = value;
      req.labelPick = ANY;
      req.labelText = '';
      paint();
    }));
  }

  // Label
  const tags = tagsFor(cat, req.sub);
  if (tags.length || allowsCustom(cat, req.sub)) {
    const options = [{ value: ANY, label: 'Any label' }]
      .concat(tags.map((t) => ({ value: t, label: t })));
    if (allowsCustom(cat, req.sub)) options.push({ value: CUSTOM, label: 'Typed label' });
    block.appendChild(chipRow(options, req.labelPick, (value) => {
      req.labelPick = value;
      if (value !== CUSTOM) req.labelText = '';
      paint();
    }));
  }

  if (req.labelPick === CUSTOM) {
    const field = el('input', 'text-field');
    field.type = 'text';
    field.maxLength = LIMITS.label;
    field.placeholder = 'Label to match';
    field.value = req.labelText;
    field.setAttribute('aria-label', 'Label to match');
    field.addEventListener('input', () => {
      req.labelText = field.value;
      refreshSave();
    });
    block.appendChild(field);
    block.appendChild(el('p', 'goal-note',
      'Matched exactly, so it has to be typed the same way on the day.'));
  }

  // Metric
  if (cat.meta) {
    block.appendChild(chipRow(
      ['count', 'distance', 'duration'].map((m) => ({ value: m, label: METRIC_LABELS[m] })),
      req.metric,
      (value) => {
        req.metric = value;
        req.unit = defaultUnit(value);
        if (value === 'count') req.target = '1';
        paint();
      },
    ));
  }

  // Amount
  const row = el('div', 'amount-row');
  const amount = el('input', 'text-field amount');
  amount.type = 'number';
  amount.inputMode = 'decimal';
  amount.min = '0';
  amount.step = req.metric === 'count' ? '1' : 'any';
  amount.placeholder = '0';
  amount.value = req.target;
  amount.setAttribute('aria-label', 'How much');
  amount.addEventListener('input', () => {
    req.target = amount.value;
    refreshSave();
  });
  row.appendChild(amount);

  if (req.metric === 'count') {
    row.appendChild(el('span', 'goal-unit', 'times'));
  } else {
    const units = req.metric === 'distance' ? UNITS.distance : UNITS.time;
    row.appendChild(chipRow(
      units.map((u) => ({ value: u, label: u })),
      req.unit,
      (value) => { req.unit = value; paint(); },
      'units',
    ));
  }
  block.appendChild(row);

  return block;
}

function rangeBlock(draft, paint) {
  const wrap = el('div', 'goal-range');

  const field = (which, label) => {
    const line = el('label', 'goal-range-row');
    line.appendChild(el('span', 'goal-range-label', label));
    const input = el('input', 'text-field');
    input.type = 'date';
    input.value = draft[which] || '';
    input.addEventListener('change', () => {
      // Snapped to a Monday, because "per week" starting on a Wednesday has no
      // meaning. The week the chosen date falls in is the one that counts.
      draft[which] = input.value ? toISO(mondayOf(parseISO(input.value))) : null;
      paint();
    });
    line.appendChild(input);
    wrap.appendChild(line);
  };

  field('from', 'From');
  field('to', 'Until');

  const parts = [];
  if (draft.from) parts.push(`from ${formatRangeShort(draft.from)}`);
  if (draft.to) parts.push(`until ${formatRangeShort(draft.to)}`);
  wrap.appendChild(el('p', 'goal-note', parts.length
    ? `Active ${parts.join(', ')}. Whole weeks, Monday to Sunday.`
    : 'Leave both empty for a goal with no end.'));

  return wrap;
}
