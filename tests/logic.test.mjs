// Run with:  node tests/logic.test.mjs
//
// Covers the pure logic only — no canvas, no DOM. The rendering is verified by
// eye in harness.html, because "does this icon read as a running shoe" is not
// something an assertion can answer.

import { defaultWeekStart, formatRange, formatRangeShort, mondayOf, toISO,
         addWeeks, relativeName, todayIndex } from '../static/js/week.js';
import { metaFor, labelFor, resolve, needsLabel, columnCentres, MAX_PER_DAY,
         LIMITS, GEO, TYPE } from '../static/js/tokens.js';
import { measure, fitSize, truncateTo } from '../static/js/render.js';
import { sanitiseGoal, sanitiseGoals, evaluate, isActive, activeGoals,
         toCanonical, fromCanonical, contribution, matches, describe,
         goalCategories, newGoalId, maxConcurrent, capacityProblem,
         groupGoals } from '../static/js/goals.js';
// A localStorage stub, installed before state.js loads so the archive has
// somewhere to live. Node has no DOM; the archive is pure logic otherwise.
globalThis.localStorage = (() => {
  let store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => { store = new Map(); },
  };
})();
const { emptyState, emptyDays, sanitise, encodeState, decodeState,
        isEmpty, countActivities, saveWeek, loadWeek, lastVisitedWeek,
        hasStoredWeek, storedWeekStarts } = await import('../static/js/state.js');
// presets.js borrows state.js's day validation, so it loads after the stub too.
const { sanitisePreset, sanitisePresets, presetFromWeek, daysOf: presetDays,
        describePreset, newPresetId, candidateWeeks,
        CANDIDATE_WEEKS } = await import('../static/js/presets.js');

let fails = 0;
let count = 0;
const eq = (got, want, what) => {
  count++;
  const ok = got === want;
  if (!ok) {
    fails++;
    console.log(`FAIL  ${what}\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
  }
};
const section = (s) => console.log(`\n${s}`);

section('default week rule — week of Mon 20 Jul 2026');
for (const [day, date, want] of [
  ['Mon', new Date(2026, 6, 20), '2026-07-13'],
  ['Tue', new Date(2026, 6, 21), '2026-07-13'],
  ['Wed', new Date(2026, 6, 22), '2026-07-13'],
  ['Thu', new Date(2026, 6, 23), '2026-07-20'],
  ['Fri', new Date(2026, 6, 24), '2026-07-20'],
  ['Sat', new Date(2026, 6, 25), '2026-07-20'],
  ['Sun', new Date(2026, 6, 26), '2026-07-20'],
]) eq(defaultWeekStart(date), want, `${day} opens on ${want}`);

section('monday anchoring');
eq(toISO(mondayOf(new Date(2026, 6, 26))), '2026-07-20', 'Sunday anchors back');
eq(toISO(mondayOf(new Date(2026, 0, 1))), '2025-12-29', 'New Year crosses the year');

section('range formatting');
eq(formatRange('2026-07-20'), '20th July – 26th July 2026', 'within one month');
eq(formatRange('2026-06-29'), '29th June – 5th July 2026', 'crossing a month');
eq(formatRange('2026-12-28'), '28th December 2026 – 3rd January 2027', 'crossing a year');
eq(formatRange('2027-03-01'), '1st March – 7th March 2027', 'ordinal 1st');
eq(formatRange('2026-11-02'), '2nd November – 8th November 2026', 'ordinal 2nd');
eq(formatRange('2026-06-08'), '8th June – 14th June 2026', 'ordinal 14th not 14st');
eq(formatRange('2026-11-09'), '9th November – 15th November 2026', 'ordinal 15th');
eq(formatRangeShort('2026-07-20'), '20 – 26 Jul', 'short within month');
eq(formatRangeShort('2026-06-29'), '29 Jun – 5 Jul', 'short crossing month');

section('week navigation');
eq(addWeeks('2026-07-20', -1), '2026-07-13', 'back one week');
eq(addWeeks('2026-01-04', -1), '2025-12-28', 'back across a year');
eq(addWeeks('2026-07-20', 4), '2026-08-17', 'forward four weeks');
eq(relativeName('2026-07-20', new Date(2026, 6, 23)), 'This week', 'this week');
eq(relativeName('2026-07-13', new Date(2026, 6, 23)), 'Last week', 'last week');
eq(relativeName('2026-07-27', new Date(2026, 6, 23)), 'Next week', 'next week');
eq(relativeName('2026-06-01', new Date(2026, 6, 23)), null, 'distant week unnamed');
eq(todayIndex('2026-07-20', new Date(2026, 6, 23)), 3, 'Thursday is index 3');
eq(todayIndex('2026-07-20', new Date(2026, 7, 23)), -1, 'outside the week');

section('duration and distance formatting');
eq(metaFor({ amount: 5, unit: 'km' }), '5km', 'integer km');
eq(metaFor({ amount: 21.1, unit: 'km' }), '21.1km', 'one decimal');
eq(metaFor({ amount: 12.75, unit: 'km' }), '12.8km', 'rounds to 1dp');
eq(metaFor({ amount: 20, unit: 'min' }), '20min', 'minutes');
eq(metaFor({ amount: 1.5, unit: 'h' }), '1h30', 'fractional hours');
eq(metaFor({ amount: 2.25, unit: 'h' }), '2h15', 'quarter hour');
eq(metaFor({ amount: 2, unit: 'h' }), '2h', 'whole hours');
eq(metaFor({ amount: 3, unit: 'mi' }), '3mi', 'miles');
eq(metaFor({ amount: 0, unit: 'km' }), '', 'zero renders nothing');
eq(metaFor({ amount: -5, unit: 'km' }), '', 'negative renders nothing');
eq(metaFor({ amount: 'abc', unit: 'km' }), '', 'garbage renders nothing');
eq(metaFor({ amount: 5 }), '', 'no unit renders nothing');
eq(metaFor({}), '', 'no data renders nothing');

section('labels and taxonomy resolution');
eq(labelFor({ tag: 'easy' }), 'EASY', 'preset tag');
eq(labelFor({ custom: 'hill repeats' }), 'HILL REPEATS', 'custom label');
eq(labelFor({ tag: 'easy', custom: 'hill repeats' }), 'HILL REPEATS', 'custom beats preset');
eq(labelFor({ custom: '   ' }), '', 'whitespace is no label');
eq(labelFor({}), '', 'no label');
eq(labelFor({ cat: 'workout', sub: 'hiit' }), 'HIIT', 'HIIT captions itself');
eq(labelFor({ cat: 'workout', sub: 'hiit', tag: 'custom', custom: 'tabata' }), 'TABATA',
  'a custom label overrides the default caption');
eq(labelFor({ cat: 'workout', sub: 'strength' }), '', 'strength has no default caption');
eq(resolve({ cat: 'cardio', sub: 'run' }).icon, 'run', 'run uses the shoe');
eq(resolve({ cat: 'cardio', sub: 'run' }).acceptsMeta, true, 'cardio accepts a duration');
eq(resolve({ cat: 'workout', sub: 'strength' }).acceptsMeta, true, 'workout accepts one too');
eq(resolve({ cat: 'mobility', sub: 'yoga' }).acceptsMeta, true, 'mobility accepts one too');
eq(resolve({ cat: 'sport', sub: 'sport' }).acceptsMeta, true, 'sport accepts a duration');
eq(resolve({ cat: 'cheat', sub: 'beer' }).acceptsMeta, false, 'cheat day does not');
eq(resolve({ cat: 'rest', sub: 'rest' }).acceptsMeta, false, 'rest does not');
eq(resolve({ cat: 'workout', sub: 'strength' }).icon, 'strength', 'strength uses the dumbbell glyph');
eq(resolve({ cat: 'workout', sub: 'custom' }).icon, 'custom', 'workout custom uses the spark');
eq(resolve({ cat: 'workout', sub: 'hiit' }).icon, 'hiit', 'HIIT keeps the stopwatch');
eq(resolve({ cat: 'cardio', sub: 'custom' }).icon, 'custom', 'cardio custom uses the spark');
eq(resolve({ cat: 'mobility', sub: 'custom' }).icon, 'custom', 'mobility custom uses the spark');
eq(resolve({ cat: 'cardio', sub: 'nonsense' }).icon, 'run', 'unknown sub-type falls back');
eq(resolve({ cat: 'nonsense', sub: 'x' }), null, 'unknown category is null');
eq(resolve({ cat: 'rest', sub: 'rest' }).colours.glyph, '#767C83', 'tinted tier uses ink, not white');
eq(resolve({ cat: 'cardio', sub: 'run' }).colours.glyph, '#FFFFFF', 'solid tier uses white');

section('required labels');
eq(needsLabel({ cat: 'cardio', sub: 'custom' }), true, 'a custom cardio must be named');
eq(needsLabel({ cat: 'mobility', sub: 'custom' }), true, 'a custom mobility must be named');
eq(needsLabel({ cat: 'cardio', sub: 'run', tag: 'custom' }), true, 'a custom run type must be named');
eq(needsLabel({ cat: 'workout', sub: 'strength', tag: 'custom' }), true, 'a custom workout must be named');
eq(needsLabel({ cat: 'cardio', sub: 'run', tag: 'easy' }), false, 'a preset tag needs nothing');
eq(needsLabel({ cat: 'workout', sub: 'strength' }), false, 'an untagged workout needs nothing');
eq(needsLabel({ cat: 'rest', sub: 'rest' }), false, 'a rest day needs nothing');
eq(needsLabel({ cat: 'sport', sub: 'sport' }), false, 'sport takes an optional name');
eq(needsLabel({ cat: 'workout', sub: 'custom' }), true, 'a custom workout must be named');
eq(needsLabel({ cat: 'workout', sub: 'hiit' }), false, 'HIIT needs nothing');

section('input limits');
eq(LIMITS.label, 12, 'labels cap at 12 characters');
eq(LIMITS.title, 22, 'titles cap at 22 characters');
// 'lower body' is the longest preset label and must fit under the cap.
eq('lower body'.length <= LIMITS.label, true, 'longest preset label fits the cap');

section('text measurement — the label collision regression');
// A fake canvas where every glyph is exactly 10 units wide. `native` mirrors a
// browser with ctx.letterSpacing, where measureText already includes tracking
// and appends one extra gap after the final glyph. Measuring in one mode and
// drawing in the other is what pushed 'PHYSIOTHERAPY' into its neighbours.
const GLYPH = 10;          // glyph advance at the reference size
const REF = 18;            // ...which is this many px
function fakeCanvas(native) {
  globalThis.CanvasRenderingContext2D = native
    ? class { set letterSpacing(v) {} get letterSpacing() { return '0px'; } }
    : class {};
  const ctx = {
    font: '', _ls: 0,
    save() {}, restore() {},
    measureText(t) {
      // Advance scales with font size, as a real canvas does. Tracking is an
      // absolute px value and deliberately does not scale.
      const size = parseFloat((/(\d+(?:\.\d+)?)px/.exec(this.font) || [])[1]) || REF;
      const n = [...t].length;
      return { width: n * GLYPH * (size / REF) + (native ? this._ls * n : 0) };
    },
  };
  if (native) {
    Object.defineProperty(ctx, 'letterSpacing', {
      get() { return `${this._ls}px`; },
      set(v) { this._ls = parseFloat(v) || 0; },
    });
  }
  return ctx;
}
// What drawText will actually put on the canvas: n glyphs and n-1 gaps.
const drawnWidth = (text, tracking) =>
  [...text].length * GLYPH + tracking * ([...text].length - 1);   // at REF size

const spec = { font: 'body', size: 18, weight: 500, tracking: 1.6 };
for (const native of [true, false]) {
  const ctx = fakeCanvas(native);
  const mode = native ? 'native tracking' : 'manual tracking';
  for (const text of ['EASY', 'LOWER BODY', 'PHYSIOTHERAP', 'WWWWWWWWWWWW']) {
    eq(Math.round(measure(ctx, text, spec.tracking) * 100) / 100,
       Math.round(drawnWidth(text, spec.tracking) * 100) / 100,
       `${mode}: "${text}" measures as it draws`);
  }
  eq(measure(ctx, 'ABC', 0), 30, `${mode}: no tracking measures plainly`);
}
// Both paths must agree with each other, or the bug returns on one platform.
eq(measure(fakeCanvas(true), 'PHYSIOTHERAP', 1.6),
   measure(fakeCanvas(false), 'PHYSIOTHERAP', 1.6),
   'both code paths agree');

section('row-wide sizing keeps labels inside their column');
const pitch = (GEO.width - GEO.padX * 2) / 7;
const labelMax = pitch - 18;
{
  const ctx = fakeCanvas(true);
  // The widest label the picker will accept, at the real column width.
  const worst = 'W'.repeat(LIMITS.label);
  const size = fitSize(ctx, ['EASY', worst, 'CORE'], TYPE.label, labelMax, 13);
  eq(size <= TYPE.label.size, true, 'a long label pulls the row size down');
  eq(size >= 13, true, 'but never below the floor');
  eq(truncateTo(ctx, worst, TYPE.label, size, labelMax), worst,
    'the longest allowed label is not truncated');
  // Every label in the row shares one size, so none can overflow on its own.
  const short = fitSize(ctx, ['EASY'], TYPE.label, labelMax, 13);
  eq(short, TYPE.label.size, 'a row of short labels stays at full size');
}

section('state round trip');
{
  const original = {
    title: 'Gym Block',
    weekStart: '2026-07-20',
    days: [
      [{ cat: 'cardio', sub: 'run', tag: 'easy', amount: 5, unit: 'km' }],
      [],
      [{ cat: 'workout', sub: 'strength', tag: 'chest', amount: 45, unit: 'min' },
       { cat: 'mobility', sub: 'yoga' }],
      [{ cat: 'workout', sub: 'custom', custom: 'kettlebells' }],
      [], [],
      [{ cat: 'cheat', sub: 'beer' }],
    ],
  };
  const encoded = encodeState(sanitise(original));
  const back = decodeState(encoded);
  eq(back.title, 'Gym Block', 'title survives');
  eq(back.weekStart, '2026-07-20', 'week survives');
  eq(back.days[0][0].amount, 5, 'amount survives');
  eq(back.days[0][0].unit, 'km', 'unit survives');
  eq(back.days[2].length, 2, 'a stacked day survives');
  eq(back.days[3][0].custom, 'kettlebells', 'custom label survives');
  eq(back.days[1].length, 0, 'an empty day stays empty');
  eq(countActivities(back), 5, 'nothing was lost');
  eq(encoded.length < 300, true, `encodes to ${encoded.length} characters`);
  eq(/^[A-Za-z0-9_-]+$/.test(encoded), true, 'url-safe with no padding');
}

section('state is defensive about untrusted input');
eq(decodeState('not-valid-base64!!'), null, 'garbage decodes to null');
eq(decodeState(''), null, 'empty decodes to null');
eq(decodeState(btoa('{"v":99}')), null, 'a future format is refused');
{
  const messy = sanitise({
    title: 'x'.repeat(200),
    weekStart: '2026-07-22',            // a Wednesday
    days: [
      [{ cat: 'nope', sub: 'nope' }],
      [{ cat: 'cardio', sub: 'run', amount: -5, unit: 'km' }],
      [{ cat: 'cardio', sub: 'run', amount: 99999999, unit: 'km' }],
      [{ cat: 'cardio', sub: 'run', amount: 5, unit: 'furlongs' }],
      [{ cat: 'workout', sub: 'strength', tag: 'not-a-tag' }],
      [{ cat: 'rest', sub: 'rest' }, { cat: 'rest', sub: 'rest' }, { cat: 'rest', sub: 'rest' }],
      'not an array',
    ],
  });
  eq(messy.title.length, LIMITS.title, 'an overlong title is cut to the limit');
  eq(messy.weekStart, '2026-07-20', 'a mid-week date snaps back to its Monday');
  eq(messy.days[0].length, 0, 'an unknown category is dropped');
  eq(messy.days[1][0].amount, undefined, 'a negative amount is dropped');
  eq(messy.days[2][0].amount, 9999, 'an absurd amount is clamped');
  eq(messy.days[3][0].amount, undefined, 'an unknown unit is dropped');
  eq(messy.days[4][0].tag, undefined, 'an unknown tag is dropped');
  eq(messy.days[5].length, MAX_PER_DAY, 'a third activity is dropped');
  eq(messy.days[6].length, 0, 'a non-array day becomes empty');
  eq(messy.days.length, 7, 'always seven days');
}
eq(isEmpty(emptyState()), true, 'a fresh week is empty');
eq(sanitise(null).days.length, 7, 'null sanitises to a fresh week');
eq(sanitise('nonsense').title, 'My Week', 'a string sanitises to a fresh week');

section('weeks are stored separately');
{
  localStorage.clear();
  const runWeek = {
    title: 'My Week', weekStart: '2026-07-20',
    days: [[{ cat: 'cardio', sub: 'run', tag: 'easy', amount: 5, unit: 'km' }],
           [], [], [], [], [], []],
  };
  const gymWeek = {
    title: 'Gym Block', weekStart: '2026-07-13',
    days: [[{ cat: 'workout', sub: 'strength', tag: 'chest' }],
           [{ cat: 'workout', sub: 'hiit' }], [], [], [], [], []],
  };
  saveWeek(runWeek);
  saveWeek(gymWeek);

  const backRun = loadWeek('2026-07-20');
  const backGym = loadWeek('2026-07-13');
  eq(backRun.days[0][0].sub, 'run', 'the later week keeps its own activity');
  eq(backGym.days[0][0].tag, 'chest', 'the earlier week keeps its own');
  eq(backGym.days[1][0].sub, 'hiit', 'and all of it');
  eq(backRun.title, 'My Week', 'titles are per week');
  eq(backGym.title, 'Gym Block', 'including a renamed one');
  eq(countActivities(backRun), 1, 'weeks do not bleed into each other');
  eq(loadWeek('2026-06-01'), null, 'an untouched week is null, not empty data');
  eq(lastVisitedWeek(), '2026-07-13', 'the last saved week is remembered');
  eq(hasStoredWeek('2026-07-20'), true, 'a stored week is marked');
  eq(hasStoredWeek('2026-06-01'), false, 'an unstored week is not');
  eq(storedWeekStarts().length, 2, 'two weeks on file');

  // Editing one week must not disturb another.
  saveWeek({ ...runWeek, days: emptyDays(), title: 'My Week' });
  eq(loadWeek('2026-07-20'), null, 'clearing a week removes it');
  eq(loadWeek('2026-07-13').days[0][0].tag, 'chest', 'the other week is untouched');
}
{
  localStorage.clear();
  // The archive must not grow without bound.
  for (let i = 0; i < 60; i++) {
    saveWeek({
      title: 'My Week', weekStart: addWeeks('2026-07-20', -i),
      days: [[{ cat: 'rest', sub: 'rest' }], [], [], [], [], [], []],
    });
  }
  const kept = storedWeekStarts();
  eq(kept.length <= 40, true, `archive pruned to ${kept.length} weeks`);
  eq(kept.includes('2026-07-20'), true, 'the most recent week survives pruning');
  eq(kept.includes(addWeeks('2026-07-20', -59)), false, 'the oldest is dropped');
}
{
  // A save from the previous single-week format is folded in, once.
  localStorage.clear();
  localStorage.setItem('weekform.week.v1', JSON.stringify({
    title: 'Old Week', weekStart: '2026-06-01',
    days: [[{ cat: 'cardio', sub: 'bike', amount: 30, unit: 'min' }],
           [], [], [], [], [], []],
  }));
  const migrated = loadWeek('2026-06-01');
  eq(migrated !== null, true, 'the old save is rescued');
  eq(migrated.days[0][0].sub, 'bike', 'with its contents intact');
  eq(localStorage.getItem('weekform.week.v1'), null, 'and the old key retired');
}

section('geometry invariants');
const c = columnCentres();
eq(c.length, 7, 'seven columns');
eq(Math.round(c[0]), 125, 'first centre');
eq(Math.round(c[6]), 955, 'last centre');
eq(c[6] + GEO.circleR < GEO.width - 1, true, 'last circle stays inside the canvas');
eq(c[0] - GEO.circleR > 1, true, 'first circle stays inside the canvas');
eq(MAX_PER_DAY, 2, 'two activities per day');
// A stacked secondary circle must not reach into the next day's column.
const gap = (c[1] - c[0]) - GEO.circleR * 2;
eq(gap > GEO.stackDX, true,
  `inter-circle gap ${gap.toFixed(1)}px clears the ${GEO.stackDX}px stack offset`);
// The duration must fit inside the circle's chord at the height it is drawn.
const chord = 2 * Math.sqrt(GEO.circleR ** 2 - GEO.metaY ** 2);
eq(chord > 60, true, `duration chord is ${chord.toFixed(1)}px wide`);
eq(GEO.labelY > GEO.circleY + GEO.circleR, true, 'label sits below the circle');
eq(GEO.footerY < GEO.height, true, 'footer sits inside the canvas');


// --- goals -----------------------------------------------------------------

const blankDays = () => [[], [], [], [], [], [], []];
const wk = (fill) => {
  const days = blankDays();
  if (fill) fill(days);
  return { title: 'My Week', weekStart: '2026-07-20', days };
};
const r3 = (n) => Math.round(n * 1000) / 1000;
const goal = (over) => sanitiseGoal({ id: 'abcd1234', name: 'G', cat: 'cardio',
  from: null, to: null, reqs: [], ...over });

section('goals — which categories may be one');
{
  const ids = goalCategories().map((c) => c.id);
  eq(ids.includes('cardio'), true, 'cardio can be a goal');
  eq(ids.includes('rest'), true, 'rest days can be a goal');
  eq(ids.includes('illness'), false, 'illness cannot');
  eq(ids.includes('vacation'), false, 'vacation cannot');
  eq(ids.includes('cheat'), false, 'cheat days cannot');
  eq(/^[a-z0-9]{8}$/.test(newGoalId()), true, 'generated ids match the stored shape');
}

section('goals — sanitising untrusted input');
{
  eq(sanitiseGoal(null), null, 'null is not a goal');
  eq(sanitiseGoal({ id: 'x', cat: 'cardio', reqs: [{ metric: 'count', target: 1 }] }),
    null, 'a short id is rejected');
  eq(goal({ cat: 'illness', reqs: [{ metric: 'count', target: 1 }] }), null,
    'a goal cannot be built on illness');
  eq(goal({ cat: 'nonsense', reqs: [{ metric: 'count', target: 1 }] }), null,
    'an unknown category is rejected');
  eq(goal({ reqs: [] }), null, 'a goal with no parts is rejected');
  eq(goal({ reqs: [{ metric: 'count', target: 0 }] }), null, 'a zero target is rejected');
  eq(goal({ reqs: [{ metric: 'distance', target: 5 }] }), null,
    'a distance with no unit is rejected');
  eq(goal({ reqs: [{ sub: 'gone', metric: 'count', target: 1 }] }), null,
    'a sub-type that no longer exists drops the part');

  const rest = sanitiseGoal({ id: 'restgoal', name: 'Two rest days', cat: 'rest',
    reqs: [{ metric: 'distance', target: 3, unit: 'km' }] });
  eq(rest.reqs[0].metric, 'count', 'a category with no amounts can only be counted');
  eq(rest.reqs[0].target, 3, 'its target survives as a count');

  const many = goal({ reqs: Array.from({ length: 9 },
    () => ({ metric: 'count', target: 1 })) });
  eq(many.reqs.length, LIMITS.reqs, `parts are capped at ${LIMITS.reqs}`);

  const swapped = goal({ from: '2026-08-17', to: '2026-07-20',
    reqs: [{ metric: 'count', target: 1 }] });
  eq(swapped.from, '2026-07-20', 'a backwards range is swapped, not rejected');
  eq(swapped.to, '2026-08-17', 'and its end is kept');

  const unnamed = goal({ name: '   ', reqs: [{ metric: 'count', target: 1 }] });
  eq(unnamed.name, 'Cardio', 'an unnamed goal falls back to its category');

  const dupes = sanitiseGoals([
    { id: 'aaaa1111', cat: 'cardio', reqs: [{ metric: 'count', target: 1 }] },
    { id: 'aaaa1111', cat: 'cardio', reqs: [{ metric: 'count', target: 2 }] },
    { id: 'bbbb2222', cat: 'cardio', reqs: [{ metric: 'count', target: 1 }] },
  ]);
  eq(dupes.length, 2, 'a repeated id is dropped');
}

section('goals — units are canonical');
{
  eq(toCanonical(5, 'km', 'distance'), 5000, '5km is 5000 metres');
  eq(r3(toCanonical(1, 'mi', 'distance')), 1609.344, 'a mile is 1609.344 metres');
  eq(toCanonical(1.5, 'h', 'duration'), 90, '1.5h is 90 minutes');
  eq(toCanonical(0, 'km', 'distance'), 0, 'nothing is nothing');
  eq(toCanonical('x', 'km', 'distance'), 0, 'unparseable is nothing');
  eq(fromCanonical(5000, 'km', 'distance'), 5, 'and back again');
  eq(r3(fromCanonical(3218.688, 'mi', 'distance')), 2, 'metres back to miles');
}

section('goals — what an activity contributes');
{
  const run10 = { cat: 'cardio', sub: 'run', amount: 10, unit: 'km' };
  const run30 = { cat: 'cardio', sub: 'run', amount: 30, unit: 'min' };
  const bare = { cat: 'cardio', sub: 'run' };

  eq(contribution(run10, { metric: 'count', target: 1 }), 1, 'any run is one run');
  eq(contribution(bare, { metric: 'count', target: 1 }), 1,
    'a run with no amount is still one run');
  eq(contribution(bare, { metric: 'distance', target: 1, unit: 'km' }), 0,
    'but it is not any kilometres');
  eq(contribution(run30, { metric: 'distance', target: 1, unit: 'km' }), 0,
    'minutes add nothing to a distance goal');
  eq(contribution(run30, { metric: 'duration', target: 1, unit: 'min' }), 30,
    'and everything to a duration one');

  eq(matches(run10, { metric: 'count', target: 1 }, 'cardio'), true,
    'no filters matches anything in the category');
  eq(matches(run10, { sub: 'swim', metric: 'count', target: 1 }, 'cardio'), false,
    'a sub-type filter excludes');
  eq(matches(run10, { metric: 'count', target: 1 }, 'workout'), false,
    'another category never matches');
  eq(matches({ cat: 'cardio', sub: 'run', tag: 'easy' },
    { label: 'Easy', metric: 'count', target: 1 }, 'cardio'), true,
    'labels match regardless of case');
}

section('goals — counting a week');
{
  const g = goal({ cat: 'workout', name: '2x workout',
    reqs: [{ metric: 'count', target: 2 }] });
  const week = wk((d) => {
    d[1] = [{ cat: 'workout', sub: 'strength' }];
    d[3] = [{ cat: 'workout', sub: 'strength' }];
  });
  const out = evaluate(g, week);
  eq(out.series.map(r3).join(','), '0,0.5,0.5,1,1,1,1', 'progress steps on the day it happens');
  eq(out.dotSeries.join(','), '0,1,1,2,2,2,2', 'and the dots fill with it');
  eq(out.met, true, 'two of two is met');
  eq(out.useDots, true, 'a small count is drawn as dots');
  eq(out.marks, 2, 'one dot per unit of the target');
  eq(out.summary, '2 of 2', 'summary counts whole things');

  const short = evaluate(g, wk((d) => { d[1] = [{ cat: 'workout', sub: 'strength' }]; }));
  eq(short.met, false, 'one of two is not met');
  eq(short.summary, '1 of 2', 'and says so');

  const other = evaluate(g, wk((d) => { d[1] = [{ cat: 'cardio', sub: 'run' }]; }));
  eq(other.series[6], 0, 'another category does not count towards it');
}

section('goals — distance across a week');
{
  const g = goal({ name: 'Run 20km',
    reqs: [{ sub: 'run', metric: 'distance', target: 20, unit: 'km' }] });

  const half = evaluate(g, wk((d) => {
    d[2] = [{ cat: 'cardio', sub: 'run', amount: 10, unit: 'km' }];
  }));
  eq(half.series.map(r3).join(','), '0,0,0.5,0.5,0.5,0.5,0.5', 'the line rises on Wednesday');
  eq(half.met, false, 'and half is not met');
  eq(half.useDots, false, 'a distance is never dots');
  eq(half.summary, '10 / 20km', 'summary is in the goal\u2019s own unit');

  const full = evaluate(g, wk((d) => {
    d[2] = [{ cat: 'cardio', sub: 'run', amount: 10, unit: 'km' }];
    d[4] = [{ cat: 'cardio', sub: 'run', amount: 10, unit: 'km' }];
  }));
  eq(full.met, true, 'the second half meets it');
  eq(full.series[6], 1, 'and fills the chart');

  const miles = evaluate(g, wk((d) => {
    d[0] = [{ cat: 'cardio', sub: 'run', amount: 12.5, unit: 'mi' }];
  }));
  eq(miles.met, true, '12.5mi meets a 20km goal');

  const over = evaluate(g, wk((d) => {
    d[0] = [{ cat: 'cardio', sub: 'run', amount: 30, unit: 'km' }];
  }));
  eq(over.series[6], 1, 'an overshoot is capped at full');
  eq(over.summary, '30 / 20km', 'but the real figure is still shown');

  const bike = evaluate(g, wk((d) => {
    d[0] = [{ cat: 'cardio', sub: 'bike', amount: 30, unit: 'km' }];
  }));
  eq(bike.series[6], 0, 'a bike ride does not count towards a running goal');
}

section('goals — several parts at once');
{
  const g = goal({ cat: 'workout', name: 'Full body', reqs: [
    { sub: 'strength', label: 'upper body', metric: 'count', target: 1 },
    { sub: 'strength', label: 'core', metric: 'count', target: 1 },
    { sub: 'strength', label: 'lower body', metric: 'count', target: 1 },
  ] });

  const two = evaluate(g, wk((d) => {
    d[0] = [{ cat: 'workout', sub: 'strength', tag: 'upper body' }];
    d[2] = [{ cat: 'workout', sub: 'strength', tag: 'core' }];
  }));
  eq(two.summary, '2 of 3', 'two parts of three');
  eq(two.met, false, 'and not met');
  eq(two.marks, 3, 'one dot per part');
  eq(r3(two.series[6]), 0.667, 'progress is two thirds');

  const lopsided = evaluate(g, wk((d) => {
    d[0] = [{ cat: 'workout', sub: 'strength', tag: 'upper body' }];
    d[1] = [{ cat: 'workout', sub: 'strength', tag: 'upper body' }];
  }));
  eq(lopsided.summary, '1 of 3',
    'doing one part twice cannot stand in for a missing one');

  const done = evaluate(g, wk((d) => {
    d[0] = [{ cat: 'workout', sub: 'strength', tag: 'upper body' }];
    d[2] = [{ cat: 'workout', sub: 'strength', tag: 'core' }];
    d[4] = [{ cat: 'workout', sub: 'strength', tag: 'lower body' }];
  }));
  eq(done.met, true, 'all three parts is met');

  // Overlapping parts are counted against both, which is what makes
  // "three runs, at least one easy" work.
  const overlap = goal({ reqs: [
    { sub: 'run', metric: 'count', target: 2 },
    { sub: 'run', label: 'easy', metric: 'count', target: 1 },
  ] });
  const both = evaluate(overlap, wk((d) => {
    d[0] = [{ cat: 'cardio', sub: 'run', tag: 'easy' }];
    d[3] = [{ cat: 'cardio', sub: 'run', tag: 'tempo' }];
  }));
  eq(both.met, true, 'an easy run counts towards both parts');

  // Mixed metrics have no single total worth printing.
  const mixed = goal({ cat: 'workout', reqs: [
    { sub: 'strength', metric: 'count', target: 1 },
    { sub: 'hiit', metric: 'duration', target: 30, unit: 'min' },
  ] });
  const half = evaluate(mixed, wk((d) => { d[0] = [{ cat: 'workout', sub: 'strength' }]; }));
  eq(half.summary, '1 of 2', 'a mixed goal counts its parts instead');
  eq(half.useDots, false, 'and is never dots');
}

section('goals — dots only while they can be counted at a glance');
{
  const four = goal({ reqs: [{ metric: 'count', target: 4 }] });
  const five = goal({ reqs: [{ metric: 'count', target: 5 }] });
  eq(evaluate(four, wk()).useDots, true, 'four marks is a dot grid');
  eq(evaluate(five, wk()).useDots, false, 'five is an area chart');
}

section('goals — active ranges');
{
  const always = goal({ reqs: [{ metric: 'count', target: 1 }] });
  const bounded = goal({ from: '2026-07-20', to: '2026-08-17',
    reqs: [{ metric: 'count', target: 1 }] });

  eq(isActive(always, '2020-01-06'), true, 'an unbounded goal is always active');
  eq(isActive(bounded, '2026-07-13'), false, 'the week before is outside');
  eq(isActive(bounded, '2026-07-20'), true, 'the first week is inside');
  eq(isActive(bounded, '2026-08-17'), true, 'and the last week is inclusive');
  eq(isActive(bounded, '2026-08-24'), false, 'the week after is outside');
  eq(activeGoals([always, bounded], '2026-09-07').length, 1, 'only the active ones draw');
}

section('goals — description for the manage page');
{
  eq(describe(goal({ reqs: [{ sub: 'run', metric: 'count', target: 2 }] })),
    '2 \u00d7 run', 'a simple count');
  eq(describe(goal({ reqs: [{ sub: 'run', metric: 'distance', target: 20, unit: 'km' }] })),
    '20km run', 'a distance');
  eq(describe(goal({ cat: 'workout', reqs: [
    { sub: 'strength', label: 'core', metric: 'count', target: 1 },
    { sub: 'strength', label: 'upper body', metric: 'count', target: 1 },
  ] })), '1 \u00d7 strength \u00b7 core + 1 \u00d7 strength \u00b7 upper body',
    'parts are joined');
  eq(describe(sanitiseGoal({ id: 'restgoal', cat: 'rest',
    reqs: [{ metric: 'count', target: 2 }] })), '2 \u00d7 rest day',
    'a single sub-type uses its category name');
}


section('goals — how many are live at once');
{
  const g = (id, from, to) => sanitiseGoal({ id, cat: 'cardio', from, to,
    reqs: [{ metric: 'count', target: 1 }] });

  eq(maxConcurrent([]), 0, 'nothing is nothing');
  eq(maxConcurrent([g('aaaa0001')]), 1, 'one unbounded goal');
  eq(maxConcurrent([g('aaaa0001'), g('aaaa0002')]), 2, 'two unbounded goals overlap');

  // Consecutive, not overlapping: one ends the week before the next begins.
  eq(maxConcurrent([
    g('aaaa0003', null, '2026-07-20'),
    g('aaaa0004', '2026-07-27', null),
  ]), 1, 'a goal ending the week before another starts does not overlap it');

  // Sharing a single week is an overlap.
  eq(maxConcurrent([
    g('aaaa0005', null, '2026-07-20'),
    g('aaaa0006', '2026-07-20', null),
  ]), 2, 'sharing one week is an overlap');

  // A chain where each overlaps its neighbour by exactly one week, but no
  // single week holds all three.
  eq(maxConcurrent([
    g('aaaa0007', '2026-07-06', '2026-07-13'),
    g('aaaa0008', '2026-07-13', '2026-07-20'),
    g('aaaa0009', '2026-07-20', '2026-07-27'),
  ]), 2, 'a chain of three never puts three in one week');

  // Three that really do share a week are counted as three.
  eq(maxConcurrent([
    g('aaaa0010', '2026-07-06', '2026-07-20'),
    g('aaaa0011', '2026-07-13', '2026-07-27'),
    g('aaaa0012', '2026-07-20', '2026-08-03'),
  ]), 3, 'three ranges covering the same week count as three');

  // Ten goals, one week each, back to back.
  const chain = Array.from({ length: 10 }, (_, i) =>
    g(`bbbb00${String(i).padStart(2, '0')}`, addWeeks('2026-01-05', i),
      addWeeks('2026-01-05', i)));
  eq(maxConcurrent(chain), 1, 'ten consecutive single-week goals never collide');
}

section('goals — the active limit, not a storage limit');
{
  const g = (id, from, to) => sanitiseGoal({ id, cat: 'cardio', from, to,
    reqs: [{ metric: 'count', target: 1 }] });

  const six = Array.from({ length: 6 }, (_, i) => g(`cccc000${i}`));
  eq(capacityProblem(six, g('dddd0001', '2026-07-20', '2026-07-20')) !== null, true,
    'a seventh goal in a week that already holds six is refused');
  eq(capacityProblem([], g('dddd0002')), null, 'the first goal is fine');

  const past = Array.from({ length: 6 }, (_, i) =>
    g(`eeee000${i}`, '2026-01-05', '2026-02-02'));
  eq(capacityProblem(past, g('ffff0001', '2026-07-20', '2026-07-20')), null,
    'six finished goals do not block a new one');

  // Editing an existing goal must not count it against itself.
  const five = Array.from({ length: 5 }, (_, i) => g(`aaaa100${i}`));
  const sixth = g('aaaa1005');
  eq(capacityProblem([...five, sixth], sixth), null,
    'editing the sixth goal is not blocked by the sixth goal');

  const many = Array.from({ length: LIMITS.storedGoals }, (_, i) =>
    g(`z${String(i).padStart(7, '0')}`, '2026-01-05', '2026-01-05'));
  eq(capacityProblem(many, g('zzzz9999', '2026-06-01', '2026-06-01')) !== null, true,
    `holding ${LIMITS.storedGoals} goals refuses another`);
  eq(sanitiseGoals(many.concat(g('zzzz8888'))).length, LIMITS.storedGoals,
    'and the sanitiser caps the list at the same number');
}

section('goals — active, upcoming and finished');
{
  const g = (id, from, to) => sanitiseGoal({ id, cat: 'cardio', from, to,
    reqs: [{ metric: 'count', target: 1 }] });
  const today = new Date(2026, 6, 22);          // Wednesday, week of Mon 20 Jul

  const groups = groupGoals([
    g('gggg0001'),                                     // always
    g('gggg0002', '2026-07-20', '2026-08-17'),         // covers this week
    g('gggg0003', '2026-08-24', null),                 // starts later
    g('gggg0004', null, '2026-07-13'),                 // ended last week
    g('gggg0005', null, '2026-06-01'),                 // ended long ago
  ], today);

  eq(groups.active.length, 2, 'two goals are live this week');
  eq(groups.upcoming.length, 1, 'one has not started');
  eq(groups.finished.length, 2, 'two are done');
  eq(groups.finished[0].id, 'gggg0004', 'finished are most recent first');
  eq(groupGoals([g('hhhh0001', '2026-07-20', '2026-07-20')], today).active.length, 1,
    'a goal covering exactly this week is active');
  eq(groupGoals([g('hhhh0002', '2026-07-13', '2026-07-13')], today).finished.length, 1,
    'a goal covering exactly last week is finished');
}

section('presets — a preset is a week that was kept');
{
  const week = { title: 'Big week', weekStart: '2026-07-20', days: [
    [{ cat: 'cardio', sub: 'run', amount: 10, unit: 'km' }],
    [], [{ cat: 'workout', sub: 'strength', tag: 'core' }], [], [], [], [],
  ] };

  eq(/^[a-z0-9]{8}$/.test(newPresetId()), true, 'generated ids match the stored shape');
  eq(sanitisePreset(null), null, 'null is not a preset');
  eq(sanitisePreset({ id: 'x', days: week.days }), null, 'a short id is rejected');
  eq(sanitisePreset({ id: 'pppp0001', days: emptyDays() }), null,
    'an empty preset is rejected');
  eq(sanitisePreset({ id: 'pppp0002', days: 'nonsense' }), null,
    'so is one with no days at all');

  const p = presetFromWeek(week, 'Base week');
  eq(p.name, 'Base week', 'it keeps its name');
  eq(p.days[0].length, 1, 'and its activities');
  eq(p.days[0][0].amount, 10, 'including amounts');
  eq('title' in p, false, 'but never a title');
  eq(describePreset(p), '2 activities across 2 days', 'and describes itself');

  // Junk in a preset is filtered by the same gate a pasted link goes through.
  const dirty = sanitisePreset({ id: 'pppp0003', name: 'x'.repeat(80), days: [
    [{ cat: 'cardio', sub: 'run' }, { cat: 'nope', sub: 'nope' }],
    [], [], [], [], [], [],
  ] });
  eq(dirty.days[0].length, 1, 'an unknown category is dropped from a preset');
  eq(dirty.name.length, LIMITS.presetName, 'and a long name is trimmed');

  eq(sanitisePresets([p, p, { ...p, id: 'pppp0004' }]).length, 2, 'a repeated id is dropped');
  eq(sanitisePresets(Array.from({ length: 9 }, (_, i) =>
    ({ ...p, id: `qqqq000${i}` }))).length, LIMITS.presets,
    `presets are capped at ${LIMITS.presets}`);

  // Applying must not hand out a reference to the stored preset.
  const applied = presetDays(p);
  applied[0][0].amount = 99;
  eq(p.days[0][0].amount, 10, 'applying a preset copies it rather than sharing it');
  eq(applied[2][0].tag, 'core', 'and carries labels across');
}


section('presets — which weeks are worth offering');
{
  const run = { cat: 'cardio', sub: 'run' };
  const lift = { cat: 'workout', sub: 'strength' };
  const week = (...activities) => {
    const days = [[], [], [], [], [], [], []];
    activities.forEach((a, i) => { days[i] = [a]; });
    return { title: '', days };
  };

  eq(candidateWeeks({}).length, 0, 'no weeks means nothing to offer');
  eq(candidateWeeks(null).length, 0, 'and neither does nothing at all');

  const offered = candidateWeeks({
    '2026-07-06': week(run),
    '2026-07-13': { title: 'Empty', days: [[], [], [], [], [], [], []] },
    '2026-07-20': week(run, lift),
  });
  eq(offered.length, 2, 'a week with nothing in it is not offered');
  eq(offered[0].weekStart, '2026-07-20', 'the most recent comes first');
  eq(offered[1].weekStart, '2026-07-06', 'and the oldest last');
  eq(offered[0].count, 2, 'activities are counted');

  eq(candidateWeeks({ '2026-07-20': { title: 'Big week', days: week(run).days } })[0].title,
    'Big week', 'a title is carried through for the name suggestion');
  eq(candidateWeeks({ '2026-07-20': { title: 42, days: week(run).days } })[0].title,
    '', 'a title that is not text becomes none');

  // The same gate a pasted link goes through, so a stored week that has since
  // gone stale cannot put an unknown activity into a preset.
  const dirty = candidateWeeks({ '2026-07-20': { days: [
    [{ cat: 'cardio', sub: 'run' }, { cat: 'gone', sub: 'gone' }],
    [], [], [], [], [], [],
  ] } });
  eq(dirty[0].count, 1, 'an unknown category is dropped before it is offered');

  const many = {};
  for (let i = 0; i < CANDIDATE_WEEKS + 6; i++) {
    many[addWeeks('2026-01-05', i)] = week(run);
  }
  eq(candidateWeeks(many).length, CANDIDATE_WEEKS,
    `the list is capped at ${CANDIDATE_WEEKS} weeks`);
  eq(candidateWeeks(many, 3).length, 3, 'and the cap can be lowered');

  // A candidate is shaped so presetFromWeek can take it directly.
  const p = presetFromWeek(candidateWeeks({ '2026-07-20': week(run, lift) })[0], 'From a week');
  eq(p.name, 'From a week', 'a candidate week becomes a preset');
  eq(p.days[1][0].cat, 'workout', 'carrying its activities');
}


// The goal cards fade everything after today, and use week.js's todayIndex to
// decide where that is. These pin down the cases that drive the fade: the two
// ends of the week, and the -1 that means "not this week, draw it settled".
section('today, as the goal cards use it');
{
  const on = (y, m, d) => new Date(y, m, d);      // 20 July 2026 is a Monday

  const week = [];
  for (let d = 20; d <= 26; d++) week.push(todayIndex('2026-07-20', on(2026, 6, d)));
  eq(week.join(','), '0,1,2,3,4,5,6', 'a whole week maps to the seven columns in order');
  eq(todayIndex('2026-07-20', on(2026, 6, 26)), 6,
    'Sunday is the last column, not the first — JS weeks start on Sunday, ours do not');

  eq(todayIndex('2026-07-13', on(2026, 6, 22)) < 0, true, 'a past week has no today');
  eq(todayIndex('2026-07-27', on(2026, 6, 22)) < 0, true, 'and neither has a future one');
  eq(todayIndex('2026-07-20', on(2026, 6, 19)) < 0, true,
    'the Sunday before belongs to the previous week');
  eq(todayIndex('2026-07-20', on(2026, 6, 27)) < 0, true,
    'and the Monday after to the next one');
}

console.log(fails === 0
  ? `\n${count} assertions passed.`
  : `\n${fails} of ${count} assertions FAILED.`);
process.exit(fails ? 1 : 0);
