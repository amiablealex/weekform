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
eq(resolve({ cat: 'cardio', sub: 'run' }).icon, 'run', 'run uses the shoe');
eq(resolve({ cat: 'cardio', sub: 'run' }).acceptsMeta, true, 'cardio accepts a duration');
eq(resolve({ cat: 'workout', sub: 'strength' }).acceptsMeta, true, 'workout accepts one too');
eq(resolve({ cat: 'mobility', sub: 'yoga' }).acceptsMeta, true, 'mobility accepts one too');
eq(resolve({ cat: 'sport', sub: 'sport' }).acceptsMeta, true, 'sport accepts a duration');
eq(resolve({ cat: 'cheat', sub: 'beer' }).acceptsMeta, false, 'cheat day does not');
eq(resolve({ cat: 'rest', sub: 'rest' }).acceptsMeta, false, 'rest does not');
eq(resolve({ cat: 'workout', sub: 'strength' }).icon, 'dumbbell', 'strength uses the dumbbell');
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

console.log(fails === 0
  ? `\n${count} assertions passed.`
  : `\n${fails} of ${count} assertions FAILED.`);
process.exit(fails ? 1 : 0);
