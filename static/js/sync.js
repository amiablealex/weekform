// ---------------------------------------------------------------------------
// weekform — sync
//
// localStorage stays the working copy. The server is a second home for it, not
// the source of truth, which means the app behaves identically whether the
// network is there or not — a week added on a train is saved locally and pushed
// when it can be.
//
// Signed out, none of this runs and nothing leaves the browser.
// ---------------------------------------------------------------------------

import { sanitise, storedWeekStarts, loadWeek, saveWeek } from './state.js';

const isSignedIn = () => Boolean(window.WEEKFORM && window.WEEKFORM.signedIn);
const csrf = () => (window.WEEKFORM && window.WEEKFORM.csrf) || '';

const PUSH_DELAY = 900;
const pending = new Map();

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
    ...options,
  });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} → ${response.status}`);
  return response.json();
}

/** Push one week. Debounced, because a push per keystroke helps nobody. */
export function push(state) {
  if (!isSignedIn()) return;
  const key = state.weekStart;
  clearTimeout(pending.get(key));
  const body = JSON.stringify({ title: state.title, days: state.days });
  pending.set(key, setTimeout(async () => {
    pending.delete(key);
    try {
      await request(`/api/weeks/${key}`, { method: 'PUT', body });
    } catch (err) {
      // The local copy is already saved, so a failure here costs nothing but a
      // delay — the next edit to this week will carry it up.
      console.warn('weekform: could not save to the server', err);
    }
  }, PUSH_DELAY));
}

export async function remove(weekStart) {
  if (!isSignedIn()) return;
  try {
    await request(`/api/weeks/${weekStart}`, { method: 'DELETE' });
  } catch (err) {
    console.warn('weekform: could not remove from the server', err);
  }
}

export async function fetchAll() {
  if (!isSignedIn()) return {};
  const data = await request('/api/weeks');
  return data.weeks || {};
}

/**
 * Reconcile device and server, once, at start-up.
 *
 * Anything on the server is written to the device. Anything the device has that
 * the server does not is pushed up — which is what makes signing in for the
 * first time keep the weeks somebody already built while signed out, rather
 * than silently replacing them with an empty account.
 *
 * Where both hold the same week, the server wins. It is the copy that followed
 * them from their last device, and picking a side beats inventing a merge
 * nobody asked for.
 */
export async function reconcile() {
  if (!isSignedIn()) return { pulled: 0, pushed: 0 };

  let remote = {};
  try {
    remote = await fetchAll();
  } catch (err) {
    console.warn('weekform: could not read the server', err);
    return { pulled: 0, pushed: 0 };
  }

  let pulled = 0;
  for (const [weekStart, payload] of Object.entries(remote)) {
    const incoming = sanitise({ ...payload, weekStart });
    saveWeek(incoming);
    pulled += 1;
  }

  let pushed = 0;
  for (const weekStart of storedWeekStarts()) {
    if (weekStart in remote) continue;
    const local = loadWeek(weekStart);
    if (!local) continue;
    try {
      await request(`/api/weeks/${weekStart}`, {
        method: 'PUT',
        body: JSON.stringify({ title: local.title, days: local.days }),
      });
      pushed += 1;
    } catch (err) {
      console.warn('weekform: could not upload a local week', err);
    }
  }

  return { pulled, pushed };
}

export { isSignedIn };
