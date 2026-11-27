// App shell: sidebar, note list, routing between views.

import {
  api, S, bus, loadState, saveLib, flushSaves, newNote, courseById, courseLabel, visibleNotes, allNotes, tagCounts,
  dueCards, openAssignments, overdueCount, providerInfo, applyAppearance, COURSE_COLORS, fmtDate, saveNote,
} from './state.js';
import { mountMaterials } from './materials.js';
import { separator, applyLayout, togglePane } from './layout.js';
import { mountSchedule, mountMaster, sessionStartMs, openSession } from './schedule.js';
import { todayStr } from './lib/util.js';
import { h, clear, icon, iconButton, button, toast, confirmDialog, formDialog, showMenu, emptyState, errorMessage } from './dom.js';
import { mountNote, unmountNote, currentNoteId, toggleRecord, stopRecording, togglePlay, playFromCaret, importAudio, seek, openMoreMenu } from './noteview.js';
import { mountReview, mountAssignments, mountGuides, unmountStudy } from './study.js';
import { mountSettings } from './settings.js';
import { recorder, transcription } from './audio.js';
import { fmtTime, uid, snippet } from './lib/util.js';

const $app = document.getElementById('app');
const $sidebar = document.getElementById('sidebar');
const $list = document.getElementById('list');
const $main = document.getElementById('main');

let searchInput = null;
let sidebarBody = null;
let recBox = null;

// ============================================================== routing ===

S.go = (view) => {
  S.view = { filter: S.view.filter, query: S.view.query, ...view };
  if (view.kind === 'notes' && view.filter) S.view.filter = view.filter;
  route();
};

S.pendingSeek = null;
S.openNote = (id, { seek: seekTo = null } = {}) => {
  S.noteId = id && S.notes[id] ? id : null;
  S.pendingSeek = seekTo === undefined ? null : seekTo;
  if (S.view.kind !== 'notes') S.view = { kind: 'notes', filter: { type: 'all', id: null }, query: '' };
  // Make sure the opened note is visible in the list.
  if (S.noteId && !visibleNotes().some((n) => n.id === S.noteId)) { S.view.filter = { type: S.notes[S.noteId].archived ? 'archive' : 'all', id: null }; S.view.query = ''; if (searchInput) searchInput.value = ''; }
  route();
};

function route() {
  const { kind } = S.view;
  $app.classList.toggle('no-list', kind !== 'notes');
  renderSidebar();
  renderRecPill();
  if (kind !== 'notes') { unmountNote(); }
  unmountStudy();
  if (kind === 'notes') {
    renderList();
    const note = S.noteId ? S.notes[S.noteId] : null;
    if (note) {
      if (currentNoteId() !== note.id || !$main.querySelector('.note')) mountNote($main, note);
      else if (S.pendingSeek !== null && S.pendingSeek !== undefined) { seek(S.pendingSeek); S.pendingSeek = null; }
    }
    else { unmountNote(); renderWelcome(); }
  } else if (kind === 'review') mountReview($main, { courseId: S.view.courseId || null });
  else if (kind === 'assignments') mountAssignments($main);
  else if (kind === 'guides') mountGuides($main);
  else if (kind === 'schedule') mountSchedule($main);
  else if (kind === 'master') mountMaster($main, { courseId: S.view.courseId || null });
  else if (kind === 'materials') mountMaterials($main, { courseId: S.view.courseId });
  else if (kind === 'settings') mountSettings($main).then(renderSidebar);
}

// ============================================================== sidebar ===

function navItem({ label, iconName, active, onClick, count = null, countKind = '', color = null, trailing = null }) {
  return h('li', { class: 'nav-row' },
    h('button', { type: 'button', class: `nav-item ${active ? 'active' : ''}`, 'aria-current': active ? 'page' : null, onClick },
      color ? h('span', { class: 'dot', style: { '--dot': color } }) : icon(iconName, 16),
      h('span', { class: 'nav-label', text: label }),
      count ? h('span', { class: `count ${countKind}`, text: String(count) }) : null),
    trailing);
}

function buildSidebar() {
  searchInput = h('input', { type: 'search', class: 'input search', placeholder: 'Search', 'aria-label': 'Search notes and transcripts',
    onInput: () => {
      S.view.query = searchInput.value;
      if (S.view.kind !== 'notes') { S.go({ kind: 'notes' }); searchInput.focus(); } else renderList();
    } });
  sidebarBody = h('div', { class: 'sidebar-body' });
  $sidebar.append(
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, icon('mic', 15)), h('span', { class: 'brand-name', text: 'ListeNote' }),
      iconButton('chevron', 'Hide sidebar', () => togglePane('side'), { class: 'side-toggle hide-side', size: 16 })),
    h('div', { class: 'sidebar-top' },
      h('div', { class: 'search-wrap' }, icon('search', 15), searchInput),
      button('New note', () => createNote(), { kind: 'primary', iconName: 'plus', attrs: { class: 'btn btn-primary btn-block' } }),
      recBox = h('div', { class: 'rec-box', hidden: true })),
    sidebarBody,
  );
}

// Shown on every view while a recording runs: jump back to its note, or stop it.
function renderRecPill() {
  if (!recBox) return;
  clear(recBox);
  // On the recording note itself, the record bar already shows time and Stop.
  const shown = recorder.active && !(S.view.kind === 'notes' && S.noteId === recorder.noteId);
  recBox.hidden = !shown;
  if (!shown) return;
  const note = S.notes[recorder.noteId];
  recBox.append(
    h('button', { type: 'button', class: 'rec-open', title: 'Go to the note being recorded', onClick: () => S.openNote(recorder.noteId) },
      h('span', { class: `rec-dot ${recorder.paused ? 'paused' : ''}`, 'aria-hidden': 'true' }),
      h('span', { class: 'rec-label' }, h('span', { class: recorder.paused ? '' : 'sr-only', text: recorder.paused ? 'Paused: ' : 'Recording: ' }), (note && note.title) || 'Untitled lecture'),
      h('span', { class: 'rec-box-time', text: fmtTime(recorder.elapsed()) })),
    button('Stop', () => stopRecording(), { attrs: { class: 'btn btn-small', 'aria-label': 'Stop recording' } }));
}

// A sidebar heading that folds its section away. Folded sections are remembered.
function folded() {
  if (!S.lib.settings.collapsed) S.lib.settings.collapsed = {};
  return S.lib.settings.collapsed;
}
function sectionHead(key, label, { level = 'h2', cls = 'nav-heading', trailing = null } = {}) {
  const open = !folded()[key];
  const toggle = h('button', { type: 'button', class: 'nav-toggle', 'aria-expanded': String(open), 'data-sec': key,
    onClick: () => {
      folded()[key] = open;
      saveLib();
      renderSidebar();
      const again = sidebarBody.querySelector(`[data-sec="${CSS.escape(key)}"]`);
      if (again) again.focus();
    } }, icon('chevron', 12), h('span', { text: label }));
  return { open, el: h('div', { class: 'nav-heading-row' }, h(level, { class: cls }, toggle), trailing) };
}

function renderSidebar() {
  const { kind, filter } = S.view;
  const isFilter = (type, id = null) => kind === 'notes' && filter.type === type && filter.id === id;
  const active = allNotes().filter((n) => !n.archived);
  const due = dueCards().length;
  const todo = openAssignments().length;
  const overdue = overdueCount();
  clear(sidebarBody);

  sidebarBody.append(h('ul', { class: 'nav' },
    navItem({ label: 'All notes', iconName: 'notes', active: isFilter('all'), count: active.length, onClick: () => S.go({ kind: 'notes', filter: { type: 'all', id: null } }) }),
    active.some((n) => n.pinned) ? navItem({ label: 'Pinned', iconName: 'pin', active: isFilter('pinned'), onClick: () => S.go({ kind: 'notes', filter: { type: 'pinned', id: null } }) }) : null,
  ));

  const study = sectionHead('study', 'Study');
  sidebarBody.append(study.el);
  if (study.open) sidebarBody.append(h('ul', { class: 'nav' },
    navItem({ label: 'Schedule', iconName: 'calendar', active: kind === 'schedule', count: (S.lib.sessions || []).filter((s) => s.date === todayStr()).length, onClick: () => S.go({ kind: 'schedule' }) }),
    navItem({ label: 'Master notes', iconName: 'copy', active: kind === 'master', onClick: () => S.go({ kind: 'master', courseId: S.view.filter.type === 'course' ? S.view.filter.id : null }) }),
    navItem({ label: 'Review flashcards', iconName: 'cards', active: kind === 'review', count: due, countKind: due ? 'accent' : '', onClick: () => S.go({ kind: 'review', courseId: null }) }),
    navItem({ label: 'Assignments', iconName: 'checklist', active: kind === 'assignments', count: todo, countKind: overdue ? 'alert' : '', onClick: () => S.go({ kind: 'assignments' }) }),
    navItem({ label: 'Study guides', iconName: 'guide', active: kind === 'guides', onClick: () => S.go({ kind: 'guides' }) }),
  ));

  // Courses, grouped by term.
  const courses = S.lib.courses.filter((c) => !c.archived);
  const terms = [...new Set(courses.map((c) => c.term || ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : b.localeCompare(a)));
  const coursesHead = sectionHead('courses', 'Courses', { trailing: iconButton('plus', 'Add a course', () => editCourse(null), { size: 15 }) });
  sidebarBody.append(coursesHead.el);
  if (coursesHead.open && !courses.length) sidebarBody.append(h('p', { class: 'nav-empty', text: 'Add your courses to keep each class\'s lectures, flashcards and deadlines together.' }));
  // Folders are the course's `term` field, so courses saved before folders existed keep their grouping.
  for (const term of coursesHead.open ? terms : []) {
    if (terms.length > 1 || term) {
      const more = term ? iconButton('more', `Options for folder ${term}`, () => showMenu(more, [
        { label: 'Add a course here', icon: 'plus', onSelect: () => editCourse(null, { term }) },
        { label: 'Rename folder…', icon: 'edit', onSelect: () => renameFolder(term) },
      ]), { size: 15, class: 'row-more' }) : null;
      const head = sectionHead(`folder:${term}`, term || 'No folder', { level: 'h3', cls: 'nav-term', trailing: more });
      head.el.classList.add('nav-row');
      sidebarBody.append(head.el);
      if (!head.open) continue;
    }
    sidebarBody.append(h('ul', { class: 'nav' }, courses.filter((c) => (c.term || '') === term).map((c) => {
      const more = iconButton('more', `Options for ${c.name}`, () => showMenu(more, [
        { label: 'Edit course', icon: 'edit', onSelect: () => editCourse(c) },
        { label: 'Move to folder…', icon: 'folder', onSelect: () => moveToFolder(c) },
        { label: 'Course materials…', icon: 'book', onSelect: () => S.go({ kind: 'materials', courseId: c.id }) },
        { label: 'New master note…', icon: 'copy', onSelect: () => S.go({ kind: 'master', courseId: c.id }) },
        { label: 'Review this course', icon: 'cards', onSelect: () => S.go({ kind: 'review', courseId: c.id }) },
        'sep',
        { label: 'Archive course', icon: 'archive', onSelect: () => { c.archived = true; saveLib(); route(); toast(`${c.name} archived. Find it under Archive.`); } },
        { label: 'Delete course…', icon: 'trash', danger: true, onSelect: () => removeCourse(c) },
      ]), { size: 15, class: 'row-more' });
      return navItem({ label: c.code ? `${c.code} ${c.name}` : c.name, color: c.color, active: isFilter('course', c.id), count: active.filter((n) => n.courseId === c.id).length,
        onClick: () => S.go({ kind: 'notes', filter: { type: 'course', id: c.id } }), trailing: more });
    })));
  }
  const archivedCourses = S.lib.courses.filter((c) => c.archived);
  if (archivedCourses.length && S.view.kind === 'notes' && S.view.filter.type === 'archive') {
    sidebarBody.append(h('h3', { class: 'nav-term', text: 'Archived courses' }), h('ul', { class: 'nav' }, archivedCourses.map((c) => {
      const more = iconButton('more', `Options for ${c.name}`, () => showMenu(more, [
        { label: 'Restore course', icon: 'archive', onSelect: () => { c.archived = false; saveLib(); route(); } },
        { label: 'Delete course…', icon: 'trash', danger: true, onSelect: () => removeCourse(c) },
      ]), { size: 15, class: 'row-more' });
      return navItem({ label: c.name, color: c.color, active: isFilter('course', c.id), onClick: () => S.go({ kind: 'notes', filter: { type: 'course', id: c.id } }), trailing: more });
    })));
  }
  const unfiled = active.filter((n) => !n.courseId || !courseById(n.courseId)).length;
  if (courses.length && unfiled) {
    sidebarBody.append(h('ul', { class: 'nav' }, navItem({ label: 'No course', iconName: 'folder', active: isFilter('unfiled'), count: unfiled, onClick: () => S.go({ kind: 'notes', filter: { type: 'unfiled', id: null } }) })));
  }

  const tags = tagCounts();
  if (tags.length) {
    const tagsHead = sectionHead('tags', 'Tags');
    sidebarBody.append(tagsHead.el);
    if (tagsHead.open) sidebarBody.append(h('ul', { class: 'nav' }, tags.slice(0, 30).map(([tag, n]) =>
      navItem({ label: `#${tag}`, iconName: 'tag', active: isFilter('tag', tag), count: n, onClick: () => S.go({ kind: 'notes', filter: { type: 'tag', id: tag } }) }))));
  }

  const p = providerInfo();
  const aiOk = p && p.available;
  sidebarBody.append(h('div', { class: 'sidebar-foot' }, h('ul', { class: 'nav' },
    allNotes().some((n) => n.archived) || S.lib.courses.some((c) => c.archived) ? navItem({ label: 'Archive', iconName: 'archive', active: isFilter('archive'), onClick: () => S.go({ kind: 'notes', filter: { type: 'archive', id: null } }) }) : null,
    navItem({ label: 'Settings', iconName: 'settings', active: kind === 'settings', onClick: () => S.go({ kind: 'settings' }) })),
  h('button', { type: 'button', class: `ai-status ${aiOk ? 'ok' : 'warn'}`, onClick: () => S.go({ kind: 'settings' }) },
    h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
    h('span', { text: aiOk ? `AI: ${p.label}` : 'AI not set up' }))));
}

const folderNames = () => [...new Set(S.lib.courses.map((c) => c.term).filter(Boolean))].sort();

async function editCourse(course, { term = '' } = {}) {
  const out = await formDialog({
    title: course ? 'Edit course' : 'Add a course',
    submitLabel: course ? 'Save' : 'Add course',
    fields: [
      { name: 'name', label: 'Course name', value: course ? course.name : '', required: true, placeholder: 'Intro to Biology' },
      { name: 'code', label: 'Course code (optional)', value: course ? course.code : '', placeholder: 'BIO 101' },
      { name: 'term', label: 'Folder (optional)', value: course ? course.term : term, placeholder: 'Fall 2026', list: folderNames(), hint: 'Courses are grouped into folders in the sidebar. Type a new name to make a folder.' },
      { name: 'color', label: 'Colour', type: 'swatch', value: course ? course.color : COURSE_COLORS[S.lib.courses.length % COURSE_COLORS.length].value, options: COURSE_COLORS },
    ],
  });
  if (!out || !out.name) return;
  if (course) Object.assign(course, out);
  else {
    const created = { id: uid(), archived: false, ...out };
    S.lib.courses.push(created);
    if (S.view.kind === 'notes') S.view.filter = { type: 'course', id: created.id };
  }
  saveLib();
  route();
}

async function moveToFolder(course) {
  const out = await formDialog({
    title: `Move ${course.name}`, submitLabel: 'Move',
    fields: [{ name: 'term', label: 'Folder', value: course.term || '', placeholder: 'Fall 2026', list: folderNames(), hint: 'Pick a folder or type a new name. Leave it empty to take the course out of its folder.' }],
  });
  if (!out) return;
  course.term = out.term;
  saveLib();
  renderSidebar();
}

async function renameFolder(term) {
  const out = await formDialog({
    title: 'Rename folder', submitLabel: 'Rename',
    fields: [{ name: 'term', label: 'Folder name', value: term, list: folderNames().filter((f) => f !== term), hint: 'Use an existing name to merge the two folders. Leave it empty to remove the folder and keep its courses.' }],
  });
  if (!out || out.term === term) return;
  for (const c of S.lib.courses) if (c.term === term) c.term = out.term;
  const f = folded();
  if (f[`folder:${term}`]) { f[`folder:${out.term}`] = true; delete f[`folder:${term}`]; }
  saveLib();
  renderSidebar();
}

async function removeCourse(course) {
  const count = allNotes().filter((n) => n.courseId === course.id).length;
  const ok = await confirmDialog({
    title: `Delete ${course.name}?`,
    body: count ? `Its ${count} note${count === 1 ? '' : 's'} are kept and moved to "No course". Flashcards and assignments are kept too.` : 'This course has no notes.',
    confirmLabel: 'Delete course', danger: true,
  });
  if (!ok) return;
  S.lib.courses = S.lib.courses.filter((c) => c.id !== course.id);
  if (S.view.filter.type === 'course' && S.view.filter.id === course.id) S.view.filter = { type: 'all', id: null };
  saveLib();
  route();
}

// ================================================================= list ===

function filterTitle() {
  const { filter } = S.view;
  if (filter.type === 'course') { const c = courseById(filter.id); return c ? courseLabel(c) : 'Course'; }
  return ({ all: 'All notes', pinned: 'Pinned', archive: 'Archive', unfiled: 'No course', tag: `#${filter.id}` })[filter.type] || 'Notes';
}

function createNote() {
  const { filter } = S.view;
  const note = newNote({ courseId: S.view.kind === 'notes' && filter.type === 'course' ? filter.id : null });
  if (S.view.kind === 'notes' && !['all', 'course'].includes(filter.type)) S.view.filter = { type: 'all', id: null };
  S.view.query = '';
  if (searchInput) searchInput.value = '';
  S.openNote(note.id);
}

// The ••• on a note card: open that note, then show its menu under the card's button.
function noteMenu(id) {
  if (S.noteId !== id) S.openNote(id);
  if (S.noteId !== id) return;
  const anchor = $list.querySelector(`.card-more[data-note="${id}"]`);
  if (!openMoreMenu(anchor)) toast('Unlock this note to see its options.');
}

function renderList() {
  if (S.view.kind !== 'notes') return;
  const notes = visibleNotes();
  const q = S.view.query.trim();
  clear($list);
  $list.append(h('header', { class: 'list-head' },
    h('div', { class: 'list-title-row' }, h('h1', { text: q ? 'Search results' : filterTitle() }),
      iconButton('chevron', 'Hide notes list', () => togglePane('list'), { class: 'side-toggle hide-list', size: 16 })),
    h('span', { class: 'footnote', 'aria-live': 'polite', text: `${notes.length} note${notes.length === 1 ? '' : 's'}${q ? ` for "${q}"` : ''}` })));

  if (!notes.length) {
    const archive = S.view.filter.type === 'archive';
    $list.append(h('div', { class: 'list-empty' },
      h('p', { text: q ? 'Nothing matches. Search looks in titles, typed notes and transcripts.' : archive ? 'Archived notes appear here.' : 'No notes here yet.' }),
      q || archive ? null : button('New note', () => createNote(), { iconName: 'plus', attrs: { class: 'btn btn-small' } })));
    return;
  }
  $list.append(h('ul', { class: 'note-list' }, notes.map((n) => {
    const course = courseById(n.courseId);
    let preview = null;
    if (n.locked) preview = h('span', { class: 'note-snippet', text: 'Locked note' });
    else if (q) {
      const hit = snippet(n.text, q) || snippet((n.transcript || []).map((s) => s.text).join(' '), q);
      if (hit) preview = h('span', { class: 'note-snippet' }, hit.before, h('mark', { text: hit.match }), hit.after);
    }
    if (!preview) preview = h('span', { class: 'note-snippet', text: (n.text || '').replace(/\s+/g, ' ').slice(0, 110) || (n.transcript && n.transcript.length ? n.transcript[0].text : 'No text yet') });
    const busy = recorder.active && recorder.noteId === n.id ? 'Recording' : transcription.noteId === n.id ? 'Transcribing' : null;
    const menuBtn = iconButton('more', `Actions for ${n.title || 'Untitled lecture'}`, () => noteMenu(n.id), { class: 'card-more', size: 16, attrs: { 'aria-haspopup': 'menu', 'data-note': n.id } });
    return h('li', { class: 'note-row' }, menuBtn, h('button', { type: 'button', class: `note-item ${n.id === S.noteId ? 'active' : ''}`, 'aria-current': n.id === S.noteId ? 'true' : null, onClick: () => S.openNote(n.id) },
      h('span', { class: 'note-item-top' },
        course ? h('span', { class: 'dot', style: { '--dot': course.color } }) : null,
        h('span', { class: 'note-item-title', text: n.title || 'Untitled lecture' }),
        n.pinned ? h('span', { class: 'pin-flag' }, icon('pin', 13), h('span', { class: 'sr-only', text: 'Pinned' })) : null),
      preview,
      h('span', { class: 'note-item-meta' },
        h('span', { text: fmtDate(n.created) }),
        n.audio ? h('span', { class: 'badge' }, icon('mic', 12), n.audio.duration ? fmtTime(n.audio.duration) : 'Audio') : null,
        busy ? h('span', { class: 'badge badge-live', text: busy }) : null)));
  })));
}

// ============================================================== welcome ===

function renderWelcome() {
  clear($main);
  const p = providerInfo();
  const first = allNotes().length === 0;
  if (!first) {
    $main.append(emptyState('notes', 'Pick a note, or start a new one', 'Record a class and type as you listen. Every line is linked to the moment you wrote it.',
      button('New note', () => createNote(), { kind: 'primary', iconName: 'plus' })));
    return;
  }
  const step = (n, title, body) => h('li', { class: 'step' }, h('span', { class: 'step-n', 'aria-hidden': 'true', text: String(n) }), h('div', null, h('h3', { text: title }), h('p', { text: body })));
  $main.append(h('div', { class: 'welcome' },
    h('h1', { text: 'Listen in class. Catch up later.' }),
    h('p', { class: 'welcome-lead', text: 'ListeNote records your lecture while you type. Every line you write is linked to the moment you wrote it, so one click replays what was being said.' }),
    h('ol', { class: 'steps' },
      step(1, 'Record and type', 'Press Record at the start of class and take notes as usual. Add #tags like #exam to mark moments that matter.'),
      step(2, 'Transcribe on this computer', 'ListeNote turns the recording into a searchable transcript with Whisper. Your audio is never uploaded.'),
      step(3, 'Study from it', 'Get a summary, ask questions, and make flashcards, quizzes and exam study guides, using the AI subscription you already have.')),
    h('div', { class: 'welcome-actions' },
      button('Start your first note', () => createNote(), { kind: 'primary', iconName: 'plus' }),
      button('Add a course', () => editCourse(null), { iconName: 'book' })),
    h('p', { class: `welcome-ai ${p && p.available ? 'ok' : 'warn'}` },
      h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
      p && p.available ? `${p.label} was found on this computer and will power the study tools. ` : 'No AI tool was found yet. Recording, notes and transcription work without one. ',
      h('button', { type: 'button', class: 'link', onClick: () => S.go({ kind: 'settings' }) }, p && p.available ? 'Change in Settings' : 'Set one up in Settings')),
  ));
}

// ================================================================= boot ===

bus.on('toast', ({ message, kind }) => toast(message, kind));
bus.on('library', () => { renderSidebar(); renderList(); renderRecPill(); });
bus.on('recording', () => { renderList(); renderRecPill(); });
setInterval(() => { const t = recBox && recBox.querySelector('.rec-box-time'); if (t && recorder.active) t.textContent = fmtTime(recorder.elapsed()); }, 1000);
bus.on('transcription', () => renderList());

api.onMenu((action) => {
  if (document.querySelector('dialog[open]')) return;
  // Start/stop shortcut: stops the running recording whatever view is open.
  if (action === 'toggle-record' && recorder.active) { stopRecording(); return; }
  if (action === 'new-note') createNote();
  else if (action === 'new-course') editCourse(null);
  else if (action === 'master') S.go({ kind: 'master' });
  else if (['side', 'list', 'panel'].includes(action)) togglePane(action);
  else if (action === 'settings') S.go({ kind: 'settings' });
  else if (action === 'find') { searchInput.focus(); searchInput.select(); }
  else if (S.view.kind === 'notes' && currentNoteId()) {
    if (action === 'toggle-record') toggleRecord();
    else if (action === 'toggle-play') togglePlay();
    else if (action === 'play-line') playFromCaret();
    else if (action === 'import-audio') importAudio();
  } else if (['toggle-record', 'import-audio'].includes(action)) {
    createNote();
    if (action === 'toggle-record') toggleRecord(); else importAudio();
  }
});

// Note reminders and assignment due-date notices, while the app is open.
function checkReminders() {
  const now = Date.now();
  const notify = (title, body, onClick) => {
    try { const n = new Notification(title, { body }); n.onclick = () => { window.focus(); onClick(); }; } catch { toast(`${title}: ${body}`); }
  };
  for (const note of allNotes()) {
    if (!note.reminder || note.reminderDone || Date.parse(note.reminder) > now) continue;
    note.reminderDone = true;
    saveNote(note.id);
    bus.emit('library');
    notify('Reminder', note.title || 'Untitled lecture', () => S.openNote(note.id));
  }
  const tomorrow = new Date(now + 86400000);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  let changed = false;
  for (const a of openAssignments()) {
    if (a.notified || !a.due || a.due > tomorrowStr || new Date().getHours() < 8) continue;
    a.notified = true;
    changed = true;
    notify(a.due === tomorrowStr ? 'Due tomorrow' : 'Due now', a.title, () => S.go({ kind: 'assignments' }));
  }
  for (const s of S.lib.sessions || []) {
    const start = sessionStartMs(s);
    if (s.notified || !s.start || start - now > 5 * 60000 || now - start > 30 * 60000) continue;
    s.notified = true;
    changed = true;
    const course = courseById(s.courseId);
    notify('Class starting', `${s.title}${course ? ` · ${courseLabel(course)}` : ''}. Click to take notes.`, () => openSession(s));
  }
  if (changed) saveLib();
}

window.addEventListener('beforeunload', flushSaves);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSaves(); });

(async function boot() {
  try {
    document.body.classList.toggle('mac', api.platform === 'darwin');
    const recovered = await loadState();
    S.providers = await api.llmDetect();
    applyAppearance();
    const view = /^#view=([a-z0-9]{8,40})$/.exec(location.hash);
    if (view) {
      // A second window: read-only, and never writes, so it cannot overwrite the main window's edits.
      S.frozen = true;
      $app.classList.add('viewer');
      const note = S.notes[view[1]];
      document.title = note ? `${note.title || 'Untitled lecture'} · ListeNote` : 'ListeNote';
      if (note) mountNote($main, note, { viewer: true }); else $main.append(emptyState('x', 'Note not found', null));
      return;
    }
    buildSidebar();
    $app.append(separator('side', { tab: false }), separator('list'),
      // Shown at the top left only while the sidebar is hidden.
      iconButton('chevron', 'Show sidebar', () => togglePane('side'), { class: 'side-toggle show-side', size: 16 }));
    applyLayout();
    setInterval(checkReminders, 30000);
    checkReminders();
    const latest = allNotes().filter((n) => !n.archived).sort((a, b) => b.updated - a.updated)[0];
    S.noteId = latest ? latest.id : null;
    route();
    if (recovered) toast('ListeNote closed during a recording last time. The audio that was captured has been recovered.');
  } catch (err) {
    clear($main).append(emptyState('x', 'ListeNote could not start', errorMessage(err)));
  }
}());
