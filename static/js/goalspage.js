// ---------------------------------------------------------------------------
// weekform — the goals page
//
// Goals are created, edited and deleted here and nowhere else. The strip page
// only draws them. That is deliberate: the front page is a calculator, and a
// calculator does not carry its own settings screen.
// ---------------------------------------------------------------------------

import { PALETTE, LIMITS, category } from './tokens.js';
import { iconBadgeSvg } from './icons.js';
import { describe, groupGoals, capacityProblem } from './goals.js';
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
    openGoalSheet(goal, async (updated) => { await store(updated); },
      (candidate) => capacityProblem(goals, candidate));
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

/**
 * Grouped, because a goal that finished in March is worth keeping and worth
 * getting out of the way. The limit is on how many are live in one week, so a
 * long list of finished goals costs nothing on the front page and there is no
 * reason to make anybody delete one to make room.
 */
function paint() {
  list.innerHTML = '';

  if (!goals.length) {
    list.appendChild(el('p', 'goal-empty', 'No goals yet.'));
  } else {
    const groups = groupGoals(goals);
    const sections = [
      ['Active', groups.active],
      ['Upcoming', groups.upcoming],
      ['Finished', groups.finished],
    ];
    for (const [heading, members] of sections) {
      if (!members.length) continue;
      const block = el('section', 'goal-group');
      const head = el('h2', 'goal-group-head', heading);
      head.appendChild(el('span', 'goal-group-n', String(members.length)));
      block.appendChild(head);
      members.forEach((goal) => block.appendChild(row(goal)));
      list.appendChild(block);
    }
  }

  const full = goals.length >= LIMITS.storedGoals;
  addBtn.hidden = full;
  note.textContent = full
    ? `${LIMITS.storedGoals} goals is the limit.`
    : `Goals appear under your week when it falls inside their dates. ` +
      `Up to ${LIMITS.activeGoals} can be active in the same week.`;
}

addBtn.addEventListener('click', () => {
  openGoalSheet(null, async (goal) => { await store(goal); },
    (candidate) => capacityProblem(goals, candidate));
});

(async () => {
  try {
    goals = await fetchGoals();
  } catch {
    note.textContent = 'Your goals could not be loaded. Try again shortly.';
  }
  paint();
})();
