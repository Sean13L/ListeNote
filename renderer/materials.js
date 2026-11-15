// Course materials page, plus picking the passages that matter for a request.

import { api, S, bus, saveLib, courseById, courseLabel, fmtDate } from './state.js';
import { h, clear, button, iconButton, toast, errorMessage, confirmDialog, emptyState } from './dom.js';
import { uid, rankChunks } from './lib/util.js';

const cache = new Map(); // material id -> chunks

export function courseMaterials(courseId) {
  return (S.lib.materials || []).filter((m) => m.courseId === courseId);
}

// Passages from a course's materials most related to `query`, as [{ name, loc, text }].
export async function sourcesFor(courseId, query, budget = 40000) {
  const mats = courseMaterials(courseId);
  if (!mats.length) return [];
  const all = [];
  for (const m of mats) {
    if (!cache.has(m.id)) cache.set(m.id, await api.materialsLoad(m.id).catch(() => []));
    for (const c of cache.get(m.id)) all.push({ ...c, name: m.name });
  }
  return rankChunks(all, query, budget);
}

export function mountMaterials(container, { courseId }) {
  clear(container);
  const page = h('div', { class: 'page page-narrow' });
  container.append(page);
  if (!S.lib.materials) S.lib.materials = [];

  async function add() {
    try {
      const ids = Array.from({ length: 100 }, () => uid());
      toast('Reading files…');
      const added = await api.materialsAdd(ids);
      for (const m of added) S.lib.materials.push({ ...m, courseId, added: Date.now() });
      saveLib();
      if (added.length) toast(`${added.length} file${added.length === 1 ? '' : 's'} added.`);
      draw();
    } catch (err) { toast(errorMessage(err), 'error'); }
  }

  function draw() {
    clear(page);
    const course = courseById(courseId);
    if (!course) { page.append(emptyState('x', 'Course not found', null)); return; }
    const mats = courseMaterials(courseId);
    page.append(h('header', { class: 'page-head' },
      h('div', null, h('h1', { text: 'Course materials' }), h('p', { class: 'page-sub', text: courseLabel(course) })),
      h('div', { class: 'page-actions' }, button('Add files', add, { kind: 'primary', iconName: 'upload' }))));
    page.append(h('p', { class: 'page-sub', text: 'Add lecture slides, textbook chapters, handouts or readings (PDF, PowerPoint, Word or text). Summaries, questions, flashcards, quizzes, practice problems, diagrams and study guides for this course will draw on them and cite the page or slide. Only the text is kept, on this computer; for each request, just the most relevant passages are sent to your AI.' }));
    if (!mats.length) {
      page.append(emptyState('book', 'No materials yet', 'Scanned pages (photos of text) cannot be read; use files with selectable text.', button('Add files', add, { iconName: 'upload' })));
      return;
    }
    page.append(h('ul', { class: 'assignment-list' }, mats.map((m) => h('li', { class: 'assignment' },
      h('div', { class: 'assignment-main' }, h('span', { class: 'assignment-title', text: m.name }),
        h('span', { class: 'assignment-meta', text: `${Math.round(m.chars / 1000)}k characters · ${m.parts} passages · added ${fmtDate(m.added)}` })),
      iconButton('trash', `Remove ${m.name}`, async () => {
        if (!(await confirmDialog({ title: `Remove ${m.name}?`, body: 'The AI will stop using it. Your original file is not affected.', confirmLabel: 'Remove', danger: true }))) return;
        await api.materialsRemove(m.id);
        cache.delete(m.id);
        S.lib.materials = S.lib.materials.filter((x) => x.id !== m.id);
        saveLib();
        bus.emit('library');
        draw();
      }, { size: 16 })))));
  }
  draw();
}
