// Settings: which AI to use, transcription, appearance, privacy and data.

import { api, S, saveLib, applyAppearance, bus } from './state.js';
import { h, clear, button, toast, errorMessage, confirmDialog } from './dom.js';
import { runAI, job } from './ai.js';
import { TEST_PROMPT } from './lib/prompts.js';

const LANGUAGES = ['english', 'spanish', 'french', 'german', 'italian', 'portuguese', 'dutch', 'polish', 'turkish', 'russian', 'ukrainian', 'arabic', 'hebrew', 'hindi', 'bengali', 'urdu', 'vietnamese', 'thai', 'indonesian', 'malay', 'tagalog', 'chinese', 'japanese', 'korean', 'swedish', 'norwegian', 'danish', 'finnish', 'greek', 'czech', 'romanian', 'hungarian'];
const cap = (s) => s[0].toUpperCase() + s.slice(1);

export async function mountSettings(container) {
  clear(container);
  const page = h('div', { class: 'page page-narrow' });
  container.append(page);
  S.providers = await api.llmDetect();
  const info = await api.appInfo();
  if (!page.isConnected) return;
  const st = S.lib.settings;
  const set = (key, value) => { st[key] = value; saveLib(); bus.emit('library'); };

  const section = (title, intro, ...children) => h('section', { class: 'settings-section' }, h('h2', { text: title }), intro ? h('p', { class: 'page-sub', text: intro }) : null, children);
  const field = (label, control, hint) => {
    const id = `set-${label.replace(/\W+/g, '-').toLowerCase()}`;
    control.id = id;
    return h('div', { class: 'field' }, h('label', { for: id, text: label }), control, hint ? h('small', { text: hint }) : null);
  };

  // ---- AI ----
  const modelInput = h('input', { type: 'text', class: 'input', value: st.model, autocomplete: 'off', spellcheck: false, onChange: () => set('model', modelInput.value.trim()) });
  // The model list comes from the chosen tool itself (Claude Code, Ollama).
  // Tools that cannot list their models get a text box instead.
  let models = null;
  const modelSelect = h('select', { class: 'input', id: 'set-model-list', onChange: () => { set('model', modelSelect.value); syncEffort(); } });
  const modelStatus = h('small', { role: 'status' });
  const refreshBtn = button('Refresh list', () => loadModels(true), { kind: 'small' });
  const EFFORT_LABELS = { minimal: 'Minimal (fastest)', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max', ultra: 'Ultra (slowest)' };
  const effortSelect = h('select', { class: 'input', onChange: () => set('effort', effortSelect.value) });
  // Effort levels offered depend on the chosen model.
  const syncEffort = () => {
    const m = models && models.find((x) => x.value === st.model);
    const levels = m ? m.efforts : [];
    effortField.hidden = !['claude', 'codex'].includes(st.provider) || !levels.length;
    if (st.effort && !levels.includes(st.effort)) set('effort', '');
    effortSelect.replaceChildren(...[['', 'Default'], ...levels.map((e) => [e, EFFORT_LABELS[e] || e])]
      .map(([v, l]) => h('option', { value: v, selected: st.effort === v, text: l })));
  };
  let loadToken = 0;
  async function loadModels(refresh = false) {
    const token = ++loadToken;
    const provider = st.provider;
    models = null;
    syncProvider();
    const info = S.providers.find((x) => x.id === provider);
    if (!['claude', 'codex', 'ollama'].includes(provider) || !info || !info.available) return;
    modelSelect.disabled = true;
    modelSelect.replaceChildren(h('option', { text: 'Loading models…' }));
    modelStatus.textContent = `Reading the model list from ${info.label}…`;
    try {
      const list = await api.llmModels(provider, refresh);
      if (token !== loadToken || !page.isConnected) return;
      if (!list || !list.length) throw new Error(provider === 'ollama' ? 'No models are downloaded yet. Run "ollama pull llama3.2" in a terminal, then refresh.' : 'No models were listed.');
      models = list;
      if (!list.some((m) => m.value === st.model)) set('model', list[0].value);
      modelSelect.replaceChildren(...list.map((m) => h('option', { value: m.value, selected: m.value === st.model, text: m.description ? `${m.label} · ${m.description}` : m.label })));
      modelStatus.textContent = `${list.length} model${list.length === 1 ? '' : 's'} available from ${info.label}.`;
    } catch (err) {
      if (token !== loadToken) return;
      modelStatus.textContent = `Could not read the model list: ${errorMessage(err)}`;
    }
    modelSelect.disabled = false;
    syncProvider();
  }
  const effortField = field('Effort', effortSelect, 'How hard the model thinks. Higher is slower and uses more of your plan.');
  const modelHint = h('small');
  const customInput = h('input', { type: 'text', class: 'input', value: st.customCommand, autocomplete: 'off', spellcheck: false, placeholder: 'llm -m my-model', onChange: () => set('customCommand', customInput.value.trim()) });
  const customField = h('div', { class: 'field' }, h('label', { for: 'set-custom', text: 'Command' }), customInput, h('small', { text: 'Any program that reads a prompt on standard input and prints the answer. It is run directly, not through a shell.' }));
  customInput.id = 'set-custom';
  const testOut = h('p', { class: 'footnote', role: 'status' });
  const testBtn = button('Test connection', async () => {
    testBtn.disabled = true;
    testOut.textContent = 'Asking the AI to reply…';
    try {
      const answer = await runAI('test:settings', TEST_PROMPT, { system: 'You are a connection test. Follow the instruction exactly.' });
      testOut.textContent = `Working. It replied: "${answer.slice(0, 80)}"`;
    } catch (err) {
      testOut.textContent = `Not working: ${errorMessage(err)}`;
    }
    testBtn.disabled = false;
  });
  if (job('test:settings') && job('test:settings').running) testBtn.disabled = true;

  const syncProvider = () => {
    const p = S.providers.find((x) => x.id === st.provider);
    modelHint.textContent = p ? p.modelHint : '';
    customField.hidden = st.provider !== 'custom';
    modelInput.closest('.field').hidden = st.provider === 'custom';
    const listed = !!models;
    const canList = ['claude', 'codex', 'ollama'].includes(st.provider) && p && p.available;
    modelSelect.hidden = !canList || (!listed && !modelSelect.disabled);
    modelInput.hidden = !modelSelect.hidden;
    refreshBtn.hidden = !canList;
    modelStatus.hidden = !canList;
    modelLabel.htmlFor = modelSelect.hidden ? 'set-model' : 'set-model-list';
    modelLabel.textContent = !modelSelect.hidden || (p && p.needsModel) ? 'Model' : 'Model (leave blank for your default)';
    modelHint.hidden = !modelSelect.hidden;
    syncEffort();
  };

  // Connect: check the tool is signed in (open its sign-in if not), select it,
  // and read its models.
  const connectState = new Map(); // provider id -> status element
  let signInPoll = null;
  async function connect(p) {
    const out = connectState.get(p.id);
    clearInterval(signInPoll);
    for (const [id, el] of connectState) if (id !== p.id) el.textContent = '';
    out.textContent = 'Checking sign-in…';
    try {
      const a = await api.llmAuth(p.id);
      if (a.installed === false) { out.textContent = `${a.detail} Use "How to install", then press Connect again.`; return; }
      if (a.signedIn === false) {
        out.replaceChildren(document.createTextNode(`${a.detail}. `), button('Sign in', () => signIn(p), { kind: 'small' }));
        return;
      }
      out.textContent = a.detail ? `${a.detail}. Finding models…` : 'Finding models…';
      if (st.provider !== p.id) {
        st.model = p.id === 'claude' ? 'default' : '';
        modelInput.value = '';
        set('provider', p.id);
        const radio = page.querySelector(`input[name=provider][value="${p.id}"]`);
        if (radio) radio.checked = true;
      }
      await loadModels(true);
      out.textContent = models ? `Connected. ${models.length} model${models.length === 1 ? '' : 's'} found.` : `Connected. ${p.label} cannot list its models, so type one below if you want a specific model.`;
    } catch (err) { out.textContent = `Could not connect: ${errorMessage(err)}`; }
  }
  async function signIn(p) {
    const out = connectState.get(p.id);
    try {
      const r = await api.llmSignIn(p.id);
      out.textContent = r.manual ? `Open a terminal and run: ${r.manual}. Then press Connect again.` : 'Finish signing in in the Terminal window and your browser. ListeNote will continue when you are signed in.';
      if (r.manual) return;
      const started = Date.now();
      signInPoll = setInterval(async () => {
        if (!page.isConnected || Date.now() - started > 10 * 60000) { clearInterval(signInPoll); return; }
        const a = await api.llmAuth(p.id).catch(() => null);
        if (a && a.signedIn) { clearInterval(signInPoll); connect(p); }
      }, 3000);
    } catch (err) { out.textContent = errorMessage(err); }
  }

  const providerList = h('div', { class: 'provider-list', role: 'radiogroup', 'aria-label': 'AI to use' }, S.providers.map((p) => {
    const status = p.id === 'custom' ? 'Your own command' : p.available ? 'Installed' : 'Not installed';
    const out = h('span', { class: 'connect-status', role: 'status' });
    connectState.set(p.id, out);
    return h('label', { class: `provider ${p.available ? '' : 'missing'}` },
      h('input', { type: 'radio', name: 'provider', value: p.id, checked: st.provider === p.id, onChange: () => {
        // Model names belong to one tool; start each tool on its own default.
        st.model = p.id === 'claude' ? 'default' : '';
        modelInput.value = '';
        set('provider', p.id);
        loadModels();
      } }),
      h('span', { class: 'provider-main' },
        h('strong', { text: p.label }),
        h('span', { class: `status ${p.available && p.id !== 'custom' ? 'ok' : ''}`, text: status + (p.tested || p.id === 'custom' ? '' : ' · not yet tested by the developers on this setup') }),
        out),
      !p.available && p.install ? h('a', { href: p.install, target: '_blank', rel: 'noreferrer', text: 'How to install' }) : null,
      p.id !== 'custom' ? button('Connect', (e) => { e.preventDefault(); connect(p); }, { kind: 'small' }) : null);
  }));
  const modelLabel = h('label', { for: 'set-model', text: 'Model' });
  const modelField = h('div', { class: 'field' }, modelLabel, modelSelect, modelInput, modelHint, h('div', { class: 'row model-row' }, modelStatus, refreshBtn));
  modelInput.id = 'set-model';

  // ---- transcription ----
  const whisperSelect = h('select', { class: 'input', onChange: () => set('whisperModel', whisperSelect.value) },
    [['tiny', 'Tiny: fastest, least accurate (about 150 MB)'], ['base', 'Base: good balance (about 290 MB)'], ['small', 'Small: most accurate, slower (about 970 MB)']]
      .map(([v, l]) => h('option', { value: v, selected: st.whisperModel === v, text: l })));
  const langSelect = h('select', { class: 'input', onChange: () => set('language', langSelect.value) },
    LANGUAGES.map((l) => h('option', { value: l, selected: st.language === l, text: cap(l) })));
  const autoBox = h('input', { type: 'checkbox', id: 'set-auto', checked: st.autoTranscribe, onChange: () => set('autoTranscribe', autoBox.checked) });
  const check = (key, label) => {
    const box = h('input', { type: 'checkbox', id: `set-${key}`, checked: !!st[key], onChange: () => set(key, box.checked) });
    return h('div', { class: 'check' }, box, h('label', { for: `set-${key}`, text: label }));
  };
  const pick = (key, options) => {
    const sel = h('select', { class: 'input', onChange: () => { set(key, sel.value); applyAppearance(); } }, options.map(([v, l]) => h('option', { value: v, selected: String(st[key]) === v, text: l })));
    return sel;
  };
  // Device names are only visible once the microphone has been allowed.
  const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
  const named = (kind, none) => [['', none], ...devices.filter((d) => d.kind === kind && d.deviceId && d.deviceId !== 'default').map((d, i) => [d.deviceId, d.label || `${kind === 'audioinput' ? 'Microphone' : 'Speaker'} ${i + 1}`])];
  const skipSelect = h('select', { class: 'input', onChange: () => set('skipSeconds', Number(skipSelect.value)) },
    [5, 10, 15, 30].map((n) => h('option', { value: String(n), selected: Number(st.skipSeconds) === n, text: `${n} seconds` })));

  // ---- appearance ----
  const themeSelect = h('select', { class: 'input', onChange: () => { set('theme', themeSelect.value); applyAppearance(); } },
    [['system', 'Match system'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('option', { value: v, selected: st.theme === v, text: l })));
  const accents = [['indigo', 'Indigo'], ['forest', 'Forest'], ['crimson', 'Crimson'], ['ocean', 'Ocean']];
  const accentGroup = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Accent colour' }, accents.map(([v, l]) =>
    h('label', { class: `swatch accent-${v}` }, h('input', { type: 'radio', name: 'accent', value: v, checked: st.accent === v, onChange: () => { set('accent', v); applyAppearance(); } }), h('span', { class: 'sr-only', text: l }))));

  page.append(
    h('header', { class: 'page-head' }, h('div', null, h('h1', { text: 'Settings' }))),

    section('AI for summaries, questions, flashcards and quizzes',
      'ListeNote does not include an AI or need an API key. It uses a command-line AI tool on this computer with your existing subscription. Press Connect next to yours: ListeNote checks you are signed in (and opens the sign-in if not), then finds the models your account can use.',
      providerList, modelField, effortField, customField,
      h('div', { class: 'row' }, testBtn, testOut)),

    section('Transcription', 'Speech is turned into text on this computer with Whisper. Audio is never uploaded.',
      field('Speech model', whisperSelect, 'Downloaded once from Hugging Face the first time you transcribe with it.'),
      field('Spoken language', langSelect),
      h('div', { class: 'check' }, autoBox, h('label', { for: 'set-auto', text: 'Transcribe automatically when a recording stops' })),
      check('liveTranscribe', 'Transcribe live while recording (uses more battery)'),
      check('identifySpeakers', 'Identify speakers (downloads a 385 MB voice model the first time)'),
      field('Skip buttons jump by', skipSelect)),

    section('Recording', 'Choose what to record next to the Record button: microphone, computer audio (Zoom, Teams, Meet, YouTube), or both.',
      field('Recording quality', pick('recordQuality', [['space', 'Space saver (16 kHz, about 11 MB per hour)'], ['good', 'Good (44.1 kHz, about 29 MB per hour)'], ['best', 'Best (48 kHz, about 58 MB per hour)']])),
      field('Microphone', pick('micId', named('audioinput', 'System default'))),
      field('Play recordings through', pick('outputId', named('audiooutput', 'System default'))),
      check('noiseReduction', 'Reduce background noise'),
      h('p', { class: 'footnote', text: `Computer audio needs ${window.listenote.platform === 'darwin' ? 'macOS 14.2 or later and permission under System Settings → Privacy & Security → Screen & System Audio Recording' : 'Windows; it is not available on Linux'}. Shortcut to start or stop recording from any app: ${window.listenote.platform === 'darwin' ? '⌘⌥⇧R' : 'Ctrl+Alt+Shift+R'}.` })),

    section('Appearance', null, field('Theme', themeSelect),
      field('Note width (margins)', pick('editorWidth', [['narrow', 'Narrow'], ['normal', 'Normal'], ['wide', 'Full width']])),
      field('Date format', pick('dateFormat', [['short', 'Short (14/11/26)'], ['medium', 'Medium (14 Nov 2026)'], ['long', 'Long (14 November 2026)'], ['iso', 'ISO (2026-11-14)']])), h('div', { class: 'field' }, h('span', { text: 'Accent colour' }), accentGroup)),

    section('Privacy', null,
      h('ul', { class: 'plain-list' },
        h('li', { text: 'Your notes, recordings and transcripts are stored only in a folder on this computer. ListeNote has no account, no server, no analytics and no tracking.' }),
        h('li', { text: 'Transcription runs on this computer. The only download is the speech model itself, fetched from huggingface.co.' }),
        h('li', { text: 'When you use Summary, Ask, Flashcards, Quiz or Study guides, the text of that note and its transcript is sent to the AI you chose above, under your own account and that provider\'s terms. Audio is never sent. Choose Ollama to keep this step on your computer too.' }),
        h('li', { text: 'The AI tool is started with its tools switched off or read-only, so lecture text cannot make it run commands or read your files.' }))),

    section('Your data', `Stored in ${info.dataDir}`,
      h('div', { class: 'row' },
        button('Show folder', () => api.revealData()),
        button('Delete all data…', async () => {
          const ok = await confirmDialog({
            title: 'Delete everything?',
            body: 'This permanently deletes every note, recording, transcript, flashcard, assignment and study guide from this computer. It cannot be undone. Downloaded speech models are kept.',
            confirmLabel: 'Delete everything', danger: true, requireText: 'DELETE',
          });
          if (!ok) return;
          try { S.frozen = true; await api.wipeData(); window.location.reload(); } catch (err) { S.frozen = false; toast(errorMessage(err), 'error'); }
        }, { kind: 'danger' }))),

    h('p', { class: 'footnote', text: `ListeNote ${info.version}` }),
  );
  loadModels();
}
