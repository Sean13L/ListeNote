// Runs AI requests through the student's own CLI (see main/llm.js).
//
// Jobs are tracked here by key (for example "summary:<noteId>") rather than in
// a view, so an answer keeps streaming if the student looks at another tab and
// is still there when they come back.

import { api, S, bus, providerInfo } from './state.js';
import { uid } from './lib/util.js';
import { SYSTEM } from './lib/prompts.js';
import { errorMessage } from './dom.js';

export const jobs = new Map(); // key -> { id, running, text, error }

const byId = new Map();
let pendingEmit = new Set();
let emitScheduled = false;

api.onLlmDelta(({ id, delta }) => {
  const job = byId.get(id);
  if (!job) return;
  job.text += delta;
  pendingEmit.add(job.key);
  if (emitScheduled) return;
  emitScheduled = true;
  requestAnimationFrame(() => {
    emitScheduled = false;
    const keys = pendingEmit;
    pendingEmit = new Set();
    for (const key of keys) bus.emit('job', key);
  });
});

export function job(key) {
  return jobs.get(key) || null;
}

export function isRunning(key) {
  const j = jobs.get(key);
  return !!(j && j.running);
}

export function aiReady() {
  const p = providerInfo();
  if (!p) return { ok: false, reason: 'Choose an AI in Settings.' };
  if (!p.available) return { ok: false, reason: `${p.label} is not installed on this computer. Install it or pick another AI in Settings.` };
  if (p.needsModel && !S.lib.settings.model.trim()) return { ok: false, reason: `${p.label} needs a model name. Add one in Settings.` };
  return { ok: true, label: p.label };
}

// Resolves with the full answer text. Rejects with a readable Error.
export async function runAI(key, prompt, { system = SYSTEM } = {}) {
  if (isRunning(key)) throw new Error('That is already running.');
  const ready = aiReady();
  if (!ready.ok) throw new Error(ready.reason);
  const { provider, model, effort, customCommand } = S.lib.settings;
  const entry = { key, id: uid(), running: true, text: '', error: null };
  jobs.set(key, entry);
  byId.set(entry.id, entry);
  bus.emit('job', key);
  try {
    const result = await api.llmRun({ id: entry.id, provider, model, effort, custom: customCommand, system, prompt });
    entry.text = result;
    return result;
  } catch (err) {
    entry.error = errorMessage(err);
    throw new Error(entry.error);
  } finally {
    entry.running = false;
    byId.delete(entry.id);
    bus.emit('job', key);
  }
}

export function cancelAI(key) {
  const j = jobs.get(key);
  if (j && j.running) api.llmCancel(j.id);
}

export function clearJob(key) {
  const j = jobs.get(key);
  if (j && !j.running) jobs.delete(key);
}
