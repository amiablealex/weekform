// ---------------------------------------------------------------------------
// weekform — goals
//
// A goal is a rule written against the taxonomy in tokens.js, evaluated against
// the week on screen. Nothing here is stored: whether a goal is met is worked
// out from the current week every time, so removing an activity un-meets it.
// That is the whole design. There is no history of met and missed weeks, and
// there deliberately never will be — that is the streaks feature this app has
// refused since the beginning.
//
//   goal = { id, name, cat, from, to, reqs: [ requirement ] }
//   requirement = { sub?, label?, metric, target, unit? }
//
// A goal is met when every one of its requirements is met. A single-requirement
// goal covers "20km of running"; several cover "one upper body, one core, one
// lower body". The builder is the same either way.
//
// `from` and `to` are ISO Mondays, or null for always active. They are compared
// as strings, which is safe for ISO dates and avoids a timezone round trip.
//
// This file is pure: no DOM, no network, no localStorage. It is the part worth
// testing, and tests/logic.test.mjs does.
// ---------------------------------------------------------------------------

import { LIMITS, UNITS, GOAL, PALETTE,
         category, subType, labelFor, goalCategories } from './tokens.js';
import { addWeeks, mondayOf, toISO } from './week.js';

export const METRICS = ['count', 'distance', 'duration'];

// Canonical units are metres and minutes. Everything is converted on the way in
// so that a goal of 20km counts a 3.2mi run, and a 90min goal counts 1.5h.
const TO_METRES = { km: 1000, mi: 1609.344 };
const TO_MINUTES = { min: 1, h: 60 };

// Distance comparisons are floating point once miles are involved, so "met"
// needs a hair of tolerance or 20km of miles can land at 19.999999999999996.
const EPSILON = 1e-6;

export function metricOf(unit) {
  if (UNITS.distance.includes(unit)) return 'distance';
  if (UNITS.time.includes(unit)) return 'duration';
  return null;
}

/** An amount and unit as metres or minutes. Returns 0 for anything unusable. */
export function toCanonical(amount, unit, metric) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (metric === 'count') return n;
  if (metric === 'distance') return TO_METRES[unit] ? n * TO_METRES[unit] : 0;
  if (metric === 'duration') return TO_MINUTES[unit] ? n * TO_MINUTES[unit] : 0;
  return 0;
}

/** Canonical back to a display unit, for the figure in a goal's header. */
export function fromCanonical(value, unit, metric) {
  if (metric === 'count') return value;
  if (metric === 'distance') return TO_METRES[unit] ? value / TO_METRES[unit] : 0;
  if (metric === 'duration') return TO_MINUTES[unit] ? value / TO_MINUTES[unit] : 0;
  return 0;
}

/** "12", "12.5", "0" — one decimal at most, no trailing zero. */
export function trimNumber(value) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

// --- validation ------------------------------------------------------------
// Goals arrive from the server, which never looks inside them, so everything
// below treats them as untrusted the same way state.js treats a pasted link.

const ID_RE = /^[a-z0-9]{4,16}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanMonday(value) {
  return typeof value === 'string' && ISO_RE.test(value) ? value : null;
}

export function newGoalId() {
  let id = '';
  while (id.length < 8) id += Math.random().toString(36).slice(2);
  return id.slice(0, 8);
}

function cleanRequirement(raw, cat) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};

  if (raw.sub) {
    const sub = cat.subs.find((s) => s.id === raw.sub);
    if (!sub) return null;             // the sub-type was renamed or removed
    out.sub = sub.id;
  }

  const label = cleanText(raw.label, LIMITS.label);
  if (label) out.label = label;

  // A category that takes no duration or distance can only be counted.
  const metric = cat.meta && METRICS.includes(raw.metric) ? raw.metric : 'count';
  out.metric = metric;

  const target = Number(raw.target);
  if (!Number.isFinite(target) || target <= 0) return null;

  if (metric === 'count') {
    out.target = Math.min(Math.round(target), 99);
  } else {
    const units = metric === 'distance' ? UNITS.distance : UNITS.time;
    if (!units.includes(raw.unit)) return null;
    out.target = Math.min(Math.round(target * 100) / 100, 9999);
    out.unit = raw.unit;
  }
  return out;
}

/**
 * Coerce anything into a goal that is safe to evaluate, or null.
 *
 * A goal whose category or every sub-type has since been removed from the
 * taxonomy resolves to null and is simply not shown, rather than drawn broken.
 */
export function sanitiseGoal(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;

  const cat = category(raw.cat);
  if (!cat || cat.goals === false) return null;

  const reqs = (Array.isArray(raw.reqs) ? raw.reqs : [])
    .map((r) => cleanRequirement(r, cat))
    .filter(Boolean)
    .slice(0, LIMITS.reqs);
  if (!reqs.length) return null;

  let from = cleanMonday(raw.from);
  let to = cleanMonday(raw.to);
  if (from && to && from > to) [from, to] = [to, from];

  return {
    id: raw.id,
    name: cleanText(raw.name, LIMITS.goalName) || cat.label,
    cat: cat.id,
    from,
    to,
    reqs,
  };
}

export function sanitiseGoals(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(sanitiseGoal)
    .filter((g) => {
      if (!g || seen.has(g.id)) return false;
      seen.add(g.id);
      return true;
    })
    .slice(0, LIMITS.storedGoals);
}

// --- how many are live at once ---------------------------------------------
// The limit that matters is how many cards can land under one strip, not how
// many goals an account holds. Somebody who has kept a year of finished goals
// has a long list on the goals page and one card on the front page, and only
// the second of those is a problem worth capping.

// Open-ended goals need a bound to sweep between. ISO dates sort as strings, so
// these sit outside any real date without needing a special case.
const BEFORE_ALL = '0000-00-00';
const AFTER_ALL = '9999-99-99';

/**
 * The largest number of these goals ever active in the same week.
 *
 * A sweep over the range boundaries rather than a pairwise overlap count:
 * a chain of goals can each overlap its neighbour without any single week
 * holding more than two of them.
 */
export function maxConcurrent(goals) {
  const events = [];
  for (const goal of goals) {
    events.push([goal.from || BEFORE_ALL, 1]);
    // A goal ending in week W is active through W, so it clears the week after.
    events.push([goal.to ? addWeeks(goal.to, 1) : AFTER_ALL, -1]);
  }
  // Ends before starts at the same boundary: a goal finishing the week before
  // another begins does not overlap it.
  events.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));

  let live = 0;
  let most = 0;
  for (const [, delta] of events) {
    live += delta;
    if (live > most) most = live;
  }
  return most;
}

/**
 * Why this goal cannot be saved alongside the others, or null if it can.
 * Editing an existing goal replaces it rather than adding to it.
 */
export function capacityProblem(goals, candidate) {
  const others = goals.filter((g) => g.id !== candidate.id);
  if (others.length + 1 > LIMITS.storedGoals) {
    return `${LIMITS.storedGoals} goals is the limit.`;
  }
  if (maxConcurrent([...others, candidate]) > LIMITS.activeGoals) {
    return `That would put more than ${LIMITS.activeGoals} goals in one week. ` +
           'Change its dates, or finish another.';
  }
  return null;
}

/**
 * Active, upcoming and finished, relative to the week we are in now.
 *
 * Deliberately measured against today rather than the week on screen: the goals
 * page has no week on screen, and "finished" should not change meaning because
 * somebody scrolled back to March.
 */
export function groupGoals(goals, today = new Date()) {
  const now = toISO(mondayOf(today));
  const active = [];
  const upcoming = [];
  const finished = [];

  for (const goal of goals) {
    if (goal.to && goal.to < now) finished.push(goal);
    else if (goal.from && goal.from > now) upcoming.push(goal);
    else active.push(goal);
  }

  upcoming.sort((a, b) => (a.from < b.from ? -1 : 1));
  finished.sort((a, b) => (a.to > b.to ? -1 : 1));   // most recent first
  return { active, upcoming, finished };
}

// --- matching --------------------------------------------------------------

const normLabel = (text) => (text || '').trim().toLowerCase();

/** Does this activity satisfy this requirement's filters? */
export function matches(activity, req, catId) {
  if (activity.cat !== catId) return false;
  if (req.sub && activity.sub !== req.sub) return false;
  if (req.label && normLabel(labelFor(activity)) !== normLabel(req.label)) return false;
  return true;
}

/**
 * What this activity adds to this requirement.
 *
 * An activity carrying no amount contributes 1 to a count and 0 to a distance
 * or duration — a run logged without a distance is still a run, but it is not
 * any kilometres. The same goes for the wrong kind of amount: 30min of running
 * adds nothing to a 20km goal.
 */
export function contribution(activity, req) {
  if (req.metric === 'count') return 1;
  if (metricOf(activity.unit) !== req.metric) return 0;
  return toCanonical(activity.amount, activity.unit, req.metric);
}

// --- evaluation ------------------------------------------------------------

export function isActive(goal, weekStart) {
  if (goal.from && weekStart < goal.from) return false;
  if (goal.to && weekStart > goal.to) return false;
  return true;
}

export function activeGoals(goals, weekStart) {
  return goals.filter((g) => isActive(g, weekStart));
}

function targetCanonical(req) {
  return req.metric === 'count'
    ? req.target
    : toCanonical(req.target, req.unit, req.metric);
}

/**
 * Evaluate a goal against a week.
 *
 * `series[i]` is progress from 0 to 1 at the end of day i, capped at 1 — an
 * overshot goal fills the chart and no more, with the real figure in the
 * header. Progress across several requirements is the sum of each one's
 * contribution clamped to its own target, so doing six upper body sessions
 * cannot stand in for a missing core one.
 *
 * An activity is counted against every requirement it matches. That is
 * deliberate: "three runs, at least one easy" is two requirements and the easy
 * run should satisfy both.
 */
export function evaluate(goal, state) {
  const cat = category(goal.cat);
  const targets = goal.reqs.map(targetCanonical);
  const total = targets.reduce((a, b) => a + b, 0);
  const actual = goal.reqs.map(() => 0);
  const series = [];

  for (let day = 0; day < 7; day++) {
    for (const activity of (state.days[day] || [])) {
      goal.reqs.forEach((req, i) => {
        if (matches(activity, req, goal.cat)) actual[i] += contribution(activity, req);
      });
    }
    const done = actual.reduce((sum, value, i) => sum + Math.min(value, targets[i]), 0);
    series.push(total > 0 ? Math.min(done / total, 1) : 0);
  }

  const reqStates = goal.reqs.map((req, i) => ({
    req,
    actual: actual[i],
    target: targets[i],
    met: actual[i] >= targets[i] - EPSILON,
  }));

  const met = reqStates.every((r) => r.met);
  const done = reqStates.reduce((sum, r) => sum + Math.min(r.actual, r.target), 0);
  const raw = reqStates.reduce((sum, r) => sum + r.actual, 0);

  // A dot grid only reads while there are few enough dots to count at a glance,
  // and only makes sense for whole things. Everything else is an area chart.
  const counting = goal.reqs.every((r) => r.metric === 'count');
  const useDots = counting && total <= GOAL.maxDots;

  return {
    goal,
    met,
    series,
    reqStates,
    useDots,
    marks: useDots ? total : 0,
    // Cumulative whole requirements satisfied at the end of each day, for the
    // dot grid. Only meaningful when every requirement is a count.
    dotSeries: counting ? series.map((p) => Math.round(p * total)) : [],
    colours: PALETTE[cat.palette],
    summary: summarise(goal, reqStates, done, raw, total),
  };
}

/**
 * The figure beside a goal's name.
 *
 * "12 / 20km" when every requirement shares one metric and unit, otherwise
 * "2 of 3" — how many parts of the goal are done. A goal mixing kilometres and
 * repetitions has no single total worth printing.
 *
 * The chart caps at the target but this does not: 30km against a 20km goal
 * reads "30 / 20km", because a full chart with no number would be a lie about
 * what was actually done. Counts are the exception — "3 of 2" reads as a
 * mistake rather than an overshoot, so they clamp.
 */
function summarise(goal, reqStates, done, raw, total) {
  const metrics = new Set(goal.reqs.map((r) => r.metric));
  const units = new Set(goal.reqs.map((r) => r.unit || ''));

  if (metrics.size === 1 && metrics.has('count')) {
    return `${Math.min(Math.round(done), total)} of ${total}`;
  }
  if (metrics.size === 1 && units.size === 1) {
    const unit = goal.reqs[0].unit;
    const metric = goal.reqs[0].metric;
    return `${trimNumber(fromCanonical(raw, unit, metric))} / ` +
           `${trimNumber(fromCanonical(total, unit, metric))}${unit}`;
  }
  const satisfied = reqStates.filter((r) => r.met).length;
  return `${satisfied} of ${reqStates.length}`;
}

// --- description -----------------------------------------------------------

/** "2 × run · easy", for the manage page. Not shown on the strip page. */
export function describe(goal) {
  const cat = category(goal.cat);
  return goal.reqs.map((req) => {
    const sub = req.sub ? subType(goal.cat, req.sub) : null;
    const what = sub && cat.subs.length > 1 ? sub.label.toLowerCase() : cat.label.toLowerCase();
    const amount = req.metric === 'count'
      ? `${req.target} ×`
      : `${trimNumber(req.target)}${req.unit}`;
    const label = req.label ? ` · ${req.label.toLowerCase()}` : '';
    return `${amount} ${what}${label}`;
  }).join(' + ');
}

export { goalCategories };
