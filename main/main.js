const {
  app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, protocol, session, shell,
  systemPreferences, utilityProcess, desktopCapturer, globalShortcut, safeStorage,
} = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const path = require('node:path');
const { Store, AUDIO_EXTS, assertId, assertExt, ATTACH_RE } = require('./store');
const llm = require('./llm');
const materials = require('./materials');

const RENDERER = path.join(__dirname, '..', 'renderer');
const ORIGIN = 'app://local';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
};

const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let store = null;
let whisper = null;
const whisperPending = new Map();

const dataDir = () => path.join(app.getPath('userData'), 'data');
const modelsDir = () => path.join(app.getPath('userData'), 'models');
const tmpDir = () => path.join(app.getPath('userData'), 'tmp');

// ---------------------------------------------------------------- window ---

function serveApp() {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    if (url.host !== 'local') return new Response('Not found', { status: 404 });
    let rel = decodeURIComponent(url.pathname);
    const att = /^\/attachments\/([^/]+)$/.exec(rel);
    if (att) {
      if (!ATTACH_RE.test(att[1])) return new Response('Not found', { status: 404 });
      try {
        // Served as an image only; nothing the student attaches can run as a page.
        const body = await fsp.readFile(path.join(store.attachDir, att[1]));
        const ext = path.extname(att[1]).slice(1).toLowerCase();
        return new Response(body, { headers: { 'content-type': IMAGE_MIME[ext] || 'application/octet-stream', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'" } });
      } catch { return new Response('Not found', { status: 404 }); }
    }
    if (rel === '/') rel = '/index.html';
    const file = path.normalize(path.join(RENDERER, rel));
    if (!file.startsWith(RENDERER + path.sep)) return new Response('Forbidden', { status: 403 });
    try {
      const body = await fsp.readFile(file);
      return new Response(body, {
        headers: {
          'content-type': MIME[path.extname(file)] || 'application/octet-stream',
          'content-security-policy': CSP,
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-store',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function createWindow(viewNoteId = null) {
  const w = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    show: false,
    title: 'ListeNote',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#17161a' : '#f7f5f0',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: true,
      // Keep timers and recording running at full speed while the student has
      // another app in front during a lecture.
      backgroundThrottling: false,
    },
  });

  w.once('ready-to-show', () => w.show());
  if (!viewNoteId) { win = w; w.on('closed', () => { win = null; }); }

  // The window only ever shows the app itself. Links open in the browser.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  w.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${ORIGIN}/`)) event.preventDefault();
  });

  w.loadURL(`${ORIGIN}/index.html${viewNoteId ? `#view=${viewNoteId}` : ''}`);
  return w;
}

function lockDownPermissions() {
  const ses = session.defaultSession;
  const fromApp = (url) => typeof url === 'string' && url.startsWith(`${ORIGIN}/`);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => {
    const audioOnly = permission === 'media' && (details.mediaTypes || []).every((t) => t === 'audio');
    callback((audioOnly || ['notifications', 'clipboard-sanitized-write'].includes(permission)) && fromApp(details.requestingUrl || wc.getURL()));
  });
  ses.setPermissionCheckHandler((wc, permission, origin) => ['media', 'notifications', 'clipboard-sanitized-write'].includes(permission) && fromApp(`${origin}/`));
  // "Computer audio": grant the system audio mix (meetings, videos). Chromium needs a
  // video source too; the page drops that track straight away.
  ses.setDisplayMediaRequestHandler((request, callback) => {
    if (!fromApp(request.securityOrigin + '/') && !(request.frame && fromApp(request.frame.url))) return callback(null);
    desktopCapturer.getSources({ types: ['screen'] })
      .then((sources) => callback(sources[0] ? { video: sources[0], audio: 'loopback' } : null))
      .catch(() => callback(null));
  });
}

function buildMenu() {
  const send = (action) => () => win && win.webContents.send('menu', action);
  const mac = process.platform === 'darwin';
  const template = [
    ...(mac ? [{
      label: 'ListeNote',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: send('settings') },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Note', accelerator: 'CmdOrCtrl+N', click: send('new-note') },
        { label: 'New Course', accelerator: 'CmdOrCtrl+Shift+N', click: send('new-course') },
        { label: 'New Master Note…', click: send('master') },
        { type: 'separator' },
        { label: 'Import Audio…', click: send('import-audio') },
        ...(mac ? [] : [{ type: 'separator' }, { label: 'Settings', accelerator: 'Ctrl+,', click: send('settings') }, { role: 'quit' }]),
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Note',
      submenu: [
        { label: 'Start or Stop Recording', accelerator: 'CmdOrCtrl+Shift+R', click: send('toggle-record') },
        { label: 'Play or Pause', accelerator: 'CmdOrCtrl+Shift+Space', click: send('toggle-play') },
        { label: 'Play From This Line', accelerator: 'Alt+P', click: send('play-line') },
        { type: 'separator' },
        { label: 'Find', accelerator: 'CmdOrCtrl+F', click: send('find') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Show or Hide Sidebar', accelerator: 'CmdOrCtrl+Alt+1', click: send('side') },
        { label: 'Show or Hide Notes List', accelerator: 'CmdOrCtrl+Alt+2', click: send('list') },
        { label: 'Show or Hide Study Panel', accelerator: 'CmdOrCtrl+Alt+3', click: send('panel') },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --------------------------------------------------------------- whisper ---

function getWhisper() {
  if (whisper) return whisper;
  fs.mkdirSync(modelsDir(), { recursive: true });
  whisper = utilityProcess.fork(path.join(__dirname, 'whisper-worker.js'), [modelsDir()], {
    serviceName: 'ListeNote Transcription',
    stdio: 'ignore',
  });
  whisper.on('message', (msg) => {
    if (msg.type === 'model-progress' || msg.type === 'model-ready') {
      if (win) win.webContents.send('whisper:model', msg);
      return;
    }
    const pending = whisperPending.get(msg.id);
    if (!pending) return;
    whisperPending.delete(msg.id);
    if (msg.type === 'result') pending.resolve(msg.segments);
    else pending.reject(new Error(msg.message || 'Transcription failed.'));
  });
  whisper.on('exit', () => {
    whisper = null;
    for (const p of whisperPending.values()) p.reject(new Error('Transcription stopped.'));
    whisperPending.clear();
  });
  return whisper;
}

function stopWhisper() {
  if (whisper) whisper.kill();
}

// ------------------------------------------------------------------- ipc ---

// Every handler checks that the call came from the app's own page.
function handle(channel, fn) {
  ipcMain.handle(channel, (event, ...args) => {
    const url = event.senderFrame && event.senderFrame.url;
    if (!url || !url.startsWith(`${ORIGIN}/`)) throw new Error('Blocked');
    return fn(event, ...args);
  });
}

const safeName = (name, fallback) =>
  String(name || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || fallback;

function registerIpc() {
  handle('store:load', () => store.loadAll());
  handle('store:saveLibrary', (_e, library) => store.saveLibrary(library));
  handle('store:saveNote', (_e, note) => store.saveNote(note));
  handle('store:deleteNote', (_e, id) => store.deleteNote(id));

  handle('audio:load', (_e, id, ext) => store.loadAudio(id, ext));
  handle('audio:save', (_e, id, ext, data) => store.saveAudio(id, ext, data));
  handle('audio:delete', (_e, id) => store.deleteAudio(id));
  handle('audio:import', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Import a recording',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Audio', extensions: [...AUDIO_EXTS] }],
    });
    if (res.canceled || !res.filePaths.length) return null;
    const out = [];
    for (const file of res.filePaths) {
      const ext = assertExt(path.extname(file));
      const stat = await fsp.stat(file);
      if (stat.size > 1024 * 1024 * 1024) throw new Error(`${path.basename(file)} is larger than 1 GB.`);
      const buf = await fsp.readFile(file);
      out.push({ name: path.basename(file, path.extname(file)), ext, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
    }
    return out;
  });
  handle('doc:import', async () => {
    const res = await dialog.showOpenDialog(win, { title: 'Import a document', properties: ['openFile'], filters: [{ name: 'Text', extensions: ['txt', 'md', 'markdown'] }] });
    if (res.canceled || !res.filePaths[0]) return null;
    if ((await fsp.stat(res.filePaths[0])).size > 5 * 1024 * 1024) throw new Error('That document is larger than 5 MB.');
    return fsp.readFile(res.filePaths[0], 'utf8');
  });
  handle('attach:pick', async (_e, noteId, imagesOnly) => {
    const res = await dialog.showOpenDialog(win, {
      title: imagesOnly ? 'Insert an image' : 'Attach a file', properties: ['openFile'],
      filters: imagesOnly ? [{ name: 'Images', extensions: Object.keys(IMAGE_MIME) }] : [],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const file = res.filePaths[0];
    if ((await fsp.stat(file)).size > 200 * 1024 * 1024) throw new Error('That file is larger than 200 MB.');
    return store.addAttachment(noteId, path.extname(file), await fsp.readFile(file), path.basename(file));
  });
  handle('attach:save', (_e, noteId, ext, data) => store.addAttachment(noteId, ext, Buffer.from(data), `pasted.${ext}`));
  handle('attach:open', async (_e, file) => {
    if (!ATTACH_RE.test(String(file))) throw new Error('Invalid attachment');
    const err = await shell.openPath(path.join(store.attachDir, file));
    if (err) throw new Error(err);
  });
  handle('attach:read', async (_e, file) => {
    if (!ATTACH_RE.test(String(file))) throw new Error('Invalid attachment');
    return fsp.readFile(path.join(store.attachDir, file));
  });
  handle('audio:url', async (_e, url) => {
    let u;
    try { u = new URL(String(url)); } catch { throw new Error('That is not a valid link.'); }
    if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https links are supported.');
    const bin = await llm.which('yt-dlp');
    if (!bin) throw new Error('Importing from a link needs yt-dlp. Install it (for example "brew install yt-dlp") and try again.');
    const dir = path.join(tmpDir(), `url-${Date.now()}`);
    await fsp.mkdir(dir, { recursive: true });
    try {
      // Audio-only formats that play without ffmpeg; "--" stops the URL being read as an option.
      const title = await new Promise((resolve, reject) => {
        execFile(bin, ['-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio', '--no-playlist', '--max-filesize', '1G',
          '--no-simulate', '--print', 'title', '-o', path.join(dir, 'audio.%(ext)s'), '--', u.href],
        { timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, PATH: llm.resolvePathSync() } },
        (err, stdout, stderr) => (err ? reject(new Error(`Download failed: ${String(stderr || err.message).trim().split('\n').pop()}`)) : resolve(stdout.trim().split('\n')[0])));
      });
      const file = (await fsp.readdir(dir)).find((n) => n.startsWith('audio.') && !n.endsWith('.part'));
      if (!file) throw new Error('No audio was downloaded.');
      const ext = assertExt(path.extname(file));
      const buf = await fsp.readFile(path.join(dir, file));
      return { name: title || 'Video lecture', ext, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
  handle('audio:export', async (_e, id, ext, name) => {
    const src = store.audioPath(id, ext);
    const res = await dialog.showSaveDialog(win, { defaultPath: `${safeName(name, 'Recording')}.${assertExt(ext)}` });
    if (res.canceled || !res.filePath) return false;
    await fsp.copyFile(src, res.filePath);
    return true;
  });

  handle('record:begin', (_e, id, ext) => store.beginRecording(assertId(id), ext));
  handle('record:append', (_e, id, data) => store.appendRecording(id, data));
  handle('record:finish', (_e, id) => store.finishRecording(id));
  handle('record:abort', (_e, id) => store.abortRecording(assertId(id)));
  handle('mic:access', async () => {
    if (process.platform !== 'darwin') return true;
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status === 'granted') return true;
    if (status === 'denied' || status === 'restricted') return false;
    return systemPreferences.askForMediaAccess('microphone');
  });

  handle('export:text', async (_e, name, ext, content) => {
    const e = ['md', 'txt', 'html', 'ics'].includes(ext) ? ext : 'txt';
    const res = await dialog.showSaveDialog(win, { defaultPath: `${safeName(name, 'Note')}.${e}` });
    if (res.canceled || !res.filePath) return false;
    await fsp.writeFile(res.filePath, String(content), 'utf8');
    return true;
  });

  handle('export:pdf', async (_e, name, bodyHtml) => {
    const res = await dialog.showSaveDialog(win, { defaultPath: `${safeName(name, 'Note')}.pdf` });
    if (res.canceled || !res.filePath) return false;
    await fsp.mkdir(tmpDir(), { recursive: true });
    const tmp = path.join(tmpDir(), `print-${Date.now()}.html`);
    const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src app: data:">
<style>
  body { font: 11pt/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1b1a1f; margin: 0; }
  h1 { font: 600 20pt Georgia, serif; margin: 0 0 4pt; }
  h2 { font: 600 13pt Georgia, serif; margin: 18pt 0 6pt; border-bottom: 1px solid #ddd; padding-bottom: 3pt; }
  h3 { font-size: 11.5pt; margin: 12pt 0 4pt; }
  .meta { color: #5c5a66; font-size: 9.5pt; margin-bottom: 14pt; }
  .t { color: #5c5a66; font-size: 8.5pt; font-variant-numeric: tabular-nums; margin-right: 6pt; }
  p, div { margin: 0 0 3pt; }
  mark { background: #ffe58a; }
  ul, ol { margin: 4pt 0 6pt 16pt; padding: 0; }
</style></head><body>${String(bodyHtml)}</body></html>`;
    await fsp.writeFile(tmp, doc, 'utf8');
    const printer = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true, contextIsolation: true } });
    try {
      await printer.loadFile(tmp);
      const pdf = await printer.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.7, bottom: 0.7, left: 0.75, right: 0.75 },
      });
      await fsp.writeFile(res.filePath, pdf);
    } finally {
      printer.destroy();
      await fsp.rm(tmp, { force: true });
    }
    return true;
  });

  handle('llm:detect', () => llm.detect());
  handle('llm:auth', (_e, provider) => llm.authStatus(String(provider)));
  handle('llm:signin', (_e, provider) => llm.openSignIn(String(provider)));
  handle('llm:models', (_e, provider, refresh) => llm.listModels(String(provider), { refresh: !!refresh, workDir: path.join(tmpDir(), 'ai') }));
  handle('llm:run', async (event, req) => {
    const id = assertId(req.id);
    return llm.run(
      {
        id,
        provider: String(req.provider),
        model: String(req.model || ''),
        effort: String(req.effort || ''),
        custom: String(req.custom || ''),
        system: String(req.system || ''),
        prompt: String(req.prompt || ''),
        workDir: path.join(tmpDir(), 'ai'),
      },
      (delta) => { if (!event.sender.isDestroyed()) event.sender.send('llm:delta', { id, delta }); },
    );
  });
  handle('llm:cancel', (_e, id) => llm.cancel(id));

  handle('whisper:transcribe', (_e, req) => {
    const id = assertId(req.id);
    if (!(req.pcm instanceof Float32Array)) throw new Error('Bad audio data');
    return new Promise((resolve, reject) => {
      whisperPending.set(id, { resolve, reject });
      getWhisper().postMessage({
        type: 'transcribe', id,
        model: String(req.model || 'base'),
        language: String(req.language || 'english'),
        offset: Number(req.offset) || 0,
        speakers: req.speakers === true,
        pcm: req.pcm,
      });
    });
  });
  handle('whisper:cancel', () => stopWhisper());

  // ---- locked notes: content sealed with the OS keychain, opened with Touch ID or a password
  handle('lock:status', async () => ({
    touchId: process.platform === 'darwin' && systemPreferences.canPromptTouchID(),
    hasPassword: !!(await readLockFile()),
    encryption: safeStorage.isEncryptionAvailable(),
  }));
  handle('lock:setPassword', async (_e, password) => {
    if (String(password).length < 4) throw new Error('Use at least 4 characters.');
    if (await readLockFile()) throw new Error('A password is already set.');
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(String(password), salt, 32);
    await fsp.writeFile(lockFile(), JSON.stringify({ salt: salt.toString('hex'), hash: hash.toString('hex') }));
  });
  handle('lock:unlock', async (_e, id, password) => {
    assertId(id);
    if (process.platform === 'darwin' && systemPreferences.canPromptTouchID() && password == null) {
      await systemPreferences.promptTouchID('unlock this note');
    } else {
      const lf = await readLockFile();
      if (!lf) throw new Error('No password is set.');
      const got = crypto.scryptSync(String(password || ''), Buffer.from(lf.salt, 'hex'), 32);
      if (!crypto.timingSafeEqual(got, Buffer.from(lf.hash, 'hex'))) throw new Error('Wrong password.');
    }
    return store.unseal(id);
  });

  // ---- course materials and syllabus
  const matDir = () => path.join(dataDir(), 'materials');
  const matFile = (id) => path.join(matDir(), `${assertId(id)}.json`);
  const pickDocs = async (title, multi) => {
    const res = await dialog.showOpenDialog(win, { title, properties: multi ? ['openFile', 'multiSelections'] : ['openFile'], filters: [{ name: 'Documents', extensions: materials.EXTS }] });
    return res.canceled ? [] : res.filePaths;
  };
  handle('materials:add', async (_e, ids) => {
    const files = await pickDocs('Add course materials', true);
    await fsp.mkdir(matDir(), { recursive: true });
    const out = [];
    for (const [i, file] of files.entries()) {
      if ((await fsp.stat(file)).size > 200 * 1024 * 1024) throw new Error(`${path.basename(file)} is larger than 200 MB.`);
      const chunks = await materials.extract(file);
      const id = assertId(ids[i]);
      await fsp.writeFile(matFile(id), JSON.stringify(chunks));
      out.push({ id, name: path.basename(file), chars: chunks.reduce((n, c) => n + c.text.length, 0), parts: chunks.length });
    }
    return out;
  });
  handle('materials:load', async (_e, id) => JSON.parse(await fsp.readFile(matFile(id), 'utf8')));
  handle('materials:remove', (_e, id) => fsp.rm(matFile(id), { force: true }));
  handle('syllabus:read', async () => {
    const [file] = await pickDocs('Choose your syllabus', false);
    if (!file) return null;
    return { name: path.basename(file), text: (await materials.extract(file)).map((c) => (c.loc ? `[${c.loc}] ${c.text}` : c.text)).join('\n\n') };
  });

  // ---- calendar import: an .ics file or a calendar's iCal link (Google, Apple, Outlook)
  handle('ics:open', async () => {
    const res = await dialog.showOpenDialog(win, { title: 'Import a calendar file', properties: ['openFile'], filters: [{ name: 'Calendar', extensions: ['ics', 'ical'] }] });
    if (res.canceled || !res.filePaths[0]) return null;
    if ((await fsp.stat(res.filePaths[0])).size > 20 * 1024 * 1024) throw new Error('That calendar file is larger than 20 MB.');
    return fsp.readFile(res.filePaths[0], 'utf8');
  });
  handle('ics:fetch', async (_e, raw) => {
    let u;
    try { u = new URL(String(raw).trim().replace(/^webcal:/i, 'https:')); } catch { throw new Error('That is not a valid link.'); }
    if (u.protocol !== 'https:') throw new Error('Calendar links must start with https:// or webcal://');
    const res = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`The calendar could not be downloaded (error ${res.status}). Check the link is the secret iCal address.`);
    const text = await res.text();
    if (text.length > 20 * 1024 * 1024) throw new Error('That calendar is larger than 20 MB.');
    if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('That link did not return a calendar. Use the "iCal format" address.');
    return text;
  });

  handle('app:window', (_e, id) => { createWindow(assertId(id)); });
  handle('app:info', () => ({ version: app.getVersion(), dataDir: dataDir(), modelsDir: modelsDir() }));
  handle('app:reveal', () => shell.openPath(dataDir()));
  handle('app:wipe', async () => {
    stopWhisper();
    llm.cancelAll();
    await store.wipe();
    await fsp.rm(matDir(), { recursive: true, force: true });
    await fsp.rm(tmpDir(), { recursive: true, force: true });
    return true;
  });
  handle('app:theme', (_e, theme) => {
    nativeTheme.themeSource = ['light', 'dark'].includes(theme) ? theme : 'system';
  });
}

const lockFile = () => path.join(app.getPath('userData'), 'lock.json');
async function readLockFile() {
  try { return JSON.parse(await fsp.readFile(lockFile(), 'utf8')); } catch { return null; }
}

// ------------------------------------------------------------------ boot ---

app.whenReady().then(() => {
  store = new Store(dataDir(), safeStorage);
  store.ensureDirs();
  serveApp();
  lockDownPermissions();
  registerIpc();
  buildMenu();
  createWindow();
  // Start or stop recording from any app, like Noted's Control Center button.
  globalShortcut.register('CommandOrControl+Alt+Shift+R', () => {
    if (!win) createWindow();
    win.show();
    win.focus();
    win.webContents.send('menu', 'toggle-record');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('before-quit', () => {
  llm.cancelAll();
  stopWhisper();
});

// No new windows, no remote content, anywhere in the app.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});
