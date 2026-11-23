// npm run generate:audio [-- --budget 12000 --dry]
// Pre-generates every voice line once (ElevenLabs API, key from .env only) and stores it as public/audio/<hash>.mp3.
// Files already in manifest.json are never paid for again. Slow versions are made locally with ffmpeg (no credits).
import { readFile, writeFile, appendFile, access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { loadContent, audioKey, ROOT } from './lib.mjs';

const run = promisify(execFile);
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1] ?? true; };
const DRY = args.includes('--dry');
const MODEL = 'eleven_v4_turbo'; // 0.5 credit per character (checked via /v1/models on 2026-11-12)
const VOICES = {
  guide: '7XW5JhaNn90bnFojQ5DA', // Mali – natural & clear Thai (female)
  kind: 'EXAVITQu4vr4xnSDxMaL', // Sarah – American (female)
  strict: 'onwK4e9ZLuTAKqWW03F9', // Daniel – British (male)
  asian: 'bcdIY58WBBzAMmef52NW', // Zie – Thai narrator speaking English (Asian accent)
  reader: 'Xb7hH8MSUJpSbSDYk0k2', // Alice – clear British educator (female)
};
const AUDIO = path.join(ROOT, 'public/audio');

async function env() {
  const t = await readFile(path.join(ROOT, '.env'), 'utf8').catch(() => '');
  return t.match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1]?.trim();
}
export const interviewerFor = (id) => ['kind', 'strict', 'asian'][parseInt(audioKey('x', id), 36) % 3];

const c = await loadContent();
/** [priority, voice, text, slowToo] in the order credits should be spent */
const jobs = [];
const add = (prio, voice, text, slow = false) => text && jobs.push({ prio, voice, text: text.trim(), slow });
// 1. interview questions (+ follow-ups) in the interviewer's own voice
add(1, 'kind', "Good morning. Please have a seat. Let's begin.");
for (const q of c.interview.questions) { const v = interviewerFor(q.id); add(1, v, q.q); q.follow.forEach((f) => add(1, v, f)); }
// 2. shadowing sentences, survival phrases, lesson speaking lines (normal + slow)
for (const s of c.shadowing) add(2, 'reader', s.text, true);
for (const s of c.interview.survival) add(2, 'reader', s.en, true);
for (const l of c.lessons) l.speak.forEach((s) => add(2, 'reader', s, true));
// 3. narration for animated scenes (lesson hooks + land films)
for (const l of c.lessons) add(3, 'guide', l.hook.beats.map((b) => b.say).join(' '));
try {
  const films = JSON.parse(await readFile(path.join(ROOT, 'content/land-films.json'), 'utf8'));
  films.forEach((f) => add(3, 'guide', f.map((b) => b.say).join(' ')));
} catch {}
// 4. sample answers + discover examples (nice to have)
for (const q of c.interview.questions) add(4, 'reader', q.sample);
for (const l of c.lessons) l.discover.examples.forEach((e) => add(4, 'reader', e.replace(/\*\*/g, '')));
// 5. reading passages are read by the browser voice (not worth the credits)

const manPath = path.join(AUDIO, 'manifest.json');
const manifest = JSON.parse(await readFile(manPath, 'utf8').catch(() => '{}'));
const seen = new Set();
const todo = jobs.sort((a, b) => a.prio - b.prio).filter((j) => { const k = audioKey(j.voice, j.text); if (seen.has(k) || manifest[k]) return false; seen.add(k); return true; });
const slowTodo = jobs.filter((j) => j.slow && !manifest[audioKey(j.voice, j.text, true)]);

const key = await env();
let creditsLeft = Infinity;
if (key) {
  const sub = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': key } }).then((r) => r.json()).catch(() => null);
  if (sub?.character_limit) creditsLeft = sub.character_limit - sub.character_count;
}
const budget = Math.min(Number(flag('budget', Infinity)), creditsLeft - 1500); // keep a reserve for later fixes
const cost = (t) => Math.ceil(t.length * 0.5);
console.log(`to generate: ${todo.length} lines, ${todo.reduce((a, j) => a + j.text.length, 0)} chars (~${todo.reduce((a, j) => a + cost(j.text), 0)} credits). Credits left: ${creditsLeft}. Budget: ${budget}`);
if (DRY || !key) { if (!key) console.log('No ELEVENLABS_API_KEY in .env — the app will use the browser voice.'); process.exit(0); }

let spent = 0; const byPrio = {}; let made = 0; let failed = 0;
const queue = [...todo];
async function worker() {
  while (queue.length) {
    const j = queue.shift();
    if (spent + cost(j.text) > budget) { continue; }
    spent += cost(j.text);
    const k = audioKey(j.voice, j.text);
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICES[j.voice]}?output_format=mp3_44100_64`, {
      method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: j.text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    }).catch((e) => ({ ok: false, status: e.message }));
    if (!r.ok) { failed++; spent -= cost(j.text); console.log('✗', r.status, j.voice, j.text.slice(0, 50), r.text ? (await r.text()).slice(0, 160) : ''); if (r.status === 401 || r.status === 402) queue.length = 0; continue; }
    await writeFile(path.join(AUDIO, `${k}.mp3`), Buffer.from(await r.arrayBuffer()));
    manifest[k] = `${k}.mp3`; made++;
    byPrio[j.prio] = (byPrio[j.prio] ?? 0) + j.text.length;
    if (made % 10 === 0) { await writeFile(manPath, JSON.stringify(manifest)); console.log(`… ${made} files, ~${spent} credits`); }
  }
}
await Promise.all([worker(), worker(), worker()]);

// slow versions (local ffmpeg, free)
let slowMade = 0;
for (const j of slowTodo) {
  const k = audioKey(j.voice, j.text); const ks = audioKey(j.voice, j.text, true);
  if (!manifest[k] || manifest[ks]) continue;
  try { await access(path.join(AUDIO, manifest[k])); await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(AUDIO, manifest[k]), '-filter:a', 'atempo=0.78', path.join(AUDIO, `${ks}.mp3`)]); manifest[ks] = `${ks}.mp3`; slowMade++; } catch {}
}
await writeFile(manPath, JSON.stringify(manifest));

const names = { 1: 'คำถามสัมภาษณ์', 2: 'ประโยค shadowing/พูด', 3: 'เสียงพากย์แอนิเมชัน', 4: 'คำตอบตัวอย่าง/ตัวอย่างประโยค' };
const line = `\n## รอบ ${new Date().toISOString().slice(0, 16).replace('T', ' ')}\n- โมเดล ${MODEL} (คิด 0.5 เครดิต/ตัวอักษร) · สร้าง ${made} ไฟล์ · ล้มเหลว ${failed} · ทำเสียงช้าด้วย ffmpeg ${slowMade} ไฟล์ (ไม่เสียเครดิต)\n` +
  Object.entries(byPrio).map(([p, n]) => `- ${names[p]}: ${n} ตัวอักษร`).join('\n') + `\n- ใช้ไปรวม ~${spent} เครดิต · คงเหลือก่อนรอบนี้ ${creditsLeft}\n`;
await appendFile(path.join(ROOT, 'AUDIO_REPORT.md'), line);
console.log(line);
