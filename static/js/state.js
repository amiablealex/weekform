// ---------------------------------------------------------------------------
// weekform — state
//
// The week lives in three places, in order of precedence:
//   1. the URL fragment  — shareable, and never sent to the server
//   2. localStorage      — survives a refresh
//   3. a fresh empty week
//
// The fragment is chosen over a query string deliberately: fragments are not
// transmitted in the HTTP request, so nobody's training week ends up in a
// server log. It also means anything arriving here is untrusted input from a
// URL somebody could have edited, hence `sanitise` below.
// ---------------------------------------------------------------------------

import { BRAND, CATEGORIES, MAX_PER_DAY, LIMITS, UNITS,
         category, subType } from './tokens.js';
import { defaultWeekStart, toISO, parseISO, mondayOf } from './week.js';

const STORAGE_KEY = 'weekform.week.v1';
const FORMAT = 1;

const ALL_UNITS = [...UNITS.time, ...UNITS.distance];

export function emptyState() {
  return {
    title: BRAND.defaultTitle,
    weekStart: defaultWeekStart(),
    days: [[], [], [], [], [], [], []],
  };
}

export function emptyDays() {
  return [[], [], [], [], [], [], []];
}

// --- validation ------------------------------------------------------------

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanWeekStart(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = parseISO(value);
  if (Number.isNaN(d.getTime())) return null;
  // Snap to Monday rather than rejecting: a hand-edited URL pointing at a
  // Wednesday should still open the week that Wednesday belongs to.
  return toISO(mondayOf(d));
}

function cleanActivity(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const cat = category(raw.cat);
  if (!cat) return null;
  const sub = subType(cat.id, raw.sub);
  if (!sub) return null;

  const out = { cat: cat.id, sub: sub.id };

  const tags = sub.tags || [];
  if (raw.tag === 'custom' && sub.custom) out.tag = 'custom';
  else if (typeof raw.tag === 'string' && tags.includes(raw.tag)) out.tag = raw.tag;

  const custom = cleanText(raw.custom, LIMITS.label);
  if (custom) out.custom = custom;

  if (cat.meta) {
    const amount = Number(raw.amount);
    if (Number.isFinite(amount) && amount > 0 && ALL_UNITS.includes(raw.unit)) {
      // Guard against absurd values from a hand-edited URL.
      out.amount = Math.min(Math.round(amount * 100) / 100, 9999);
      out.unit = raw.unit;
    }
  }
  return out;
}

/** Coerce anything into a state object that is safe to render. */
export function sanitise(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;

  const weekStart = cleanWeekStart(raw.weekStart);
  const days = Array.isArray(raw.days) ? raw.days : [];

  return {
    title: cleanText(raw.title, LIMITS.title) || BRAND.defaultTitle,
    weekStart: weekStart || base.weekStart,
    days: Array.from({ length: 7 }, (_, i) => {
      const day = Array.isArray(days[i]) ? days[i] : [];
      return day.map(cleanActivity).filter(Boolean).slice(0, MAX_PER_DAY);
    }),
  };
}

// --- compact encoding ------------------------------------------------------
// Activities become positional arrays with trailing blanks dropped, which keeps
// a full week around 150 characters once encoded.

function packActivity(a) {
  const row = [a.cat, a.sub, a.tag || '', a.custom || '', a.amount || '', a.unit || ''];
  while (row.length && row[row.length - 1] === '') row.pop();
  return row;
}

function unpackActivity(row) {
  if (!Array.isArray(row)) return null;
  const [cat, sub, tag, custom, amount, unit] = row;
  return { cat, sub, tag, custom, amount, unit };
}

function b64urlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeState(state) {
  const payload = {
    v: FORMAT,
    t: state.title === BRAND.defaultTitle ? '' : state.title,
    w: state.weekStart,
    d: state.days.map((day) => day.map(packActivity)),
  };
  return b64urlEncode(JSON.stringify(payload));
}

export function decodeState(encoded) {
  try {
    const payload = JSON.parse(b64urlDecode(encoded));
    if (!payload || payload.v !== FORMAT) return null;
    return sanitise({
      title: payload.t || BRAND.defaultTitle,
      weekStart: payload.w,
      days: (payload.d || []).map((day) => (day || []).map(unpackActivity)),
    });
  } catch {
    return null;   // a mangled link should open an empty week, not an error
  }
}

// --- persistence -----------------------------------------------------------

export function saveLocal(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing, or storage full. Not worth interrupting anyone over.
  }
}

export function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitise(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function readHash() {
  const hash = location.hash.replace(/^#/, '');
  return hash ? decodeState(hash) : null;
}

export function writeHash(state) {
  const encoded = encodeState(state);
  // replaceState rather than assigning location.hash, so editing a week does
  // not fill the back button with fifty history entries.
  history.replaceState(null, '', `#${encoded}`);
}

export function shareUrl(state) {
  return `${location.origin}${location.pathname}#${encodeState(state)}`;
}

/** Whether anything has actually been entered — used to gate the share button. */
export function isEmpty(state) {
  return state.days.every((day) => day.length === 0);
}

export function countActivities(state) {
  return state.days.reduce((n, day) => n + day.length, 0);
}

export { CATEGORIES, MAX_PER_DAY, LIMITS };
