// The note editor. Each line can carry a timestamp (data-t, in seconds) that
// links it to a moment in the recording. Lines typed while recording or playing
// are stamped automatically.

import { h, icon } from './dom.js';
import { fmtTime } from './lib/util.js';

const ALLOWED = new Set(['DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'MARK', 'H2', 'H3', 'UL', 'OL', 'LI', 'IMG']);
// Images may only point at the note's own attachments.
const IMG_SRC = /^app:\/\/local\/attachments\/[a-z0-9]{8,40}-[a-z0-9]{8,40}\.(png|jpe?g|gif|webp)$/;
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'TEMPLATE', 'SVG', 'MATH']);
const LINE_SELECTOR = 'div, h2, h3, li';

// Rebuild stored or pasted HTML from an allow-list: a handful of formatting
// tags, and the one attribute we own (data-t). Everything else is unwrapped or
// dropped, so saved notes can never smuggle scripts or styles back in.
function cleanChildren(source, out) {
  for (const node of source.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) { out.append(document.createTextNode(node.nodeValue)); continue; }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = node.tagName.toUpperCase();
    if (DROP.has(tag)) continue;
    const mapped = tag === 'P' ? 'DIV' : tag;
    if (!ALLOWED.has(mapped)) { cleanChildren(node, out); continue; }
    if (mapped === 'IMG') {
      const src = node.getAttribute('src') || '';
      if (IMG_SRC.test(src)) out.append(Object.assign(document.createElement('img'), { src, alt: node.getAttribute('alt') || '' }));
      continue;
    }
    const el = document.createElement(mapped);
    const t = node.getAttribute('data-t');
    if (t && /^\d+(\.\d+)?$/.test(t)) setStamp(el, Number(t));
    cleanChildren(node, el);
    out.append(el);
  }
}

export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const frag = document.createDocumentFragment();
  cleanChildren(doc.body, frag);
  return frag;
}

function setStamp(el, seconds) {
  el.setAttribute('data-t', String(Math.round(seconds * 10) / 10));
  el.setAttribute('data-ts', fmtTime(seconds));
}

function clearStamp(el) {
  el.removeAttribute('data-t');
  el.removeAttribute('data-ts');
}

const isLeafLine = (el) => !el.querySelector(LINE_SELECTOR);

export function createEditor({ html, getStampTime, onChange, onSeek, onPasteImage = null }) {
  const el = h('div', {
    class: 'editor', contenteditable: 'true', role: 'textbox', 'aria-multiline': 'true',
    'aria-label': 'Note text', spellcheck: true, 'data-placeholder': 'Start typing. Lines you write while recording are linked to that moment.',
  });
  const known = new WeakSet();

  const lines = () => [...el.querySelectorAll(LINE_SELECTOR)].filter(isLeafLine);
  const markKnown = () => { for (const line of el.querySelectorAll(LINE_SELECTOR)) known.add(line); };

  function ensureStructure() {
    if (!el.firstChild) {
      const div = h('div', null, h('br'));
      el.append(div);
      const range = document.createRange();
      range.setStart(div, 0);
      range.collapse(true);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }
    // Text typed straight into the root (no line element yet): wrap it.
    for (const node of [...el.childNodes]) {
      if (node.nodeType === Node.TEXT_NODE || (node.nodeType === Node.ELEMENT_NODE && !node.matches('div, h2, h3, ul, ol'))) {
        const sel = window.getSelection();
        const hadCaret = sel.rangeCount && node.contains(sel.anchorNode);
        const offset = hadCaret ? sel.anchorOffset : 0;
        const anchor = sel.anchorNode;
        const div = document.createElement('div');
        node.replaceWith(div);
        div.append(node);
        if (hadCaret) {
          const range = document.createRange();
          range.setStart(anchor, Math.min(offset, anchor.nodeType === Node.TEXT_NODE ? anchor.nodeValue.length : anchor.childNodes.length));
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  }

  function currentLine() {
    const sel = window.getSelection();
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) return null;
    let node = sel.anchorNode.nodeType === Node.ELEMENT_NODE ? sel.anchorNode : sel.anchorNode.parentElement;
    while (node && node !== el) {
      if (node.matches(LINE_SELECTOR) && isLeafLine(node)) return node;
      node = node.parentElement;
    }
    return null;
  }

  function refreshEmptyFlag() {
    el.classList.toggle('is-empty', !el.textContent.trim() && el.querySelectorAll(LINE_SELECTOR).length <= 1);
  }

  function afterEdit() {
    ensureStructure();
    // Lines created by this edit (Enter, paste) inherit a clone of the previous
    // line's stamp. Strip it; they get their own time below if one applies.
    const fresh = [];
    for (const line of el.querySelectorAll(LINE_SELECTOR)) {
      if (!known.has(line)) { known.add(line); if (isLeafLine(line)) { clearStamp(line); fresh.push(line); } }
    }
    const t = getStampTime();
    if (t !== null) {
      for (const line of fresh) if (line.textContent.trim()) setStamp(line, t);
      const line = currentLine();
      if (line && !line.hasAttribute('data-t') && line.textContent.trim()) setStamp(line, t);
    }
    // A stamp left behind on a line that is now empty moves down with its text.
    for (const line of fresh) {
      const prev = line.previousElementSibling;
      if (prev && prev.hasAttribute('data-t') && !prev.textContent.trim() && line.textContent.trim() && !line.hasAttribute('data-t')) {
        setStamp(line, Number(prev.getAttribute('data-t')));
        clearStamp(prev);
      }
    }
    refreshEmptyFlag();
    onChange();
  }

  el.addEventListener('input', afterEdit);

  el.addEventListener('paste', (e) => {
    e.preventDefault();
    const image = [...((e.clipboardData && e.clipboardData.files) || [])].find((f) => /^image\/(png|jpeg|gif|webp)$/.test(f.type));
    if (image && onPasteImage) { onPasteImage(image).then((src) => src && insertImage(src)); return; }
    const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
    if (text) document.execCommand('insertText', false, text);
  });

  el.addEventListener('drop', (e) => e.preventDefault());

  // The timestamp sits in the left gutter (a CSS ::before). A click there lands
  // on the line element, left of its text box.
  el.addEventListener('click', (e) => {
    const line = e.target instanceof Element ? e.target.closest('[data-t]') : null;
    if (!line || !el.contains(line)) return;
    if (e.clientX < line.getBoundingClientRect().left) {
      e.preventDefault();
      onSeek(Number(line.getAttribute('data-t')));
    }
  });

  el.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); exec('bold'); }
      else if (k === 'i') { e.preventDefault(); exec('italic'); }
      else if (k === 'u') { e.preventDefault(); exec('underline'); }
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); toggleHighlight(); }
  });

  function exec(command, value = null) {
    if (el.getAttribute('contenteditable') !== 'true') return;
    el.focus();
    document.execCommand(command, false, value);
    afterEdit();
  }

  function insertImage(src, alt = '') {
    if (el.getAttribute('contenteditable') !== 'true') return;
    el.focus();
    const line = currentLine();
    const div = h('div', null, h('img', { src, alt }));
    known.add(div);
    if (line) line.after(div); else el.append(div);
    afterEdit();
  }

  function toggleBlock(tag) {
    const line = currentLine();
    const t = line && line.getAttribute('data-t');
    const isOn = line && line.tagName === tag.toUpperCase();
    exec('formatBlock', isOn ? 'div' : tag);
    const now = currentLine();
    if (now && t && !now.hasAttribute('data-t')) setStamp(now, Number(t));
  }

  function toggleHighlight() {
    if (el.getAttribute('contenteditable') !== 'true') return;
    const sel = window.getSelection();
    if (!sel.rangeCount || !el.contains(sel.anchorNode)) return;
    const range = sel.getRangeAt(0);
    const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const inside = start && start.closest('mark');
    if (inside && el.contains(inside)) {
      inside.replaceWith(...inside.childNodes);
    } else {
      if (range.collapsed) return;
      // Highlight line by line so a selection across lines stays valid HTML.
      const targets = lines().filter((line) => range.intersectsNode(line));
      for (const line of targets) {
        const r = document.createRange();
        r.selectNodeContents(line);
        if (line.contains(range.startContainer)) r.setStart(range.startContainer, range.startOffset);
        if (line.contains(range.endContainer)) r.setEnd(range.endContainer, range.endOffset);
        if (r.collapsed) continue;
        const mark = document.createElement('mark');
        mark.append(r.extractContents());
        for (const nested of mark.querySelectorAll('mark')) nested.replaceWith(...nested.childNodes);
        r.insertNode(mark);
      }
      sel.removeAllRanges();
    }
    el.normalize();
    afterEdit();
  }

  const tool = (label, iconOrText, action, shortcut) => h('button', {
    type: 'button', class: 'tool', 'aria-label': label, title: shortcut ? `${label} (${shortcut})` : label,
    onMousedown: (e) => e.preventDefault(), onClick: action,
  }, iconOrText);
  const mod = window.listenote.platform === 'darwin' ? '⌘' : 'Ctrl+';
  const toolbar = h('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
    tool('Bold', h('b', { text: 'B' }), () => exec('bold'), `${mod}B`),
    tool('Italic', h('i', { text: 'I' }), () => exec('italic'), `${mod}I`),
    tool('Underline', h('u', { text: 'U' }), () => exec('underline'), `${mod}U`),
    tool('Highlight', icon('highlight', 16), toggleHighlight, `${mod}⇧H`),
    h('span', { class: 'tool-sep', 'aria-hidden': 'true' }),
    tool('Heading', h('span', { text: 'H' }), () => toggleBlock('h2')),
    tool('Bulleted list', icon('bullet', 16), () => exec('insertUnorderedList')),
  );

  el.append(sanitizeHtml(html));
  if (!el.firstChild) el.append(h('div', null, h('br')));
  markKnown();
  refreshEmptyFlag();
  try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch { /* optional */ }

  let nowLine = null;

  return {
    el,
    toolbar,
    getHtml: () => el.innerHTML,
    getText: () => lines().map((l) => l.textContent).join('\n').trim(),
    getLines: () => lines().map((l) => ({ t: l.hasAttribute('data-t') ? Number(l.getAttribute('data-t')) : null, text: l.textContent })),
    focus: () => el.focus(),
    setReadOnly(readOnly) {
      el.setAttribute('contenteditable', readOnly ? 'false' : 'true');
      el.classList.toggle('read-only', readOnly);
      toolbar.classList.toggle('disabled', readOnly);
      for (const b of toolbar.querySelectorAll('button')) b.disabled = readOnly;
    },
    // Time of the line the caret is on, or the nearest stamped line above it.
    caretTime() {
      let line = currentLine();
      while (line) {
        if (line.hasAttribute('data-t')) return Number(line.getAttribute('data-t'));
        const all = lines();
        const i = all.indexOf(line);
        line = i > 0 ? all[i - 1] : null;
      }
      return null;
    },
    // Highlight the line being spoken during playback.
    setPlayhead(t) {
      // Stamps are not always in page order (a line added on a second listen
      // can sit anywhere), so pick the latest stamp at or before the playhead.
      let best = null;
      let bestT = -1;
      if (t !== null) {
        for (const line of el.querySelectorAll('[data-t]')) {
          const lt = Number(line.getAttribute('data-t'));
          if (lt <= t + 0.25 && lt >= bestT) { best = line; bestT = lt; }
        }
      }
      if (best === nowLine) return;
      if (nowLine) nowLine.classList.remove('now');
      if (best) best.classList.add('now');
      nowLine = best;
    },
    insertImage,
    appendLines(items) {
      const last = el.lastElementChild;
      if (last && !last.textContent.trim() && el.children.length === 1) last.remove();
      for (const item of items) {
        const div = h('div', null, item.text);
        if (Number.isFinite(item.t)) setStamp(div, item.t);
        known.add(div);
        el.append(div);
      }
      refreshEmptyFlag();
      onChange();
    },
    cleanHtmlForExport() {
      if (nowLine) nowLine.classList.remove('now');
      const html = el.innerHTML;
      if (nowLine) nowLine.classList.add('now');
      return html;
    },
  };
}
