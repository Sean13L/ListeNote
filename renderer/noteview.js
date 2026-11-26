// The open note: title, editor, recording/playback bar, and the side panel
// (Transcript, Summary, Ask, Flashcards, Quiz).

import {
  api, S, bus, saveNote, saveLib, touchNote, newNote, deleteNote, courseById, courseLabel, addAssignment, dueCards,
  fmtDate,
} from './state.js';
import {
  h, clear, icon, iconButton, button, toast, errorMessage, confirmDialog, formDialog, showMenu, closeMenu, renderMarkdown, emptyState, copyText,
} from './dom.js';
import { createEditor, sanitizeHtml } from './editor.js';
import { recorder, Player, transcription, transcribeNote, cancelTranscription, computeSilence } from './audio.js';
import { runAI, cancelAI, job, isRunning, aiReady, clearJob } from './ai.js';
import { fmtTime, parseTime, uid, todayStr, extractJson, normalizeCards, normalizeQuiz, newCardSchedule } from './lib/util.js';
import { buildContext, summaryPrompt, askPrompt, flashcardPrompt, quizPrompt, practicePrompt, visualPrompt, parseVisual } from './lib/prompts.js';
import { sourcesFor, courseMaterials } from './materials.js';
import { separator, togglePane } from './layout.js';

const TABS = [
  { id: 'transcript', label: 'Transcript' },
  { id: 'summary', label: 'Summary' },
  { id: 'ask', label: 'Ask' },
  { id: 'cards', label: 'Cards' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'practice', label: 'Practice' },
];
const SPEEDS = [0.7, 1, 1.25, 1.5, 1.75, 2];
const MODEL_SIZES = { tiny: '150 MB', base: '290 MB', small: '970 MB' };

let ctx = null;
let lastTab = 'transcript';

export function currentNoteId() {
  return ctx ? ctx.note.id : null;
}

export function unmountNote() {
  if (!ctx) return;
  for (const off of ctx.offs) off();
  relock(ctx.note);
  cancelAnimationFrame(ctx.raf);
  if (ctx.player) ctx.player.destroy();
  ctx = null;
}

export function mountNote(container, note, { viewer = false } = {}) {
  unmountNote();
  clear(container);
  if (note.locked && !note._open) { renderLockScreen(container, note, viewer); return; }
  const q = (S.view.query || '').trim();
  const hitInTranscript = q && note.transcript.some((s) => s.text.toLowerCase().includes(q.toLowerCase())) && !(note.text || '').toLowerCase().includes(q.toLowerCase());
  if (hitInTranscript) lastTab = 'transcript';
  const c = ctx = {
    note, container, offs: [], raf: 0, player: null, playerState: 'none', // none | loading | ready | error
    tab: lastTab, readOnly: viewer, viewer, rate: 1, skipSilence: false,
    trQuery: hitInTranscript ? q : '', trRows: [], trNow: null, stream: null, quizAnswers: {}, quizChecked: false, running: {},
  };

  // ---- header ----
  const title = h('input', {
    class: 'note-title', type: 'text', value: note.title, placeholder: 'Untitled lecture', 'aria-label': 'Note title', readOnly: viewer,
    onInput: () => { note.title = title.value; touchNote(note); libraryChangedSoon(); },
  });
  const courseSelect = h('select', { class: 'input input-small', 'aria-label': 'Course', onChange: () => {
    note.courseId = courseSelect.value || null;
    for (const card of S.lib.cards) if (card.noteId === note.id) card.courseId = note.courseId;
    saveLib(); touchNote(note); bus.emit('library');
  } },
    h('option', { value: '', text: 'No course' }),
    S.lib.courses.filter((co) => !co.archived || co.id === note.courseId).map((co) => h('option', { value: co.id, selected: co.id === note.courseId, text: courseLabel(co) })),
  );
  c.recordBtn = h('button', { type: 'button', class: 'btn btn-record', onClick: () => toggleRecord() });
  c.moreBtn = iconButton('more', 'More actions', () => openMoreMenu(), { class: 'head-more' });
  const sourceSelect = h('select', { class: 'input input-small source-select', 'aria-label': 'What to record', title: 'What to record',
    onChange: () => { S.lib.settings.recordSource = sourceSelect.value; saveLib(); } },
  [['mic', 'Microphone'], ['both', 'Mic + computer audio'], ['system', 'Computer audio only']].map(([v, l]) => h('option', { value: v, selected: (S.lib.settings.recordSource || 'mic') === v, text: l })));
  c.attachRow = h('div', { class: 'attach-row' });
  const head = h('header', { class: 'note-head' },
    h('div', { class: 'note-head-row' }, h('div', { class: 'title-wrap' }, title, c.moreBtn), viewer ? null : [sourceSelect, c.recordBtn]),
    h('div', { class: 'note-meta' }, courseSelect,
      viewer ? h('span', { class: 'meta-text', text: fmtDate(note.created, { weekday: true }) })
        : c.dateBtn = h('button', { type: 'button', class: 'meta-text meta-date', title: 'Change the lecture date', onClick: () => changeDate() }, fmtDate(note.created, { weekday: true })),
      c.metaExtra = h('span', { class: 'meta-text' })),
    c.attachRow,
  );

  // ---- editor ----
  c.editor = createEditor({
    html: note.html,
    getStampTime: () => {
      if (recorder.active && recorder.noteId === note.id) return recorder.paused ? null : recorder.elapsed();
      if (c.player && c.player.playing) return c.player.time;
      return null;
    },
    onChange: () => {
      note.html = c.editor.cleanHtmlForExport();
      note.text = c.editor.getText();
      touchNote(note);
      libraryChangedSoon();
    },
    onSeek: (t) => seek(t),
    onPasteImage: async (file) => {
      try {
        const att = await api.attachSave(note.id, file.type.split('/')[1].replace('jpeg', 'jpg'), await file.arrayBuffer());
        return `app://local/attachments/${att.file}`;
      } catch (err) { toast(errorMessage(err), 'error'); return null; }
    },
  });
  if (!viewer) {
    c.editor.toolbar.append(h('span', { class: 'tool-sep', 'aria-hidden': 'true' }),
      h('button', { type: 'button', class: 'tool', 'aria-label': 'Insert image', title: 'Insert image', onMousedown: (e) => e.preventDefault(), onClick: () => insertImage() }, icon('image', 16)),
      h('button', { type: 'button', class: 'tool', 'aria-label': 'Attach a file', title: 'Attach a file (slides, handouts)', onMousedown: (e) => e.preventDefault(), onClick: () => attachFile() }, icon('paperclip', 16)));
  } else c.editor.setReadOnly(true);
  const editorPane = h('section', { class: 'note-editor', 'aria-label': 'Notes' }, c.editor.toolbar, h('div', { class: 'editor-scroll' }, c.editor.el));

  // ---- side panel ----
  c.tabButtons = TABS.map((t) => h('button', {
    type: 'button', role: 'tab', id: `tab-${t.id}`, 'aria-controls': 'tabpanel', class: 'tab',
    onClick: () => selectTab(t.id),
    onKeydown: (e) => {
      const i = TABS.findIndex((x) => x.id === c.tab);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
        selectTab(next.id);
        c.tabButtons[TABS.indexOf(next)].focus();
      }
    },
  }, t.label));
  c.panel = h('div', { class: 'panel-body', role: 'tabpanel', id: 'tabpanel', tabindex: '0' });
  const side = h('aside', { class: 'panel', 'aria-label': 'Study tools' }, h('div', { class: 'tabs-row' }, h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Study tools' }, c.tabButtons),
    iconButton('chevron', 'Hide study panel', () => togglePane('panel'), { class: 'side-toggle hide-panel', size: 16 })), c.panel);

  c.transport = h('footer', { class: 'transport' });
  container.append(h('div', { class: 'note' }, head, h('div', { class: 'note-body' }, editorPane, side, separator('panel', { fromRight: true, tab: false }),
    iconButton('chevron', 'Show study panel', () => togglePane('panel'), { class: 'side-toggle show-panel', size: 16 })), c.transport));

  c.offs.push(
    bus.on('recording', () => { if (ctx === c) { renderRecordButton(); renderTransport(); } }),
    bus.on('transcription', (id) => { if (ctx === c && id === note.id && c.tab === 'transcript') renderPanel(); }),
    bus.on('job', (key) => { if (ctx === c) onJob(key); }),
    bus.on('library', () => { if (ctx === c) renderMeta(); }),
  );

  renderRecordButton();
  renderMeta();
  renderAttachments();
  selectTab(c.tab);
  renderTransport();
  if (note.audio) loadPlayer();
  if (!note.title && !note.text && !viewer) title.focus();
}

let libTimer = null;
function libraryChangedSoon() {
  clearTimeout(libTimer);
  libTimer = setTimeout(() => bus.emit('library'), 500);
}

// ============================================================ lock/attach ===

function renderLockScreen(container, note, viewer) {
  const unlock = async () => {
    try {
      const status = await api.lockStatus();
      let password = null;
      if (!status.touchId) {
        const out = await formDialog({ title: 'Unlock note', submitLabel: 'Unlock', fields: [{ name: 'pw', label: 'Password', type: 'password', required: true }] });
        if (!out) return;
        password = out.pw;
      }
      Object.assign(note, await api.lockUnlock(note.id, password), { _open: true });
      mountNote(container, note, { viewer });
    } catch (err) { toast(errorMessage(err).replace(/^.*Touch ID.*cancel.*$/i, 'Unlock cancelled.'), 'error'); }
  };
  container.append(emptyState('lock', note.title || 'Locked note', 'This note is locked. Its notes, transcript and study material are encrypted on this computer.',
    button('Unlock', unlock, { kind: 'primary', iconName: 'lock' })));
}

async function toggleLock() {
  const c = ctx;
  const { note } = c;
  if (note.locked) {
    if (!(await confirmDialog({ title: 'Remove the lock?', body: 'The note will be stored without encryption again.', confirmLabel: 'Remove lock' }))) return;
    note.locked = false;
    delete note.sealed;
    note._open = false;
    touchNote(note);
    renderMeta();
    return;
  }
  const status = await api.lockStatus();
  if (!status.encryption) { toast('This computer cannot encrypt notes, so locking is unavailable.', 'error'); return; }
  if (!status.touchId && !status.hasPassword) {
    const out = await formDialog({ title: 'Set a password for locked notes', submitLabel: 'Set password', intro: 'One password unlocks all locked notes. It cannot be recovered if you forget it.',
      fields: [{ name: 'a', label: 'Password', type: 'password', required: true }, { name: 'b', label: 'Repeat password', type: 'password', required: true }] });
    if (!out) return;
    if (out.a !== out.b) { toast('The passwords do not match.', 'error'); return; }
    try { await api.lockSetPassword(out.a); } catch (err) { toast(errorMessage(err), 'error'); return; }
  }
  note.locked = true;
  note._open = true;
  saveNote(note.id, { now: true });
  renderMeta();
  toast(status.touchId ? 'Locked. Unlock with Touch ID.' : 'Locked. Unlock with your password.');
}

// Close a locked note: drop its content from memory so it shows the lock screen.
export function relock(note) {
  if (!note.locked || !note._open) return;
  saveNote(note.id, { now: true });
  Object.assign(note, { _open: false, html: '', text: '', transcript: [], summary: null, chat: [], quiz: null, practice: null, visuals: [], speakers: null, attachments: [] });
}

function renderAttachments() {
  const c = ctx;
  const files = c.note.attachments || [];
  const sources = ((c.note.master && c.note.master.sources) || []).filter((id) => S.notes[id]);
  clear(c.attachRow);
  c.attachRow.hidden = !files.length && !sources.length;
  if (sources.length) {
    c.attachRow.append(h('span', { class: 'meta-text', text: `${c.note.master.kind} review, built from:` }),
      ...sources.map((id) => h('button', { type: 'button', class: 'attach-chip link', onClick: () => S.openNote(id) }, S.notes[id].title || 'Untitled lecture')));
  }
  for (const a of files) {
    c.attachRow.append(h('span', { class: 'attach-chip' },
      h('button', { type: 'button', class: 'link', onClick: () => api.attachOpen(a.file).catch((err) => toast(errorMessage(err), 'error')) }, icon('paperclip', 13), a.name),
      c.viewer ? null : iconButton('x', `Remove ${a.name}`, () => {
        c.note.attachments = files.filter((x) => x !== a);
        touchNote(c.note);
        renderAttachments();
      }, { size: 13 })));
  }
}

async function attachFile() {
  const c = ctx;
  try {
    const att = await api.attachPick(c.note.id, false);
    if (!att) return;
    c.note.attachments = [...(c.note.attachments || []), att];
    touchNote(c.note);
    if (ctx === c) renderAttachments();
  } catch (err) { toast(errorMessage(err), 'error'); }
}

async function insertImage() {
  const c = ctx;
  try {
    const att = await api.attachPick(c.note.id, true);
    if (att && ctx === c) c.editor.insertImage(`app://local/attachments/${att.file}`, att.name);
  } catch (err) { toast(errorMessage(err), 'error'); }
}

async function importDocument() {
  const c = ctx;
  try {
    const text = await api.docImport();
    if (text == null || ctx !== c) return;
    c.editor.appendLines(text.replace(/\r/g, '').split('\n').map((line) => ({ t: null, text: line })));
    toast('Document added to the end of your note.');
  } catch (err) { toast(errorMessage(err), 'error'); }
}

function renderMeta() {
  const { note } = ctx;
  const bits = [];
  if (note.audio && note.audio.duration) bits.push(note.audio.trim ? `${fmtTime(note.audio.trim.end - note.audio.trim.start)} (trimmed)` : `${fmtTime(note.audio.duration)} recorded`);
  if (note.locked) bits.push('Locked');
  if (note.reminder && !note.reminderDone) bits.push(`Reminder ${fmtDate(Date.parse(note.reminder), { time: true })}`);
  if (note.pinned) bits.push('Pinned');
  if (note.archived) bits.push('Archived');
  if (ctx.readOnly) bits.push('Reading mode');
  ctx.metaExtra.textContent = bits.join(' · ');
}

// ============================================================ recording ===

function renderRecordButton() {
  const c = ctx;
  const mine = recorder.active && recorder.noteId === c.note.id;
  clear(c.recordBtn);
  c.recordBtn.classList.toggle('is-recording', mine);
  c.recordBtn.append(icon(mine ? 'stop' : 'mic', 16), h('span', { text: mine ? 'Stop' : 'Record' }));
  c.recordBtn.setAttribute('aria-label', mine ? 'Stop recording' : 'Start recording');
}

export async function toggleRecord() {
  const c = ctx;
  if (!c) return;
  const { note } = c;
  if (recorder.active) {
    if (recorder.noteId !== note.id) { toast('Another note is recording. Stop it first.', 'error'); return; }
    await stopRecording();
    return;
  }
  if (note.audio) {
    const ok = await confirmDialog({
      title: 'This note already has a recording',
      body: 'Each note holds one recording. Start a new note in the same course and record there?',
      confirmLabel: 'New note and record',
    });
    if (!ok) return;
    const fresh = newNote({ courseId: note.courseId });
    S.openNote(fresh.id);
    await toggleRecord();
    return;
  }
  if (!S.lib.settings.recordingNoticeSeen) {
    const ok = await confirmDialog({
      title: 'Before you record',
      body: 'Recording a class can need permission. Rules differ by school and by region, and some require everyone being recorded to agree. Check your school\'s policy or ask your lecturer first. Recordings stay on this computer.',
      confirmLabel: 'I understand',
    });
    if (!ok) return;
    S.lib.settings.recordingNoticeSeen = true;
    saveLib();
  }
  try {
    const st = S.lib.settings;
    await recorder.start(note.id, { live: st.liveTranscribe ? { note, model: st.whisperModel, language: st.language } : null });
    c.editor.focus();
    toast('Recording. Lines you type are linked to this moment.');
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

async function stopRecording() {
  const c = ctx;
  const { note } = c;
  try {
    const result = await recorder.stop();
    note.audio = { ext: result.ext, mime: result.mime, duration: result.duration };
    note.silence = null;
    note.updated = Date.now();
    saveNote(note.id, { now: true });
    bus.emit('library');
    if (ctx === c) { renderMeta(); renderPanel(); await loadPlayer(); }
    if (result.liveTranscript) toast('Recording and live transcript saved.');
    else if (S.lib.settings.autoTranscribe) startTranscription(note);
    else toast('Recording saved. Open the Transcript tab to transcribe it.');
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

export async function importAudio({ fromUrl = false } = {}) {
  const c = ctx;
  if (!c) return;
  const { note } = c;
  if (note.audio || recorder.active) { toast('This note already has a recording.', 'error'); return; }
  try {
    let files;
    if (fromUrl) {
      const out = await formDialog({ title: 'Import a video lecture', submitLabel: 'Import', fields: [{ name: 'url', label: 'YouTube or video link', type: 'url', required: true, placeholder: 'https://www.youtube.com/watch?v=…' }],
        intro: 'Only the audio is downloaded, with yt-dlp, then kept on this computer. Only import videos you are allowed to download.' });
      if (!out || !out.url) return;
      toast('Downloading audio…');
      files = [await api.audioFromUrl(out.url)];
    } else files = await api.audioImport();
    if (!files || !files.length) return;
    // First file goes into this note; any others each get a new note in the same course.
    for (const [i, f] of files.slice(1).entries()) {
      const extra = newNote({ title: f.name, courseId: note.courseId });
      await api.audioSave(extra.id, f.ext, f.data);
      extra.audio = { ext: f.ext, mime: null, duration: 0 };
      extra.created += i + 1;
      touchNote(extra);
    }
    const file = files[0];
    await api.audioSave(note.id, file.ext, file.data);
    note.audio = { ext: file.ext, mime: null, duration: 0 };
    if (!note.title) note.title = file.name;
    if (files.length > 1) toast(`${files.length - 1} more recording${files.length > 2 ? 's' : ''} imported as new notes.`);
    touchNote(note);
    bus.emit('library');
    if (ctx === c) { renderMeta(); renderPanel(); await loadPlayer(); }
    if (S.lib.settings.autoTranscribe) startTranscription(note);
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

// ============================================================= playback ===

async function loadPlayer() {
  const c = ctx;
  const { note } = c;
  if (c.player) c.player.destroy();
  c.playerState = 'loading';
  renderTransport();
  const player = new Player({
    onTime: (t) => { if (ctx === c) onPlayhead(t); },
    onState: () => { if (ctx === c) updateTransportState(); },
  });
  c.player = player;
  try {
    const duration = await player.load(note.id, note.audio);
    if (ctx !== c) { player.destroy(); return; }
    if (duration && Math.abs((note.audio.duration || 0) - duration) > 1) { note.audio.duration = duration; saveNote(note.id); bus.emit('library'); renderMeta(); }
    player.setRate(c.rate);
    player.setTrim(note.audio.trim);
    if (S.lib.settings.outputId) player.setOutput(S.lib.settings.outputId);
    if ((S.lib.settings.eq || []).some(Boolean)) player.setEq(S.lib.settings.eq);
    c.playerState = 'ready';
    if (S.pendingSeek !== null && S.pendingSeek !== undefined) { player.seek(S.pendingSeek, { play: true }); S.pendingSeek = null; }
  } catch (err) {
    if (ctx !== c) return;
    c.playerState = 'error';
    toast(errorMessage(err), 'error');
  }
  renderTransport();
  // Timestamp buttons in the transcript are only clickable once audio is ready.
  if (c.tab === 'transcript') renderPanel();
}

export function seek(t) {
  const c = ctx;
  if (!c || !c.player || c.playerState !== 'ready') {
    if (c && recorder.active) toast('Stop recording to play back.');
    return;
  }
  c.player.seek(t, { play: true });
}

export function togglePlay() {
  if (ctx && ctx.player && ctx.playerState === 'ready') ctx.player.toggle();
}

export function playFromCaret() {
  if (!ctx) return;
  const t = ctx.editor.caretTime();
  if (t === null) toast('This line has no timestamp.');
  else seek(t);
}

function onPlayhead(t) {
  const c = ctx;
  if (c.seekBar && !c.seeking) {
    c.seekBar.value = String(t);
    c.seekBar.setAttribute('aria-valuetext', `${fmtTime(t)} of ${fmtTime(c.player.duration)}`);
  }
  if (c.timeLabel) c.timeLabel.textContent = `${fmtTime(t)} / ${fmtTime(c.player.duration)}`;
  c.editor.setPlayhead(c.player.playing || t > 0 ? t : null);
  if (c.tab === 'transcript' && c.trRows.length) {
    let row = null;
    for (const r of c.trRows) { if (r.s <= t + 0.2) row = r; else break; }
    if (row !== c.trNow) {
      if (c.trNow) c.trNow.el.classList.remove('now');
      if (row) {
        row.el.classList.add('now');
        if (c.player.playing) row.el.scrollIntoView({ block: 'nearest' });
      }
      c.trNow = row;
    }
  }
}

function updateTransportState() {
  const c = ctx;
  if (!c.playBtn) return;
  const playing = c.player.playing;
  clear(c.playBtn).append(icon(playing ? 'pause' : 'play', 18));
  c.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
  c.playBtn.title = playing ? 'Pause' : 'Play';
}

function renderTransport() {
  const c = ctx;
  const { note } = c;
  cancelAnimationFrame(c.raf);
  clear(c.transport);
  c.playBtn = c.seekBar = c.timeLabel = null;
  const recordingHere = recorder.active && recorder.noteId === note.id;

  if (recordingHere) {
    const timer = h('span', { class: 'rec-time', role: 'timer', 'aria-label': 'Recording time' }, '0:00');
    const meter = h('span', { class: 'meter-fill' });
    c.transport.className = 'transport is-recording';
    c.transport.append(
      h('span', { class: `rec-dot ${recorder.paused ? 'paused' : ''}`, 'aria-hidden': 'true' }),
      h('strong', { text: recorder.paused ? 'Paused' : 'Recording' }),
      timer,
      h('span', { class: 'meter', 'aria-hidden': 'true' }, meter),
      h('span', { class: 'spacer' }),
      button(recorder.paused ? 'Resume' : 'Pause', () => (recorder.paused ? recorder.resume() : recorder.pause())),
      button('Stop', () => stopRecording(), { kind: 'danger', iconName: 'stop' }),
    );
    const tick = () => {
      if (ctx !== c || !recorder.active) return;
      timer.textContent = fmtTime(recorder.elapsed());
      meter.style.setProperty('width', `${Math.round((recorder.paused ? 0 : recorder.level()) * 100)}%`);
      c.raf = requestAnimationFrame(tick);
    };
    tick();
    return;
  }

  c.transport.className = 'transport';
  if (!note.audio) {
    c.transport.append(
      h('span', { class: 'transport-hint' }, 'No recording yet. Press Record, or import an audio file.'),
      h('span', { class: 'spacer' }),
      button('Import audio', () => importAudio(), { iconName: 'upload' }),
      button('Import from link', () => importAudio({ fromUrl: true }), { iconName: 'download' }),
    );
    return;
  }
  if (c.playerState === 'loading') { c.transport.append(h('span', { class: 'transport-hint' }, 'Loading recording…')); return; }
  if (c.playerState === 'error') { c.transport.append(h('span', { class: 'transport-hint' }, 'The recording could not be opened.')); return; }
  if (c.playerState !== 'ready') return;

  const skipBy = Number(S.lib.settings.skipSeconds) || 10;
  const player = c.player;
  c.playBtn = h('button', { type: 'button', class: 'icon-btn play-btn', onClick: () => player.toggle() });
  c.seekBar = h('input', {
    type: 'range', class: 'seek', min: String(player.start), max: String(player.end || 0), step: '0.1', value: String(player.time), 'aria-label': 'Position in recording',
    onInput: () => { c.seeking = true; if (c.timeLabel) c.timeLabel.textContent = `${fmtTime(Number(c.seekBar.value))} / ${fmtTime(player.duration)}`; },
    onChange: () => { c.seeking = false; player.seek(Number(c.seekBar.value)); },
  });
  c.timeLabel = h('span', { class: 'time-label' }, `${fmtTime(player.time)} / ${fmtTime(player.duration)}`);
  const speedBtn = h('button', { type: 'button', class: 'btn btn-small', 'aria-label': `Playback speed, ${c.rate}×`, 'aria-haspopup': 'menu', onClick: () => {
    showMenu(speedBtn, SPEEDS.map((r) => ({ label: `${r}×`, checked: r === c.rate, onSelect: () => { c.rate = r; player.setRate(r); renderTransport(); } })));
  } }, `${c.rate}×`);
  const silenceBtn = h('button', {
    type: 'button', class: 'btn btn-small', 'aria-pressed': String(c.skipSilence), title: 'Jump over long pauses during playback',
    onClick: () => toggleSkipSilence(),
  }, 'Skip pauses');
  const eqBtn = h('button', { type: 'button', class: 'btn btn-small', 'aria-haspopup': 'dialog', 'aria-pressed': String((S.lib.settings.eq || []).some(Boolean)), onClick: () => openEq(eqBtn) }, 'EQ');
  c.transport.append(
    iconButton('back', `Back ${skipBy} seconds`, () => player.skip(-skipBy)),
    c.playBtn,
    iconButton('forward', `Forward ${skipBy} seconds`, () => player.skip(skipBy)),
    c.seekBar, c.timeLabel, speedBtn, silenceBtn, eqBtn,
  );
  updateTransportState();
}

// Three-band EQ, playback only (Noted's EQ). A small panel under the button.
function openEq(anchor) {
  closeMenu();
  const st = S.lib.settings;
  const eq = (st.eq || [0, 0, 0]).slice();
  const panel = h('div', { class: 'menu eq-panel', role: 'dialog', 'aria-label': 'Equaliser' });
  const apply = () => { st.eq = eq.slice(); saveLib(); if (ctx && ctx.player) ctx.player.setEq(eq); anchor.setAttribute('aria-pressed', String(eq.some(Boolean))); };
  const sliders = ['Low', 'Mid', 'High'].map((label, i) => {
    const out = h('output', { text: `${eq[i] > 0 ? '+' : ''}${eq[i]} dB` });
    const input = h('input', { type: 'range', min: '-12', max: '12', step: '1', value: String(eq[i]), 'aria-label': `${label} (decibels)`,
      onInput: () => { eq[i] = Number(input.value); out.textContent = `${eq[i] > 0 ? '+' : ''}${eq[i]} dB`; apply(); } });
    return h('label', { class: 'eq-row' }, h('span', { text: label }), input, out);
  });
  panel.append(h('strong', { text: 'Equaliser' }), ...sliders, h('div', { class: 'row' },
    button('Reset', () => { eq.fill(0); sliders.forEach((row) => { row.querySelector('input').value = '0'; row.querySelector('output').textContent = '0 dB'; }); apply(); }, { kind: 'small' }),
    h('span', { class: 'footnote', text: 'Changes playback only.' })));
  document.body.append(panel);
  const r = anchor.getBoundingClientRect();
  panel.style.setProperty('left', `${Math.max(8, r.right - panel.offsetWidth)}px`);
  panel.style.setProperty('top', `${Math.max(8, r.top - panel.offsetHeight - 6)}px`);
  panel.querySelector('input').focus();
  const close = (e) => {
    if (e.type === 'keydown' ? e.key !== 'Escape' : panel.contains(e.target) || e.target === anchor) return;
    panel.remove(); document.removeEventListener('mousedown', close, true); document.removeEventListener('keydown', close, true); anchor.focus();
  };
  setTimeout(() => { document.addEventListener('mousedown', close, true); document.addEventListener('keydown', close, true); });
}

// Keeps the time of day so notes from the same day stay in order.
async function changeDate() {
  const c = ctx;
  const { note } = c;
  const d = new Date(note.created);
  const pad = (n) => String(n).padStart(2, '0');
  const out = await formDialog({
    title: 'Lecture date', submitLabel: 'Save',
    fields: [{ name: 'date', label: 'Date', type: 'date', required: true, value: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }],
  });
  if (!out || !/^\d{4}-\d{2}-\d{2}$/.test(out.date)) return;
  const [y, m, day] = out.date.split('-').map(Number);
  d.setFullYear(y, m - 1, day);
  note.created = d.getTime();
  touchNote(note);
  bus.emit('library');
  if (ctx === c) c.dateBtn.textContent = fmtDate(note.created, { weekday: true });
}

async function trimRecording() {
  const c = ctx;
  const { note } = c;
  const dur = (c.player && c.player.duration) || note.audio.duration || 0;
  const t = note.audio.trim || { start: 0, end: dur };
  const out = await formDialog({
    title: 'Trim recording', submitLabel: 'Save',
    intro: `Playback and transcription use only the part between these times (the recording is ${fmtTime(dur)} long). Nothing is deleted, so you can undo this later.`,
    fields: [
      { name: 'start', label: 'Start at (m:ss)', value: fmtTime(t.start), required: true },
      { name: 'end', label: 'End at (m:ss)', value: fmtTime(t.end), required: true },
    ],
  });
  if (!out) return;
  const start = parseTime(out.start);
  const end = Math.min(parseTime(out.end) ?? -1, dur);
  if (start === null || end === null || end - start < 1) { toast('Enter a start before the end, like 1:30 and 52:10.', 'error'); return; }
  note.audio.trim = start <= 0.5 && end >= dur - 0.5 ? null : { start, end };
  touchNote(note);
  if (ctx !== c) return;
  c.player.setTrim(note.audio.trim);
  renderMeta();
  renderTransport();
  if (note.transcript.length) toast('Trimmed. Transcribe again to match the new length.');
}

async function setReminder() {
  const c = ctx;
  const { note } = c;
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date(Date.now() + 3600000);
  const out = await formDialog({
    title: 'Remind me about this note', submitLabel: 'Set reminder',
    intro: 'ListeNote shows a notification at this time while it is open. Leave the time empty to remove the reminder.',
    fields: [{ name: 'when', label: 'When', type: 'datetime-local', value: note.reminder || `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00` }],
  });
  if (!out) return;
  note.reminder = out.when || null;
  note.reminderDone = false;
  touchNote(note);
  if (ctx === c) renderMeta();
  if (out.when) Notification.requestPermission().catch(() => {});
}

async function toggleSkipSilence() {
  const c = ctx;
  const { note } = c;
  if (c.skipSilence) { c.skipSilence = false; c.player.skipSilence = false; renderTransport(); return; }
  try {
    if (!note.silence) { toast('Finding the pauses in this recording…'); await computeSilence(note, c.player.bytes); }
    if (ctx !== c) return;
    c.player.silence = note.silence;
    c.player.skipSilence = true;
    c.skipSilence = true;
    renderTransport();
    if (!note.silence.length) toast('No long pauses found in this recording.');
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

// ================================================================= menu ===

// Opens the open note's menu under `anchor` (the ••• on its card in the notes
// list, or in the header when the list is hidden). Returns false if the note
// is locked and closed.
export function openMoreMenu(anchor = ctx && ctx.moreBtn) {
  const c = ctx;
  if (!c || !c.editor) return false;
  const { note } = c;
  showMenu(anchor, [
    { label: note.pinned ? 'Unpin' : 'Pin to top', icon: 'pin', onSelect: () => { note.pinned = !note.pinned; touchNote(note); renderMeta(); bus.emit('library'); } },
    c.viewer ? null : { label: 'Reading mode', checked: c.readOnly, onSelect: () => { c.readOnly = !c.readOnly; c.editor.setReadOnly(c.readOnly); renderMeta(); } },
    c.viewer ? null : { label: 'Open in new window', icon: 'copy', onSelect: () => api.openWindow(note.id) },
    c.viewer ? null : { label: note.locked ? 'Remove lock…' : 'Lock note…', icon: 'lock', onSelect: () => toggleLock() },
    c.viewer ? null : { label: note.reminder && !note.reminderDone ? 'Change reminder…' : 'Set reminder…', icon: 'calendar', onSelect: () => setReminder() },
    { label: note.archived ? 'Move out of archive' : 'Archive', icon: 'archive', onSelect: () => { note.archived = !note.archived; touchNote(note); renderMeta(); bus.emit('library'); toast(note.archived ? 'Archived.' : 'Restored.'); } },
    'sep',
    c.viewer ? null : { label: 'Import text document…', icon: 'upload', onSelect: () => importDocument() },
    c.viewer ? null : { label: 'Insert image…', icon: 'image', onSelect: () => insertImage() },
    c.viewer ? null : { label: 'Attach file…', icon: 'paperclip', onSelect: () => attachFile() },
    note.audio && !c.viewer ? { label: 'Trim recording…', icon: 'edit', onSelect: () => trimRecording() } : null,
    !note.audio ? { label: 'Import audio…', icon: 'upload', onSelect: () => importAudio() } : null,
    !note.audio ? { label: 'Import from video link…', icon: 'download', onSelect: () => importAudio({ fromUrl: true }) } : null,
    { label: 'Share as web page…', icon: 'send', onSelect: () => exportNote('html') },
    { label: 'Export as PDF', icon: 'download', onSelect: () => exportNote('pdf') },
    { label: 'Export as Markdown', icon: 'download', onSelect: () => exportNote('md') },
    { label: 'Export as plain text', icon: 'download', onSelect: () => exportNote('txt') },
    note.audio ? { label: 'Export recording', icon: 'download', onSelect: () => exportNote('audio') } : null,
    'sep',
    note.audio ? { label: 'Remove recording…', icon: 'trash', danger: true, onSelect: () => removeRecording() } : null,
    c.viewer ? null : { label: 'Delete note…', icon: 'trash', danger: true, onSelect: () => removeNote() },
  ]);
  return true;
}

async function removeRecording() {
  const c = ctx;
  const { note } = c;
  const ok = await confirmDialog({
    title: 'Remove this recording?',
    body: 'The audio and its transcript will be permanently deleted. Your typed notes, summary and flashcards are kept, but their timestamps will no longer play.',
    confirmLabel: 'Remove recording', danger: true,
  });
  if (!ok) return;
  if (transcription.noteId === note.id) cancelTranscription();
  if (c.player) c.player.destroy();
  c.player = null;
  c.playerState = 'none';
  await api.audioDelete(note.id);
  note.audio = null;
  note.transcript = [];
  note.silence = null;
  touchNote(note);
  bus.emit('library');
  if (ctx === c) { renderMeta(); renderTransport(); renderPanel(); }
}

async function removeNote() {
  const { note } = ctx;
  if (recorder.active && recorder.noteId === note.id) { toast('Stop recording first.', 'error'); return; }
  const cards = S.lib.cards.filter((card) => card.noteId === note.id).length;
  const ok = await confirmDialog({
    title: `Delete "${note.title || 'Untitled lecture'}"?`,
    body: `This permanently deletes the note${note.audio ? ', its recording and transcript' : ''}${cards ? `, and ${cards} flashcard${cards === 1 ? '' : 's'} made from it` : ''}. This cannot be undone.`,
    confirmLabel: 'Delete note', danger: true,
  });
  if (!ok) return;
  if (transcription.noteId === note.id) cancelTranscription();
  unmountNote();
  await deleteNote(note.id);
  S.openNote(null);
  toast('Note deleted.');
}

// =============================================================== export ===

function noteHeaderLine(note) {
  const course = courseById(note.courseId);
  return [course ? courseLabel(course) : null, fmtDate(note.created)].filter(Boolean).join(' · ');
}

function toPlain(note, lines, markdown) {
  const out = [markdown ? `# ${note.title || 'Untitled lecture'}` : (note.title || 'Untitled lecture'), markdown ? `*${noteHeaderLine(note)}*` : noteHeaderLine(note), ''];
  const head = (text) => (markdown ? `## ${text}` : `${text.toUpperCase()}`);
  const noteLines = lines.filter((l) => l.text.trim());
  if (noteLines.length) {
    out.push(head('Notes'), '');
    for (const l of noteLines) out.push(l.t !== null ? `[${fmtTime(l.t)}] ${l.text}` : l.text, markdown ? '' : null);
  }
  if (note.summary) out.push('', head('Summary'), '', note.summary.markdown);
  if (note.transcript.length) {
    out.push('', head('Transcript'), '');
    for (const s of note.transcript) out.push(`[${fmtTime(s.s)}] ${s.text}`, markdown ? '' : null);
  }
  return `${out.filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function toPdfBody(note, html) {
  const root = h('div', null, h('h1', { text: note.title || 'Untitled lecture' }), h('div', { class: 'meta', text: noteHeaderLine(note) }));
  const body = h('div');
  body.append(sanitizeHtml(html));
  for (const line of body.querySelectorAll('[data-t]')) {
    line.prepend(h('span', { class: 't', text: line.getAttribute('data-ts') }));
    line.removeAttribute('data-t'); line.removeAttribute('data-ts');
  }
  if (body.textContent.trim()) root.append(h('h2', { text: 'Notes' }), body);
  if (note.summary) {
    const md = renderMarkdown(note.summary.markdown);
    for (const hd of md.querySelectorAll('h2, h3, h4')) hd.replaceWith(h('h3', { text: hd.textContent }));
    root.append(h('h2', { text: 'Summary' }), md);
  }
  if (note.transcript.length) {
    root.append(h('h2', { text: 'Transcript' }), note.transcript.map((s) => h('div', null, h('span', { class: 't', text: fmtTime(s.s) }), s.text)));
  }
  return root.innerHTML;
}

// A single self-contained page anyone can open in a browser: notes, transcript,
// summary and the recording, with clickable timestamps. Replaces Noted's web link,
// since ListeNote has no server to host one.
async function toWebPage(note, c) {
  const toDataUrl = (blob) => new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob); });
  const body = h('div');
  body.innerHTML = toPdfBody(note, c.editor.cleanHtmlForExport());
  for (const img of body.querySelectorAll('img')) {
    const file = img.getAttribute('src').split('/').pop();
    const ext = file.split('.').pop().replace('jpg', 'jpeg');
    img.src = await toDataUrl(new Blob([await api.attachRead(file)], { type: `image/${ext}` }));
  }
  for (const t of body.querySelectorAll('.t')) {
    const sec = parseTime(t.textContent);
    if (sec !== null) t.replaceWith(h('a', { class: 't', href: '#', 'data-t': String(sec), text: t.textContent }));
  }
  let audio = '';
  if (note.audio && c.player && c.player.bytes) {
    audio = `<audio id="a" controls preload="metadata" src="${await toDataUrl(new Blob([c.player.bytes], { type: note.audio.mime || 'audio/webm' }))}"></audio>`;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(note.title || 'Lecture notes')}</title>
<style>
body{font:16px/1.6 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px 16px 120px;color:#1b1a1f;background:#fffdf9}
h1{font:600 28px Georgia,serif;margin:0 0 4px}h2{font:600 19px Georgia,serif;margin:28px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
.meta{color:#5c5a66}.t{display:inline-block;min-width:48px;font:600 12px sans-serif;color:#4338ca;background:#e9e7fb;border-radius:5px;padding:0 5px;margin-right:8px;text-decoration:none}
img{max-width:100%}mark{background:#ffe58a}audio{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;width:min(720px,calc(100% - 32px))}
@media(prefers-color-scheme:dark){body{background:#17161a;color:#ece9e4}.meta{color:#aaa6b3}.t{background:#2b2950;color:#b9b4ff}mark{background:#6b5a12}}
</style></head><body>${body.innerHTML}${audio}
<script>document.addEventListener('click',function(e){var t=e.target.closest('[data-t]');var a=document.getElementById('a');if(!t||!a)return;e.preventDefault();a.currentTime=+t.dataset.t;a.play();});</script>
</body></html>`;
}

async function exportNote(kind) {
  const c = ctx;
  const { note } = c;
  const name = note.title || 'Untitled lecture';
  try {
    let done = false;
    if (kind === 'audio') done = await api.audioExport(note.id, note.audio.ext, name);
    else if (kind === 'html') done = await api.exportText(name, 'html', await toWebPage(note, c));
    else if (kind === 'pdf') done = await api.exportPdf(name, toPdfBody(note, c.editor.cleanHtmlForExport()));
    else done = await api.exportText(name, kind, toPlain(note, c.editor.getLines(), kind === 'md'));
    if (done) toast('Exported.');
  } catch (err) {
    toast(errorMessage(err), 'error');
  }
}

// ================================================================ panel ===

function selectTab(id) {
  const c = ctx;
  c.tab = lastTab = id;
  for (const [i, t] of TABS.entries()) {
    const selected = t.id === id;
    c.tabButtons[i].setAttribute('aria-selected', String(selected));
    c.tabButtons[i].tabIndex = selected ? 0 : -1;
  }
  c.panel.setAttribute('aria-labelledby', `tab-${id}`);
  renderPanel();
}

function renderPanel() {
  const c = ctx;
  c.stream = null;
  c.trRows = [];
  c.trNow = null;
  const scroll = c.panel.scrollTop;
  clear(c.panel);
  ({ transcript: renderTranscript, summary: renderSummary, ask: renderAsk, cards: renderCards, quiz: renderQuiz, practice: renderPractice })[c.tab]();
  if (c.tab !== 'ask') c.panel.scrollTop = scroll;
}

// A job changed. While it is streaming, only swap the streaming text (so focus
// and scroll are left alone); when it starts or ends, redraw the panel.
function onJob(key) {
  const c = ctx;
  const [rawKind, id] = key.split(':');
  if (id !== c.note.id) return;
  const kind = rawKind === 'visual' ? 'practice' : rawKind;
  const running = isRunning(key);
  const was = c.running[key];
  c.running[key] = running;
  if (kind !== c.tab) return;
  if (running && was && c.stream && c.stream.key === key) {
    const j = job(key);
    const nearBottom = c.panel.scrollHeight - c.panel.scrollTop - c.panel.clientHeight < 60;
    c.stream.el.replaceChildren(c.stream.raw ? document.createTextNode(c.stream.raw(j.text)) : renderMarkdown(j.text, { onSeek: seek }));
    if (kind === 'ask' && nearBottom) c.panel.scrollTop = c.panel.scrollHeight;
    return;
  }
  renderPanel();
}

// The note plus the course-material passages most related to it (and to the
// student's question, when there is one).
async function contextFor(note, extra = '') {
  const lines = ctx.editor.getLines();
  const course = courseById(note.courseId);
  const transcript = note.speakers ? note.transcript.map((s) => ({ ...s, text: s.spk != null ? `${note.speakers[s.spk]}: ${s.text}` : s.text })) : note.transcript;
  const query = `${extra} ${extra} ${note.title} ${note.text} ${note.transcript.slice(0, 400).map((s) => s.text).join(' ')}`;
  const sources = note.courseId ? await sourcesFor(note.courseId, query) : [];
  const built = buildContext({ title: note.title, course: course ? courseLabel(course) : '', lines, transcript, sources });
  built.empty = built.empty && !sources.length;
  const hasTimes = note.transcript.length > 0 || lines.some((l) => l.t !== null);
  return { built, hasTimes };
}

function aiGate(what) {
  const ready = aiReady();
  if (ready.ok) return null;
  return h('div', { class: 'notice notice-warn' }, h('p', { text: `${what} needs an AI. ${ready.reason}` }), button('Open Settings', () => S.go({ kind: 'settings' })));
}

function nothingToStudy() {
  return h('div', { class: 'notice' }, h('p', { text: 'There is nothing to work from yet. Type some notes, or transcribe the recording first.' }));
}

function aiFootnote() {
  const ready = aiReady();
  return h('p', { class: 'footnote', text: ready.ok ? `Uses ${ready.label} on your account. The note text and transcript are sent to that service.` : '' });
}

function streamBox(key, { raw = null } = {}) {
  const j = job(key);
  const el = h('div', { class: 'stream', 'aria-live': 'off' }, raw ? raw(j.text) : renderMarkdown(j.text, { onSeek: seek }));
  ctx.stream = { key, el, raw };
  return el;
}

function workingRow(label, key) {
  return h('div', { class: 'working', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { text: label }), h('span', { class: 'spacer' }), button('Stop', () => cancelAI(key), { kind: 'small' }));
}

function jobError(key) {
  const j = job(key);
  if (!j || j.running || !j.error || j.error === 'Cancelled.') return null;
  return h('div', { class: 'notice notice-error', role: 'alert' }, h('p', { text: j.error }));
}

// ------------------------------------------------------------ transcript ---

function startTranscription(note) {
  transcribeNote(note).then((finished) => {
    if (finished) toast(note.transcript.length ? 'Transcript ready.' : 'No speech was found in this recording.');
  }).catch((err) => toast(errorMessage(err), 'error'));
}

function renderTranscript() {
  const c = ctx;
  const { note } = c;
  const settings = S.lib.settings;

  if (transcription.noteId === note.id) {
    const downloading = transcription.modelPercent !== null && transcription.modelPercent < 100;
    const pct = downloading ? transcription.modelPercent : transcription.percent;
    const label = transcription.phase === 'decoding' ? 'Preparing audio…'
      : downloading ? `Downloading speech model (one time)… ${pct}%`
        : `Transcribing on this computer… ${pct}%`;
    c.panel.append(h('div', { class: 'progress-block' },
      h('p', { id: 'tr-progress-label', text: label }),
      h('div', { class: 'progress', role: 'progressbar', 'aria-labelledby': 'tr-progress-label', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct) },
        h('span', { class: 'progress-fill', style: { width: `${pct}%` } })),
      button('Cancel', () => cancelTranscription(), { kind: 'small' }),
    ));
    if (!note.transcript.length) return;
  }

  const live = transcription.live === note.id;
  if (live) {
    c.panel.append(h('div', { class: 'working', role: 'status' }, h('span', { class: 'rec-dot', 'aria-hidden': 'true' }),
      h('span', { text: transcription.modelPercent != null ? `Downloading speech model (one time)… ${transcription.modelPercent}%`
        : note.transcript.length ? 'Transcribing live…' : 'Transcribing live. The first lines appear about 10 seconds in.' })));
    if (!note.transcript.length) return;
  }

  if (!note.audio && !live) {
    c.panel.append(emptyState('mic', 'No recording yet', 'Record this class or import an audio file, and ListeNote will turn it into a searchable transcript on your computer.'));
    return;
  }

  if (!note.transcript.length) {
    if (transcription.noteId === note.id) return;
    const busy = !!transcription.noteId || recorder.active;
    c.panel.append(emptyState('notes', 'Transcribe this recording',
      `Runs entirely on this computer using the Whisper "${settings.whisperModel}" model. The first time, the model (about ${MODEL_SIZES[settings.whisperModel] || '290 MB'}) is downloaded from Hugging Face. Your audio is never uploaded.`,
      button(busy ? 'Another transcription is running' : 'Transcribe', () => startTranscription(note), { kind: 'primary', attrs: { disabled: busy } }),
      button('Change model or language', () => S.go({ kind: 'settings' }))));
    return;
  }

  const search = h('input', { type: 'search', class: 'input', placeholder: 'Search transcript', 'aria-label': 'Search transcript', value: c.trQuery, onInput: () => { c.trQuery = search.value; drawRows(); } });
  const count = h('span', { class: 'footnote', 'aria-live': 'polite' });
  const moreBtn = iconButton('more', 'Transcript actions', () => showMenu(moreBtn, [
    { label: 'Insert into note', icon: 'edit', onSelect: () => { c.editor.appendLines(note.transcript.map((s) => ({ t: s.s, text: s.text }))); toast('Transcript added to the end of your note.'); } },
    { label: 'Copy transcript', icon: 'copy', onSelect: () => copyText(note.transcript.map((s) => `[${fmtTime(s.s)}] ${s.text}`).join('\n')) },
    'sep',
    { label: 'Transcribe again…', icon: 'refresh', onSelect: async () => {
      if (transcription.noteId) { toast('A transcription is already running.', 'error'); return; }
      if (await confirmDialog({ title: 'Transcribe again?', body: 'The current transcript will be replaced. Use this after changing the speech model or language in Settings.', confirmLabel: 'Replace transcript' })) startTranscription(note);
    } },
  ]));
  const rowsEl = h('div', { class: 'tr-rows' });
  c.panel.append(h('div', { class: 'panel-tools' }, search, moreBtn), count, rowsEl);

  function drawRows() {
    const q = c.trQuery.trim().toLowerCase();
    clear(rowsEl);
    c.trRows = [];
    c.trNow = null;
    const playable = c.playerState === 'ready';
    for (const seg of note.transcript) {
      if (q && !seg.text.toLowerCase().includes(q)) continue;
      const prev = c.trRows.length ? c.trRows[c.trRows.length - 1].spk : undefined;
      let chip = null;
      if (note.speakers && seg.spk != null && (seg.spk !== prev || q)) {
        chip = h('button', { type: 'button', class: 'speaker', 'aria-haspopup': 'menu', title: 'Assign speaker', onClick: () => speakerMenu(chip, seg) }, note.speakers[seg.spk] || `Speaker ${seg.spk + 1}`);
      }
      const el = h('div', { class: 'tr-row' },
        h('button', { type: 'button', class: 'ts', disabled: !playable, 'aria-label': `Play from ${fmtTime(seg.s)}`, onClick: () => seek(seg.s) }, fmtTime(seg.s)),
        h('span', { class: 'tr-text' }, chip, seg.text));
      rowsEl.append(el);
      c.trRows.push({ s: seg.s, el, spk: seg.spk });
    }
    count.textContent = q ? `${c.trRows.length} matching line${c.trRows.length === 1 ? '' : 's'}` : '';
    if (q && !c.trRows.length) rowsEl.append(h('p', { class: 'footnote', text: 'No lines match.' }));
  }
  drawRows();

  // Name a speaker everywhere, or move this line to another speaker.
  function speakerMenu(anchor, seg) {
    const names = note.speakers;
    showMenu(anchor, [
      ...names.map((name, i) => ({ label: name, checked: seg.spk === i, onSelect: () => { seg.spk = i; touchNote(note); drawRows(); } })),
      { label: 'New speaker', icon: 'plus', onSelect: () => { names.push(`Speaker ${names.length + 1}`); seg.spk = names.length - 1; touchNote(note); drawRows(); } },
      'sep',
      { label: `Rename "${names[seg.spk]}"…`, icon: 'edit', onSelect: async () => {
        const out = await formDialog({ title: 'Name this speaker', fields: [{ name: 'n', label: 'Name', value: names[seg.spk], required: true, placeholder: 'Prof. Rivera' }] });
        if (out && out.n) { names[seg.spk] = out.n.slice(0, 60); touchNote(note); drawRows(); }
      } },
    ]);
  }
}

// --------------------------------------------------------------- summary ---

async function generateSummary() {
  const c = ctx;
  const { note } = c;
  const { built, hasTimes } = await contextFor(note);
  if (built.empty) { toast('Type some notes or transcribe the recording first.'); return; }
  const key = `summary:${note.id}`;
  try {
    const text = await runAI(key, summaryPrompt(built, { today: todayStr(), hasTimes }));
    note.summary = { markdown: text, created: Date.now(), truncated: built.truncated };
    note.updated = Date.now();
    saveNote(note.id, { now: true });
    clearJob(key);
    bus.emit('job', key);
  } catch (err) {
    if (errorMessage(err) !== 'Cancelled.') toast(errorMessage(err), 'error');
  }
}

function renderSummary() {
  const c = ctx;
  const { note } = c;
  const key = `summary:${note.id}`;
  c.running[key] = isRunning(key);

  if (isRunning(key)) {
    c.panel.append(workingRow('Writing summary…', key), streamBox(key));
    return;
  }
  const err = jobError(key);
  if (err) c.panel.append(err);

  if (!note.summary) {
    const gate = aiGate('A summary');
    c.panel.append(emptyState('sparkle', 'Summarise this lecture', 'Get an overview, the key points with links back to the moment they were said, key terms, and any deadlines that were mentioned.',
      gate ? null : button('Write summary', () => generateSummary(), { kind: 'primary', iconName: 'sparkle' })), gate, gate ? null : aiFootnote());
    return;
  }

  const added = new Set(S.lib.assignments.filter((a) => a.noteId === note.id).map((a) => a.title));
  const md = renderMarkdown(note.summary.markdown, {
    onSeek: note.audio ? seek : null,
    onTask: (todo) => {
      if (!todo.title || /^none/i.test(todo.title)) return;
      addAssignment({ title: todo.title, due: todo.due, courseId: note.courseId, noteId: note.id });
      toast(todo.due ? 'Added to assignments.' : 'Added to assignments with no due date. Set one in Assignments.');
    },
  });
  for (const li of md.querySelectorAll('li.task')) {
    const b = li.querySelector('button');
    const text = li.querySelector('span').textContent;
    if ([...added].some((t) => text.startsWith(t))) { b.disabled = true; b.textContent = 'Added'; }
  }
  c.panel.append(
    h('div', { class: 'panel-tools' },
      h('span', { class: 'footnote', text: `Written ${fmtDate(note.summary.created)}${note.summary.truncated ? ' · long transcript was cut short' : ''}` }),
      h('span', { class: 'spacer' }),
      iconButton('copy', 'Copy summary', () => copyText(note.summary.markdown)),
      iconButton('refresh', 'Write summary again', () => generateSummary())),
    md,
    h('p', { class: 'footnote', text: 'AI summaries can contain mistakes. Check important details against the recording.' }),
  );
}

// ------------------------------------------------------------------- ask ---

async function sendQuestion(question) {
  const c = ctx;
  const { note } = c;
  const { built, hasTimes } = await contextFor(note, question);
  if (built.empty) { toast('Type some notes or transcribe the recording first.'); return; }
  const key = `ask:${note.id}`;
  const history = note.chat.slice();
  note.chat.push({ role: 'user', text: question });
  saveNote(note.id);
  try {
    const text = await runAI(key, askPrompt(built, history, question, { hasTimes }));
    note.chat.push({ role: 'assistant', text });
    saveNote(note.id, { now: true });
    clearJob(key);
    bus.emit('job', key);
  } catch (err) {
    if (errorMessage(err) === 'Cancelled.') { note.chat.pop(); saveNote(note.id); bus.emit('job', key); }
  }
}

function renderAsk() {
  const c = ctx;
  const { note } = c;
  const key = `ask:${note.id}`;
  const running = isRunning(key);
  c.running[key] = running;
  const gate = aiGate('Asking questions');

  const log = h('div', { class: 'chat', role: 'log', 'aria-label': 'Questions and answers' });
  if (!note.chat.length && !running) {
    log.append(emptyState('sparkle', 'Ask about this lecture', 'Ask anything about your notes and the transcript. Answers link back to the moment in the recording.'));
    if (!gate) {
      log.append(h('div', { class: 'suggestions' }, ['Explain the hardest idea in simpler terms', 'What should I review before the exam?', 'What did the lecturer say was most important?']
        .map((s) => h('button', { type: 'button', class: 'chip', onClick: () => sendQuestion(s) }, s))));
    }
  }
  for (const m of note.chat) {
    log.append(h('div', { class: `msg msg-${m.role}` }, h('span', { class: 'sr-only', text: m.role === 'user' ? 'You asked: ' : 'Answer: ' }),
      m.role === 'user' ? h('p', { text: m.text }) : renderMarkdown(m.text, { onSeek: note.audio ? seek : null })));
  }
  if (running) log.append(h('div', { class: 'msg msg-assistant' }, streamBox(key)), workingRow('Thinking…', key));
  const err = jobError(key);
  if (err) log.append(err);
  c.panel.append(log);

  if (gate) { c.panel.append(gate); return; }
  const input = h('textarea', { class: 'input', rows: 2, placeholder: 'Ask a question…', 'aria-label': 'Your question', disabled: running,
    onKeydown: (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } } });
  const submit = () => {
    const q = input.value.trim();
    if (!q || isRunning(key)) return;
    sendQuestion(q);
  };
  c.panel.append(h('form', { class: 'ask-form', onSubmit: (e) => { e.preventDefault(); submit(); } },
    input,
    h('div', { class: 'ask-actions' },
      note.chat.length ? button('Clear', async () => {
        if (await confirmDialog({ title: 'Clear this conversation?', body: 'All questions and answers for this note will be deleted.', confirmLabel: 'Clear', danger: true })) { note.chat = []; saveNote(note.id); clearJob(key); renderPanel(); }
      }, { kind: 'small' }) : null,
      h('span', { class: 'spacer' }),
      h('button', { type: 'submit', class: 'btn btn-primary', disabled: running }, icon('send', 16), h('span', { text: 'Ask' })))),
  aiFootnote());
  c.panel.scrollTop = c.panel.scrollHeight;
}

// ------------------------------------------------------------ flashcards ---

async function generateCards() {
  const c = ctx;
  const { note } = c;
  const { built, hasTimes } = await contextFor(note);
  if (built.empty) { toast('Type some notes or transcribe the recording first.'); return; }
  const key = `cards:${note.id}`;
  const existing = S.lib.cards.filter((card) => card.noteId === note.id).map((card) => card.front);
  try {
    const text = await runAI(key, flashcardPrompt(built, { count: 10, hasTimes, existing }));
    const cards = normalizeCards(extractJson(text));
    if (!cards.length) throw new Error('The AI did not return any usable flashcards. Try again.');
    const now = Date.now();
    for (const card of cards) {
      S.lib.cards.push({ id: uid(), noteId: note.id, courseId: note.courseId, front: card.front, back: card.back, t: card.t, created: now, ...newCardSchedule(now) });
    }
    saveLib();
    clearJob(key);
    bus.emit('library');
    bus.emit('job', key);
    toast(`${cards.length} flashcards added.`);
  } catch (err) {
    const j = job(key);
    if (j) j.error = errorMessage(err);
    bus.emit('job', key);
  }
}

function renderCards() {
  const c = ctx;
  const { note } = c;
  const key = `cards:${note.id}`;
  c.running[key] = isRunning(key);
  const cards = S.lib.cards.filter((card) => card.noteId === note.id);
  const gate = aiGate('Making flashcards');

  if (isRunning(key)) {
    c.panel.append(workingRow('Writing flashcards…', key));
    ctx.stream = { key, el: h('span'), raw: () => '' };
  }
  const err = jobError(key);
  if (err) c.panel.append(err);

  if (!cards.length) {
    if (!isRunning(key)) {
      c.panel.append(emptyState('cards', 'Flashcards from this lecture', 'ListeNote writes question-and-answer cards from your notes and transcript, then schedules them for review so you see each card just before you would forget it.',
        gate ? null : button('Make 10 flashcards', () => generateCards(), { kind: 'primary', iconName: 'sparkle' })), gate, gate ? null : aiFootnote());
    }
    return;
  }

  const due = dueCards().filter((card) => card.noteId === note.id).length;
  c.panel.append(h('div', { class: 'panel-tools' },
    h('span', { class: 'footnote', text: `${cards.length} card${cards.length === 1 ? '' : 's'} · ${due} due` }),
    h('span', { class: 'spacer' }),
    button('Review', () => S.go({ kind: 'review', courseId: note.courseId || null }), { kind: 'small', iconName: 'cards' }),
    gate || isRunning(key) ? null : button('Make more', () => generateCards(), { kind: 'small', iconName: 'sparkle' })));
  c.panel.append(h('ul', { class: 'card-list' }, cards.map((card) => h('li', { class: 'card-item' },
    h('div', { class: 'card-text' }, h('p', { class: 'card-front', text: card.front }), h('p', { class: 'card-back', text: card.back })),
    h('div', { class: 'card-tools' },
      card.t !== null && card.t !== undefined && note.audio ? h('button', { type: 'button', class: 'ts', 'aria-label': `Play from ${fmtTime(card.t)}`, onClick: () => seek(card.t) }, fmtTime(card.t)) : null,
      iconButton('trash', `Delete card: ${card.front}`, () => {
        S.lib.cards = S.lib.cards.filter((x) => x.id !== card.id);
        saveLib(); bus.emit('library'); renderPanel();
      }, { size: 15 }))))));
}

// ------------------------------------------------------------------ quiz ---

async function generateQuiz() {
  const c = ctx;
  const { note } = c;
  const { built, hasTimes } = await contextFor(note);
  if (built.empty) { toast('Type some notes or transcribe the recording first.'); return; }
  const key = `quiz:${note.id}`;
  try {
    const text = await runAI(key, quizPrompt(built, { count: 8, hasTimes }));
    const questions = normalizeQuiz(extractJson(text));
    if (!questions.length) throw new Error('The AI did not return a usable quiz. Try again.');
    note.quiz = { questions, created: Date.now() };
    saveNote(note.id, { now: true });
    if (ctx === c) { c.quizAnswers = {}; c.quizChecked = false; }
    clearJob(key);
    bus.emit('job', key);
  } catch (err) {
    const j = job(key);
    if (j) j.error = errorMessage(err);
    bus.emit('job', key);
  }
}

function renderQuiz() {
  const c = ctx;
  const { note } = c;
  const key = `quiz:${note.id}`;
  c.running[key] = isRunning(key);
  const gate = aiGate('Making a quiz');

  if (isRunning(key)) {
    c.panel.append(workingRow('Writing quiz…', key));
    ctx.stream = { key, el: h('span'), raw: () => '' };
    return;
  }
  const err = jobError(key);
  if (err) c.panel.append(err);

  if (!note.quiz) {
    c.panel.append(emptyState('checklist', 'Practice quiz', 'Test yourself with multiple-choice questions written from this lecture. Each answer explains why, and links to where it was covered.',
      gate ? null : button('Make a quiz', () => generateQuiz(), { kind: 'primary', iconName: 'sparkle' })), gate, gate ? null : aiFootnote());
    return;
  }

  const { questions } = note.quiz;
  const checked = c.quizChecked;
  const score = questions.filter((q, i) => c.quizAnswers[i] === q.answer).length;
  if (checked) {
    c.panel.append(h('div', { class: 'score', role: 'status' }, h('strong', { text: `${score} of ${questions.length} correct` }),
      h('span', { class: 'spacer' }),
      button('Try again', () => { c.quizAnswers = {}; c.quizChecked = false; renderPanel(); c.panel.scrollTop = 0; }, { kind: 'small' }),
      gate ? null : button('New quiz', () => generateQuiz(), { kind: 'small', iconName: 'sparkle' })));
  }
  questions.forEach((q, i) => {
    const chosen = c.quizAnswers[i];
    c.panel.append(h('fieldset', { class: 'question' },
      h('legend', { text: `${i + 1}. ${q.q}` }),
      q.options.map((opt, oi) => {
        const state = !checked ? '' : oi === q.answer ? 'correct' : chosen === oi ? 'wrong' : '';
        return h('label', { class: `option ${state}` },
          h('input', { type: 'radio', name: `q-${note.id}-${i}`, checked: chosen === oi, disabled: checked, onChange: () => { c.quizAnswers[i] = oi; checkBtn.disabled = Object.keys(c.quizAnswers).length < questions.length; } }),
          h('span', { text: opt }),
          state === 'correct' ? h('span', { class: 'option-tag', text: 'Correct answer' }) : state === 'wrong' ? h('span', { class: 'option-tag', text: 'Your answer' }) : null);
      }),
      checked ? h('div', { class: 'explain' },
        h('p', { text: q.explain || '' }),
        q.t !== null && note.audio ? h('button', { type: 'button', class: 'ts', 'aria-label': `Play from ${fmtTime(q.t)}`, onClick: () => seek(q.t) }, fmtTime(q.t)) : null) : null,
    ));
  });
  const checkBtn = button('Check answers', () => { c.quizChecked = true; renderPanel(); c.panel.scrollTop = 0; }, { kind: 'primary', attrs: { disabled: Object.keys(c.quizAnswers).length < questions.length } });
  if (!checked) c.panel.append(h('div', { class: 'quiz-actions' }, checkBtn, h('span', { class: 'footnote', text: 'Answer every question to check.' })));
}

// -------------------------------------------------------------- practice ---

async function generateProblems(level, focus) {
  const c = ctx;
  const { note } = c;
  const { built } = await contextFor(note, focus);
  if (built.empty) { toast('Type some notes, transcribe the recording, or add course materials first.'); return; }
  const key = `practice:${note.id}`;
  try {
    const text = await runAI(key, practicePrompt(built, { count: 5, level, focus }));
    const data = extractJson(text);
    const problems = (Array.isArray(data) ? data : []).map((p) => ({
      problem: String(p.problem || '').slice(0, 3000), hint: String(p.hint || '').slice(0, 600),
      solution: String(p.solution || '').slice(0, 6000), answer: String(p.answer || '').slice(0, 400),
    })).filter((p) => p.problem && p.solution);
    if (!problems.length) throw new Error('The AI did not return usable problems. Try again.');
    note.practice = { level, focus, problems, created: Date.now() };
    saveNote(note.id, { now: true });
    if (ctx === c) c.shown = {};
    clearJob(key);
    bus.emit('job', key);
  } catch (err) {
    const j = job(key);
    if (j) j.error = errorMessage(err);
    bus.emit('job', key);
  }
}

async function generateVisual(topic) {
  const c = ctx;
  const { note } = c;
  const { built } = await contextFor(note, topic);
  if (built.empty) { toast('Type some notes, transcribe the recording, or add course materials first.'); return; }
  const key = `visual:${note.id}`;
  try {
    const v = parseVisual(await runAI(key, visualPrompt(built, { topic })));
    note.visuals = [{ id: uid(), topic, ...v, created: Date.now() }, ...(note.visuals || [])].slice(0, 20);
    saveNote(note.id, { now: true });
    clearJob(key);
    bus.emit('job', key);
  } catch (err) {
    const j = job(key);
    if (j) j.error = errorMessage(err);
    bus.emit('job', key);
  }
}

// AI-drawn SVG is shown as an <img>: inside an image, SVG cannot run scripts or
// load anything, so a bad or hostile drawing is harmless.
function diagram(v) {
  const fig = h('figure', { class: 'diagram' },
    h('button', { type: 'button', class: 'diagram-zoom', 'aria-label': `Enlarge diagram: ${v.title}`, onClick: () => {
      const on = fig.classList.toggle('zoomed');
      fig.querySelector('.diagram-zoom').setAttribute('aria-label', `${on ? 'Shrink' : 'Enlarge'} diagram: ${v.title}`);
    } }, h('img', { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(v.svg)}`, alt: v.description })),
    h('figcaption', null, h('strong', { text: v.title }), h('span', { text: v.description })));
  return fig;
}

function renderPractice() {
  const c = ctx;
  const { note } = c;
  const pKey = `practice:${note.id}`;
  const vKey = `visual:${note.id}`;
  c.running[pKey] = isRunning(pKey);
  c.running[vKey] = isRunning(vKey);
  c.shown = c.shown || {};
  const gate = aiGate('Practice problems and diagrams');
  if (gate) { c.panel.append(gate); return; }
  const mats = note.courseId ? courseMaterials(note.courseId).length : 0;
  c.panel.append(h('p', { class: 'footnote', text: mats ? `Uses this lecture and ${mats} course material file${mats === 1 ? '' : 's'}.` : note.courseId ? 'Tip: add slides or a textbook under the course\'s "Course materials" for better problems.' : 'Tip: put this note in a course and add course materials for better problems.' }));

  // Problems
  const level = h('select', { class: 'input input-small', 'aria-label': 'Difficulty' },
    [['fundamentals', 'Fundamentals'], ['practice', 'Practice'], ['challenge', 'Challenge']].map(([v, l]) => h('option', { value: v, selected: (note.practice && note.practice.level) === v, text: l })));
  const focus = h('input', { type: 'text', class: 'input input-small', placeholder: 'Focus (optional)', 'aria-label': 'Focus for the problems' });
  c.panel.append(h('h3', { class: 'panel-h', text: 'Practice problems' }),
    isRunning(pKey) ? workingRow('Writing problems…', pKey) : h('div', { class: 'panel-tools wrap' }, level, focus, button('Make 5 problems', () => generateProblems(level.value, focus.value.trim()), { kind: 'primary', iconName: 'sparkle' })));
  const pErr = jobError(pKey);
  if (pErr) c.panel.append(pErr);
  if (note.practice && !isRunning(pKey)) {
    note.practice.problems.forEach((p, i) => {
      const s = c.shown[i] || {};
      const toggle = (k) => { c.shown[i] = { ...s, [k]: !s[k] }; renderPanel(); };
      c.panel.append(h('div', { class: 'question' },
        h('div', { class: 'problem-n', text: `Problem ${i + 1}` }), renderMarkdown(p.problem, { onSeek: note.audio ? seek : null }),
        h('div', { class: 'row' },
          p.hint ? h('button', { type: 'button', class: 'btn btn-small', 'aria-expanded': String(!!s.hint), onClick: () => toggle('hint') }, s.hint ? 'Hide hint' : 'Hint') : null,
          h('button', { type: 'button', class: 'btn btn-small', 'aria-expanded': String(!!s.sol), onClick: () => toggle('sol') }, s.sol ? 'Hide solution' : 'Show solution')),
        s.hint ? h('p', { class: 'explain', text: p.hint }) : null,
        s.sol ? h('div', { class: 'explain' }, renderMarkdown(p.solution, { onSeek: note.audio ? seek : null }), p.answer ? h('p', null, h('strong', { text: 'Answer: ' }), p.answer) : null) : null));
    });
  }

  // Diagrams
  const topic = h('input', { type: 'text', class: 'input input-small', placeholder: 'What to draw (optional)', 'aria-label': 'Diagram topic' });
  c.panel.append(h('h3', { class: 'panel-h', text: 'Concept diagrams' }),
    isRunning(vKey) ? workingRow('Drawing diagram…', vKey) : h('div', { class: 'panel-tools wrap' }, topic, button('Draw diagram', () => generateVisual(topic.value.trim()), { kind: 'primary', iconName: 'sparkle' })));
  const vErr = jobError(vKey);
  if (vErr) c.panel.append(vErr);
  for (const v of note.visuals || []) {
    c.panel.append(h('div', { class: 'diagram-wrap' }, diagram(v), iconButton('trash', `Delete diagram: ${v.title}`, () => {
      note.visuals = note.visuals.filter((x) => x !== v); saveNote(note.id); renderPanel();
    }, { size: 15 })));
  }
  c.panel.append(aiFootnote(), h('p', { class: 'footnote', text: 'AI-written problems and diagrams can contain mistakes. Check them against your materials.' }));
}
