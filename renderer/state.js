// App state, persistence, and a tiny event bus shared by every view.

import { uid, extractTags, todayStr } from './lib/util.js';

export const api = window.listenote;

export const COURSE_COLORS = [
  { value: '#4f6bd8', label: 'Blue' }, { value: '#2f8f6b', label: 'Green' }, { value: '#c2553a', label: 'Rust' },
  { value: '#8a5bc7', label: 'Purple' }, { value: '#b8860b', label: 'Gold' }, { value: '#2a8ea8', label: 'Teal' },
  { value: '#c2457f', label: 'Pink' }, { value: '#6b7280', label: 'Slate' },
];

export const DEFAULT_SETTINGS = {
  theme: 'system',
  accent: 'indigo',
  provider: 'claude',
  model: 'default',
  effort: '',
  customCommand: '',
  whisperModel: 'base',
  language: 'english',
  skipSeconds: 10,
  autoTranscribe: false,
  recordingNoticeSeen: false,
  recordSource: 'mic',
  recordQuality: 'good',
  noiseReduction: true,
  micId: '',
  outputId: '',
  liveTranscribe: true,
  identifySpeakers: false,
  eq: [0, 0, 0],
  editorWidth: 'normal',
  dateFormat: 'medium',
};

export const S = {
  lib: null,
  notes: {},
  providers: [],
  // view.kind: 'notes' | 'review' | 'assignments' | 'guides' | 'settings'
  view: { kind: 'notes', filter: { type: 'all', id: null }, query: '' },
  noteId: null,
};

// ---------------------------------------------------------------- bus ---

const handlers = new Map();
export const bus = {
  on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, new Set());
    handlers.get(name).add(fn);
    return () => handlers.get(name).delete(fn);
  },
  emit(name, payload) {
    for (const fn of [...(handlers.get(name) || [])]) fn(payload);
  },
};

// -------------------------------------------------------- persistence ---

function emptyLibrary() {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, courses: [], assignments: [], cards: [], guides: [] };
}

export async function loadState() {
  const { library, notes, recovered } = await api.loadAll();
  S.lib = { ...emptyLibrary(), ...(library || {}) };
  S.lib.settings = { ...DEFAULT_SETTINGS, ...(S.lib.settings || {}) };
  // Claude always has a model chosen; "default" is Claude Code's recommended one.
  if (S.lib.settings.provider === 'claude' && !S.lib.settings.model) S.lib.settings.model = 'default';
  for (const key of ['courses', 'assignments', 'cards', 'guides']) if (!Array.isArray(S.lib[key])) S.lib[key] = [];
  S.notes = notes || {};
  // Audio rescued from a recording that was cut short by a crash or quit.
  for (const r of recovered || []) {
    const note = S.notes[r.id];
    if (note && !note.audio) {
      note.audio = { ext: r.ext, mime: r.mime, duration: 0 };
      saveNote(note.id);
    } else if (!note) {
      const rescued = newNote({ title: 'Recovered recording' });
      api.audioLoad(r.id, r.ext).then(({ data }) => api.audioSave(rescued.id, r.ext, data)).then(() => {
        rescued.audio = { ext: r.ext, mime: r.mime, duration: 0 };
        saveNote(rescued.id);
        api.audioDelete(r.id);
      }).catch(() => {});
    }
  }
  return (recovered || []).length;
}

let libTimer = null;
export function saveLib() {
  if (S.frozen) return;
  clearTimeout(libTimer);
  libTimer = setTimeout(() => api.saveLibrary(S.lib).catch(reportSaveError), 250);
}

const noteTimers = new Map();
export function saveNote(id, { now = false } = {}) {
  if (S.frozen) return;
  clearTimeout(noteTimers.get(id));
  const write = () => {
    noteTimers.delete(id);
    if (S.notes[id]) api.saveNote(S.notes[id]).catch(reportSaveError);
  };
  if (now) write(); else noteTimers.set(id, setTimeout(write, 400));
}

export function flushSaves() {
  if (S.frozen) return;
  clearTimeout(libTimer);
  if (S.lib) api.saveLibrary(S.lib).catch(() => {});
  for (const id of [...noteTimers.keys()]) saveNote(id, { now: true });
}

function reportSaveError(err) {
  bus.emit('toast', { message: `Could not save: ${String((err && err.message) || err)}`, kind: 'error' });
}

// -------------------------------------------------------------- notes ---

export function newNote({ title = '', courseId = null } = {}) {
  const now = Date.now();
  const note = {
    id: uid(), title, courseId, created: now, updated: now, pinned: false, archived: false,
    html: '', text: '', tags: [], audio: null, transcript: [], summary: null, chat: [], quiz: null, silence: null,
  };
  S.notes[note.id] = note;
  saveNote(note.id, { now: true });
  return note;
}

export function touchNote(note) {
  note.updated = Date.now();
  note.tags = extractTags(`${note.title} ${note.text}`);
  saveNote(note.id);
}

export async function deleteNote(id) {
  clearTimeout(noteTimers.get(id));
  noteTimers.delete(id);
  delete S.notes[id];
  S.lib.cards = S.lib.cards.filter((c) => c.noteId !== id);
  for (const a of S.lib.assignments) if (a.noteId === id) a.noteId = null;
  saveLib();
  await api.deleteNote(id);
}

export const courseById = (id) => S.lib.courses.find((c) => c.id === id) || null;

export function courseLabel(course) {
  if (!course) return 'No course';
  return course.code ? `${course.code} · ${course.name}` : course.name;
}

export function allNotes() {
  return Object.values(S.notes);
}

export function visibleNotes() {
  const { filter, query } = S.view;
  const q = query.trim().toLowerCase();
  let list = allNotes();
  if (filter.type === 'archive') list = list.filter((n) => n.archived);
  else {
    list = list.filter((n) => !n.archived && !(filter.type !== 'course' && n.courseId && courseById(n.courseId) && courseById(n.courseId).archived));
    if (filter.type === 'course') list = list.filter((n) => n.courseId === filter.id);
    else if (filter.type === 'unfiled') list = list.filter((n) => !n.courseId || !courseById(n.courseId));
    else if (filter.type === 'pinned') list = list.filter((n) => n.pinned);
    else if (filter.type === 'tag') list = list.filter((n) => (n.tags || []).includes(filter.id));
  }
  if (q) {
    // A locked note matches on its title only, even while a recording keeps it open in memory.
    list = list.filter((n) => (n.title || '').toLowerCase().includes(q)
      || (!n.locked && (n.text || '').toLowerCase().includes(q))
      || (!n.locked && (n.transcript || []).some((s) => s.text.toLowerCase().includes(q))));
  }
  return list.sort((a, b) => (b.pinned - a.pinned) || (b.updated - a.updated));
}

export function tagCounts() {
  const counts = new Map();
  for (const n of allNotes()) if (!n.archived) for (const t of n.tags || []) counts.set(t, (counts.get(t) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// ------------------------------------------------------------- school ---

export function dueCards(courseId = null, now = Date.now()) {
  return S.lib.cards.filter((c) => c.due <= now && (!courseId || c.courseId === courseId));
}

export function addAssignment({ title, due = '', courseId = null, noteId = null }) {
  const a = { id: uid(), title, due, courseId, noteId, done: false, created: Date.now() };
  S.lib.assignments.push(a);
  saveLib();
  bus.emit('library');
  return a;
}

export function openAssignments() {
  return S.lib.assignments.filter((a) => !a.done);
}

export function overdueCount() {
  const today = todayStr();
  return openAssignments().filter((a) => a.due && a.due < today).length;
}

export function providerInfo() {
  return S.providers.find((p) => p.id === S.lib.settings.provider) || null;
}

export function applyAppearance() {
  const { theme, accent, editorWidth } = S.lib.settings;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
  document.documentElement.dataset.width = editorWidth;
  api.setTheme(theme);
}

// Dates follow the format chosen in Settings (Noted's "Date format").
export function fmtDate(ts, { weekday = false, time = false } = {}) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  const fmt = S.lib ? S.lib.settings.dateFormat : 'medium';
  const clock = time ? ` ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
  if (fmt === 'iso') return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}${clock}`;
  const opts = { short: { day: 'numeric', month: 'numeric', year: '2-digit' }, medium: { day: 'numeric', month: 'short', year: 'numeric' }, long: { day: 'numeric', month: 'long', year: 'numeric' } }[fmt] || {};
  return d.toLocaleDateString(undefined, weekday ? { ...opts, weekday: 'short' } : opts) + clock;
}
