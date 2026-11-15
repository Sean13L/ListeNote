// School views: flashcard review, assignments, and course study guides.

import { api, S, bus, saveLib, courseById, courseLabel, dueCards, addAssignment, allNotes, fmtDate } from './state.js';
import { h, clear, icon, iconButton, button, toast, errorMessage, confirmDialog, formDialog, renderMarkdown, emptyState, copyText } from './dom.js';
import { runAI, cancelAI, job, isRunning, aiReady, clearJob } from './ai.js';
import { uid, fmtTime, schedule, intervalLabel, todayStr, dueLabel, daysUntil, toIcs } from './lib/util.js';
import { studyGuidePrompt } from './lib/prompts.js';
import { sourcesFor } from './materials.js';

let offs = [];
export function unmountStudy() {
  for (const off of offs) off();
  offs = [];
  document.removeEventListener('keydown', reviewKeys);
}

const courseOptions = (includeNone = 'No course') => [
  { value: '', label: includeNone },
  ...S.lib.courses.filter((c) => !c.archived).map((c) => ({ value: c.id, label: courseLabel(c) })),
];

function pageHead(title, subtitle, ...actions) {
  return h('header', { class: 'page-head' }, h('div', null, h('h1', { text: title }), subtitle ? h('p', { class: 'page-sub', text: subtitle }) : null), h('div', { class: 'page-actions' }, actions));
}

// =============================================================== review ===

let review = null;

function reviewKeys(e) {
  if (!review || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
  if (!review.current) return;
  if (!review.revealed && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); review.reveal(); }
  else if (review.revealed && ['1', '2', '3', '4'].includes(e.key)) { e.preventDefault(); review.grade(Number(e.key) - 1); }
}

export function mountReview(container, { courseId = null } = {}) {
  unmountStudy();
  clear(container);
  const state = review = { courseId, queue: [], current: null, revealed: false, done: 0 };
  const page = h('div', { class: 'page page-narrow' });
  container.append(page);

  const build = () => {
    state.queue = dueCards(state.courseId).sort((a, b) => a.due - b.due);
    state.current = state.queue[0] || null;
    state.revealed = false;
  };

  state.reveal = () => { state.revealed = true; draw(); const first = page.querySelector('.grade'); if (first) first.focus(); };
  state.grade = (grade) => {
    const card = state.current;
    if (!card) return;
    Object.assign(card, schedule(card, grade));
    state.done += 1;
    saveLib();
    bus.emit('library');
    build();
    draw();
    const show = page.querySelector('.reveal-btn');
    if (show) show.focus();
  };

  function draw() {
    clear(page);
    const total = S.lib.cards.filter((c) => !state.courseId || c.courseId === state.courseId).length;
    const select = h('select', { class: 'input input-small', 'aria-label': 'Deck', onChange: () => { state.courseId = select.value || null; state.done = 0; build(); draw(); } },
      courseOptions('All courses').map((o) => h('option', { value: o.value, selected: o.value === (state.courseId || ''), text: o.label })));
    page.append(pageHead('Review', `${state.queue.length} due · ${total} card${total === 1 ? '' : 's'} in this deck`, select));

    if (!total) {
      page.append(emptyState('cards', 'No flashcards yet', 'Open a lecture note, go to the Flashcards tab and choose "Make 10 flashcards". They will show up here when they are due.'));
      return;
    }
    const card = state.current;
    if (!card) {
      const next = S.lib.cards.filter((c) => !state.courseId || c.courseId === state.courseId).reduce((min, c) => Math.min(min, c.due), Infinity);
      const mins = Math.max(1, Math.round((next - Date.now()) / 60000));
      const when = mins < 60 ? `in ${mins} minute${mins === 1 ? '' : 's'}` : mins < 1440 ? `in about ${Math.round(mins / 60)} hour${Math.round(mins / 60) === 1 ? '' : 's'}` : `in ${Math.round(mins / 1440)} day${Math.round(mins / 1440) === 1 ? '' : 's'}`;
      page.append(emptyState('check', state.done ? `Done. ${state.done} card${state.done === 1 ? '' : 's'} reviewed.` : 'Nothing due right now', `The next card is due ${when}.`,
        mins < 60 ? button('Check again', () => { build(); draw(); }) : null));
      return;
    }
    const note = S.notes[card.noteId];
    const course = courseById(card.courseId);
    page.append(h('article', { class: 'flashcard', 'aria-live': 'polite' },
      h('div', { class: 'flashcard-meta' }, course ? h('span', { class: 'dot', style: { '--dot': course.color } }) : null, h('span', { text: [course ? courseLabel(course) : null, note ? (note.title || 'Untitled lecture') : null].filter(Boolean).join(' · ') })),
      h('p', { class: 'flashcard-front', text: card.front }),
      state.revealed ? h('div', { class: 'flashcard-back' }, h('p', { text: card.back }),
        note ? button(card.t !== null && card.t !== undefined && note.audio ? `Hear it at ${fmtTime(card.t)}` : 'Open the note', () => S.openNote(note.id, { seek: note.audio ? card.t : null }), { kind: 'small', iconName: note.audio && card.t != null ? 'play' : 'notes' }) : null) : null,
    ));
    if (!state.revealed) {
      page.append(h('div', { class: 'review-actions' }, button('Show answer', () => state.reveal(), { kind: 'primary', attrs: { class: 'btn btn-primary reveal-btn' } }), h('span', { class: 'footnote', text: 'Space to show' })));
    } else {
      const grades = [['Again', 'again'], ['Hard', 'hard'], ['Good', 'good'], ['Easy', 'easy']];
      page.append(h('div', { class: 'review-actions grades', role: 'group', 'aria-label': 'How well did you remember?' },
        grades.map(([label, cls], i) => h('button', { type: 'button', class: `grade grade-${cls}`, onClick: () => state.grade(i) },
          h('span', { class: 'grade-label', text: label }), h('span', { class: 'grade-next', text: intervalLabel(card, i) }), h('kbd', { text: String(i + 1) })))));
    }
  }

  build();
  draw();
  document.addEventListener('keydown', reviewKeys);
  offs.push(() => { if (review === state) review = null; });
}

// ========================================================== assignments ===

export function mountAssignments(container) {
  unmountStudy();
  clear(container);
  const page = h('div', { class: 'page page-narrow' });
  container.append(page);

  async function edit(existing) {
    const out = await formDialog({
      title: existing ? 'Edit assignment' : 'New assignment',
      submitLabel: existing ? 'Save' : 'Add',
      fields: [
        { name: 'title', label: 'What is due?', value: existing ? existing.title : '', required: true, placeholder: 'Problem set 4' },
        { name: 'courseId', label: 'Course', type: 'select', value: existing ? (existing.courseId || '') : '', options: courseOptions() },
        { name: 'due', label: 'Due date', type: 'date', value: existing ? existing.due : '' },
      ],
    });
    if (!out || !out.title) return;
    if (existing) { Object.assign(existing, { title: out.title, courseId: out.courseId || null, due: out.due, notified: existing.due === out.due && existing.notified }); saveLib(); bus.emit('library'); }
    else addAssignment({ title: out.title, courseId: out.courseId || null, due: out.due });
    draw();
  }

  function row(a) {
    const course = courseById(a.courseId);
    const days = daysUntil(a.due);
    const urgency = a.done ? '' : days === null ? '' : days < 0 ? 'overdue' : days <= 2 ? 'soon' : '';
    const id = `as-${a.id}`;
    return h('li', { class: `assignment ${a.done ? 'done' : ''}` },
      h('input', { type: 'checkbox', id, checked: a.done, onChange: (e) => { a.done = e.target.checked; saveLib(); bus.emit('library'); draw(); } }),
      h('label', { for: id, class: 'assignment-main' },
        h('span', { class: 'assignment-title', text: a.title }),
        h('span', { class: 'assignment-meta' },
          course ? h('span', { class: 'dot', style: { '--dot': course.color } }) : null,
          h('span', { text: course ? courseLabel(course) : 'No course' }),
          h('span', { class: `due ${urgency}`, text: dueLabel(a.due) }))),
      a.noteId && S.notes[a.noteId] ? iconButton('notes', `Open the lecture this came from: ${a.title}`, () => S.openNote(a.noteId), { size: 16 }) : null,
      iconButton('edit', `Edit ${a.title}`, () => edit(a), { size: 16 }),
      iconButton('trash', `Delete ${a.title}`, async () => {
        if (!(await confirmDialog({ title: 'Delete this assignment?', body: a.title, confirmLabel: 'Delete', danger: true }))) return;
        S.lib.assignments = S.lib.assignments.filter((x) => x.id !== a.id); saveLib(); bus.emit('library'); draw();
      }, { size: 16 }));
  }

  function draw() {
    clear(page);
    const today = todayStr();
    const all = S.lib.assignments;
    const open = all.filter((a) => !a.done);
    const exportIcs = async () => {
      const items = open.filter((a) => a.due).map((a) => ({ ...a, course: courseLabel(courseById(a.courseId)) }));
      if (!items.length) { toast('No upcoming assignments have a due date.'); return; }
      try { if (await api.exportText('Assignments', 'ics', toIcs(items))) toast('Saved. Open the file to add the due dates to your calendar.'); } catch (err) { toast(errorMessage(err), 'error'); }
    };
    page.append(pageHead('Assignments', `${open.length} to do`,
      button('Add to calendar', exportIcs, { iconName: 'calendar' }),
      button('New assignment', () => edit(null), { kind: 'primary', iconName: 'plus' })));
    if (!all.length) {
      page.append(emptyState('checklist', 'No assignments yet', 'Add deadlines here, or let ListeNote find them: when you summarise a lecture, any deadline the lecturer mentioned gets an "Add to assignments" button.'));
      return;
    }
    const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.created - b.created;
    const groups = [
      ['Overdue', open.filter((a) => a.due && a.due < today).sort(byDue)],
      ['Upcoming', open.filter((a) => a.due && a.due >= today).sort(byDue)],
      ['No due date', open.filter((a) => !a.due).sort(byDue)],
      ['Done', all.filter((a) => a.done).sort((a, b) => b.created - a.created)],
    ];
    for (const [label, items] of groups) {
      if (!items.length) continue;
      page.append(h('section', { class: 'group' }, h('h2', { text: `${label} (${items.length})` }), h('ul', { class: 'assignment-list' }, items.map(row))));
    }
  }
  draw();
}

// =============================================================== guides ===

function noteSource(note) {
  const parts = [];
  if (note.summary) parts.push(`Summary:\n${note.summary.markdown}`);
  if (note.text) parts.push(`Student notes:\n${note.text}`);
  if (!note.summary && note.transcript.length) parts.push(`Transcript:\n${note.transcript.map((s) => s.text).join(' ')}`);
  return parts.join('\n\n');
}

export function mountGuides(container, { guideId = null } = {}) {
  unmountStudy();
  clear(container);
  const page = h('div', { class: 'page' });
  container.append(page);
  let openId = guideId;
  let stream = null;

  async function create() {
    const ready = aiReady();
    if (!ready.ok) { toast(ready.reason, 'error'); return; }
    const courses = S.lib.courses.filter((c) => !c.archived && allNotes().some((n) => n.courseId === c.id && !n.archived && noteSource(n)));
    if (!courses.length) { toast('Add notes to a course first. A study guide is built from a course\'s lectures.'); return; }
    const out = await formDialog({
      title: 'New study guide',
      submitLabel: 'Write guide',
      intro: `Builds an exam guide from every lecture in a course, using ${ready.label}. Lectures with a summary are used in summarised form; the rest use your notes and transcript.`,
      fields: [
        { name: 'courseId', label: 'Course', type: 'select', value: courses[0].id, options: courses.map((c) => ({ value: c.id, label: courseLabel(c) })) },
        { name: 'focus', label: 'Focus (optional)', placeholder: 'Midterm: weeks 1 to 5', hint: 'Leave blank to cover everything.' },
      ],
    });
    if (!out) return;
    const course = courseById(out.courseId);
    const notes = allNotes().filter((n) => n.courseId === course.id && !n.archived && noteSource(n)).sort((a, b) => a.created - b.created);
    const guide = { id: uid(), courseId: course.id, title: out.focus ? `${course.name}: ${out.focus}` : `${course.name} study guide`, created: Date.now(), lectures: notes.length, markdown: '' };
    S.lib.guides.unshift(guide);
    saveLib();
    openId = guide.id;
    draw();
    const key = `guide:${guide.id}`;
    try {
      const materials = await sourcesFor(course.id, `${out.focus} ${out.focus} ${notes.map((n) => `${n.title} ${n.summary ? n.summary.markdown : n.text.slice(0, 2000)}`).join(' ')}`, 30000);
      guide.markdown = await runAI(key, studyGuidePrompt({
        course: courseLabel(course), focus: out.focus, materials,
        sources: notes.map((n) => ({ title: n.title || 'Untitled lecture', date: new Date(n.created).toISOString().slice(0, 10), text: noteSource(n) })),
      }));
      saveLib();
      clearJob(key);
    } catch (err) {
      if (errorMessage(err) === 'Cancelled.' || !guide.markdown) { S.lib.guides = S.lib.guides.filter((g) => g.id !== guide.id); saveLib(); if (openId === guide.id) openId = null; }
      if (errorMessage(err) !== 'Cancelled.') toast(errorMessage(err), 'error');
    }
    bus.emit('library');
    if (page.isConnected) draw();
  }

  function draw() {
    clear(page);
    stream = null;
    const guide = S.lib.guides.find((g) => g.id === openId);
    if (guide) {
      const key = `guide:${guide.id}`;
      const running = isRunning(key);
      const course = courseById(guide.courseId);
      page.classList.add('page-narrow');
      page.append(
        h('div', { class: 'crumbs' }, button('All study guides', () => { openId = null; draw(); }, { kind: 'small' })),
        pageHead(guide.title, `${course ? courseLabel(course) : 'Course removed'} · ${guide.lectures} lecture${guide.lectures === 1 ? '' : 's'} · ${fmtDate(guide.created)}`,
          running ? button('Stop', () => cancelAI(key)) : [
            iconButton('copy', 'Copy study guide', () => copyText(guide.markdown)),
            button('Export', async () => { try { if (await api.exportText(guide.title, 'md', `# ${guide.title}\n\n${guide.markdown}\n`)) toast('Exported.'); } catch (err) { toast(errorMessage(err), 'error'); } }, { iconName: 'download' }),
            iconButton('trash', 'Delete study guide', async () => {
              if (!(await confirmDialog({ title: 'Delete this study guide?', body: guide.title, confirmLabel: 'Delete', danger: true }))) return;
              S.lib.guides = S.lib.guides.filter((g) => g.id !== guide.id); saveLib(); openId = null; draw();
            }),
          ]),
      );
      if (running) {
        const el = h('div', { class: 'stream' }, renderMarkdown(job(key).text));
        stream = { key, el };
        page.append(h('div', { class: 'working', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { text: 'Writing study guide…' })), el);
      } else {
        page.append(renderMarkdown(guide.markdown), h('p', { class: 'footnote', text: 'AI-written guides can contain mistakes or miss topics. Check against your lectures and syllabus.' }));
      }
      return;
    }
    page.classList.remove('page-narrow');
    page.append(pageHead('Study guides', 'Exam guides written from every lecture in a course.', button('New study guide', () => create(), { kind: 'primary', iconName: 'sparkle' })));
    if (!S.lib.guides.length) {
      page.append(emptyState('guide', 'No study guides yet', 'When an exam is coming, ListeNote can read all the lectures in a course and write one guide: the big picture, each topic, key terms, and likely exam questions.'));
      return;
    }
    page.append(h('ul', { class: 'guide-list' }, S.lib.guides.map((g) => {
      const course = courseById(g.courseId);
      return h('li', null, h('button', { type: 'button', class: 'guide-card', onClick: () => { openId = g.id; draw(); } },
        h('span', { class: 'dot', style: { '--dot': course ? course.color : '#6b7280' } }),
        h('span', { class: 'guide-card-main' }, h('strong', { text: g.title }), h('span', { class: 'footnote', text: `${g.lectures} lecture${g.lectures === 1 ? '' : 's'} · ${fmtDate(g.created)}${isRunning(`guide:${g.id}`) ? ' · writing…' : ''}` })),
        icon('chevron', 16)));
    })));
  }

  offs.push(bus.on('job', (key) => {
    if (!key.startsWith('guide:') || !page.isConnected) return;
    if (stream && stream.key === key && isRunning(key)) stream.el.replaceChildren(renderMarkdown(job(key).text));
    else draw();
  }));
  draw();
}
