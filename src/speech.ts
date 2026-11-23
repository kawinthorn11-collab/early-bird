import { HAS_SERVER } from './audio';
import { duckMusic } from './music';
import { useEffect, useRef, useState } from 'react';
import type { Settings } from './types';

export const GREEN = { lo: -32, hi: -10 }; // dBFS window that reads as "clear and loud enough" at laptop distance
const SILENCE_DB = -45;

/** Microphone recorder with a live loudness meter (Web Audio) and a loudness timeline for pause analysis. */
export function useRecorder() {
  const [rec, setRec] = useState(false);
  const [db, setDb] = useState(-90);
  const [err, setErr] = useState('');
  const parts = useRef<Blob[]>([]);
  const mr = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef(0);
  const timeline = useRef<number[]>([]); // dB every ~50ms
  const startT = useRef(0);
  const asr = useRef<{ text: string; stop: () => void } | null>(null);

  useEffect(() => () => stopTracks(), []);

  function stopTracks() {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    ctx.current?.close().catch(() => {});
    stream.current = null; ctx.current = null;
    duckMusic(false);
  }

  async function start() {
    setErr('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      duckMusic(true);
      const c = new AudioContext(); ctx.current = c;
      const an = c.createAnalyser(); an.fftSize = 2048;
      c.createMediaStreamSource(s).connect(an);
      const buf = new Float32Array(an.fftSize);
      timeline.current = []; let last = 0;
      const tick = (t: number) => {
        an.getFloatTimeDomainData(buf);
        let sum = 0; for (const v of buf) sum += v * v;
        const d = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9);
        setDb(d);
        if (t - last > 50) { timeline.current.push(d); last = t; }
        raf.current = requestAnimationFrame(tick);
      };
      raf.current = requestAnimationFrame(tick);
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
      const m = new MediaRecorder(s, type ? { mimeType: type } : undefined);
      parts.current = [];
      m.ondataavailable = (e) => e.data.size && parts.current.push(e.data);
      m.start(250); mr.current = m; startT.current = Date.now();
      asr.current = webSpeechListen();
      setRec(true);
    } catch (e) {
      setErr(location.protocol === 'http:' && location.hostname !== 'localhost' ? 'มือถือต้องเปิดผ่าน https หรือ localhost ถึงจะใช้ไมค์ได้ (ดู README)' : 'เปิดไมค์ไม่ได้: ' + (e as Error).message);
    }
  }

  function stop(): Promise<{ blob: Blob; seconds: number; timeline: number[]; webText: string }> {
    return new Promise((resolve) => {
      const m = mr.current;
      const webText = asr.current?.text ?? ''; asr.current?.stop();
      if (!m) return resolve({ blob: new Blob(), seconds: 0, timeline: [], webText });
      m.onstop = () => {
        stopTracks(); setRec(false); setDb(-90);
        resolve({ blob: new Blob(parts.current, { type: m.mimeType }), seconds: (Date.now() - startT.current) / 1000, timeline: [...timeline.current], webText: asr.current?.text || webText });
      };
      m.stop();
    });
  }
  return { rec, db, err, start, stop };
}

/** Browser speech recognition, run alongside recording as a last-resort transcript. */
function webSpeechListen() {
  const SR = (window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;
  if (!SR) return null;
  const out = { text: '', stop: () => {} };
  try {
    const r = new SR(); r.lang = 'en-US'; r.continuous = true; r.interimResults = false;
    r.onresult = (e: any) => { out.text = Array.from(e.results as ArrayLike<any>).map((x: any) => x[0].transcript).join(' '); };
    r.onerror = () => {};
    r.start(); out.stop = () => { try { r.stop(); } catch {} };
  } catch {}
  return out;
}

export type Analysis = { transcript: string; engine: string; words: string[]; wpm: number; pauses: number; fillers: number; loudOk: number; speechSec: number };

const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'ah', 'hmm', 'mm', 'uhm']);
export const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').split(/\s+/).filter(Boolean);

export async function transcribe(blob: Blob, s: Settings, webText: string): Promise<{ text: string; engine: string }> {
  if (HAS_SERVER && s.stt !== 'webspeech') {
    try {
      const r = await fetch(`/api/transcribe?engine=${s.stt === 'auto' ? 'auto' : s.stt === 'local' ? 'local' : 'eleven'}`, { method: 'POST', body: blob });
      if (r.ok) { const d = await r.json(); return { text: d.text, engine: d.engine }; }
    } catch {}
  }
  return { text: webText, engine: webText ? 'web-speech' : 'none' };
}

export function analyse(text: string, engine: string, timeline: number[]): Analysis {
  const words = tokens(text);
  const voiced = timeline.map((d) => d > SILENCE_DB);
  const first = voiced.indexOf(true); const last = voiced.lastIndexOf(true);
  let pauses = 0; let run = 0; let green = 0; let speaking = 0;
  for (let i = Math.max(0, first); i <= last; i++) {
    if (!voiced[i]) { run++; continue; }
    if (run * 0.05 >= 1) pauses++;
    run = 0; speaking++;
    if (timeline[i] >= GREEN.lo) green++;
  }
  const speechSec = first < 0 ? 0 : ((last - first + 1) * 50) / 1000;
  const real = words.filter((w) => !FILLERS.has(w));
  return {
    transcript: text, engine, words,
    wpm: speechSec > 1 ? Math.round(real.length / (speechSec / 60)) : 0,
    pauses, fillers: words.filter((w) => FILLERS.has(w)).length,
    loudOk: speaking ? green / speaking : 0, speechSec,
  };
}

/** Which words of the target sentence the recogniser did NOT hear (shown in orange, never "wrong"). LCS alignment. */
export function unheard(target: string, heard: string): Set<number> {
  const a = tokens(target); const b = tokens(heard);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const miss = new Set<number>(); let i = 0, j = 0;
  while (i < a.length) {
    if (j < b.length && a[i] === b[j]) { i++; j++; } else if (j < b.length && dp[i][j + 1] >= dp[i + 1][j]) j++; else { miss.add(i); i++; }
  }
  return miss;
}

export type Feedback = { good: string; fix: string; better: string };

/** Exactly three things: one strength, one fix, one better sentence to say again. */
export async function feedback(a: Analysis, ctx: { target?: string; question?: string; sample?: string }, s: Settings): Promise<Feedback> {
  if (HAS_SERVER && s.aiModel && ctx.question && a.transcript) {
    try {
      const r = await fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          model: s.aiModel, json: true, maxTokens: 400,
          messages: [
            { role: 'system', content: 'You coach a shy Thai first-year English major (CEFR A2) practising for speaking tasks in an Everyday English / Listening and Speaking class. Reply ONLY JSON {"good":"...","fix":"...","better":"..."}. "good" and "fix" are ONE short sentence each in friendly casual Thai (like an older sibling; never say ผิด). "better" is ONE improved English answer of 2-3 short A2-B1 sentences that keeps ONLY the facts the student said — never invent facts about them.' },
            { role: 'user', content: `Question: ${ctx.question}\nStudent said (speech-to-text): ${a.transcript}\nSpeed: ${a.wpm} wpm, fillers: ${a.fillers}, long pauses: ${a.pauses}, loud enough: ${Math.round(a.loudOk * 100)}%` },
          ],
        }),
      });
      if (r.ok) { const d = JSON.parse((await r.json()).content.replace(/^```json|```$/g, '')); if (d.good && d.fix && d.better) return d; }
    } catch {}
  }
  const miss = ctx.target ? [...unheard(ctx.target, a.transcript)].map((i) => tokens(ctx.target!)[i]) : [];
  const good =
    a.loudOk >= 0.6 ? 'เสียงดังพอแล้ว เข็มอยู่โซนเขียวเกือบตลอด 👍'
    : ctx.target && miss.length <= 1 && a.words.length ? 'ออกเสียงชัด ระบบฟังออกเกือบทุกคำ'
    : a.wpm >= 90 && a.wpm <= 160 ? `ความเร็วกำลังดี (${a.wpm} คำ/นาที)`
    : a.words.length && a.fillers === 0 ? 'ไม่มี um / uh เลย เยี่ยม'
    : 'กล้าพูดออกมาแล้ว นี่คือก้าวที่ยากที่สุด';
  const fix =
    a.loudOk < 0.5 ? 'ลองพูดดังขึ้นอีกนิด หายใจเข้าลึก ๆ แล้วส่งเสียงจากท้อง ให้เข็มอยู่โซนเขียว'
    : miss.length ? `ลองออกเสียงคำว่า "${miss.slice(0, 3).join('", "')}" ให้ชัดขึ้น เน้นเสียงท้ายคำ`
    : a.fillers >= 2 ? 'ถ้าต้องคิด ให้พูดว่า "Let me think..." แทน um / uh'
    : a.pauses >= 3 ? 'มีช่วงเงียบนานหลายครั้ง ลองใช้คำเชื่อมอย่าง "and", "because", "so" เพื่อพูดต่อไปเรื่อย ๆ'
    : a.wpm && a.wpm < 70 ? 'ลองพูดต่อเนื่องขึ้นนิดนึง ไม่ต้องรีบ แต่ไม่หยุดกลางประโยค'
    : 'ลองเน้นเสียงคำสำคัญ เช่น ชื่อ ความสนใจ หรือเหตุผล ให้คนฟังจำได้';
  const better = ctx.target ?? ctx.sample?.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ') ?? '';
  return { good, fix, better };
}
