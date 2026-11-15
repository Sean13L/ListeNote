const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const load = (rel) => import(path.join(__dirname, '..', 'renderer', 'lib', rel));

test('fmtTime and parseTime round-trip', async () => {
  const { fmtTime, parseTime } = await load('util.js');
  assert.equal(fmtTime(0), '0:00');
  assert.equal(fmtTime(75.9), '1:15');
  assert.equal(fmtTime(3725), '1:02:05');
  assert.equal(parseTime('1:15'), 75);
  assert.equal(parseTime('1:02:05'), 3725);
  assert.equal(parseTime('nope'), null);
  assert.equal(parseTime('12'), null);
});

test('extractTags finds #TimeTags but not mid-word hashes', async () => {
  const { extractTags } = await load('util.js');
  assert.deepEqual(extractTags('Review #exam and #Exam, also #week-3. url.com/#frag C#sharp'), ['exam', 'week-3']);
  assert.deepEqual(extractTags('no tags # here'), []);
});

test('dueLabel describes distance from today', async () => {
  const { dueLabel } = await load('util.js');
  assert.equal(dueLabel('2026-11-14', '2026-11-14'), 'Due today');
  assert.equal(dueLabel('2026-11-15', '2026-11-14'), 'Due tomorrow');
  assert.equal(dueLabel('2026-11-17', '2026-11-14'), 'Due in 3 days');
  assert.equal(dueLabel('2026-11-13', '2026-11-14'), 'Due yesterday');
  assert.equal(dueLabel('2026-11-10', '2026-11-14'), '4 days overdue');
  assert.equal(dueLabel('', '2026-11-14'), 'No due date');
});

test('flashcard scheduling grows intervals and resets on Again', async () => {
  const { schedule, newCardSchedule } = await load('util.js');
  const now = 1_000_000_000_000;
  const DAY = 86400000;
  let card = newCardSchedule(now);
  card = schedule(card, 2, now);
  assert.equal(card.interval, 1);
  card = schedule(card, 2, now);
  assert.equal(card.interval, 3);
  card = schedule(card, 2, now);
  assert.equal(card.interval, 8); // 3 * 2.5 rounded
  assert.equal(card.due, now + 8 * DAY);
  const easy = schedule(card, 3, now);
  assert.ok(easy.interval > 8 * 2.5 && easy.ease > card.ease);
  const hard = schedule(card, 1, now);
  assert.ok(hard.interval > card.interval && hard.interval < 8 * 2.5 && hard.ease < card.ease);
  const again = schedule(card, 0, now);
  assert.equal(again.reps, 0);
  assert.equal(again.due, now + 10 * 60 * 1000);
  for (let i = 0; i < 20; i++) card = schedule(card, 0, now);
  assert.equal(card.ease, 1.3); // never drops below the floor
});

function tone(seconds, sr, amp) {
  const out = new Float32Array(Math.floor(seconds * sr));
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * 220 * i) / sr);
  return out;
}
function concat(...parts) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

test('splitPoints cuts long audio at the quietest moment, covering every sample', async () => {
  const { splitPoints } = await load('util.js');
  const sr = 1000;
  // 26s of sound, a 1s pause, then 33s of sound.
  const pcm = concat(tone(26, sr, 0.5), new Float32Array(sr), tone(33, sr, 0.5));
  const chunks = splitPoints(pcm, sr);
  assert.equal(chunks[0][0], 0);
  assert.equal(chunks.at(-1)[1], pcm.length);
  for (let i = 1; i < chunks.length; i++) assert.equal(chunks[i][0], chunks[i - 1][1]);
  for (const [s, e] of chunks) assert.ok(e - s <= 29 * sr && e > s);
  assert.ok(chunks[0][1] >= 26 * sr && chunks[0][1] <= 27 * sr, `first cut landed in the pause (${chunks[0][1]})`);
  assert.deepEqual(splitPoints(tone(5, sr, 0.5), sr), [[0, 5000]]);
});

test('detectSilence reports only pauses longer than the minimum', async () => {
  const { detectSilence, isSilent } = await load('util.js');
  const sr = 1000;
  const pcm = concat(tone(3, sr, 0.4), new Float32Array(4 * sr), tone(3, sr, 0.4), new Float32Array(sr), tone(2, sr, 0.4));
  const ranges = detectSilence(pcm, sr);
  assert.equal(ranges.length, 1);
  assert.ok(Math.abs(ranges[0][0] - 3) < 0.1 && Math.abs(ranges[0][1] - 7) < 0.1);
  assert.equal(isSilent(new Float32Array(1000)), true);
  assert.equal(isSilent(tone(1, sr, 0.4)), false);
});

test('extractJson survives prose, fences and brackets inside strings', async () => {
  const { extractJson } = await load('util.js');
  assert.deepEqual(extractJson('Here you go:\n```json\n[{"a": "x ] y"}]\n```\nDone.'), [{ a: 'x ] y' }]);
  assert.deepEqual(extractJson('Sure! {"cards": [1, 2]} hope that helps'), { cards: [1, 2] });
  assert.deepEqual(extractJson('[{"q":"say \\"hi\\""}]'), [{ q: 'say "hi"' }]);
  assert.throws(() => extractJson('no data here'), /expected format/);
});

test('normalizeCards and normalizeQuiz drop malformed entries', async () => {
  const { normalizeCards, normalizeQuiz } = await load('util.js');
  assert.deepEqual(
    normalizeCards([{ front: 'Q1', back: 'A1', t: '1:05' }, { front: '', back: 'x' }, { question: 'Q2', answer: 'A2', t: null }, null]),
    [{ front: 'Q1', back: 'A1', t: 65 }, { front: 'Q2', back: 'A2', t: null }],
  );
  const quiz = normalizeQuiz({ questions: [
    { q: 'ok', options: ['a', 'b', 'c', 'd'], answer: 2, explain: 'e', t: '[0:30]' },
    { q: 'letter', options: ['a', 'b', 'c', 'd'], answer: 'B' },
    { q: 'text answer', options: ['a', 'b'], answer: 'b' },
    { q: 'out of range', options: ['a', 'b'], answer: 5 },
    { q: 'no options', answer: 0 },
  ] });
  assert.equal(quiz.length, 3);
  assert.deepEqual(quiz.map((q) => q.answer), [2, 1, 1]);
  assert.equal(quiz[0].t, 30);
});

test('parseMarkdown yields data, with timestamps and to-dos recognised', async () => {
  const { parseMarkdown, parseTodo } = await load('util.js');
  const blocks = parseMarkdown('## Key points\n- **Light** reactions [1:05]\n- plain\n\n## To-do\n- [ ] Problem set 3 (due: 2026-11-20)\n\n<script>alert(1)</script>');
  assert.equal(blocks[0].type, 'h');
  assert.equal(blocks[1].type, 'ul');
  assert.deepEqual(blocks[1].items[0].inline, [{ t: 'b', v: 'Light' }, { t: 'text', v: ' reactions ' }, { t: 'ts', v: '1:05', sec: 65 }]);
  assert.equal(blocks[3].items[0].task, true);
  assert.deepEqual(parseTodo(blocks[3].items[0].raw), { title: 'Problem set 3', due: '2026-11-20' });
  assert.deepEqual(parseTodo('Read chapter 4 (due: unknown)'), { title: 'Read chapter 4', due: '' });
  // Markup in AI output stays inert text.
  assert.deepEqual(blocks[4], { type: 'p', inline: [{ t: 'text', v: '<script>alert(1)</script>' }] });
});

test('buildContext stamps note lines and flags an empty note', async () => {
  const { buildContext, summaryPrompt } = await load('prompts.js');
  const ctx = buildContext({ title: 'Bio', course: 'BIO 101', lines: [{ t: 65, text: 'Calvin cycle' }, { t: null, text: 'no stamp' }], transcript: [{ s: 3, e: 5, text: 'Hello class' }] });
  assert.match(ctx.text, /\[1:05\] Calvin cycle/);
  assert.match(ctx.text, /\nno stamp/);
  assert.match(ctx.text, /\[0:03\] Hello class/);
  assert.equal(ctx.empty, false);
  assert.equal(buildContext({ title: 'x', lines: [], transcript: [] }).empty, true);
  assert.match(summaryPrompt(ctx, { today: '2026-11-14', hasTimes: true }), /Today's date is 2026-11-14/);
  const long = buildContext({ title: 'x', lines: [], transcript: Array.from({ length: 20000 }, (_, i) => ({ s: i, e: i + 1, text: 'word '.repeat(5) })) });
  assert.equal(long.truncated, true);
  assert.ok(long.text.length < 185000);
});

test('splitCommand parses a custom command line without a shell', () => {
  const { splitCommand } = require('../main/llm');
  assert.deepEqual(splitCommand('ollama run "my model" --flag=\'a b\' x'), ['ollama', 'run', 'my model', "--flag='a", "b'", 'x']);
  assert.deepEqual(splitCommand("llm -m 'gpt 4' -s \"be \\\"brief\\\"\""), ['llm', '-m', 'gpt 4', '-s', 'be "brief"']);
  assert.deepEqual(splitCommand(''), []);
});

test('Store saves atomically, rejects unsafe ids, and recovers a cut-off recording', async () => {
  const { Store } = require('../main/store');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'listenote-test-'));
  try {
    const store = new Store(root);
    store.ensureDirs();
    await store.saveLibrary({ courses: [{ id: 'c1' }] });
    await store.saveNote({ id: 'abcdefgh12345678', title: 'T' });
    assert.throws(() => store.saveNote({ id: '../../etc/passwd' }), /Invalid id/);
    assert.throws(() => store.audioPath('abcdefgh12345678', 'exe'), /Unsupported/);

    await store.beginRecording('abcdefgh12345678', 'webm');
    await store.appendRecording('abcdefgh12345678', new Uint8Array(4096).fill(7));
    // Simulate the app quitting mid-lecture: the stream is never finished.
    store.streams.get('abcdefgh12345678').stream.end();
    await new Promise((r) => setTimeout(r, 50));
    store.streams.clear();

    const again = new Store(root);
    const all = await again.loadAll();
    assert.deepEqual(all.library, { courses: [{ id: 'c1' }] });
    assert.equal(all.notes.abcdefgh12345678.title, 'T');
    assert.deepEqual(all.recovered, [{ id: 'abcdefgh12345678', ext: 'webm', mime: 'audio/webm' }]);
    const audio = await again.loadAudio('abcdefgh12345678', 'webm');
    assert.equal(audio.data.byteLength, 4096);

    await again.deleteNote('abcdefgh12345678');
    assert.deepEqual((await again.loadAll()).notes, {});
    assert.deepEqual(fs.readdirSync(path.join(root, 'audio')), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Store seals a locked note and never loses the sealed copy', async () => {
  const { Store } = require('../main/store');
  const fake = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from(`enc:${s}`), decryptString: (b) => b.toString().slice(4) };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'listenote-lock-'));
  try {
    const store = new Store(root, fake);
    store.ensureDirs();
    const id = 'lockedtest123456';
    await store.saveNote({ id, title: 'Secret', locked: true, _open: true, html: '<div>exam answers</div>', text: 'exam answers', transcript: [{ s: 0, e: 1, text: 'hi' }], tags: ['x'] });
    const onDisk = JSON.parse(fs.readFileSync(path.join(root, 'notes', `${id}.json`), 'utf8'));
    assert.equal(onDisk.text, '');
    assert.equal(onDisk._open, undefined);
    assert.ok(onDisk.sealed && !fs.readFileSync(path.join(root, 'notes', `${id}.json`), 'utf8').includes('exam answers'));
    // Closed-note save (e.g. pinning) without content must keep the sealed copy.
    await store.saveNote({ id, title: 'Secret', locked: true, pinned: true, text: '' });
    assert.equal((await store.unseal(id)).text, 'exam answers');
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'notes', `${id}.json`), 'utf8')).pinned, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clusterSpeakers groups similar voices and fills short lines', async () => {
  const { clusterSpeakers } = await load('util.js');
  const A = [1, 0.1, 0]; const A2 = [0.95, 0.15, 0.05]; const B = [0, 1, 0.2];
  assert.deepEqual(clusterSpeakers([A, null, B, A2, null]), [0, 0, 1, 0, 0]);
  assert.deepEqual(clusterSpeakers([null, B]), [0, 0]);
});

test('toIcs writes all-day events and escapes text', async () => {
  const { toIcs } = await load('util.js');
  const ics = toIcs([{ id: 'a1', title: 'Essay; draft, v2', due: '2026-12-31', course: 'BIO 101' }, { id: 'a2', title: 'No date', due: '' }], new Date('2026-11-14T10:00:00Z'));
  assert.match(ics, /DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
  assert.ok(ics.includes('SUMMARY:Essay\\; draft\\, v2'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
});

test('rankChunks returns the passages that match the question, within budget', async () => {
  const { rankChunks } = await load('util.js');
  const chunks = [
    { loc: 'p. 1', text: 'Mitochondria produce ATP through oxidative phosphorylation.' },
    { loc: 'p. 2', text: 'The French revolution began in 1789.' },
    { loc: 'p. 3', text: 'ATP synthase uses a proton gradient across the mitochondria membrane.' },
  ];
  const out = rankChunks(chunks, 'How do mitochondria make ATP?', 1000);
  assert.deepEqual(out.map((c) => c.loc).sort(), ['p. 1', 'p. 3']);
  assert.equal(rankChunks(chunks, 'mitochondria ATP', 70).length, 1);
  assert.deepEqual(rankChunks(chunks, 'the of and'), []);
});

test('parseIcs and expandEvents read a weekly class with an exception', async () => {
  const { parseIcs, expandEvents } = await load('util.js');
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:1', 'SUMMARY:BIO 101 Lecture\\, Hall A', 'DTSTART:20260901T100000', 'DTEND:20260901T112000',
    'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20260930T235959Z', 'EXDATE:20260908T100000', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:2', 'SUMMARY:Dentist', 'DTSTART;VALUE=DATE:20260915', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:3', 'SUMMARY:Cancelled', 'STATUS:CANCELLED', 'DTSTART:20260915T090000', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const events = parseIcs(ics);
  assert.equal(events.length, 2);
  assert.equal(events[0].summary, 'BIO 101 Lecture, Hall A');
  const occ = expandEvents(events, new Date(2026, 8, 1), new Date(2026, 9, 31)).filter((o) => o.summary.startsWith('BIO'));
  // Sep 2026: Tue/Thu from the 1st to the 30th = 9 days, minus the 8th.
  assert.equal(occ.length, 8);
  assert.equal(occ[0].start.getDate(), 1);
  assert.equal(occ[1].start.getDate(), 3);
  assert.ok(!occ.some((o) => o.start.getDate() === 8));
  assert.equal(occ[0].end - occ[0].start, 80 * 60000);
});

test('materials: unzip reads stored and deflated entries, chunks keep page labels', () => {
  const zlib = require('node:zlib');
  const { unzip, chunk } = require('../main/materials');
  // Build a two-file ZIP by hand: one deflated, one stored.
  const files = [['ppt/slides/slide2.xml', '<a:p><a:t>Second &amp; last</a:t></a:p>', 8], ['ppt/slides/slide1.xml', '<a:p><a:t>First</a:t></a:p>', 0]];
  const locals = []; const central = []; let off = 0;
  for (const [name, text, method] of files) {
    const raw = Buffer.from(text); const data = method ? zlib.deflateRawSync(raw) : raw; const n = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42);
    locals.push(lh, n, data); central.push(ch, n); off += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  const zip = unzip(Buffer.concat([...locals, cd, end]));
  assert.equal(zip.get('ppt/slides/slide2.xml')().toString(), files[0][1]);
  assert.equal(zip.get('ppt/slides/slide1.xml')().toString(), files[1][1]);
  assert.throws(() => unzip(Buffer.from('not a zip at all, definitely not a zip file')), /damaged/);
  const parts = chunk([{ loc: 'p. 3', text: `${'x'.repeat(1000)}\n${'y'.repeat(1000)}` }]);
  assert.deepEqual(parts.map((p) => [p.loc, p.text.length]), [['p. 3', 1000], ['p. 3', 1000]]);
});

test('summaryPrompt writes class notes, and exam study notes for a master note', async () => {
  const { buildContext, summaryPrompt } = await load('prompts.js');
  const ctx = buildContext({ title: 'Bio', lines: [{ t: null, text: 'cells' }], transcript: [] });
  assert.match(summaryPrompt(ctx, { today: '2026-11-14', hasTimes: false }), /study notes[\s\S]*## To-do/);
  const m = summaryPrompt(ctx, { today: '2026-11-14', hasTimes: false, master: { kind: 'Midterm', date: '2026-12-01' } });
  assert.match(m, /Midterm on 2026-12-01/);
  assert.match(m, /## Practice questions[\s\S]*## To-do/);
});

test('long material is split into chunks and merged', async () => {
  const { chunkTranscript, mergeNotesPrompt } = await load('prompts.js');
  const tr = Array.from({ length: 1000 }, (_, i) => ({ s: i, e: i + 1, text: 'x'.repeat(88) }));
  const chunks = chunkTranscript(tr, 10000);
  assert.equal(chunks.flat().length, 1000);
  assert.ok(chunks.length >= 10 && chunks.every((c) => c.length * 100 <= 10000));
  const m = mergeNotesPrompt(['A notes', 'B notes'], { title: 'Bio', today: '2026-11-14', hasTimes: true });
  assert.match(m, /part 1 of 2:\nA notes[\s\S]*part 2 of 2:\nB notes[\s\S]*## To-do/);
});

test('splitDiagrams pulls diagram blocks out of notes in order', async () => {
  const { splitDiagrams, parseVisual } = await load('prompts.js');
  const parts = splitDiagrams('## A\n- x\n```diagram\nTITLE: Surplus\nDESCRIPTION: d\n<svg viewBox="0 0 8 8"></svg>\n```\n## B');
  assert.equal(parts.length, 3);
  assert.equal(parseVisual(parts[1].diagram).title, 'Surplus');
  assert.match(parts[2].md, /## B/);
});
