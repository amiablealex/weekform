// ---------------------------------------------------------------------------
// weekform — week presets
//
// A preset is a week somebody already built, kept so they do not have to build
// it again. It is `{ id, name, days }` and nothing else: the same `days` shape
// the strip, the URL fragment and the sync endpoint already carry, so applying
// one is a copy rather than a conversion.
//
// It deliberately does not carry a title. Applying a template should not
// silently rename a week somebody has already named.
//
// Pure: no DOM, no network, no localStorage. Day validation is borrowed from
// state.js rather than repeated, so a preset can never hold an activity the
// strip would refuse to draw.
// ---------------------------------------------------------------------------

import { LIMITS } from './tokens.js';
import { sanitise } from './state.js';

// How many past weeks to offer when building a preset from one. Long enough to
// reach back a couple of months, short enough that the list is a list.
export const CANDIDATE_WEEKS = 12;

const ID_RE = /^[a-z0-9]{4,16}$/;

export function newPresetId() {
  let id = '';
  while (id.length < 8) id += Math.random().toString(36).slice(2);
  return id.slice(0, 8);
}

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Coerce anything into a preset that is safe to apply, or null. */
export function sanitisePreset(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;

  // Every activity goes through the same gate a pasted link does.
  const days = sanitise({ days: raw.days }).days;
  // An empty preset would apply nothing and occupy one of three slots.
  if (days.every((day) => day.length === 0)) return null;

  return {
    id: raw.id,
    name: cleanText(raw.name, LIMITS.presetName) || 'Preset',
    days,
  };
}

export function sanitisePresets(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .map(sanitisePreset)
    .filter((p) => {
      if (!p || seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    })
    .slice(0, LIMITS.presets);
}

/** Build a preset from the week on screen. Returns null if there is nothing in it. */
export function presetFromWeek(state, name) {
  return sanitisePreset({
    id: newPresetId(),
    name,
    days: state.days,
  });
}

/** The days a preset would apply, detached from the preset itself. */
export function daysOf(preset) {
  return preset.days.map((day) => day.map((activity) => ({ ...activity })));
}

/**
 * The weeks worth offering as the basis for a preset: most recent first, empty
 * ones dropped, validated on the way through.
 *
 * `weeks` is the same map the calendar builds — device weeks with anything on
 * the server layered over the top.
 */
export function candidateWeeks(weeks, limit = CANDIDATE_WEEKS) {
  return Object.entries(weeks || {})
    .map(([weekStart, week]) => {
      const days = sanitise({ days: week && week.days }).days;
      return {
        weekStart,
        title: (week && typeof week.title === 'string' ? week.title : '').trim(),
        days,
        count: days.reduce((n, day) => n + day.length, 0),
      };
    })
    .filter((week) => week.count > 0)
    .sort((a, b) => (a.weekStart > b.weekStart ? -1 : 1))
    .slice(0, limit);
}

/** "4 activities across 3 days" — the caption in the picker. */
export function describePreset(preset) {
  const activities = preset.days.reduce((n, day) => n + day.length, 0);
  const days = preset.days.filter((day) => day.length).length;
  return `${activities} activit${activities === 1 ? 'y' : 'ies'} across ` +
         `${days} day${days === 1 ? '' : 's'}`;
}
