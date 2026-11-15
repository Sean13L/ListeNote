// Runs the user's own AI command-line tool as a child process.
//
// ListeNote never talks to an AI API itself and holds no API keys. It hands a
// prompt to a CLI the user has already signed in to (Claude Code, Codex,
// Gemini) or to a model on their machine (Ollama), and reads the answer back.
//
// Lecture text is untrusted input, so each provider is started with its tools
// switched off or read-only, in an empty working directory.

const { spawn, execFile } = require('node:child_process');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const TIMEOUT_MS = 10 * 60 * 1000;
const MAX_OUTPUT = 4 * 1024 * 1024;

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max']);

const PROVIDERS = {
  claude: {
    label: 'Claude Code',
    bin: 'claude',
    install: 'https://claude.com/claude-code',
    modelHint: 'e.g. sonnet, opus, haiku (blank = your default)',
    tested: true,
    build({ system, model, effort }) {
      const args = [
        '-p',
        '--tools', '',
        '--strict-mcp-config',
        '--setting-sources', '',
        '--disable-slash-commands',
        '--no-session-persistence',
        '--system-prompt', system,
        '--output-format', 'stream-json',
        '--verbose',
        '--include-partial-messages',
      ];
      if (model) args.push('--model', model);
      if (effort) args.push('--effort', effort);
      return { args, stdin: (prompt) => prompt, parser: 'claude-stream' };
    },
  },
  codex: {
    label: 'Codex (ChatGPT)',
    bin: 'codex',
    install: 'https://developers.openai.com/codex/cli',
    modelHint: 'blank = your default',
    tested: false,
    build({ system, model, outFile }) {
      const args = ['exec', '--skip-git-repo-check', '--sandbox', 'read-only', '--ephemeral', '-o', outFile];
      if (model) args.push('-m', model);
      args.push('-');
      return { args, stdin: (prompt) => `${system}\n\n${prompt}`, parser: 'file' };
    },
  },
  gemini: {
    label: 'Gemini CLI',
    bin: 'gemini',
    install: 'https://github.com/google-gemini/gemini-cli',
    modelHint: 'blank = auto',
    tested: false,
    build({ system, model }) {
      const args = ['-p', 'Respond to the request above. Output only the answer.', '-o', 'text'];
      if (model) args.push('-m', model);
      return { args, stdin: (prompt) => `${system}\n\n${prompt}`, parser: 'text' };
    },
  },
  ollama: {
    label: 'Ollama (fully offline)',
    bin: 'ollama',
    install: 'https://ollama.com',
    modelHint: 'required, e.g. llama3.2',
    tested: false,
    needsModel: true,
    build({ system, model }) {
      return { args: ['run', model || 'llama3.2'], stdin: (prompt) => `${system}\n\n${prompt}`, parser: 'text' };
    },
  },
  custom: {
    label: 'Custom command',
    bin: null,
    modelHint: '',
    tested: false,
    build({ system, custom }) {
      const argv = splitCommand(custom);
      return { bin: argv[0], args: argv.slice(1), stdin: (prompt) => `${system}\n\n${prompt}`, parser: 'text' };
    },
  },
};

// Split a command line into argv without invoking a shell.
function splitCommand(line) {
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(line || '')))) {
    out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : m[2] !== undefined ? m[2] : m[3]);
  }
  return out;
}

const stripAnsi = (s) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '');

// Apps launched from Finder get a bare PATH, so tools installed by Homebrew or
// npm would not be found. Ask the login shell once for the real PATH.
let pathPromise = null;
function resolvePath() {
  if (pathPromise) return pathPromise;
  pathPromise = new Promise((resolve) => {
    const home = os.homedir();
    const extra = [
      path.join(home, '.local', 'bin'), path.join(home, 'bin'), path.join(home, '.npm-global', 'bin'),
      path.join(home, '.bun', 'bin'), path.join(home, '.cargo', 'bin'),
      '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin',
    ];
    const merge = (shellPath) => {
      const parts = [...String(shellPath || '').split(path.delimiter), ...String(process.env.PATH || '').split(path.delimiter), ...extra];
      cachedPath = [...new Set(parts.filter(Boolean))].join(path.delimiter);
      resolve(cachedPath);
    };
    if (process.platform === 'win32') return merge('');
    const shell = process.env.SHELL || '/bin/zsh';
    execFile(shell, ['-ilc', 'printf "__LN__%s__LN__" "$PATH"'], { timeout: 5000, encoding: 'utf8' }, (err, stdout) => {
      const m = /__LN__(.*?)__LN__/s.exec(stdout || '');
      merge(m ? m[1] : '');
    });
  });
  return pathPromise;
}

let cachedPath = process.env.PATH || '';
const resolvePathSync = () => cachedPath;

async function which(bin) {
  if (!bin) return null;
  if (path.isAbsolute(bin)) return (await isExecutable(bin)) ? bin : null;
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const dir of (await resolvePath()).split(path.delimiter)) {
    for (const ext of exts) {
      const file = path.join(dir, bin + ext);
      if (await isExecutable(file)) return file;
    }
  }
  return null;
}

async function isExecutable(file) {
  try {
    await fsp.access(file, fs.constants.X_OK);
    return (await fsp.stat(file)).isFile();
  } catch { return false; }
}

async function detect() {
  const out = [];
  for (const [id, p] of Object.entries(PROVIDERS)) {
    out.push({
      id, label: p.label, install: p.install || null, modelHint: p.modelHint,
      tested: p.tested, needsModel: !!p.needsModel,
      available: id === 'custom' ? true : !!(await which(p.bin)),
    });
  }
  return out;
}

const running = new Map();

async function run({ id, provider, model, effort, custom, system, prompt, workDir }, onDelta) {
  const def = PROVIDERS[provider];
  if (!def) throw new Error('Unknown AI provider.');
  if (provider === 'custom' && !String(custom || '').trim()) throw new Error('Set a custom command in Settings first.');
  if (def.needsModel && !model) throw new Error(`${def.label} needs a model name. Add one in Settings.`);

  await fsp.mkdir(workDir, { recursive: true });
  const outFile = path.join(workDir, `out-${id}.txt`);
  const built = def.build({ system, model: String(model || '').trim(), effort: EFFORTS.has(effort) ? effort : '', custom, outFile });
  const binName = built.bin || def.bin;
  const bin = await which(binName);
  if (!bin) throw new Error(`Could not find "${binName}" on this computer. Install it and sign in, or pick another AI in Settings.`);

  const env = { ...process.env, PATH: await resolvePath(), NO_COLOR: '1' };
  // If ListeNote was itself launched from a Claude Code terminal, do not let
  // that session's markers leak into the child.
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  return new Promise((resolve, reject) => {
    const child = spawn(bin, built.args, { cwd: workDir, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    running.set(id, child);

    let text = '';
    let raw = '';
    let stderr = '';
    let lineBuf = '';
    let finalResult = null;
    let apiError = null;
    let settled = false;
    let cancelled = false;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      running.delete(id);
      fsp.rm(outFile, { force: true }).catch(() => {});
      if (err) reject(err); else resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('The AI took longer than 10 minutes and was stopped.'));
    }, TIMEOUT_MS);

    child.cancel = () => { cancelled = true; child.kill('SIGTERM'); };

    const emit = (delta) => {
      if (!delta) return;
      text += delta;
      if (text.length > MAX_OUTPUT) { child.kill('SIGKILL'); return; }
      onDelta(delta);
    };

    const handleClaudeLine = (line) => {
      if (!line.trim()) return;
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === 'stream_event' && ev.event && ev.event.type === 'content_block_delta' && ev.event.delta && ev.event.delta.type === 'text_delta') {
        emit(ev.event.delta.text);
      } else if (ev.type === 'result') {
        if (ev.is_error) apiError = String(ev.result || ev.subtype || 'The AI returned an error.');
        else if (typeof ev.result === 'string') finalResult = ev.result;
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (built.parser === 'claude-stream') {
        lineBuf += chunk;
        let idx;
        while ((idx = lineBuf.indexOf('\n')) >= 0) {
          handleClaudeLine(lineBuf.slice(0, idx));
          lineBuf = lineBuf.slice(idx + 1);
        }
      } else if (built.parser === 'text') {
        emit(stripAnsi(chunk));
      } else {
        raw += chunk;
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });

    child.on('error', (err) => finish(new Error(`Could not start ${def.label}: ${err.message}`)));
    child.on('close', async (code) => {
      if (cancelled) return finish(new Error('Cancelled.'));
      if (built.parser === 'claude-stream' && lineBuf) handleClaudeLine(lineBuf);
      if (apiError) return finish(new Error(apiError));
      let result = text;
      if (built.parser === 'claude-stream' && finalResult && !text) result = finalResult;
      if (built.parser === 'file') {
        result = await fsp.readFile(outFile, 'utf8').catch(() => '') || stripAnsi(raw);
        if (result) onDelta(result);
      }
      result = result.trim();
      if (code !== 0 && !result) {
        const detail = stripAnsi(stderr).trim().split('\n').slice(-4).join('\n');
        return finish(new Error(`${def.label} exited with an error${detail ? `:\n${detail}` : '.'}\nMake sure you are signed in by running "${binName}" in a terminal.`));
      }
      if (!result) return finish(new Error(`${def.label} returned an empty answer.`));
      finish(null, result);
    });

    child.stdin.on('error', () => {});
    child.stdin.end(built.stdin(prompt));
  });
}

function cancel(id) {
  const child = running.get(id);
  if (child && child.cancel) child.cancel();
}

function cancelAll() {
  for (const child of running.values()) if (child.cancel) child.cancel();
}

module.exports = { detect, run, cancel, cancelAll, splitCommand, which, resolvePathSync, PROVIDERS };
