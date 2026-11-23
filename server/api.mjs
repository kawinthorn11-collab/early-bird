// Server-side API (runs inside the Vite dev server). The ElevenLabs key never leaves this file's process.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm, access, readdir } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROUTER = 'http://localhost:20128/v1';
const MIMI = 'http://127.0.0.1:18734/v1/chat/completions';
const WHISPER_MODEL = 'mlx-community/whisper-small.en-mlx';

export async function loadEnv() {
  try {
    const txt = await readFile(path.join(ROOT, '.env'), 'utf8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch { /* no .env: ElevenLabs features fall back */ }
}

async function findMlxWhisper() {
  for (const p of [path.join(homedir(), '.local/bin/mlx_whisper'), '/usr/local/bin/mlx_whisper', '/opt/homebrew/bin/mlx_whisper']) {
    try { await access(p); return p; } catch {}
  }
  return null;
}

const routerHeaders = () => ({ 'content-type': 'application/json', ...(process.env.NINEROUTER_API_KEY ? { authorization: `Bearer ${process.env.NINEROUTER_API_KEY}` } : {}) });

async function routerModels() {
  try {
    const r = await fetch(`${ROUTER}/models`, { headers: routerHeaders(), signal: AbortSignal.timeout(2500) });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.data || []).map((m) => m.id);
  } catch { return []; }
}

async function status() {
  return {
    mlxWhisper: !!(await findMlxWhisper()),
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    routerKey: !!process.env.NINEROUTER_API_KEY,
    routerModels: await routerModels(),
  };
}

// Only fillers: a full sentence here gets echoed back by Whisper when the speaker says little.
const FILLER_PROMPT = 'Umm, uh, hmm.';

async function transcribeLocal(audioBuf) {
  const bin = await findMlxWhisper();
  if (!bin) throw new Error('mlx_whisper not installed');
  const dir = await mkdtemp(path.join(tmpdir(), 'auq-'));
  try {
    await writeFile(path.join(dir, 'in.webm'), audioBuf);
    // trim leading/trailing silence: Whisper tends to invent words in long silent stretches (pauses are measured in the browser)
    const trim = 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse';
    await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(dir, 'in.webm'), '-af', trim, '-ar', '16000', '-ac', '1', path.join(dir, 'in.wav')]);
    await run(bin, [path.join(dir, 'in.wav'), '--model', WHISPER_MODEL, '--word-timestamps', 'True', '--output-format', 'json',
      '--output-dir', dir, '--language', 'en', '--initial-prompt', FILLER_PROMPT, '--condition-on-previous-text', 'False'], { timeout: 180000 });
    const d = JSON.parse(await readFile(path.join(dir, 'in.json'), 'utf8'));
    const words = (d.segments || []).flatMap((s) => (s.words || []).map((w) => ({ word: w.word.trim(), start: w.start, end: w.end })));
    const text = (d.text || '').trim();
    const echo = text.toLowerCase().replace(/[^a-z]/g, '') === FILLER_PROMPT.toLowerCase().replace(/[^a-z]/g, '');
    return { engine: 'mlx-whisper', text: echo ? '' : text, words: echo ? [] : words };
  } finally { rm(dir, { recursive: true, force: true }); }
}

async function transcribeEleven(audioBuf) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('no ElevenLabs key');
  const fd = new FormData();
  fd.append('model_id', 'scribe_v1');
  fd.append('language_code', 'en');
  fd.append('tag_audio_events', 'false');
  fd.append('file', new Blob([audioBuf], { type: 'audio/webm' }), 'speech.webm');
  const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: fd });
  if (!r.ok) throw new Error(`ElevenLabs STT ${r.status}`);
  const d = await r.json();
  const words = (d.words || []).filter((w) => w.type === 'word').map((w) => ({ word: w.text, start: w.start, end: w.end }));
  return { engine: 'elevenlabs', text: d.text || '', words };
}

async function chat(model, messages, { json = false, maxTokens = 600 } = {}) {
  const r = await fetch(`${ROUTER}/chat/completions`, {
    method: 'POST', headers: routerHeaders(),
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.6, stream: false, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(r.status === 401 ? '9Router ต้องใช้ API key — ใส่ NINEROUTER_API_KEY ใน .env' : `9Router ${r.status}`);
  const d = await r.json();
  return d.choices?.[0]?.message?.content ?? '';
}

async function translate(text, model) {
  // Prefer the user's local Apple Translation helper (offline), then 9Router.
  try {
    const r = await fetch(MIMI, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'apple-en-th', messages: [{ role: 'user', content: text }] }), signal: AbortSignal.timeout(8000) });
    if (r.ok) { const d = await r.json(); const t = d.choices?.[0]?.message?.content; if (t) return { engine: 'mimi', text: t }; }
  } catch {}
  if (!model) throw new Error('no translator');
  const t = await chat(model, [{ role: 'system', content: 'Translate the English into natural, simple Thai. Reply with the Thai only.' }, { role: 'user', content: text }], { maxTokens: 300 });
  return { engine: '9router', text: t.trim() };
}

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

export function apiMiddleware() {
  return async (req, res, next) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/api/status') return send(res, 200, await status());

      if (url.pathname === '/api/transcribe' && req.method === 'POST') {
        const buf = await readBody(req);
        const engine = url.searchParams.get('engine') || 'auto';
        const order = engine === 'auto' ? ['local', 'eleven'] : [engine];
        const errors = [];
        for (const e of order) {
          try { return send(res, 200, e === 'local' ? await transcribeLocal(buf) : await transcribeEleven(buf)); }
          catch (err) { errors.push(`${e}: ${err.message}`); }
        }
        return send(res, 503, { error: errors.join('; ') });
      }

      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req, 1e6)).toString('utf8'));
        if (!body.model) return send(res, 400, { error: 'model required' });
        const content = await chat(body.model, body.messages, { json: !!body.json, maxTokens: body.maxTokens || 600 });
        return send(res, 200, { content });
      }

      if (url.pathname === '/api/translate' && req.method === 'POST') {
        const body = JSON.parse((await readBody(req, 1e5)).toString('utf8'));
        return send(res, 200, await translate(String(body.text || '').slice(0, 2000), body.model));
      }

      // User-made subtitle files live in <project>/subs/<videoId>.srt|.vtt
      if (url.pathname === '/api/subs') {
        const files = await readdir(path.join(ROOT, 'subs')).catch(() => []);
        const id = url.searchParams.get('id');
        if (!id) return send(res, 200, { files });
        const f = files.find((x) => x === `${id}.srt` || x === `${id}.vtt`);
        if (!f || !/^[\w-]+\.(srt|vtt)$/.test(f)) return send(res, 404, { error: 'no subs' });
        return send(res, 200, { name: f, text: await readFile(path.join(ROOT, 'subs', f), 'utf8') });
      }
    } catch (err) {
      return send(res, 500, { error: String(err.message || err) });
    }
    next();
  };
}
