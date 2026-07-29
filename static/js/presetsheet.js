// ---------------------------------------------------------------------------
// weekform — preset sheets
//
// Two small sheets, both borrowing the shell from sheet.js. One picks a preset
// to apply, one names the week being saved as a preset. Neither knows anything
// about the taxonomy: a preset is a week, and a week is already validated.
// ---------------------------------------------------------------------------

import { LIMITS, resolve } from './tokens.js';
import { iconBadgeSvg } from './icons.js';
import { openSheet, setCloseLabel, el, close } from './sheet.js';
import { describePreset } from './presets.js';

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Seven small badges, so a preset can be recognised without applying it. */
function miniWeek(preset) {
  const row = el('div', 'preset-week');
  preset.days.forEach((day, i) => {
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

/** Choose a preset to apply. Only ever offered on an empty week. */
export function openPresetPicker(presets, onPick) {
  openSheet('Start from a preset', (body) => {
    setCloseLabel('Cancel');
    presets.forEach((preset) => {
      const row = el('button', 'preset-row');
      row.type = 'button';
      row.setAttribute('aria-label', `Apply ${preset.name}`);

      const head = el('div', 'preset-row-head');
      head.appendChild(el('span', 'preset-name', preset.name));
      head.appendChild(el('span', 'preset-count', describePreset(preset)));
      row.appendChild(head);
      row.appendChild(miniWeek(preset));

      row.addEventListener('click', () => {
        onPick(preset);
        close();
      });
      body.appendChild(row);
    });
  });
}

/**
 * One text field and a save button. Used for naming a new preset from the front
 * page, naming one built from a past week, and renaming an existing one — three
 * places that would otherwise each grow their own slightly different sheet.
 */
export function openNameSheet({ title, note, initial, action, onSave }) {
  openSheet(title, (body) => {
    setCloseLabel('Cancel');
    if (note) body.appendChild(el('p', 'sheet-note', note));

    const field = el('input', 'text-field');
    field.type = 'text';
    field.maxLength = LIMITS.presetName;
    field.value = initial || '';
    field.placeholder = 'Name it';
    field.setAttribute('aria-label', 'Preset name');
    body.appendChild(field);

    const save = el('button', 'btn btn-primary sheet-save', action);
    save.type = 'button';
    const commit = () => {
      const name = field.value.trim();
      if (!name) return;
      close();
      onSave(name);
    };
    save.disabled = !field.value.trim();
    field.addEventListener('input', () => { save.disabled = !field.value.trim(); });
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
    save.addEventListener('click', commit);
    body.appendChild(save);

    setTimeout(() => { field.focus(); field.select(); }, 60);
  });
}

/**
 * Name the week being saved. `held` is how many presets already exist, so the
 * sheet can say why it is refusing rather than simply not appearing.
 */
export function openPresetSave(held, suggestion, onSave) {
  if (held >= LIMITS.presets) {
    openSheet('Save as a preset', (body) => {
      setCloseLabel('Cancel');
      body.appendChild(el('p', 'sheet-note',
        `${LIMITS.presets} presets is the limit. Delete one from your account first.`));
    });
    return;
  }
  openNameSheet({
    title: 'Save as a preset',
    note: 'The activities are kept. The title is not.',
    initial: suggestion,
    action: 'Save preset',
    onSave,
  });
}
