// Speech-to-text worker. Runs Whisper on this computer through ONNX Runtime in
// a separate process so a long transcription never freezes the window.
// Audio never leaves the machine; the only network use is the one-time model
// download from Hugging Face.

const MODELS = {
  tiny: 'Xenova/whisper-tiny',
  base: 'Xenova/whisper-base',
  small: 'Xenova/whisper-small',
};

const cacheDir = process.argv[2];
let lib = null;
let loaded = { key: null, pipe: null };
let speaker = null;
const SPEAKER_MODEL = 'Xenova/wavlm-base-plus-sv';

const send = (msg) => process.parentPort.postMessage(msg);

async function getPipeline(model) {
  const name = MODELS[model] || MODELS.base;
  if (loaded.key === name) return loaded.pipe;
  if (!lib) {
    lib = await import('@huggingface/transformers');
    lib.env.cacheDir = cacheDir;
    lib.env.allowLocalModels = false;
  }
  if (loaded.pipe && loaded.pipe.dispose) await loaded.pipe.dispose().catch(() => {});
  loaded = { key: null, pipe: null };
  let last = -1;
  const pipe = await lib.pipeline('automatic-speech-recognition', name, {
    progress_callback: (p) => {
      if (p.status !== 'progress_total') return;
      const pct = Math.floor(p.progress);
      if (pct === last) return;
      last = pct;
      send({ type: 'model-progress', percent: pct, loaded: p.loaded, total: p.total });
    },
  });
  loaded = { key: name, pipe };
  send({ type: 'model-ready' });
  return pipe;
}

const JUNK = /^[\s\[\(]*(blank[_ ]audio|silence|music|inaudible|no speech|applause)[\s\]\)]*$/i;

// Voice fingerprint (x-vector) of one stretch of audio, for telling speakers apart.
async function embed(samples) {
  if (!speaker) {
    send({ type: 'model-progress', percent: 0 });
    speaker = { proc: await lib.AutoProcessor.from_pretrained(SPEAKER_MODEL), model: await lib.AutoModelForXVector.from_pretrained(SPEAKER_MODEL, {
      progress_callback: (p) => { if (p.status === 'progress_total') send({ type: 'model-progress', percent: Math.floor(p.progress) }); },
    }) };
    send({ type: 'model-ready' });
  }
  const out = await speaker.model(await speaker.proc(samples));
  return Array.from(out.embeddings.data);
}

async function transcribe({ id, model, language, pcm, offset, speakers }) {
  const pipe = await getPipeline(model);
  const opts = { return_timestamps: true, task: 'transcribe' };
  if (language && language !== 'auto') opts.language = language;
  const out = await pipe(pcm, opts);
  const dur = pcm.length / 16000;
  const segments = [];
  for (const c of out.chunks || []) {
    const text = String(c.text || '').trim();
    if (!text || JUNK.test(text)) continue;
    const s = Number.isFinite(c.timestamp && c.timestamp[0]) ? c.timestamp[0] : 0;
    const e = Number.isFinite(c.timestamp && c.timestamp[1]) ? c.timestamp[1] : dur;
    segments.push({ s: +(offset + Math.min(s, dur)).toFixed(2), e: +(offset + Math.min(Math.max(e, s), dur)).toFixed(2), text });
  }
  if (speakers) {
    for (const seg of segments) {
      const a = Math.floor((seg.s - offset) * 16000);
      const b = Math.floor((seg.e - offset) * 16000);
      // Under a second of audio gives an unreliable fingerprint; the caller fills it in.
      seg.emb = b - a >= 16000 ? await embed(pcm.slice(a, b)) : null;
    }
  }
  send({ type: 'result', id, segments });
}

process.parentPort.on('message', async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'transcribe') await transcribe(msg);
  } catch (err) {
    send({ type: 'error', id: msg.id, message: String((err && err.message) || err) });
  }
});
