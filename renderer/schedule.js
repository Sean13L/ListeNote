// Class schedule (from a calendar or a syllabus) and master notes for tests.

import { api, S, bus, saveLib, newNote, touchNote, courseById, courseLabel, allNotes, addAssignment, fmtDate, COURSE_COLORS } from './state.js';
import { h, clear, button, toast, errorMessage, formDialog, emptyState, renderMarkdown } from './dom.js';
import { runAI, aiReady } from './ai.js';
import { sanitizeHtml } from './editor.js';
import { uid, todayStr, extractJson, parseIcs, expandEvents } from './lib/util.js';
import { syllabusPrompt, calendarPrompt } from './lib/prompts.js';

const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeStr = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sessions = () => (S.lib.sessions = S.lib.sessions || []);

function findOrMakeCourse(name, extra = {}) {
  const n = String(name || '').trim();
  const lc = n.toLowerCase();
  const hit = S.lib.courses.find((c) => [c.name, c.code, courseLabel(c), `${c.code} ${c.name}`].some((x) => x && x.toLowerCase() === lc))
    || S.lib.courses.find((c) => c.code && lc.includes(c.code.toLowerCase()));
  if (hit) return hit;
  const course = { id: uid(), name: extra.name || n || 'New course', code: extra.code || '', term: extra.term || '', color: COURSE_COLORS[S.lib.courses.length % COURSE_COLORS.length].value, archived: false };
  S.lib.courses.push(course);
  return course;
}

export function sessionStartMs(s) {
  return Date.parse(`${s.date}T${s.start || '00:00'}:00`);
}

// Open (or create) the note for a class session.
export function openSession(s) {
  if (s.noteId && S.notes[s.noteId]) { S.openNote(s.noteId); return; }
  const note = newNote({ title: s.title || 'Lecture', courseId: s.courseId });
  if (s.topic) { note.html = `<div>Topic: ${s.topic.replace(/[<>&]/g, '')}</div>`; note.text = `Topic: ${s.topic}`; touchNote(note); }
  s.noteId = note.id;
  saveLib();
  S.openNote(note.id);
}

// =============================================================== schedule ===

export function mountSchedule(container) {
  clear(container);
  const page = h('div', { class: 'page page-narrow' });
  container.append(page);
  let review = null; // calendar entries awaiting confirmation

  async function importCalendar(fromLink) {
    try {
      let text;
      if (fromLink) {
        const out = await formDialog({
          title: 'Import a calendar by link', submitLabel: 'Import',
          intro: 'Google Calendar: Settings → your calendar → "Secret address in iCal format". Apple Calendar: share the calendar as Public and copy the link. Outlook: Publish calendar → ICS link. The link is saved so you can refresh later.',
          fields: [{ name: 'url', label: 'Calendar link (https:// or webcal://)', type: 'text', required: true, value: S.lib.calendarUrl || '' }],
        });
        if (!out || !out.url) return;
        toast('Downloading calendar…');
        text = await api.icsFetch(out.url);
        S.lib.calendarUrl = out.url;
        saveLib();
      } else {
        text = await api.icsOpen();
        if (!text) return;
      }
      await reviewCalendar(text);
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  async function reviewCalendar(text) {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const to = new Date(from.getTime() + 150 * 86400000);
    const occ = expandEvents(parseIcs(text), from, to).filter((o) => !o.allDay);
    const groups = new Map();
    for (const o of occ) {
      const g = groups.get(o.summary) || { summary: o.summary, location: o.location, occ: [] };
      g.occ.push(o);
      groups.set(o.summary, g);
    }
    // Classes repeat, so one-off events are left out of the review.
    const list = [...groups.values()].filter((g) => g.occ.length >= 2).sort((a, b) => b.occ.length - a.occ.length).slice(0, 60);
    if (!list.length) { toast('No repeating timed events were found in the next five months.', 'error'); return; }
    for (const g of list) {
      const days = [...new Set(g.occ.map((o) => o.start.toLocaleDateString(undefined, { weekday: 'short' })))].join('/');
      g.when = `${days} ${timeStr(g.occ[0].start)}, ${g.occ.length} times`;
      g.isClass = false;
      g.course = '';
    }
    if (aiReady().ok) {
      toast('Asking your AI which events are classes…');
      try {
        const guesses = extractJson(await runAI('calendar:import', calendarPrompt(list, S.lib.courses.filter((c) => !c.archived).map(courseLabel))));
        for (const gs of Array.isArray(guesses) ? guesses : []) {
          const g = list[Number(gs.n) - 1];
          if (g) { g.isClass = !!gs.isClass; g.course = String(gs.course || '').slice(0, 80); g.kind = String(gs.kind || 'Lecture').slice(0, 30); }
        }
      } catch (err) { toast(`The AI could not sort the events (${errorMessage(err)}). Tick your classes by hand.`, 'error'); }
    }
    review = list;
    draw();
  }

  function confirmCalendar() {
    const chosen = review.filter((g) => g.isClass);
    if (!chosen.length) { toast('Tick at least one class.'); return; }
    const today = todayStr();
    // A re-import replaces the calendar's future sessions that have no notes yet.
    S.lib.sessions = sessions().filter((s) => !(s.source === 'calendar' && s.date >= today && !s.noteId));
    let n = 0;
    for (const g of chosen) {
      const course = findOrMakeCourse(g.course || g.summary);
      for (const o of g.occ) {
        const s = { id: uid(), source: 'calendar', courseId: course.id, date: dateStr(o.start), start: timeStr(o.start), end: timeStr(o.end), title: `${course.code || course.name} ${g.kind || 'Lecture'}`, topic: '', location: g.location || '', noteId: null };
        if (sessions().some((x) => x.courseId === s.courseId && x.date === s.date && x.start === s.start)) continue;
        sessions().push(s);
        n++;
      }
    }
    saveLib();
    review = null;
    bus.emit('library');
    toast(`${n} class session${n === 1 ? '' : 's'} added to your schedule.`);
    draw();
  }

  async function readSyllabus() {
    const ready = aiReady();
    if (!ready.ok) { toast(ready.reason, 'error'); return; }
    try {
      const file = await api.syllabusRead();
      if (!file) return;
      toast(`Reading ${file.name} with ${ready.label}…`);
      const data = extractJson(await runAI('syllabus:import', syllabusPrompt({ text: file.text, today: todayStr() })));
      const info = data.course || {};
      const sess = (Array.isArray(data.sessions) ? data.sessions : []).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date));
      const work = (Array.isArray(data.assignments) ? data.assignments : []).filter((a) => a && a.title);
      const out = await formDialog({
        title: 'Add from syllabus', submitLabel: 'Add to schedule',
        intro: `Found ${sess.length} class session${sess.length === 1 ? '' : 's'} and ${work.length} graded item${work.length === 1 ? '' : 's'} (${work.filter((a) => a.due).length} with dates). Check the course below.`,
        fields: [{ name: 'course', label: 'Course', type: 'select', value: '__new', options: [
          { value: '__new', label: `New course: ${[info.code, info.name].filter(Boolean).join(' ') || 'from syllabus'}` },
          ...S.lib.courses.filter((c) => !c.archived).map((c) => ({ value: c.id, label: courseLabel(c) })),
        ] }],
      });
      if (!out) return;
      const course = out.course === '__new' ? findOrMakeCourse(info.code || info.name, { name: info.name || info.code, code: info.code, term: info.term }) : courseById(out.course);
      for (const s of sess) {
        const start = /^\d{2}:\d{2}$/.test(s.start || '') ? s.start : '';
        const existing = sessions().find((x) => x.courseId === course.id && x.date === s.date && (!start || !x.start || x.start === start));
        if (existing) { existing.topic = existing.topic || String(s.topic || '').slice(0, 300); if (!existing.title.includes(':')) existing.title = String(s.title || existing.title).slice(0, 120); continue; }
        sessions().push({ id: uid(), source: 'syllabus', courseId: course.id, date: s.date, start, end: /^\d{2}:\d{2}$/.test(s.end || '') ? s.end : '', title: String(s.title || 'Lecture').slice(0, 120), topic: String(s.topic || '').slice(0, 300), location: '', noteId: null });
      }
      // Holidays and cancelled classes the syllabus mentions: drop those sessions (unless notes were taken).
      const off = new Set((Array.isArray(data.noClass) ? data.noClass : []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
      S.lib.sessions = sessions().filter((s) => !(s.courseId === course.id && off.has(s.date) && !s.noteId));
      for (const a of work) {
        if (!S.lib.assignments.some((x) => x.courseId === course.id && x.title === a.title)) addAssignment({ title: String(a.title).slice(0, 200), due: /^\d{4}-\d{2}-\d{2}$/.test(a.due || '') ? a.due : '', courseId: course.id });
      }
      saveLib();
      bus.emit('library');
      toast('Syllabus added. Tip: add the syllabus file under Course materials too, so the AI can quote it.');
      draw();
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  async function editSession(s) {
    const out = await formDialog({
      title: 'Edit class session', submitLabel: 'Save',
      fields: [
        { name: 'title', label: 'Title', value: s.title, required: true },
        { name: 'date', label: 'Date', type: 'date', value: s.date, required: true },
        { name: 'start', label: 'Starts', type: 'time', value: s.start },
        { name: 'end', label: 'Ends', type: 'time', value: s.end },
        { name: 'topic', label: 'Topic (optional)', value: s.topic },
      ],
    });
    if (!out || !/^\d{4}-\d{2}-\d{2}$/.test(out.date)) return;
    const time = (t) => (/^\d{2}:\d{2}$/.test(t) ? t : '');
    if (out.date !== s.date || time(out.start) !== s.start) s.notified = false;
    Object.assign(s, { title: out.title.slice(0, 120) || s.title, date: out.date, start: time(out.start), end: time(out.end), topic: out.topic.slice(0, 300) });
    saveLib();
    bus.emit('library');
    draw();
  }

  function drawReview() {
    page.append(h('header', { class: 'page-head' }, h('div', null, h('h1', { text: 'Which of these are classes?' }),
      h('p', { class: 'page-sub', text: aiReady().ok ? 'Your AI made a first guess from the event names. Correct anything that is wrong, then add them.' : 'Tick your classes and name their course.' }))));
    const courseNames = S.lib.courses.filter((c) => !c.archived).map(courseLabel);
    page.append(h('datalist', { id: 'course-names' }, courseNames.map((n) => h('option', { value: n }))));
    page.append(h('ul', { class: 'assignment-list' }, review.map((g, i) => {
      const id = `rv-${i}`;
      const course = h('input', { type: 'text', class: 'input input-small', list: 'course-names', value: g.course, placeholder: 'Course', 'aria-label': `Course for ${g.summary}`, onInput: () => { g.course = course.value; } });
      return h('li', { class: 'assignment' },
        h('input', { type: 'checkbox', id, checked: g.isClass, onChange: (e) => { g.isClass = e.target.checked; } }),
        h('label', { for: id, class: 'assignment-main' }, h('span', { class: 'assignment-title', text: g.summary }), h('span', { class: 'assignment-meta', text: g.when })),
        course);
    })));
    page.append(h('div', { class: 'row' }, button('Add to schedule', confirmCalendar, { kind: 'primary' }), button('Cancel', () => { review = null; draw(); })),
      h('p', { class: 'footnote', text: 'Only event names, days and times were sent to your AI to make the guess.' }));
  }

  function draw() {
    clear(page);
    if (review) { drawReview(); return; }
    page.append(h('header', { class: 'page-head' },
      h('div', null, h('h1', { text: 'Schedule' }), h('p', { class: 'page-sub', text: 'Your classes, from your calendar or a syllabus. Open a session to take notes for it.' })),
      h('div', { class: 'page-actions' },
        S.lib.calendarUrl ? button('Refresh calendar', async () => { try { toast('Downloading calendar…'); await reviewCalendar(await api.icsFetch(S.lib.calendarUrl)); } catch (err) { toast(errorMessage(err), 'error'); } }) : null,
        button('Calendar link', () => importCalendar(true), { iconName: 'calendar' }),
        button('Calendar file', () => importCalendar(false), { iconName: 'upload' }),
        button('Read syllabus', () => readSyllabus(), { kind: 'primary', iconName: 'sparkle' }))));
    const today = todayStr();
    const all = sessions().slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const upcoming = all.filter((s) => s.date >= today);
    if (!all.length) {
      page.append(emptyState('calendar', 'No classes scheduled yet', 'Import your Google, Apple or Outlook calendar and ListeNote will find your classes, or let your AI read a syllabus for class dates, topics and deadlines.'));
      return;
    }
    const recent = all.filter((s) => s.date < today && s.date >= dateStr(new Date(Date.now() - 14 * 86400000)) && !s.noteId);
    const byDate = new Map();
    for (const s of upcoming.slice(0, 80)) { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s); }
    const row = (s) => {
      const course = courseById(s.courseId);
      const note = s.noteId && S.notes[s.noteId];
      return h('li', { class: 'assignment' },
        h('span', { class: 'session-time', text: s.start ? `${s.start}${s.end ? `–${s.end}` : ''}` : 'All day' }),
        h('div', { class: 'assignment-main' },
          h('span', { class: 'assignment-title', text: s.title }),
          h('span', { class: 'assignment-meta' }, course ? h('span', { class: 'dot', style: { '--dot': course.color } }) : null, h('span', { text: [course ? courseLabel(course) : null, s.topic, s.location].filter(Boolean).join(' · ') }))),
        button(note ? 'Open note' : 'Take notes', () => openSession(s), { kind: 'small', iconName: note ? 'notes' : 'plus' }),
        button('Edit', () => editSession(s), { kind: 'small', iconName: 'edit' }),
        button('Remove', () => { S.lib.sessions = sessions().filter((x) => x !== s); saveLib(); bus.emit('library'); draw(); }, { kind: 'small' }));
    };
    for (const [date, list] of byDate) {
      const label = date === today ? 'Today' : fmtDate(Date.parse(`${date}T12:00:00`), { weekday: true });
      page.append(h('section', { class: 'group' }, h('h2', { text: label }), h('ul', { class: 'assignment-list' }, list.map(row))));
    }
    if (recent.length) page.append(h('section', { class: 'group' }, h('h2', { text: 'Recent classes with no notes' }), h('ul', { class: 'assignment-list' }, recent.reverse().map(row))));
  }
  draw();
}

// ============================================================ master note ===

export function mountMaster(container, { courseId = null } = {}) {
  clear(container);
  const page = h('div', { class: 'page page-narrow' });
  container.append(page);
  const state = { courseId, picked: new Set(), parts: { notes: true, summary: true, transcript: false } };

  function create(form) {
    const name = form.name.value.trim() || `${form.kind.value} review`;
    const picked = allNotes().filter((n) => state.picked.has(n.id)).sort((a, b) => a.created - b.created);
    if (!picked.length) { toast('Choose at least one lecture or note.'); return; }
    // Copy each note in, without its timestamps (those belong to the other recordings).
    const root = h('div');
    for (const n of picked) {
      root.append(h('h2', { text: `${n.title || 'Untitled lecture'} (${fmtDate(n.created)})` }));
      if (state.parts.notes && n.html) {
        const body = h('div'); body.append(sanitizeHtml(n.html));
        for (const el of body.querySelectorAll('[data-t]')) { el.removeAttribute('data-t'); el.removeAttribute('data-ts'); }
        root.append(...body.childNodes);
      }
      if (state.parts.summary && n.summary) {
        root.append(h('h3', { text: 'Summary' }));
        for (const el of renderMarkdown(n.summary.markdown.replace(/^#{1,4}\s*To-?do[\s\S]*?(?=^#{1,4}\s|(?![\s\S]))/im, '').replace(/\s*\[\d{1,2}:\d{2}(?::\d{2})?\]/g, '')).querySelectorAll('h2, h3, h4, p, li')) {
          root.append(el.matches('h2, h3, h4') ? h('h3', { text: el.textContent }) : h('div', { text: el.matches('li') ? `• ${el.textContent}` : el.textContent }));
        }
      }
      if (state.parts.transcript && n.transcript.length) {
        root.append(h('h3', { text: 'Transcript' }), h('div', { text: n.transcript.map((s) => s.text).join(' ') }));
      }
    }
    root.append(h('h2', { text: 'My extra notes' }), h('div', null, h('br')));
    // With "All courses", file it under the course the chosen notes share, if any.
    const shared = new Set(picked.map((n) => n.courseId));
    const courseId = state.courseId || (shared.size === 1 ? [...shared][0] : null);
    const note = newNote({ title: name, courseId });
    note.html = root.innerHTML;
    note.text = [...root.children].map((el) => el.textContent).join('\n').trim();
    note.master = { kind: form.kind.value, date: form.date.value, sources: picked.map((n) => n.id) };
    touchNote(note);
    if (form.date.value) addAssignment({ title: name, due: form.date.value, courseId, noteId: note.id });
    toast('Master note created. Add anything else you need, then use Summary, Cards, Quiz or Practice on it.');
    S.openNote(note.id);
  }

  function draw() {
    clear(page);
    const notes = allNotes().filter((n) => !n.archived && !n.master && (!state.courseId || n.courseId === state.courseId)).sort((a, b) => a.created - b.created);
    const kind = h('select', { class: 'input', name: 'kind' }, ['Test', 'Quiz', 'Midterm', 'Final exam', 'Other'].map((k) => h('option', { value: k, text: k })));
    const name = h('input', { class: 'input', name: 'name', placeholder: 'Midterm 1', autocomplete: 'off' });
    const date = h('input', { class: 'input', name: 'date', type: 'date' });
    const course = h('select', { class: 'input', onChange: () => { state.courseId = course.value || null; state.picked.clear(); draw(); } },
      h('option', { value: '', text: 'All courses' }), S.lib.courses.filter((c) => !c.archived).map((c) => h('option', { value: c.id, selected: c.id === state.courseId, text: courseLabel(c) })));
    const field = (label, control) => { control.id = control.id || `m-${label.replace(/\W/g, '')}`; return h('div', { class: 'field' }, h('label', { for: control.id, text: label }), control); };
    const form = h('form', { onSubmit: (e) => { e.preventDefault(); create({ name, kind, date }); } },
      h('header', { class: 'page-head' }, h('div', null, h('h1', { text: 'New master note' }),
        h('p', { class: 'page-sub', text: 'Pick the lectures and notes a test covers. They are combined into one new note that you can keep editing.' }))),
      h('div', { class: 'master-grid' }, field('Name', name), field('Type', kind), field('Date', date), field('Course', course)),
      h('fieldset', { class: 'question' }, h('legend', { text: `Covers (${state.picked.size} chosen)` }),
        notes.length ? h('div', { class: 'row' }, button('Select all', () => { for (const n of notes) if (!n.locked || n._open) state.picked.add(n.id); draw(); }, { kind: 'small' }), button('Clear', () => { state.picked.clear(); draw(); }, { kind: 'small' })) : null,
        notes.length ? notes.map((n) => {
          const id = `pick-${n.id}`;
          const locked = n.locked && !n._open;
          return h('label', { class: 'option', for: id },
            h('input', { type: 'checkbox', id, disabled: locked, checked: state.picked.has(n.id), onChange: (e) => { if (e.target.checked) state.picked.add(n.id); else state.picked.delete(n.id); form.querySelector('legend').textContent = `Covers (${state.picked.size} chosen)`; } }),
            h('span', { text: `${n.title || 'Untitled lecture'} · ${fmtDate(n.created)}${locked ? ' · locked' : ''}${n.summary ? '' : ' · no summary'}` }));
        }) : h('p', { class: 'footnote', text: 'No notes in this course yet.' })),
      h('fieldset', { class: 'question' }, h('legend', { text: 'Include' }),
        [['notes', 'My typed notes'], ['summary', 'AI summaries (where written)'], ['transcript', 'Full transcripts (long)']].map(([k, l]) =>
          h('label', { class: 'option' }, h('input', { type: 'checkbox', checked: state.parts[k], onChange: (e) => { state.parts[k] = e.target.checked; } }), h('span', { text: l })))),
      h('div', { class: 'row' }, h('button', { type: 'submit', class: 'btn btn-primary' }, 'Create master note'),
        h('span', { class: 'footnote', text: 'With a date, the test is also added to your assignments.' })));
    page.append(form);
  }
  draw();
}
