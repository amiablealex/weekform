// ---------------------------------------------------------------------------
// weekform — preset storage
//
// The same arrangement as goals: the account is the only home, presets are
// fetched once per page load, and nothing is mirrored into localStorage where
// it would outlive signing out on a shared device.
// ---------------------------------------------------------------------------

import { sanitisePresets, sanitisePreset } from './presets.js';

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

export async function fetchPresets() {
  if (!isSignedIn()) return [];
  const data = await request('/api/presets');
  return sanitisePresets(data.presets || []);
}

export async function savePreset(preset) {
  const clean = sanitisePreset(preset);
  if (!clean) throw new Error('preset did not validate');
  await request(`/api/presets/${clean.id}`, {
    method: 'PUT',
    body: JSON.stringify(clean),
  });
  return clean;
}

export async function removePreset(id) {
  await request(`/api/presets/${id}`, { method: 'DELETE' });
}

export { isSignedIn };
