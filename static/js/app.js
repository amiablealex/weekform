// ---------------------------------------------------------------------------
// weekform — app
//
// The canvas on screen is the artefact, scaled by CSS. Editing happens through
// transparent zones laid over it, because the drawn circles are only about 38px
// across at phone width and a tap target should be at least 44.
// ---------------------------------------------------------------------------

import { GEO, columnCentres, BRAND } from './tokens.js';
import { renderStrip, renderToCanvas, toBlob, loadFonts } from './render.js';
import { formatRangeShort, relativeName, addWeeks, formatRange } from './week.js';
import { emptyState, emptyDays, sanitise, saveWeek, loadWeek, lastVisitedWeek,
         hasStoredWeek, readHash, writeHash, shareUrl, isEmpty } from './state.js';
import { openDay, openWeek, openTitle, close as closeSheet } from './sheet.js';
import { push as pushWeek, reconcile, isSignedIn } from './sync.js';

const $ = (id) => document.getElementById(id);

const stage = $('stage');
const canvas = $('strip');
const weekLabel = $('week-label');
const weekBtn = $('week-label-btn');
const shareBtn = $('share');
const copyBtn = $('copy');
const clearBtn = $('clear');
const toastNode = $('toast');

let state = emptyState();

// The export is prepared ahead of time and kept ready. Safari only allows
// navigator.share() inside a live user gesture, and awaiting a canvas export
// inside the click handler loses that gesture — the share sheet then silently
// never opens. Rendering on every change costs a few milliseconds and makes the
// handler synchronous.
let readyFile = null;
let renderToken = 0;

/**
 * Whether this browser can hand a file to the OS share sheet.
 *
 * It cannot outside a secure context, so plain http — a Tailscale address, or
 * a LAN IP during development — always falls back to a download. Desktop
 * browsers largely do not support file sharing at all. Rather than offering a
 * Share button that quietly downloads instead, the label says what will happen.
 */
function canShareFiles() {
  try {
    const probe = new File([new Uint8Array([0])], 'probe.png', { type: 'image/png' });
    return Boolean(navigator.canShare && navigator.canShare({ files: [probe] }));
  } catch {
    return false;
  }
}

// --- toast -----------------------------------------------------------------

let toastTimer = null;
function toast(message) {
  toastNode.textContent = message;
  toastNode.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastNode.classList.remove('is-on'), 2200);
}

// --- overlay ---------------------------------------------------------------

const pct = (value, axis) =>
  `${(value / (axis === 'x' ? GEO.width : GEO.height)) * 100}%`;

function buildOverlay() {
  stage.querySelectorAll('.zone, .hint').forEach((n) => n.remove());
  const centres = columnCentres();
  const pitch = (GEO.width - GEO.padX * 2) / 7;

  const title = document.createElement('button');
  title.type = 'button';
  title.className = 'zone zone-title';
  title.setAttribute('aria-label', 'Edit title');
  Object.assign(title.style, {
    left: pct(GEO.padX - 12, 'x'), top: pct(38, 'y'),
    width: pct(430, 'x'), height: pct(66, 'y'),
  });
  title.addEventListener('click', () => openTitle(state, applyChange));
  stage.appendChild(title);

  centres.forEach((cx, i) => {
    const zone = document.createElement('button');
    zone.type = 'button';
    zone.className = 'zone zone-day';
    zone.dataset.day = String(i);
    Object.assign(zone.style, {
      left: pct(cx - pitch / 2, 'x'),
      top: pct(GEO.dayLabelY - 24, 'y'),
      width: pct(pitch, 'x'),
      height: pct(GEO.labelY + 10 - (GEO.dayLabelY - 24), 'y'),
    });
    zone.addEventListener('click', () => openDay(i, state, applyChange));
    stage.appendChild(zone);

    // Editor-only marker for a day nobody has touched. The exported PNG is
    // drawn on a separate canvas, so this never appears in the image.
    const hint = document.createElement('span');
    hint.className = 'hint';
    Object.assign(hint.style, {
      left: pct(cx - GEO.circleR, 'x'),
      top: pct(GEO.circleY - GEO.circleR, 'y'),
      width: pct(GEO.circleR * 2, 'x'),
      height: pct(GEO.circleR * 2, 'y'),
    });
    stage.appendChild(hint);
  });
}

function refreshOverlay() {
  stage.querySelectorAll('.zone-day').forEach((zone) => {
    const i = Number(zone.dataset.day);
    const count = state.days[i].length;
    zone.setAttribute('aria-label', count
      ? `${dayLabel(i)}, ${count} activit${count === 1 ? 'y' : 'ies'}. Edit`
      : `${dayLabel(i)}, empty. Add an activity`);
  });
  stage.querySelectorAll('.hint').forEach((hint, i) => {
    hint.classList.toggle('is-on', state.days[i].length === 0);
  });
}

function dayLabel(i) {
  return ['Monday', 'Tuesday', 'Wednesday', 'Thursday',
    'Friday', 'Saturday', 'Sunday'][i];
}

// --- rendering -------------------------------------------------------------

function scheduleExport() {
  const token = ++renderToken;
  readyFile = null;
  // Give the browser a frame to paint the preview before doing the export.
  setTimeout(async () => {
    if (token !== renderToken) return;
    try {
      const blob = await toBlob(renderToCanvas(state));
      if (token !== renderToken) return;
      readyFile = new File([blob], `weekform-${state.weekStart}.png`,
        { type: 'image/png' });
    } catch {
      readyFile = null;
    }
  }, 60);
}

function paint() {
  renderStrip(canvas, state);
  const name = relativeName(state.weekStart);
  weekLabel.textContent = formatRangeShort(state.weekStart);
  weekBtn.setAttribute('aria-label',
    `Week of ${formatRange(state.weekStart)}. Change week`);
  $('week-rel').textContent = name || '';
  refreshOverlay();
  shareBtn.disabled = false;
  scheduleExport();
}

function applyChange() {
  state = sanitise(state);
  saveWeek(state);
  pushWeek(state);        // no-op when signed out
  writeHash(state);
  paint();
}

/**
 * Move to another week, keeping what is on screen.
 *
 * Weeks are stored separately, so stepping back to last week shows last week —
 * not this week's circles relabelled. A week nobody has touched opens empty but
 * inherits the current title, so somebody who has named their strip does not
 * have to name it again every time they navigate.
 */
function goToWeek(target) {
  saveWeek(state);
  const stored = loadWeek(target);
  state = stored || { ...emptyState(target), title: state.title };
  state.weekStart = target;
  applyChange();
}

// --- actions ---------------------------------------------------------------

async function recordShare(kind) {
  try {
    await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
      keepalive: true,
    });
  } catch {
    // The counter is not worth bothering anyone about.
  }
}

function download(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function onShare() {
  let file = readyFile;
  if (!file) {
    // Only reachable if someone taps within a few frames of a change. On iOS
    // this loses the gesture and share is refused, so it falls through to a
    // download rather than appearing to do nothing.
    try {
      const blob = await toBlob(renderToCanvas(state));
      file = new File([blob], `weekform-${state.weekStart}.png`, { type: 'image/png' });
    } catch {
      toast('Could not build the image');
      return;
    }
  }

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      recordShare('share');
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // they changed their mind
    }
  }
  download(file);
  recordShare('download');
  toast('Image saved');
}

async function onCopy() {
  const url = shareUrl(state);
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied');
  } catch {
    toast(url);
  }
}

let clearArmed = false;
let clearTimer = null;
function onClear() {
  if (!clearArmed) {
    clearArmed = true;
    clearBtn.textContent = 'Clear week?';
    clearBtn.classList.add('is-armed');
    clearTimer = setTimeout(disarmClear, 3000);
    return;
  }
  disarmClear();
  // Clears the week on screen only. The others stay where they are.
  state.days = emptyDays();
  state.title = BRAND.defaultTitle;
  applyChange();
  toast('Week cleared');
}

function disarmClear() {
  clearTimeout(clearTimer);
  clearArmed = false;
  clearBtn.textContent = 'Clear';
  clearBtn.classList.remove('is-armed');
}

function step(weeks) {
  goToWeek(addWeeks(state.weekStart, weeks));
}

// --- boot ------------------------------------------------------------------

function initialState() {
  // A shared link wins: somebody following one wants to see that week, not
  // whatever they were last editing themselves. It is only written to the
  // archive once they actually change something.
  const fromUrl = readHash();
  if (fromUrl) return fromUrl;

  const last = lastVisitedWeek();
  if (last) {
    const stored = loadWeek(last);
    if (stored) return stored;
  }
  return emptyState();
}

async function boot() {
  state = initialState();
  buildOverlay();

  // Draw once immediately so there is something on screen, then again once the
  // real faces have loaded. Canvas substitutes a fallback silently rather than
  // waiting, so the second pass is not optional.
  paint();
  try {
    await loadFonts();
  } catch {
    // Offline, or the font host is unreachable. The fallback face still works.
  }
  paint();

  if (!canShareFiles()) shareBtn.textContent = 'Save image';

  // Signed in, the device and the account are reconciled once at start-up.
  // Weeks built before signing in are uploaded rather than lost, and weeks from
  // another device arrive. The week on screen is then reloaded in case the
  // server had a newer copy of it.
  if (isSignedIn()) {
    const viewing = state.weekStart;
    reconcile().then(({ pulled, pushed }) => {
      const stored = loadWeek(viewing);
      if (stored) {
        state = stored;
        paint();
      }
      if (pushed) toast(`${pushed} week${pushed === 1 ? '' : 's'} saved to your account`);
      else if (pulled) toast('History loaded');
    });
  }

  $('week-prev').addEventListener('click', () => step(-1));
  $('week-next').addEventListener('click', () => step(1));
  weekBtn.addEventListener('click', () => openWeek(state, goToWeek, hasStoredWeek));
  shareBtn.addEventListener('click', onShare);
  copyBtn.addEventListener('click', onCopy);
  clearBtn.addEventListener('click', onClear);

  window.addEventListener('hashchange', () => {
    const incoming = readHash();
    if (incoming) {
      state = incoming;
      closeSheet();
      paint();
    }
  });

  document.body.classList.add('is-ready');
}

boot();
