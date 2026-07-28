// ---------------------------------------------------------------------------
// weekform — the goals page
//
// Goals are created, edited and deleted here and nowhere else. The strip page
// only draws them. That is deliberate: the front page is a calculator, and a
// calculator does not carry its own settings screen.
// ---------------------------------------------------------------------------

import { PALETTE, LIMITS, category } from './tokens.js';
import { iconBadgeSvg } from './icons.js';
import { describe } from './goals.js';
import { fetchGoals, saveGoal, removeGoal } from './goalsync.js';
import { openGoalSheet } from './goalsheet.js';
import { formatRangeShort } from './week.js';

const list = document.getElementById('goal-list');
const addBtn = document.getElementById('goal-add');
const note = document.getElementById('goal-note');

let goals = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function rangeText(goal) {
  if (!goal.from && !goal.to) return 'Always active';
  if (goal.from && goal.to) {
    return `${formatRangeShort(goal.from)} until ${formatRangeShort(goal.to)}`;
  }
  if (goal.from) return `From ${formatRangeShort(goal.from)}`;
  return `Until ${formatRangeShort(goal.to)}`;
}

function row(goal) {
  const cat = category(goal.cat);
  const item = el('div', 'goal-row');

  const open = el('button', 'goal-open');
  open.type = 'button';
  open.setAttribute('aria-label', `Edit ${goal.name}`);

  const mark = el('span', 'badge');
  mark.innerHTML = iconBadgeSvg(cat.subs[0].icon, PALETTE[cat.palette].glyph,
    PALETTE[cat.palette].fill, 0.5, 36);
  open.appendChild(mark);

  const text = el('div', 'goal-row-text');
  text.appendChild(el('span', 'goal-row-name', goal.name));
  text.appendChild(el('span', 'goal-row-detail', describe(goal)));
  text.appendChild(el('span', 'goal-row-range', rangeText(goal)));
  open.appendChild(text);

  open.addEventListener('click', () => {
    openGoalSheet(goal, async (updated) => {
      await store(updated);
    });
  });
  item.appendChild(open);

  // Two taps, not a modal — the same pattern as clearing a week and deleting
  // an account.
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
      await removeGoal(goal.id);
      goals = goals.filter((g) => g.id !== goal.id);
      paint();
    } catch {
      note.textContent = 'That could not be saved. Check your connection.';
    }
  });
  item.appendChild(drop);

  return item;
}

async function store(goal) {
  try {
    await saveGoal(goal);
    const at = goals.findIndex((g) => g.id === goal.id);
    if (at >= 0) goals[at] = goal;
    else goals.push(goal);
    paint();
  } catch {
    note.textContent = 'That could not be saved. Check your connection.';
  }
}

function paint() {
  list.innerHTML = '';
  if (!goals.length) {
    list.appendChild(el('p', 'goal-empty', 'No goals yet.'));
  } else {
    goals.forEach((goal) => list.appendChild(row(goal)));
  }

  const full = goals.length >= LIMITS.goals;
  addBtn.hidden = full;
  note.textContent = full
    ? `${LIMITS.goals} goals is the limit.`
    : 'Goals appear under your week when it falls inside their dates.';
}

addBtn.addEventListener('click', () => {
  openGoalSheet(null, async (goal) => {
    await store(goal);
  });
});

(async () => {
  try {
    goals = await fetchGoals();
  } catch {
    note.textContent = 'Your goals could not be loaded. Try again shortly.';
  }
  paint();
})();
