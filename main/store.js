// On-disk storage. Everything lives under <userData>/data:
//   library.json        courses, assignments, flashcards, study guides, settings
//   notes/<id>.json     one file per note (text, transcript, AI output)
//   audio/<id>.<ext>    the recording for a note
// Writes are atomic (write to a temp file, then rename) so a crash mid-write
// cannot leave a half-written library.

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const ID_RE = /^[a-z0-9]{8,40}$/;
// <noteId>-<random>.<ext>: the note prefix lets a note's files be deleted with it.
const ATTACH_RE = /^[a-z0-9]{8,40}-[a-z0-9]{8,40}\.[a-z0-9]{1,8}$/;
// Fields of a locked note that are encrypted on disk.
const SEALED = ['html', 'text', 'transcript', 'summary', 'chat', 'quiz', 'tags', 'attachments', 'practice', 'visuals', 'speakers'];
const AUDIO_EXTS = new Set(['webm', 'mp3', 'm4a', 'wav', 'ogg', 'aac', 'mp4', 'flac']);

const MIME = {
  webm: 'audio/webm', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4',
  wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac', flac: 'audio/flac',
};

function assertId(id) {
  if (typeof id !== 'string' || !ID_RE.test(id)) throw new Error('Invalid id');
  return id;
}

function assertExt(ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (!AUDIO_EXTS.has(e)) throw new Error('Unsupported audio type');
  return e;
}

class Store {
  constructor(root, safeStorage = null) {
    this.root = root;
    this.safe = safeStorage;
    this.attachDir = path.join(root, 'attachments');
    this.notesDir = path.join(root, 'notes');
    this.audioDir = path.join(root, 'audio');
    this.libraryFile = path.join(root, 'library.json');
    this.queue = Promise.resolve();
    this.streams = new Map();
  }

  ensureDirs() {
    fs.mkdirSync(this.notesDir, { recursive: true });
    fs.mkdirSync(this.audioDir, { recursive: true });
    fs.mkdirSync(this.attachDir, { recursive: true });
  }

  // Serialise writes so two saves of the same file never interleave.
  enqueue(fn) {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  async writeJson(file, value) {
    const tmp = `${file}.${process.pid}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify(value));
    await fsp.rename(tmp, file);
  }

  async readJson(file) {
    try {
      return JSON.parse(await fsp.readFile(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      // Keep the unreadable file for the user rather than overwriting it.
      await fsp.copyFile(file, `${file}.corrupt-${Date.now()}`).catch(() => {});
      return null;
    }
  }

  async loadAll() {
    this.ensureDirs();
    const library = await this.readJson(this.libraryFile);
    const notes = {};
    for (const name of await fsp.readdir(this.notesDir)) {
      if (!name.endsWith('.json')) continue;
      const id = name.slice(0, -5);
      if (!ID_RE.test(id)) continue;
      const note = await this.readJson(path.join(this.notesDir, name));
      if (note && note.id === id) notes[id] = note;
    }
    // Only at startup: a second window must not touch a recording in progress.
    const recovered = this.didRecover ? [] : await this.recoverPartials();
    this.didRecover = true;
    return { library, notes, recovered };
  }

  // A recording is streamed to "<id>.webm.part" while in progress. If the app
  // quit mid-lecture, promote what was captured so the audio is not lost.
  async recoverPartials() {
    const out = [];
    for (const name of await fsp.readdir(this.audioDir)) {
      const m = /^([a-z0-9]{8,40})\.(\w+)\.part$/.exec(name);
      if (!m || !AUDIO_EXTS.has(m[2])) continue;
      const from = path.join(this.audioDir, name);
      const stat = await fsp.stat(from);
      if (stat.size < 1024) { await fsp.rm(from, { force: true }); continue; }
      await fsp.rename(from, path.join(this.audioDir, `${m[1]}.${m[2]}`));
      out.push({ id: m[1], ext: m[2], mime: MIME[m[2]] });
    }
    return out;
  }

  saveLibrary(library) {
    return this.enqueue(() => this.writeJson(this.libraryFile, library));
  }

  saveNote(note) {
    const id = assertId(note && note.id);
    const file = path.join(this.notesDir, `${id}.json`);
    return this.enqueue(async () => {
      const out = this.seal(note);
      // A closed locked note: the window never holds the current sealed copy, so
      // keep the one on disk rather than trusting (or losing) the window's.
      if (note.locked && !note._open) {
        const disk = await this.readJson(file);
        if (disk && disk.sealed) out.sealed = disk.sealed;
        for (const k of SEALED) delete out[k];
        if (disk) for (const k of SEALED) out[k] = disk[k];
      }
      await this.writeJson(file, out);
    });
  }

  // A locked note that is open in the app arrives with its content in the clear
  // (_open). Encrypt that content before it touches the disk. A locked note that
  // is closed arrives without content and keeps its existing sealed copy.
  seal(note) {
    const out = { ...note };
    delete out._open;
    if (!note.locked || !note._open) return out;
    if (!this.safe || !this.safe.isEncryptionAvailable()) throw new Error('Encryption is not available on this computer, so the note cannot be locked.');
    const content = {};
    for (const k of SEALED) { content[k] = note[k]; out[k] = k === 'html' || k === 'text' ? '' : Array.isArray(note[k]) ? [] : null; }
    out.sealed = this.safe.encryptString(JSON.stringify(content)).toString('base64');
    return out;
  }

  async unseal(id) {
    const note = await this.readJson(path.join(this.notesDir, `${assertId(id)}.json`));
    if (!note || !note.sealed) throw new Error('This note is not locked.');
    return JSON.parse(this.safe.decryptString(Buffer.from(note.sealed, 'base64')));
  }

  async addAttachment(noteId, ext, data, name) {
    assertId(noteId);
    const e = String(ext || '').toLowerCase().replace(/^\./, '').replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
    const file = `${noteId}-${require('node:crypto').randomBytes(12).toString('hex').replace(/[^a-z0-9]/g, '')}.${e}`;
    await fsp.writeFile(path.join(this.attachDir, file), data);
    return { file, name: String(name || file).slice(0, 200), size: data.length };
  }

  async deleteNote(id) {
    assertId(id);
    await this.enqueue(() => fsp.rm(path.join(this.notesDir, `${id}.json`), { force: true }));
    await this.deleteAudio(id);
    for (const name of await fsp.readdir(this.attachDir)) {
      if (name.startsWith(`${id}-`)) await fsp.rm(path.join(this.attachDir, name), { force: true });
    }
  }

  audioPath(id, ext) {
    return path.join(this.audioDir, `${assertId(id)}.${assertExt(ext)}`);
  }

  async deleteAudio(id) {
    assertId(id);
    this.abortRecording(id);
    for (const name of await fsp.readdir(this.audioDir)) {
      if (name.startsWith(`${id}.`)) await fsp.rm(path.join(this.audioDir, name), { force: true });
    }
  }

  async saveAudio(id, ext, data) {
    await this.deleteAudio(id);
    await fsp.writeFile(this.audioPath(id, ext), Buffer.from(data));
  }

  async loadAudio(id, ext) {
    const buf = await fsp.readFile(this.audioPath(id, ext));
    return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), mime: MIME[assertExt(ext)] };
  }

  // --- streamed recording -------------------------------------------------
  async beginRecording(id, ext) {
    await this.deleteAudio(id);
    const file = `${this.audioPath(id, ext)}.part`;
    this.streams.set(id, { file, final: this.audioPath(id, ext), stream: fs.createWriteStream(file) });
  }

  appendRecording(id, data) {
    const rec = this.streams.get(assertId(id));
    if (!rec) throw new Error('No recording in progress');
    return new Promise((resolve, reject) => {
      rec.stream.write(Buffer.from(data), (err) => (err ? reject(err) : resolve()));
    });
  }

  async finishRecording(id) {
    const rec = this.streams.get(assertId(id));
    if (!rec) throw new Error('No recording in progress');
    this.streams.delete(id);
    await new Promise((resolve) => rec.stream.end(resolve));
    await fsp.rename(rec.file, rec.final);
  }

  abortRecording(id) {
    const rec = this.streams.get(id);
    if (!rec) return;
    this.streams.delete(id);
    rec.stream.destroy();
    fs.rmSync(rec.file, { force: true });
  }

  async wipe() {
    for (const id of [...this.streams.keys()]) this.abortRecording(id);
    await this.queue;
    await fsp.rm(this.root, { recursive: true, force: true });
    this.ensureDirs();
  }
}

module.exports = { Store, MIME, AUDIO_EXTS, ATTACH_RE, assertId, assertExt };
