// ---------------------------------------------------------------------------
// weekform — goal storage
//
// Unlike weeks, goals are not mirrored into localStorage. A goal only exists
// with an account, and a copy left on the device would outlive signing out —
// on a shared machine that is somebody else's training plan sitting in a
// browser. So the account is the only home, goals are fetched once per page
// load, and the section simply does not appear until they arrive.
//
// Signed out, none of this runs and the page is unchanged.
// ---------------------------------------------------------------------------

import { sanitiseGoals, sanitiseGoal } from './goals.js';

const isSignedIn = () => Boolean(window.WEEKFORM && window.WEEKFORM.signedIn);
const csrf = () => (window.WEEKFORM && window.WEEKFORM.csrf) || '';

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() },
    ...options,
  });
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${url} → ${response.status}`);
  return response.json();
}

export async function fetchGoals() {
  if (!isSignedIn()) return [];
  const data = await request('/api/goals');
  return sanitiseGoals(data.goals || []);
}

export async function saveGoal(goal) {
  const clean = sanitiseGoal(goal);
  if (!clean) throw new Error('goal did not validate');
  await request(`/api/goals/${clean.id}`, {
    method: 'PUT',
    body: JSON.stringify(clean),
  });
  return clean;
}

export async function removeGoal(id) {
  await request(`/api/goals/${id}`, { method: 'DELETE' });
}

export { isSignedIn };
