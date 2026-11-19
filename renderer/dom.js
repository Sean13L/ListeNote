// Small DOM toolkit. Everything on screen is built with h() from real nodes
// and text, never from HTML strings, so user and AI text cannot become markup.

import { parseMarkdown, parseTodo } from './lib/util.js';

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'style') for (const [k, v] of Object.entries(value)) el.style.setProperty(k, v);
      else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key in el && typeof value !== 'string' && !key.startsWith('aria')) el[key] = value;
      else el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export const clear = (el) => { el.replaceChildren(); return el; };

// ------------------------------------------------------------- icons ---
// Hand-drawn 24px stroke icons (no third-party icon set, nothing to license).

const ICONS = {
  plus: 'M12 5v14M5 12h14',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  stop: 'M7 7h10v10H7z',
  play: 'M8 5l11 7-11 7z',
  pause: 'M8 5v14M16 5v14',
  back: 'M11 7l-5 5 5 5M6 12h8a4 4 0 0 1 4 4v1',
  forward: 'M13 7l5 5-5 5M18 12h-8a4 4 0 0 0-4 4v1',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  pin: 'M9 4h6l-1 6 3 3H7l3-3zM12 13v7',
  archive: 'M4 5h16v4H4zM6 9v10h12V9M10 13h4',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  tag: 'M4 4h7l9 9-7 7-9-9zM8 8h.01',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  cards: 'M4 8h13v11H4zM7 5h13v11',
  check: 'M5 12l5 5 9-10',
  checklist: 'M4 7l2 2 3-3M4 15l2 2 3-3M12 8h8M12 16h8',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
  x: 'M6 6l12 12M18 6L6 18',
  calendar: 'M5 6h14v14H5zM5 10h14M9 4v4M15 4v4',
  notes: 'M6 4h12v16H6zM9 8h6M9 12h6M9 16h3',
  guide: 'M4 6l8-3 8 3-8 3zM7 8v6c0 1.5 2.5 3 5 3s5-1.5 5-3V8M20 6v7',
  edit: 'M4 20h4l11-11-4-4L4 16zM13 7l4 4',
  lock: 'M7 11h10v9H7zM9 11V8a3 3 0 0 1 6 0v3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  send: 'M4 12l16-8-6 16-3-7z',
  chevron: 'M9 6l6 6-6 6',
  folder: 'M3 6h7l2 3h9v10H3z',
  bullet: 'M5 7h.01M5 12h.01M5 17h.01M9 7h11M9 12h11M9 17h11',
  highlight: 'M5 19h5M14 4l6 6-9 9H7v-4zM11 7l6 6',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01',
  paperclip: 'M8 12l6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l7-7',
  refresh: 'M5 12a7 7 0 0 1 12-5l2 2M19 4v5h-5M19 12a7 7 0 0 1-12 5l-2-2M5 20v-5h5',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name, size = 18) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', name === 'stop' || name === 'play' ? 'currentColor' : 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icon');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name] || ICONS.more);
  svg.append(path);
  return svg;
}

export function iconButton(name, label, onClick, extra = {}) {
  return h('button', { type: 'button', class: `icon-btn ${extra.class || ''}`, 'aria-label': label, title: label, onClick, ...extra.attrs }, icon(name, extra.size || 18));
}

export function button(label, onClick, { kind = 'default', iconName, attrs = {} } = {}) {
  return h('button', { type: 'button', class: `btn btn-${kind}`, onClick, ...attrs }, iconName ? icon(iconName, 16) : null, h('span', { text: label }));
}

// ------------------------------------------------------------ toasts ---

export function toast(message, kind = 'info') {
  const host = document.getElementById('toasts');
  const el = h('div', { class: `toast toast-${kind}` }, message);
  host.append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 9000 : 4000);
}

export function errorMessage(err) {
  return String((err && err.message) || err || 'Something went wrong.').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

// ----------------------------------------------------------- dialogs ---
// Native <dialog> gives focus trapping, Escape-to-close and a backdrop.

function openDialog(build) {
  return new Promise((resolve) => {
    const dialog = h('dialog', { class: 'dialog' });
    // Resolve directly rather than from the dialog's "close" event: Chromium
    // delivers that event on an animation frame, which never comes while the
    // window is hidden.
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      resolve(value);
    };
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(undefined); });
    dialog.addEventListener('close', () => close(undefined));
    dialog.addEventListener('click', (e) => { if (e.target === dialog) close(undefined); });
    build(dialog, close);
    document.body.append(dialog);
    dialog.showModal();
  });
}

export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false, requireText = null }) {
  return openDialog((dialog, close) => {
    const id = `dlg-${Date.now()}`;
    dialog.setAttribute('aria-labelledby', id);
    const ok = button(confirmLabel, () => close(true), { kind: danger ? 'danger' : 'primary' });
    let input = null;
    if (requireText) {
      ok.disabled = true;
      input = h('input', { type: 'text', class: 'input', id: `${id}-in`, autocomplete: 'off', onInput: () => { ok.disabled = input.value.trim() !== requireText; } });
    }
    dialog.append(
      h('h2', { id, text: title }),
      h('p', { class: 'dialog-body', text: body }),
      input ? h('label', { class: 'field', for: `${id}-in` }, h('span', { text: `Type ${requireText} to confirm` }), input) : null,
      h('div', { class: 'dialog-actions' }, button('Cancel', () => close(false)), ok),
    );
  }).then((v) => v === true);
}

// fields: [{ name, label, type: 'text'|'date'|'select'|'swatch'|'textarea', value, options, required, placeholder, hint }]
export function formDialog({ title, fields, submitLabel = 'Save', intro = null }) {
  return openDialog((dialog, close) => {
    const id = `dlg-${Date.now()}`;
    dialog.setAttribute('aria-labelledby', id);
    const controls = {};
    const rows = fields.map((f) => {
      const fid = `${id}-${f.name}`;
      let control;
      if (f.type === 'select') {
        control = h('select', { id: fid, class: 'input' }, f.options.map((o) => h('option', { value: o.value, selected: o.value === f.value, text: o.label })));
      } else if (f.type === 'textarea') {
        control = h('textarea', { id: fid, class: 'input', rows: 3, placeholder: f.placeholder || '' });
        control.value = f.value || '';
      } else if (f.type === 'swatch') {
        control = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': f.label },
          f.options.map((o) => h('label', { class: 'swatch', style: { '--swatch': o.value } },
            h('input', { type: 'radio', name: fid, value: o.value, checked: o.value === f.value }),
            h('span', { class: 'sr-only', text: o.label }))));
        controls[f.name] = { get value() { const c = control.querySelector('input:checked'); return c ? c.value : f.value; } };
        return h('div', { class: 'field' }, h('span', { text: f.label }), control);
      } else {
        control = h('input', { id: fid, class: 'input', type: f.type || 'text', value: f.value || '', placeholder: f.placeholder || '', required: !!f.required, autocomplete: 'off' });
      }
      controls[f.name] = control;
      return h('label', { class: 'field', for: fid }, h('span', { text: f.label }), control, f.hint ? h('small', { text: f.hint }) : null);
    });
    const form = h('form', { method: 'dialog', novalidate: false, onSubmit: (e) => {
      e.preventDefault();
      const out = {};
      for (const f of fields) out[f.name] = String(controls[f.name].value || '').trim();
      close(out);
    } },
      h('h2', { id, text: title }),
      intro ? h('p', { class: 'dialog-body', text: intro }) : null,
      rows,
      h('div', { class: 'dialog-actions' }, button('Cancel', () => close(undefined)), h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel)),
    );
    dialog.append(form);
  });
}

// -------------------------------------------------------------- menu ---

let openMenu = null;

export function closeMenu() {
  if (openMenu) { openMenu.remove(); openMenu = null; }
}

// items: [{ label, icon, onSelect, danger, checked } | 'sep']
export function showMenu(anchor, items) {
  closeMenu();
  const menu = h('div', { class: 'menu', role: 'menu' });
  const buttons = [];
  for (const item of items) {
    if (!item) continue;
    if (item === 'sep') { menu.append(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
    const b = h('button', {
      type: 'button', role: item.checked === undefined ? 'menuitem' : 'menuitemcheckbox',
      'aria-checked': item.checked === undefined ? null : String(!!item.checked),
      class: `menu-item ${item.danger ? 'danger' : ''}`,
      onClick: () => { closeMenu(); anchor.focus(); item.onSelect(); },
    }, item.checked ? icon('check', 15) : item.icon ? icon(item.icon, 15) : h('span', { class: 'menu-gap' }), h('span', { text: item.label }));
    buttons.push(b);
    menu.append(b);
  }
  document.body.append(menu);
  const r = anchor.getBoundingClientRect();
  const mw = menu.offsetWidth;
  const mh = menu.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw));
  const top = r.bottom + mh + 8 > window.innerHeight ? Math.max(8, r.top - mh - 4) : r.bottom + 4;
  menu.style.setProperty('left', `${left}px`);
  menu.style.setProperty('top', `${top}px`);
  openMenu = menu;
  if (buttons[0]) buttons[0].focus();

  menu.addEventListener('keydown', (e) => {
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); buttons[(i + 1) % buttons.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length].focus(); }
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(); anchor.focus(); }
  });
  setTimeout(() => {
    const away = (e) => {
      if (openMenu !== menu) { document.removeEventListener('mousedown', away, true); return; }
      if (!menu.contains(e.target)) { closeMenu(); document.removeEventListener('mousedown', away, true); }
    };
    document.addEventListener('mousedown', away, true);
  });
}

// ---------------------------------------------------------- markdown ---

function inlineNodes(tokens, onSeek) {
  return tokens.map((tok) => {
    if (tok.t === 'b') return h('strong', { text: tok.v });
    if (tok.t === 'i') return h('em', { text: tok.v });
    if (tok.t === 'code') return h('code', { text: tok.v });
    if (tok.t === 'ts') {
      if (!onSeek || tok.sec === null) return document.createTextNode(`[${tok.v}]`);
      return h('button', { type: 'button', class: 'ts', 'aria-label': `Play from ${tok.v}`, title: 'Play this moment', onClick: () => onSeek(tok.sec) }, tok.v);
    }
    return document.createTextNode(tok.v);
  });
}

// onTask({ title, due }) -> called when the student adds a to-do to assignments.
export function renderMarkdown(md, { onSeek = null, onTask = null } = {}) {
  const root = h('div', { class: 'md' });
  for (const block of parseMarkdown(md)) {
    if (block.type === 'h') root.append(h(`h${block.level + 1}`, null, inlineNodes(block.inline, onSeek)));
    else if (block.type === 'p') root.append(h('p', null, inlineNodes(block.inline, onSeek)));
    else {
      root.append(h(block.type, null, block.items.map((item) => {
        if (item.task && onTask) {
          const todo = parseTodo(item.raw);
          const add = h('button', { type: 'button', class: 'btn btn-small', onClick: () => { onTask(todo); add.disabled = true; add.textContent = 'Added'; } }, 'Add to assignments');
          return h('li', { class: 'task' }, h('span', null, inlineNodes(item.inline, onSeek)), add);
        }
        return h('li', null, inlineNodes(item.inline, onSeek));
      })));
    }
  }
  return root;
}

export function emptyState(iconName, title, body, ...actions) {
  return h('div', { class: 'empty' }, icon(iconName, 34), h('h2', { text: title }), body ? h('p', { text: body }) : null, actions.length ? h('div', { class: 'empty-actions' }, actions) : null);
}

export async function copyText(text) {
  try { await window.listenote.copyText(String(text)); toast('Copied.'); } catch { toast('Could not copy.', 'error'); }
}
