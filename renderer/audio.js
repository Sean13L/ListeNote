// Recording, playback, and on-device transcription.

import { api, S, bus, saveNote } from './state.js';
import { uid, splitPoints, isSilent, detectSilence, clamp, clusterSpeakers } from './lib/util.js';

const SAMPLE_RATE = 16000;
// Matches Noted's three recording qualities.
const QUALITY = { space: { rate: 16000, bits: 24000 }, good: { rate: 44100, bits: 64000 }, best: { rate: 48000, bits: 128000 } };

// ---------------------------------------------------------- recorder ---
// Audio is appended to a file on disk every two seconds while recording, so a
// crash or a dead battery loses at most the last couple of seconds of a lecture.

export const recorder = {
  active: false,
  paused: false,
  noteId: null,
  _rec: null,
  _streams: [],
  _live: null,
  _ctx: null,
  _analyser: null,
  _levelBuf: null,
  _elapsed: 0,
  _since: 0,
  _writes: Promise.resolve(),
  _writeError: null,

  elapsed() {
    if (!this.active) return 0;
    return (this._elapsed + (this.paused ? 0 : performance.now() - this._since)) / 1000;
  },

  level() {
    if (!this._analyser) return 0;
    this._analyser.getFloatTimeDomainData(this._levelBuf);
    let sum = 0;
    for (const v of this._levelBuf) sum += v * v;
    return clamp(Math.sqrt(sum / this._levelBuf.length) * 6, 0, 1);
  },

  // source: 'mic' | 'both' | 'system'. 'system' is the computer's own sound
  // (a Zoom call, a YouTube lecture), captured on macOS 14.2+ and Windows.
  async start(noteId, { live = null } = {}) {
    if (this.active) throw new Error('Already recording.');
    const st = S.lib.settings;
    const source = st.recordSource || 'mic';
    const quality = QUALITY[st.recordQuality] || QUALITY.good;
    const streams = [];
    const stopAll = () => { for (const s of streams) for (const t of s.getTracks()) t.stop(); };
    try {
      if (source !== 'system') {
        const allowed = await api.micAccess();
        if (!allowed) throw new Error('Microphone access is off. Allow ListeNote in System Settings → Privacy & Security → Microphone, then try again.');
        try {
          streams.push(await navigator.mediaDevices.getUserMedia({ audio: {
            channelCount: 1, sampleRate: quality.rate, echoCancellation: source === 'both',
            noiseSuppression: st.noiseReduction !== false, autoGainControl: true,
            ...(st.micId ? { deviceId: { exact: st.micId } } : {}),
          } }));
        } catch (err) {
          throw new Error(err && err.name === 'NotFoundError' ? 'No microphone was found.' : err && err.name === 'OverconstrainedError' ? 'The chosen microphone is not connected. Pick another in Settings.' : 'Could not open the microphone.');
        }
      }
      if (source !== 'mic') {
        try {
          const display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
          for (const t of display.getVideoTracks()) t.stop();
          if (!display.getAudioTracks().length) throw new Error('none');
          streams.push(display);
        } catch {
          throw new Error(window.listenote.platform === 'darwin'
            ? 'Could not capture computer audio. Allow ListeNote in System Settings → Privacy & Security → Screen & System Audio Recording, then restart it. Needs macOS 14.2 or later.'
            : 'Could not capture computer audio on this computer.');
        }
      }
    } catch (err) { stopAll(); throw err; }

    // Mix every source into one track so a single file holds the whole lecture.
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    for (const s of streams) {
      const node = ctx.createMediaStreamSource(new MediaStream(s.getAudioTracks()));
      node.connect(dest);
      node.connect(analyser);
    }

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    try { await api.recordBegin(noteId, 'webm'); } catch (err) { stopAll(); await ctx.close(); throw err; }
    const rec = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: quality.bits });
    this._writes = Promise.resolve();
    this._writeError = null;
    rec.addEventListener('dataavailable', (e) => {
      if (!e.data || !e.data.size) return;
      this._writes = this._writes
        .then(() => e.data.arrayBuffer())
        .then((buf) => api.recordAppend(noteId, buf))
        .catch((err) => { this._writeError = err; });
    });

    Object.assign(this, {
      active: true, paused: false, noteId, _rec: rec, _streams: streams, _ctx: ctx, _analyser: analyser,
      _levelBuf: new Float32Array(analyser.fftSize), _elapsed: 0, _since: performance.now(), _live: null,
    });
    if (live) this._live = await startLive(dest.stream, live).catch(() => null);
    rec.start(2000);
    bus.emit('recording');
  },

  pause() {
    if (!this.active || this.paused) return;
    this._rec.pause();
    this._elapsed += performance.now() - this._since;
    this.paused = true;
    bus.emit('recording');
  },

  resume() {
    if (!this.active || !this.paused) return;
    this._rec.resume();
    this._since = performance.now();
    this.paused = false;
    bus.emit('recording');
  },

  async stop() {
    if (!this.active) return null;
    const duration = this.elapsed();
    const noteId = this.noteId;
    const rec = this._rec;
    await new Promise((resolve) => { rec.addEventListener('stop', resolve, { once: true }); rec.stop(); });
    await this._writes;
    for (const s of this._streams) for (const track of s.getTracks()) track.stop();
    await this._ctx.close().catch(() => {});
    const live = this._live;
    const writeError = this._writeError;
    Object.assign(this, { active: false, paused: false, noteId: null, _rec: null, _streams: [], _ctx: null, _analyser: null, _live: null });
    try {
      await api.recordFinish(noteId);
    } finally {
      bus.emit('recording');
    }
    if (live) await live.finish();
    if (writeError) throw new Error('Part of the recording could not be written to disk.');
    return { noteId, duration, ext: 'webm', mime: 'audio/webm', liveTranscript: !!live };
  },
};

// ----------------------------------------------------- live transcript ---
// Feeds the recording to Whisper in ~8 second pieces while class goes on.
// Samples are dropped while paused, so sample count stays in step with the
// recording clock and every line lands at the right time.

async function startLive(stream, { note, model, language }) {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  await ctx.audioWorklet.addModule('pcm-worklet.js');
  const node = new AudioWorkletNode(ctx, 'pcm-tap');
  ctx.createMediaStreamSource(stream).connect(node);
  let buf = new Float32Array(SAMPLE_RATE * 40);
  let len = 0;
  let consumed = 0;
  let busy = Promise.resolve();
  note.transcript = [];
  transcription.live = note.id;
  bus.emit('transcription', note.id);

  const run = (pcm, offset) => {
    busy = busy.then(async () => {
      if (isSilent(pcm)) return;
      const segs = await api.transcribe({ id: uid(), model, language, pcm, offset });
      note.transcript.push(...segs.map(({ emb, ...seg }) => seg));
      saveNote(note.id);
      bus.emit('transcription', note.id);
    }).catch(() => {});
  };
  const flush = (all) => {
    if (len < SAMPLE_RATE * (all ? 1 : 10)) return;
    const [, cut] = all ? [0, len] : splitPoints(buf.subarray(0, len), SAMPLE_RATE, { maxSec: 8, searchSec: 3 })[0];
    run(buf.slice(0, cut), consumed / SAMPLE_RATE);
    consumed += cut;
    buf.copyWithin(0, cut, len);
    len -= cut;
  };
  node.port.onmessage = (e) => {
    if (recorder.paused) return;
    const chunk = e.data;
    if (len + chunk.length > buf.length) { const bigger = new Float32Array(buf.length * 2); bigger.set(buf.subarray(0, len)); buf = bigger; }
    buf.set(chunk, len);
    len += chunk.length;
    flush(false);
  };
  return {
    async finish() {
      node.port.onmessage = null;
      await ctx.close().catch(() => {});
      flush(true);
      await busy;
      transcription.live = null;
      transcription.modelPercent = null;
      saveNote(note.id, { now: true });
      bus.emit('transcription', note.id);
    },
  };
}

// ------------------------------------------------------------ player ---

export class Player {
  constructor({ onTime, onState }) {
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.onTime = onTime;
    this.onState = onState;
    this.url = null;
    this.duration = 0;
    this.silence = null;
    this.skipSilence = false;
    this.ready = false;
    this._raf = 0;
    this.audio.addEventListener('play', () => { this.onState(); this._loop(); });
    this.audio.addEventListener('pause', () => { cancelAnimationFrame(this._raf); this.onState(); this.onTime(this.time); });
    this.audio.addEventListener('ended', () => { this.onState(); });
    this.audio.addEventListener('seeked', () => this.onTime(this.time));
    // timeupdate fires even when the window is hidden, unlike animation frames.
    this.audio.addEventListener('timeupdate', () => {
      if (this.trim && this.time >= this.trim.end && this.playing) { this.audio.pause(); this.audio.currentTime = this.trim.end; }
      if (!this.skipSilence || !this.silence || !this.playing) return;
      const t = this.time;
      // Leave a short margin so speech is not clipped on either side.
      const range = this.silence.find(([s, e]) => t > s + 0.4 && t < e - 0.8);
      if (range) this.audio.currentTime = range[1] - 0.4;
    });
  }

  get playing() { return !this.audio.paused && !this.audio.ended; }
  get time() { return this.audio.currentTime || 0; }

  async load(noteId, meta) {
    const { data, mime } = await api.audioLoad(noteId, meta.ext);
    this.bytes = data;
    this.url = URL.createObjectURL(new Blob([data], { type: mime }));
    this.audio.src = this.url;
    await new Promise((resolve, reject) => {
      this.audio.addEventListener('loadedmetadata', resolve, { once: true });
      this.audio.addEventListener('error', () => reject(new Error('This recording could not be opened.')), { once: true });
    });
    // Files written by a live recorder carry no length in their header, so the
    // browser reports Infinity. Seeking far past the end makes it scan the file.
    if (!Number.isFinite(this.audio.duration)) {
      await new Promise((resolve) => {
        const done = () => { this.audio.removeEventListener('durationchange', check); resolve(); };
        const check = () => { if (Number.isFinite(this.audio.duration)) done(); };
        this.audio.addEventListener('durationchange', check);
        this.audio.currentTime = 1e9;
        setTimeout(done, 4000);
      });
      this.audio.currentTime = 0;
    }
    this.duration = Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : (meta.duration || 0);
    this.ready = true;
    return this.duration;
  }

  _loop() {
    cancelAnimationFrame(this._raf);
    let last = -1;
    const tick = () => {
      if (!this.playing) return;
      const t = this.time;
      if (Math.abs(t - last) > 0.2) { last = t; this.onTime(t); }
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  play() {
    if (!this.ready) return;
    if (this._eq && this._eq.ctx.state === 'suspended') this._eq.ctx.resume();
    if (this.time >= this.end - 0.1) this.audio.currentTime = this.start;
    this.audio.play().catch(() => {});
  }
  pause() { this.audio.pause(); }
  toggle() { if (this.playing) this.pause(); else this.play(); }
  get start() { return this.trim ? this.trim.start : 0; }
  get end() { return this.trim ? this.trim.end : this.duration; }
  seek(t, { play = false } = {}) {
    if (!this.ready) return;
    this.audio.currentTime = clamp(t, this.start, Math.max(this.start, this.end - 0.05));
    if (play) this.play();
  }
  setTrim(trim) {
    this.trim = trim || null;
    if (this.time < this.start || this.time > this.end) this.audio.currentTime = this.start;
  }

  // Low/mid/high in dB. Playback only; the recording is not changed.
  setEq([low, mid, high]) {
    if (!this._eq) {
      if (!low && !mid && !high) return;
      const ctx = new AudioContext();
      const src = ctx.createMediaElementSource(this.audio);
      const bands = [['lowshelf', 250], ['peaking', 1000], ['highshelf', 4000]].map(([type, freq]) => {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        return f;
      });
      src.connect(bands[0]).connect(bands[1]).connect(bands[2]).connect(ctx.destination);
      this._eq = { ctx, bands };
      if (this._sink && ctx.setSinkId) ctx.setSinkId(this._sink).catch(() => {});
    }
    [low, mid, high].forEach((g, i) => { this._eq.bands[i].gain.value = Number(g) || 0; });
  }

  setOutput(deviceId) {
    this._sink = deviceId || '';
    this.audio.setSinkId(this._sink).catch(() => {});
    if (this._eq && this._eq.ctx.setSinkId) this._eq.ctx.setSinkId(this._sink).catch(() => {});
  }
  skip(delta) { this.seek(this.time + delta); }
  setRate(rate) { this.audio.playbackRate = rate; }

  destroy() {
    cancelAnimationFrame(this._raf);
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    if (this.url) URL.revokeObjectURL(this.url);
    if (this._eq) this._eq.ctx.close().catch(() => {});
    this.bytes = null;
    this.ready = false;
  }
}

// ------------------------------------------------------------ decode ---

// Decode any supported audio file to 16 kHz mono samples (what Whisper expects)
// using the browser's own decoder, so no ffmpeg is needed.
export async function decodeToMono(bytes) {
  const ctx = new OfflineAudioContext(1, 1, SAMPLE_RATE);
  const buffer = await ctx.decodeAudioData(bytes.slice(0));
  const mono = new Float32Array(buffer.length);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  return mono;
}

// ----------------------------------------------------- transcription ---

// One transcription at a time. State lives here (not in a view) so it keeps
// running, and stays visible, when the student switches notes.
export const transcription = { noteId: null, live: null, phase: null, percent: 0, modelPercent: null, cancelled: false };

api.onModelProgress((msg) => {
  const id = transcription.noteId || transcription.live;
  if (!id) return;
  transcription.modelPercent = msg.type === 'model-ready' ? null : msg.percent;
  bus.emit('transcription', id);
});

export async function transcribeNote(note) {
  if (transcription.noteId) throw new Error('Another recording is still being transcribed.');
  if (!note.audio) throw new Error('This note has no recording.');
  const { whisperModel, language } = S.lib.settings;
  Object.assign(transcription, { noteId: note.id, phase: 'decoding', percent: 0, modelPercent: null, cancelled: false });
  bus.emit('transcription', note.id);
  try {
    const { data } = await api.audioLoad(note.id, note.audio.ext);
    const full = await decodeToMono(data);
    if (!note.audio.duration) note.audio.duration = full.length / SAMPLE_RATE;
    note.silence = detectSilence(full, SAMPLE_RATE);
    // A trimmed recording is only transcribed between its in and out points.
    const trim = note.audio.trim;
    const base = trim ? Math.floor(trim.start * SAMPLE_RATE) : 0;
    const pcm = trim ? full.subarray(base, Math.floor(trim.end * SAMPLE_RATE)) : full;
    const speakers = !!S.lib.settings.identifySpeakers;
    const embs = [];
    note.transcript = [];
    const chunks = splitPoints(pcm, SAMPLE_RATE);
    transcription.phase = 'transcribing';
    for (let i = 0; i < chunks.length; i++) {
      if (transcription.cancelled) break;
      const [start, end] = chunks[i];
      const slice = pcm.slice(start, end);
      if (!isSilent(slice)) {
        const segments = await api.transcribe({ id: uid(), model: whisperModel, language, pcm: slice, offset: (base + start) / SAMPLE_RATE, speakers });
        if (transcription.cancelled) break;
        for (const { emb, ...seg } of segments) { note.transcript.push(seg); embs.push(emb || null); }
      }
      transcription.percent = Math.round(((i + 1) / chunks.length) * 100);
      saveNote(note.id);
      bus.emit('transcription', note.id);
    }
    if (speakers && !transcription.cancelled && note.transcript.length) {
      const ids = clusterSpeakers(embs);
      note.transcript.forEach((seg, i) => { seg.spk = ids[i]; });
      note.speakers = Array.from({ length: Math.max(...ids) + 1 }, (_, i) => `Speaker ${i + 1}`);
    } else note.speakers = null;
    note.updated = Date.now();
    saveNote(note.id, { now: true });
    return !transcription.cancelled;
  } catch (err) {
    if (transcription.cancelled) return false;
    throw err;
  } finally {
    Object.assign(transcription, { noteId: null, phase: null, percent: 0, modelPercent: null });
    bus.emit('transcription', note.id);
    bus.emit('library');
  }
}

export function cancelTranscription() {
  if (!transcription.noteId) return;
  transcription.cancelled = true;
  api.transcribeCancel();
}

export async function computeSilence(note, bytes) {
  const pcm = await decodeToMono(bytes);
  note.silence = detectSilence(pcm, SAMPLE_RATE);
  saveNote(note.id);
  return note.silence;
}
