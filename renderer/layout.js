// Resizable, collapsible panes: sidebar, notes list, materials viewer and the study panel.
// Drag a divider to resize; drag it past the minimum, double-click it, or press
// Enter on it to collapse. Widths are remembered in settings.

import { S, saveLib } from './state.js';
import { h, icon } from './dom.js';

const PANES = {
  side: { label: 'sidebar', min: 180, max: 420, def: 250 },
  list: { label: 'notes list', min: 200, max: 520, def: 300 },
  panel: { label: 'study panel', min: 280, max: 760, def: 400 },
  slides: { label: 'materials viewer', min: 260, max: 1000, def: 460, hidden: true },
};

function state() {
  const st = S.lib.settings;
  if (!st.layout) st.layout = {};
  for (const [k, p] of Object.entries(PANES)) {
    if (typeof st.layout[k] !== 'number') st.layout[k] = p.def;
    st.layout[`${k}Hidden`] = st.layout[`${k}Hidden`] === undefined ? !!p.hidden : !!st.layout[`${k}Hidden`];
  }
  return st.layout;
}

const separators = new Set();

export function applyLayout() {
  const L = state();
  const root = document.documentElement;
  for (const k of Object.keys(PANES)) {
    root.style.setProperty(`--w-${k}`, L[`${k}Hidden`] ? '0px' : `${L[k]}px`);
    root.classList.toggle(`${k}-hidden`, L[`${k}Hidden`]);
  }
  for (const sep of separators) {
    const k = sep.dataset.pane;
    sep.setAttribute('aria-valuenow', String(L[`${k}Hidden`] ? 0 : L[k]));
    const tab = sep.querySelector('.sep-expand');
    if (tab) tab.hidden = !L[`${k}Hidden`];
  }
}

export function togglePane(k) {
  const L = state();
  L[`${k}Hidden`] = !L[`${k}Hidden`];
  applyLayout();
  saveLib();
}

// A divider for pane `k`. `fromRight` is true when the pane sits to the right of
// the divider (the study panel), so dragging left makes it wider.
// `tab`: show a small expand tab on the divider while the pane is hidden (off
// for panes that have their own show arrow at the top).
export function separator(k, { fromRight = false, tab = true } = {}) {
  const p = PANES[k];
  const expand = h('button', { type: 'button', class: 'sep-expand', tabindex: '-1', 'aria-hidden': 'true', title: `Show ${p.label}`, onClick: () => togglePane(k) },
    icon('chevron', 14));
  if (fromRight) expand.style.setProperty('transform', 'scaleX(-1)');
  const sep = h('div', {
    class: `sep sep-${k}`, role: 'separator', tabindex: '0', 'aria-orientation': 'vertical',
    'aria-label': `Resize ${p.label}. Enter to hide or show.`, 'aria-valuemin': '0', 'aria-valuemax': String(p.max), 'data-pane': k,
  }, tab ? expand : null);

  const setWidth = (w, save) => {
    const L = state();
    if (w < p.min / 2) L[`${k}Hidden`] = true;
    else { L[`${k}Hidden`] = false; L[k] = Math.max(p.min, Math.min(p.max, Math.round(w))); }
    applyLayout();
    if (save) saveLib();
  };

  sep.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('.sep-expand')) return;
    e.preventDefault();
    sep.setPointerCapture(e.pointerId);
    const L = state();
    const start = L[`${k}Hidden`] ? 0 : L[k];
    const x0 = e.clientX;
    document.body.classList.add('resizing');
    const move = (ev) => setWidth(start + (fromRight ? x0 - ev.clientX : ev.clientX - x0), false);
    const up = () => {
      sep.removeEventListener('pointermove', move);
      // Dragged shut: reopen later at the width it had before this drag.
      const now = state();
      if (now[`${k}Hidden`] && start) now[k] = start;
      document.body.classList.remove('resizing');
      saveLib();
    };
    sep.addEventListener('pointermove', move);
    sep.addEventListener('pointerup', up, { once: true });
    sep.addEventListener('pointercancel', up, { once: true });
  });
  sep.addEventListener('dblclick', () => togglePane(k));
  sep.addEventListener('keydown', (e) => {
    const L = state();
    const step = e.shiftKey ? 64 : 16;
    const grow = fromRight ? 'ArrowLeft' : 'ArrowRight';
    const shrink = fromRight ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === grow) { e.preventDefault(); setWidth((L[`${k}Hidden`] ? p.min - step : L[k]) + step, true); }
    else if (e.key === shrink) { e.preventDefault(); if (!L[`${k}Hidden`]) setWidth(L[k] - step < p.min ? 0 : L[k] - step, true); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePane(k); }
  });
  // A note view makes a new panel divider each time it opens; drop the old ones.
  for (const old of separators) if (old.dataset.pane === k && !old.isConnected) separators.delete(old);
  separators.add(sep);
  applyLayout();
  return sep;
}
