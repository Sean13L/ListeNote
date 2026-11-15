// Pure helpers with no DOM or Electron dependency, so they run under
// `node --test` as well as in the app window.

export function uid() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += (b % 36).toString(36);
  return out;
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function parseTime(str) {
  const parts = String(str).trim().split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

export function extractTags(text) {
  const found = new Set();
  const re = /(?:^|[\s(>])#([\p{L}\p{N}][\p{L}\p{N}_-]{0,39})/gu;
  let m;
  while ((m = re.exec(String(text || '')))) found.add(m[1].toLowerCase());
  return [...found];
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// ------------------------------------------------------------ dates ---

export function todayStr(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function daysUntil(dateStr, today = todayStr()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return null;
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function dueLabel(dateStr, today = todayStr()) {
  const d = daysUntil(dateStr, today);
  if (d === null) return 'No due date';
  if (d < -1) return `${-d} days overdue`;
  if (d === -1) return 'Due yesterday';
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  if (d < 7) return `Due in ${d} days`;
  return `Due ${new Date(`${dateStr}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

// ---------------------------------------------- spaced repetition ---
// A small SM-2 variant. grade: 0 Again, 1 Hard, 2 Good, 3 Easy.

const DAY = 86400000;

export function newCardSchedule(now = Date.now()) {
  return { ease: 2.5, interval: 0, reps: 0, due: now };
}

export function schedule(card, grade, now = Date.now()) {
  let ease = card.ease || 2.5;
  let interval = card.interval || 0;
  let reps = card.reps || 0;
  let due;
  if (grade === 0) {
    ease = Math.max(1.3, ease - 0.2);
    reps = 0;
    interval = 0;
    due = now + 10 * 60 * 1000;
  } else {
    if (grade === 1) {
      ease = Math.max(1.3, ease - 0.15);
      interval = reps === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2));
    } else if (grade === 2) {
      interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(interval + 1, Math.round(interval * ease));
    } else {
      ease = ease + 0.15;
      interval = reps === 0 ? 4 : Math.max(interval + 2, Math.round(interval * ease * 1.3));
    }
    reps += 1;
    due = now + interval * DAY;
  }
  return { ease: +ease.toFixed(2), interval, reps, due };
}

export function intervalLabel(card, grade, now = Date.now()) {
  const next = schedule(card, grade, now);
  if (grade === 0) return '10 min';
  if (next.interval < 30) return `${next.interval} d`;
  if (next.interval < 365) return `${Math.round(next.interval / 30)} mo`;
  return `${(next.interval / 365).toFixed(1)} y`;
}

// ------------------------------------------------------------ audio ---

function frameRms(pcm, start, end) {
  let sum = 0;
  for (let i = start; i < end; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / Math.max(1, end - start));
}

// Whisper works on windows of up to 30 seconds. Cutting on a fixed grid slices
// words in half, so each cut is moved to the quietest moment in the last few
// seconds of its window (usually a pause between sentences).
export function splitPoints(pcm, sampleRate, { maxSec = 29, searchSec = 7 } = {}) {
  const out = [];
  const max = Math.floor(maxSec * sampleRate);
  const search = Math.floor(searchSec * sampleRate);
  const frame = Math.floor(0.1 * sampleRate);
  let start = 0;
  while (start < pcm.length) {
    if (pcm.length - start <= max) { out.push([start, pcm.length]); break; }
    const hi = start + max;
    let best = hi;
    let bestRms = Infinity;
    for (let f = hi - search; f + frame <= hi; f += frame) {
      const r = frameRms(pcm, f, f + frame);
      if (r < bestRms) { bestRms = r; best = f + (frame >> 1); }
    }
    out.push([start, best]);
    start = best;
  }
  return out;
}

export function isSilent(pcm, threshold = 0.0015) {
  return frameRms(pcm, 0, pcm.length) < threshold;
}

// Returns [[startSec, endSec], ...] for stretches quieter than the room's
// speaking level for at least `minSec`.
export function detectSilence(pcm, sampleRate, { minSec = 2, frameSec = 0.05 } = {}) {
  const frame = Math.max(1, Math.floor(frameSec * sampleRate));
  const n = Math.floor(pcm.length / frame);
  if (n === 0) return [];
  const levels = new Float32Array(n);
  for (let i = 0; i < n; i++) levels[i] = frameRms(pcm, i * frame, (i + 1) * frame);
  const sorted = Float32Array.from(levels).sort();
  const loud = sorted[Math.floor(n * 0.9)];
  const threshold = Math.max(0.002, loud * 0.08);
  const out = [];
  let runStart = -1;
  for (let i = 0; i <= n; i++) {
    const quiet = i < n && levels[i] < threshold;
    if (quiet && runStart < 0) runStart = i;
    if (!quiet && runStart >= 0) {
      const s = runStart * frameSec;
      const e = i * frameSec;
      if (e - s >= minSec) out.push([+s.toFixed(2), +e.toFixed(2)]);
      runStart = -1;
    }
  }
  return out;
}

// --------------------------------------------------------- AI output ---

// Models wrap JSON in prose or code fences. Pull out the first complete value.
export function extractJson(text) {
  const src = String(text || '');
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(src);
  const candidates = fenced ? [fenced[1], src] : [src];
  for (const cand of candidates) {
    const startIdx = cand.search(/[[{]/);
    if (startIdx < 0) continue;
    const open = cand[startIdx];
    const close = open === '[' ? ']' : '}';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = startIdx; i < cand.length; i++) {
      const ch = cand[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(cand.slice(startIdx, i + 1)); } catch { break; }
        }
      }
    }
  }
  throw new Error('The AI did not return data in the expected format. Try again.');
}

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

function toSeconds(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  if (typeof v === 'string') return parseTime(v.replace(/[[\]]/g, ''));
  return null;
}

export function normalizeCards(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data && data.cards) ? data.cards : [];
  return list
    .map((c) => ({ front: str(c && (c.front || c.question), 500), back: str(c && (c.back || c.answer), 1500), t: toSeconds(c && c.t) }))
    .filter((c) => c.front && c.back);
}

export function normalizeQuiz(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data && data.questions) ? data.questions : [];
  return list
    .map((q) => {
      const options = Array.isArray(q && q.options) ? q.options.map((o) => str(o, 300)).filter(Boolean) : [];
      let answer = q && q.answer;
      if (typeof answer === 'string') {
        const letter = /^[A-Da-d]$/.exec(answer.trim());
        answer = letter ? letter[0].toUpperCase().charCodeAt(0) - 65 : options.indexOf(answer.trim());
      }
      return { q: str(q && (q.q || q.question), 600), options, answer: Number(answer), explain: str(q && (q.explain || q.explanation), 800), t: toSeconds(q && q.t) };
    })
    .filter((q) => q.q && q.options.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
}

// "- [ ] Problem set 3 (due: 2026-11-20)" -> { title, due }
export function parseTodo(text) {
  const m = /\(\s*due:?\s*([^)]*)\)\s*$/i.exec(text);
  const title = (m ? text.slice(0, m.index) : text).trim();
  const date = m && /^\d{4}-\d{2}-\d{2}$/.test(m[1].trim()) ? m[1].trim() : '';
  return { title, due: date };
}

// ---------------------------------------------------------- markdown ---
// A deliberately small Markdown reader for AI answers. It produces plain data
// (never HTML), and the UI turns that data into DOM nodes, so AI output can
// never inject markup into the page.

export function parseInline(text) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\*([^*\s][^*]*)\*)|(\[(\d{1,2}:\d{2}(?::\d{2})?)\])/g;
  let last = 0;
  let m;
  const src = String(text);
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    if (m[1]) out.push({ t: 'b', v: m[2] });
    else if (m[3]) out.push({ t: 'code', v: m[4] });
    else if (m[5]) out.push({ t: 'i', v: m[6] });
    else if (m[7]) out.push({ t: 'ts', v: m[8], sec: parseTime(m[8]) });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}

export function parseMarkdown(md) {
  const blocks = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { blocks.push({ type: 'p', inline: parseInline(para.join(' ')) }); para = []; } };
  const flushList = () => { if (list) { blocks.push(list); list = null; } };

  for (const rawLine of String(md || '').replace(/\r/g, '').split('\n')) {
    const line = rawLine.trimEnd();
    if (/^```/.test(line.trim())) continue;
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line.trim());
    if (h) {
      flushPara(); flushList();
      blocks.push({ type: 'h', level: Math.min(3, h[1].length), inline: parseInline(h[2].replace(/#+\s*$/, '').trim()) });
      continue;
    }
    const task = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/.exec(line);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (task || ul || ol) {
      flushPara();
      const type = ol && !ul ? 'ol' : 'ul';
      if (!list || list.type !== type) { flushList(); list = { type, items: [] }; }
      if (task) list.items.push({ inline: parseInline(task[2]), task: true, done: task[1] !== ' ', raw: task[2] });
      else list.items.push({ inline: parseInline((ul || ol)[1]) });
      continue;
    }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return blocks;
}

// ------------------------------------------------------------ search ---

export function snippet(text, query, radius = 60) {
  const src = String(text || '').replace(/\s+/g, ' ');
  const idx = src.toLowerCase().indexOf(String(query).toLowerCase());
  if (idx < 0) return null;
  const start = Math.max(0, idx - radius);
  const end = Math.min(src.length, idx + query.length + radius);
  return { before: (start > 0 ? '…' : '') + src.slice(start, idx), match: src.slice(idx, idx + query.length), after: src.slice(idx + query.length, end) + (end < src.length ? '…' : '') };
}

// ------------------------------------------------------------ speakers ---

function cosine(a, b) {
  let d = 0; let x = 0; let y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
  return d / Math.sqrt(x * y || 1);
}

// Group voice fingerprints into speakers: each joins the closest speaker so far
// if similar enough, otherwise starts a new one. Lines with no fingerprint (too
// short) take the previous line's speaker. Returns a speaker index per line.
export function clusterSpeakers(embs, threshold = 0.7) {
  const centroids = [];
  const counts = [];
  const out = [];
  for (const e of embs) {
    if (!e) { out.push(out.length ? out[out.length - 1] : 0); continue; }
    let best = -1; let bestSim = threshold;
    centroids.forEach((c, i) => { const sim = cosine(c, e); if (sim > bestSim) { bestSim = sim; best = i; } });
    if (best < 0) { centroids.push(e.slice()); counts.push(1); best = centroids.length - 1; }
    else {
      const n = ++counts[best];
      centroids[best] = centroids[best].map((v, i) => v + (e[i] - v) / n);
    }
    out.push(best);
  }
  return out;
}

// --------------------------------------------------------------- calendar ---

const icsText = (s) => String(s).replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');

// All-day events for assignments with a due date, importable into any calendar app.
export function toIcs(items, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ListeNote//Assignments//EN', 'CALSCALE:GREGORIAN'];
  for (const a of items) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.due || '')) continue;
    const day = a.due.replace(/-/g, '');
    const next = new Date(`${a.due}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    lines.push('BEGIN:VEVENT', `UID:${a.id}@listenote`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day}`,
      `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`, `SUMMARY:${icsText(a.title)}`,
      a.course ? `DESCRIPTION:${icsText(a.course)}` : null, 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Due tomorrow', 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.filter(Boolean).join('\r\n')}\r\n`;
}

// ------------------------------------------------------------ retrieval ---

const STOP = new Set('the a an and or of to in on for is are was were be by with as at it this that from which what how why when who into its can will not but also these those than then there their they them our your you we he she his her i about more most such each other some any all may one two'.split(' '));
const words = (s) => (String(s).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []).filter((w) => !STOP.has(w));

// Pick the material passages most related to the query (BM25 ranking), up to a
// character budget, so a whole textbook never has to fit into one AI request.
export function rankChunks(chunks, query, budget = 40000) {
  const q = [...new Set(words(query))];
  if (!q.length || !chunks.length) return [];
  const docs = chunks.map((c) => { const tf = new Map(); const ws = words(c.text); for (const w of ws) tf.set(w, (tf.get(w) || 0) + 1); return { c, tf, len: ws.length }; });
  const avg = docs.reduce((n, d) => n + d.len, 0) / docs.length || 1;
  const df = new Map(q.map((w) => [w, docs.filter((d) => d.tf.has(w)).length]));
  const scored = docs.map((d) => ({ c: d.c, score: q.reduce((sum, w) => {
    const f = d.tf.get(w) || 0;
    if (!f) return sum;
    const idf = Math.log(1 + (docs.length - df.get(w) + 0.5) / (df.get(w) + 0.5));
    return sum + idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (d.len / avg))));
  }, 0) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const out = [];
  let used = 0;
  for (const { c } of scored) {
    if (used + c.text.length > budget) continue;
    out.push(c);
    used += c.text.length;
  }
  return out;
}

// ------------------------------------------------------------- calendar ---

function icsDate(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh = '0', mm = '0', ss = '0', z] = m;
  const allDay = !m[4] || /VALUE=DATE(?!-)/.test(params);
  // shortcut: TZID times are read as this computer's local time; fine when the
  // calendar and the student share a timezone, wrong across zones (needs a tz database).
  const date = z ? new Date(Date.UTC(+y, mo - 1, +d, +hh, +mm, +ss)) : new Date(+y, mo - 1, +d, +hh, +mm, +ss);
  return { date, allDay };
}

export function parseIcs(text) {
  const lines = String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let ev = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') { if (ev && ev.start && ev.summary) events.push(ev); ev = null; continue; }
    if (!ev) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const [name, ...params] = line.slice(0, i).split(';');
    const value = line.slice(i + 1);
    const p = params.join(';');
    const unesc = (s) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
    if (name === 'SUMMARY') ev.summary = unesc(value);
    else if (name === 'LOCATION') ev.location = unesc(value);
    else if (name === 'UID') ev.uid = value;
    else if (name === 'RRULE') ev.rrule = Object.fromEntries(value.split(';').map((kv) => kv.split('=')));
    else if (name === 'DTSTART') { const d = icsDate(value, p); if (d) { ev.start = d.date; ev.allDay = d.allDay; } }
    else if (name === 'DTEND') { const d = icsDate(value, p); if (d) ev.end = d.date; }
    else if (name === 'EXDATE') for (const v of value.split(',')) { const d = icsDate(v, p); if (d) ev.exdates.push(d.date.getTime()); }
    else if (name === 'STATUS' && value === 'CANCELLED') ev.cancelled = true;
  }
  return events.filter((e) => !e.cancelled);
}

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// Occurrences between from and to. Handles the repeats class timetables use:
// daily or weekly, with INTERVAL, BYDAY, COUNT, UNTIL and EXDATE.
export function expandEvents(events, from, to) {
  const out = [];
  for (const e of events) {
    const len = (e.end ? e.end - e.start : 3600000);
    const push = (start) => { if (start >= from && start < to && !e.exdates.includes(start.getTime())) out.push({ summary: e.summary, location: e.location || '', start, end: new Date(start.getTime() + len), allDay: e.allDay }); };
    const r = e.rrule;
    if (!r || !['WEEKLY', 'DAILY'].includes(r.FREQ)) { push(e.start); continue; }
    const interval = Math.max(1, Number(r.INTERVAL) || 1);
    const until = r.UNTIL ? icsDate(r.UNTIL, '').date : null;
    let left = r.COUNT ? Number(r.COUNT) : Infinity;
    const byday = r.FREQ === 'WEEKLY' && r.BYDAY ? r.BYDAY.split(',').map((d) => DAYS.indexOf(d.slice(-2))).filter((d) => d >= 0) : null;
    const step = r.FREQ === 'DAILY' ? interval : 7 * interval;
    for (let k = 0; k < 800 && left > 0; k++) {
      const base = new Date(e.start); base.setDate(base.getDate() + k * step);
      if ((until && base > until && !byday) || base > to) break;
      const days = byday ? byday.map((d) => { const x = new Date(base); x.setDate(x.getDate() - x.getDay() + d); return x; }).filter((x) => x >= e.start).sort((a, b) => a - b) : [base];
      for (const day of days) {
        if (left <= 0 || (until && day > until)) break;
        left--;
        push(day);
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
