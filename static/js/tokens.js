// ---------------------------------------------------------------------------
// weekform — design tokens
//
// This file is the single source of truth for anything visual. Change a value
// here and it propagates to the preview, the exported PNG, and the UI chrome.
// Nothing below should be duplicated anywhere else in the codebase.
// ---------------------------------------------------------------------------

export const BRAND = {
  domain: 'weekform.app',   // rendered bottom-right on every strip
  defaultTitle: 'My Week',
};

// --- palette ---------------------------------------------------------------
// Each entry is a badge colour, the colour of the glyph drawn on it, and the
// colour of the sub-type label that sits beneath the circle.
//
// Two tiers, deliberately:
//   solid  — training happened. Saturated fill, white glyph.
//   tinted — training did not happen. Pale fill, deep same-hue glyph.
// The tiers are why a strip reads at a glance: effort is loud, absence is quiet.

export const PALETTE = {
  cardio:   { fill: '#EE4E1E', glyph: '#FFFFFF', label: '#B33714', tier: 'solid'  },
  workout:  { fill: '#0E97AE', glyph: '#FFFFFF', label: '#0A6E7F', tier: 'solid'  },
  mobility: { fill: '#61A34C', glyph: '#FFFFFF', label: '#467635', tier: 'solid'  },
  sport:    { fill: '#8A72D0', glyph: '#FFFFFF', label: '#5B45A0', tier: 'solid'  },
  cheat:    { fill: '#E8398C', glyph: '#FFFFFF', label: '#A81F62', tier: 'solid'  },
  rest:     { fill: '#D8DCE0', glyph: '#767C83', label: '#767C83', tier: 'tinted' },
  illness:  { fill: '#F0AFA8', glyph: '#9E3F36', label: '#9E3F36', tier: 'tinted' },
  vacation: { fill: '#F5D36B', glyph: '#8A6510', label: '#8A6510', tier: 'tinted' },
};

// Strip furniture. Not activity colours — the paper the strip is printed on.
export const INK = {
  paper:    '#FFFFFF',
  title:    '#14161A',
  subtitle: '#8A9098',
  dayLabel: '#B0B6BC',
  footer:   '#9CA3AA',
};

// --- typography ------------------------------------------------------------
// Bricolage Grotesque carries the title only; its width and quirk are too much
// for small sizes. Space Grotesk does everything else — its digits are the
// reason it was chosen, since durations sit inside circles at small sizes.

export const FONTS = {
  display: '"Bricolage Grotesque"',
  body: '"Space Grotesk"',
  fallback: 'system-ui, -apple-system, sans-serif',
};

export const TYPE = {
  title:    { font: 'display', size: 46, weight: 700, tracking: -1.0 },
  subtitle: { font: 'body',    size: 25, weight: 400, tracking:  0   },
  dayLabel: { font: 'body',    size: 21, weight: 500, tracking:  1.0 },
  meta:     { font: 'body',    size: 22, weight: 700, tracking:  0   },
  label:    { font: 'body',    size: 18, weight: 500, tracking:  1.6 },
  footer:   { font: 'body',    size: 21, weight: 500, tracking:  0.4 },
};

// --- geometry --------------------------------------------------------------
// All values are logical units at 1x. The canvas is drawn at EXPORT_SCALE and
// the whole coordinate space is scaled once, so these numbers stay readable.

export const GEO = {
  width: 1080,
  height: 420,
  exportScale: 2,          // exported PNG is 2160 x 840
  padX: 56,

  titleY: 86,
  subtitleY: 124,
  dayLabelY: 182,

  circleY: 258,
  circleR: 54,

  // Secondary activity sits behind the primary, offset up and to the right.
  // +22/-22 fits inside the 26px gap between day columns, which is why the
  // cap is two activities per day rather than three.
  stackDX: 22,
  stackDY: -22,

  metaY: 32,               // duration baseline, relative to circle centre
  iconLiftWithMeta: -14,   // icon shifts up when a duration sits beneath it

  labelY: 344,             // sub-type label baseline, absolute
  footerY: 398,

  // Icon size as a fraction of circle diameter. Solo icons fill more of the
  // circle; icons sharing space with a duration shrink to make room.
  iconFillSolo: 0.50,
  iconFillWithMeta: 0.36,
};

// --- goals -----------------------------------------------------------------
// A goal card is drawn in the same 1080-wide coordinate space as the strip, so
// its day marks land on `columnCentres()` and line up with the circles above
// them by construction rather than by a fudged percentage.
//
// `ok` is the only green in the app and means one thing: this goal is met. It
// is deliberately not any palette colour — mobility is already green, and a
// mobility goal that looked permanently complete would be worse than useless.

// A goal card sits on --surface rather than on the strip's white paper, so it
// has to work in both schemes. An unfilled mark that is lighter than its
// background reads as a filled one; the dark values are darker than --surface
// is light, for the same reason.
export const GOAL = {
  ok:          '#2E8B4F',
  okDark:      '#4FBF74',
  pending:     '#CDD2D8',
  pendingDark: '#343941',

  // Above this many marks a dot grid reads as noise, so the goal is drawn as
  // an area chart instead. Distance and duration goals always are.
  maxDots: 4,

  plotH:    148,   // plot height in strip units, constant so cards match
  plotPad:   14,
  dotR:      13,   // roughly a fifth of GEO.circleR — small enough not to be
  dotPitch:  34,   // mistaken for an activity
  lineW:      5,
  areaAlpha: 0.16,
};

// Seven evenly spaced circle centres across the usable width.
export function columnCentres() {
  const usable = GEO.width - GEO.padX * 2;
  const pitch = usable / 7;
  return Array.from({ length: 7 }, (_, i) => GEO.padX + pitch * (i + 0.5));
}

export const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

// --- activity taxonomy ----------------------------------------------------
// meta:true  — this category accepts a duration or distance
// custom:true — this sub-type accepts a free-text label
// tags        — preset labels that render beneath the circle
//
// The `icon` field is an id in icons.js. Several sub-types deliberately share
// one glyph: every run type is the same shoe.

export const CATEGORIES = [
  {
    id: 'cardio', label: 'Cardio', palette: 'cardio', meta: true,
    subs: [
      { id: 'run',  label: 'Run',  icon: 'run',
        tags: ['easy', 'long', 'tempo', 'interval', 'race'], custom: true },
      { id: 'bike', label: 'Bike', icon: 'bike' },
      { id: 'swim', label: 'Swim', icon: 'swim' },
      { id: 'custom', label: 'Custom', icon: 'custom', custom: true, requiresLabel: true },
    ],
  },
  {
    id: 'workout', label: 'Workout', palette: 'workout', meta: true,
    subs: [
      // Which body part it was is a label, not a glyph — the same shape as a
      // run's character. Four presets and a free-text option.
      { id: 'strength', label: 'Strength', icon: 'strength',
        tags: ['upper body', 'chest', 'core', 'lower body'], custom: true },
      // HIIT carries its own caption — a bare stopwatch does not say what it is.
      { id: 'hiit', label: 'HIIT', icon: 'hiit', defaultTag: 'hiit' },
      { id: 'custom', label: 'Custom', icon: 'custom', custom: true, requiresLabel: true },
    ],
  },
  {
    id: 'mobility', label: 'Mobility', palette: 'mobility', meta: true,
    subs: [
      { id: 'yoga',   label: 'Yoga',   icon: 'mobility' },
      { id: 'custom', label: 'Custom', icon: 'custom', custom: true, requiresLabel: true },
    ],
  },
  {
    id: 'sport', label: 'Sport', palette: 'sport', meta: true,
    subs: [{ id: 'sport', label: 'Sport', icon: 'sport', custom: true }],
  },
  {
    id: 'rest', label: 'Rest day', palette: 'rest', meta: false,
    subs: [{ id: 'rest', label: 'Rest day', icon: 'rest' }],
  },
  {
    // goals:false — nobody sets out to be ill, on holiday, or to eat a
    // doughnut on schedule. Absent means allowed, so rest days are goal-able.
    id: 'illness', label: 'Illness / injury', palette: 'illness', meta: false,
    goals: false,
    subs: [{ id: 'illness', label: 'Illness / injury', icon: 'illness' }],
  },
  {
    id: 'vacation', label: 'Vacation', palette: 'vacation', meta: false,
    goals: false,
    subs: [{ id: 'vacation', label: 'Vacation', icon: 'vacation' }],
  },
  {
    id: 'cheat', label: 'Cheat day', palette: 'cheat', meta: false,
    goals: false,
    subs: [
      { id: 'doughnut', label: 'Doughnut', icon: 'doughnut' },
      { id: 'beer',     label: 'Beer',     icon: 'beer' },
    ],
  },
];

export const UNITS = {
  time: ['min', 'h'],
  distance: ['km', 'mi'],
};

// Max activities per day. The stacked-circle offset only reads clearly for one
// layer; raising this needs a rethink of GEO.stackDX/DY, not just this number.
export const MAX_PER_DAY = 2;

// Input limits, enforced by the picker. The renderer will still shrink and
// truncate anything that slips through, but truncation cuts mid-word and looks
// like a bug, so the real fix is to stop it being typed.
export const LIMITS = {
  title: 22,
  label: 12,
  goalName: 28,
  presetName: 22,

  // Two ceilings, for two different reasons. `activeGoals` is about the page:
  // more than six cards under a strip is a dashboard, which this is not. It
  // counts goals live in the *same week*, so a year of finished goals costs
  // nothing. `storedGoals` is about storage and nothing else, and is the only
  // one the server can enforce — working out what is active means reading the
  // dates, and the server does not read payloads.
  activeGoals: 6,
  storedGoals: 40,

  reqs: 4,           // parts within one goal
  presets: 3,
};

// --- lookups --------------------------------------------------------------

const catIndex = new Map(CATEGORIES.map((c) => [c.id, c]));

export function category(id) {
  return catIndex.get(id) || null;
}

/** The categories a goal may be built from. Data, not a list in the builder. */
export function goalCategories() {
  return CATEGORIES.filter((c) => c.goals !== false);
}

export function subType(catId, subId) {
  const c = category(catId);
  if (!c) return null;
  return c.subs.find((s) => s.id === subId) || c.subs[0];
}

// Resolve an activity to everything the renderer needs.
export function resolve(activity) {
  const cat = category(activity.cat);
  if (!cat) return null;
  const sub = subType(activity.cat, activity.sub);
  return {
    colours: PALETTE[cat.palette],
    icon: sub.icon,
    acceptsMeta: !!cat.meta,
  };
}

/**
 * True when this activity must carry a free-text label before it can be saved.
 * A circle captioned "CUSTOM" tells a reader nothing.
 */
export function needsLabel(activity) {
  const sub = subType(activity.cat, activity.sub);
  if (!sub) return false;
  if (sub.requiresLabel) return true;
  return sub.custom === true && activity.tag === 'custom';
}

/**
 * The label beneath a circle. A free-text custom label wins over a preset tag,
 * and a sub-type may declare a caption it always carries — HIIT does, because
 * the stopwatch alone does not say what kind of session it was.
 */
export function labelFor(activity) {
  const text = (activity.custom || activity.tag || '').trim();
  if (text) return text.toUpperCase();
  const sub = subType(activity.cat, activity.sub);
  return sub && sub.defaultTag ? sub.defaultTag.toUpperCase() : '';
}

// "5km", "20min", "1h30", "2h", "3.2mi"
export function metaFor(activity) {
  const { amount, unit } = activity;
  if (amount === null || amount === undefined || amount === '' || !unit) return '';
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';

  if (unit === 'h') {
    const whole = Math.floor(n);
    const mins = Math.round((n - whole) * 60);
    if (mins === 0) return `${whole}h`;
    return `${whole}h${String(mins).padStart(2, '0')}`;
  }
  const rounded = Math.round(n * 10) / 10;
  const shown = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${shown}${unit}`;
}
