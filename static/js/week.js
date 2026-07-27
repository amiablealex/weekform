// ---------------------------------------------------------------------------
// weekform — week arithmetic
//
// A week is identified by the ISO date of its Monday. Everything downstream
// takes that string. All dates are handled in local time: `new Date('2026-07-20')`
// parses as UTC and silently shifts the day for anyone west of Greenwich, so
// ISO strings are always split by hand.
// ---------------------------------------------------------------------------

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Monday of the week containing `date`. */
export function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = (d.getDay() + 6) % 7;   // Monday = 0, Sunday = 6
  d.setDate(d.getDate() - dow);
  return d;
}

export function addWeeks(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n * 7);
  return toISO(d);
}

export function daysOf(weekStartISO) {
  const start = parseISO(weekStartISO);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/**
 * Which week to open on.
 *
 * Monday to Wednesday, the current week is barely underway and there is nothing
 * worth summarising, so we assume you are reporting the week that just ended.
 * From Thursday there is enough of this week on the board to be worth sharing,
 * so we switch to the current one.
 */
export function defaultWeekStart(today = new Date()) {
  const dow = (today.getDay() + 6) % 7;   // Monday = 0
  const thisMonday = mondayOf(today);
  if (dow <= 2) {
    thisMonday.setDate(thisMonday.getDate() - 7);
  }
  return toISO(thisMonday);
}

function ordinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/**
 * "20th July – 26th July 2026"        same month
 * "29th June – 5th July 2026"         crossing a month
 * "28th December 2026 – 3rd January 2027"   crossing a year
 *
 * Uses an en dash, not a hyphen.
 */
export function formatRange(weekStartISO) {
  const start = parseISO(weekStartISO);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  const sDay = ordinal(start.getDate());
  const eDay = ordinal(end.getDate());
  const sMonth = MONTHS[start.getMonth()];
  const eMonth = MONTHS[end.getMonth()];
  const sYear = start.getFullYear();
  const eYear = end.getFullYear();

  if (sYear !== eYear) {
    return `${sDay} ${sMonth} ${sYear} – ${eDay} ${eMonth} ${eYear}`;
  }
  return `${sDay} ${sMonth} – ${eDay} ${eMonth} ${eYear}`;
}

/** Short form for the week picker: "20 – 26 Jul". */
export function formatRangeShort(weekStartISO) {
  const start = parseISO(weekStartISO);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sM = MONTHS[start.getMonth()].slice(0, 3);
  const eM = MONTHS[end.getMonth()].slice(0, 3);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} ${eM}`;
  }
  return `${start.getDate()} ${sM} – ${end.getDate()} ${eM}`;
}

/** "This week", "Last week", "Next week", or null. */
export function relativeName(weekStartISO, today = new Date()) {
  const current = toISO(mondayOf(today));
  if (weekStartISO === current) return 'This week';
  if (weekStartISO === addWeeks(current, -1)) return 'Last week';
  if (weekStartISO === addWeeks(current, 1)) return 'Next week';
  return null;
}

/** Index 0-6 of today within the given week, or -1 if today falls outside it. */
export function todayIndex(weekStartISO, today = new Date()) {
  const start = parseISO(weekStartISO);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diff = Math.round((t - start) / 86400000);
  return diff >= 0 && diff <= 6 ? diff : -1;
}
