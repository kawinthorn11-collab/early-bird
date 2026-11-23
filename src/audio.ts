// Voice playback: pre-generated ElevenLabs files when present, Web Speech otherwise. SFX are synthesized (no files). Background music lives in music.ts.
/** Only the local dev server has /api (Whisper, 9Router, subtitles). The GitHub Pages build is static. */
export const HAS_SERVER = import.meta.env.DEV;
export const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`;

export type Voice = 'guide' | 'kind' | 'strict' | 'asian' | 'reader';

/** djb2 hash — must match scripts/lib.mjs so the generator and the app agree on file names. */
export function audioKey(voice: string, text: string, slow = false) {
  const s = `${voice}|${text.trim()}${slow ? '|slow' : ''}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

let manifest: Record<string, string> | null = null;
const loadManifest = (): Promise<Record<string, string>> =>
  manifest ? Promise.resolve(manifest) : fetch(asset('audio/manifest.json')).then((r) => (r.ok ? r.json() : {})).catch(() => ({})).then((m: Record<string, string>) => (manifest = m));
loadManifest();

let current: HTMLAudioElement | null = null;
export function stopAll() {
  current?.pause(); current = null;
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

export async function hasFile(voice: Voice, text: string, slow = false) {
  return !!(await loadManifest())[audioKey(voice, text, slow)];
}

/** Speak text. Resolves when playback ends. */
export async function speak(text: string, voice: Voice = 'reader', opts: { slow?: boolean; lang?: 'en' | 'th' } = {}): Promise<void> {
  stopAll();
  const m = await loadManifest();
  const file = m[audioKey(voice, text, opts.slow)] ?? (opts.slow ? m[audioKey(voice, text)] : undefined);
  if (file) {
    const a = new Audio(asset(`audio/${file}`));
    if (opts.slow && !m[audioKey(voice, text, true)]) a.playbackRate = 0.75;
    current = a;
    return new Promise((res) => { a.onended = () => res(); a.onerror = () => res(); a.play().catch(() => res()); });
  }
  return webSpeak(text, voice, opts);
}

function webSpeak(text: string, voice: Voice, opts: { slow?: boolean; lang?: 'en' | 'th' }) {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  const lang = opts.lang ?? (voice === 'guide' ? 'th' : 'en');
  const u = new SpeechSynthesisUtterance(text);
  const want = lang === 'th' ? 'th' : voice === 'strict' ? 'en-GB' : 'en-US';
  const vs = speechSynthesis.getVoices();
  u.voice = vs.find((v) => v.lang.startsWith(want)) ?? vs.find((v) => v.lang.startsWith(lang)) ?? null;
  u.lang = u.voice?.lang ?? (lang === 'th' ? 'th-TH' : 'en-US');
  u.rate = opts.slow ? 0.7 : 0.95;
  return new Promise<void>((res) => { u.onend = () => res(); u.onerror = () => res(); speechSynthesis.speak(u); setTimeout(res, 2000 + text.length * 140); });
}

/* ---------- sound effects (WebAudio) ---------- */
let ctx: AudioContext | null = null;
const ac = () => (ctx ??= new AudioContext());
export let sfxOn = true;
export const setSfx = (on: boolean) => { sfxOn = on; };

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.15) {
  const c = ac(); const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination); o.start(c.currentTime + start); o.stop(c.currentTime + start + dur + 0.05);
}

export function sfx(kind: 'ok' | 'no' | 'win' | 'tap' | 'level') {
  if (!sfxOn) return;
  if (kind === 'ok') { tone(660, 0, 0.12, 'triangle'); tone(990, 0.09, 0.18, 'triangle'); }
  if (kind === 'no') { tone(220, 0, 0.18, 'sine', 0.12); tone(180, 0.12, 0.2, 'sine', 0.1); }
  if (kind === 'tap') tone(880, 0, 0.05, 'square', 0.04);
  if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle'));
  if (kind === 'level') [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.25, 'square', 0.06));
}

/** Which interviewer asks a question — fixed per question so its pre-generated voice file can be reused (matches scripts/generate-audio.mjs). */
export const interviewerFor = (id: string): 'kind' | 'strict' | 'asian' => (['kind', 'strict', 'asian'] as const)[parseInt(audioKey('x', id), 36) % 3];
