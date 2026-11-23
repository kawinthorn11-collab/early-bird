import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Pip, Villain } from './characters';
import { speak, stopAll, audioKey, asset } from './audio';
import { useTypewriter } from './motion';
import { LAND_THEME, type Land } from './theme';
import type { Beat } from './types';

/**
 * Narrated cartoon scene. The narration is one audio clip (beats joined); each beat appears when the
 * narration reaches its share of characters, so captions stay in sync with ElevenLabs or Web Speech audio.
 */
export function HookScene({ beats, villain, onDone, title, land }: { beats: Beat[]; villain: string; onDone?: () => void; title?: string; land?: number }) {
  const [i, setI] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const timers = useRef<number[]>([]);
  const text = beats.map((b) => b.say).join(' ');

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => { clear(); stopAll(); }, []);

  async function play() {
    clear(); setPlaying(true); setI(0);
    const m: Record<string, string> = await fetch(asset('audio/manifest.json')).then((r) => r.json()).catch(() => ({}));
    const file = m[audioKey('guide', text)];
    let dur = text.length / 13; // Thai web-speech estimate (chars/sec)
    if (file) dur = await new Promise<number>((res) => { const a = new Audio(asset(`audio/${file}`)); a.onloadedmetadata = () => res(a.duration); a.onerror = () => res(dur); });
    let acc = 0;
    beats.forEach((b, k) => { const at = (acc / text.length) * dur * 1000; acc += b.say.length + 1; if (k) timers.current.push(window.setTimeout(() => setI(k), at)); });
    await speak(text, 'guide', { lang: 'th' });
    timers.current.push(window.setTimeout(() => { setI(beats.length - 1); setPlaying(false); }, 300));
  }

  const b = beats[Math.max(0, i)];
  const board = beats.slice(0, Math.max(0, i) + 1).reverse().find((x) => x.board)?.board;
  const n = (land ?? Number(document.documentElement.dataset.land)) as Land;
  const scene = LAND_THEME[n] ?? LAND_THEME[1];
  const guideAnim = i >= 0 && b.actor !== 'villain' ? b.anim ?? 'jump' : null;
  const villainAnim = i >= 0 && b.actor === 'villain' ? b.anim ?? 'shake' : null;
  return (
    <div className="scene">
      {title && <div className="scene-title">{title}</div>}
      <div className="stage" style={{ '--beat': Math.max(0, i), '--scene': scene.accent } as CSSProperties}>
        <Backdrop land={LAND_THEME[n] ? n : 1} />
        <div className="board" key={i >= 0 ? board ?? '' : 'idle'}>{i >= 0 && board ? board : '▶'}</div>
        <div className={`actor guide ${guideAnim ? `a-${guideAnim}` : ''}`} key={`g${i}`}>
          <Effect anim={guideAnim} />
          <Pip mood={b?.anim === 'think' ? 'think' : b?.anim === 'zap' ? 'wow' : 'happy'} />
        </div>
        <div className={`actor villain ${villainAnim ? `a-${villainAnim}` : ''} ${i < 0 ? 'hidden' : ''}`} key={`v${i}`}>
          <Effect anim={villainAnim} />
          <Villain id={villain} />
        </div>
        {i >= 0 && <Bubble key={`b${i}`} side={b.actor === 'villain' ? 'right' : 'left'} text={b.say} />}
      </div>
      <div className="row">
        <button onClick={play} disabled={playing}>{i < 0 ? '▶ เล่นการ์ตูน' : playing ? 'กำลังเล่น…' : '↻ ดูอีกรอบ'}</button>
        {onDone && <button className={i >= 0 && !playing ? 'primary' : 'ghost'} onClick={() => { clear(); stopAll(); onDone(); }}>{i >= 0 && !playing ? 'ไปต่อ →' : 'ข้าม'}</button>}
      </div>
    </div>
  );
}

function Bubble({ side, text }: { side: 'left' | 'right'; text: string }) {
  const [shown, rest] = useTypewriter(text);
  return (
    <div className={`bubble ${side}`}>
      <span className="sr">{text}</span>
      <span aria-hidden="true">{shown}<span className="bubble-rest">{rest}</span></span>
    </div>
  );
}

function Effect({ anim }: { anim: string | null }) {
  if (anim === 'zap') return (
    <svg className="fx fx-zap" viewBox="-50 -50 100 100" aria-hidden="true">
      {Array.from({ length: 8 }, (_, k) => <line key={k} x1="0" y1="-30" x2="0" y2="-46" transform={`rotate(${k * 45})`} />)}
    </svg>
  );
  if (anim === 'think') return <span className="fx fx-think" aria-hidden="true"><i /><i /><i /></span>;
  return null;
}

const tri = (pts: [number, number][], base: number) => pts.map(([x, h]) => `M${x - 17} ${base} L${x} ${base - h} L${x + 17} ${base} Z`).join(' ');

/** Flat two-layer landscape per land. Layers pan a little on every beat so the scene feels like it moves on. */
function Backdrop({ land }: { land: Land }) {
  return (
    <svg className="backdrop" viewBox="0 0 600 290" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      <g className="bd-far">
        <circle className="bd-sun" cx="520" cy="58" r="20" />
        {land === 1 && <path className="bd-fill-far" d="M-160 215 Q -40 150 80 188 T 300 178 T 520 172 T 780 186 V 290 H -160 Z" />}
        {land === 2 && <>
          <path className="bd-fill-far" d="M-160 215 L -20 130 L 60 176 L 170 72 L 262 160 L 334 112 L 430 190 L 520 96 L 640 172 L 780 128 V 290 H -160 Z" />
          <path className="bd-snow" d="M150 91 L170 72 L190 91 L180 87 L170 95 L160 87 Z M502 113 L520 96 L538 113 L529 109 L520 116 L511 109 Z M320 125 L334 112 L348 125 L334 129 Z" />
        </>}
        {land === 3 && <>
          <path className="bd-fill-far" d="M-160 200 Q -20 150 120 182 T 400 170 T 780 176 V 290 H -160 Z" />
          <path className="bd-water" d="M-160 190 Q 100 182 300 192 T 780 188 V 290 H -160 Z" />
          <path className="bd-wave" d="M40 200 q10 -5 20 0 t20 0 M210 197 q10 -5 20 0 t20 0 M380 201 q10 -5 20 0 t20 0 M540 198 q10 -5 20 0 t20 0" />
        </>}
        {land === 4 && <>
          <path className="bd-fill-far" d="M-160 215 L -160 128 Q 300 58 760 128 L 760 215 Z" />
          <path className="bd-wave" d="M-160 150 Q 300 84 760 150 M-160 176 Q 300 112 760 176 M-160 200 Q 300 140 760 200" />
        </>}
      </g>
      <g className="bd-near">
        {land === 1 && <path className="bd-fill-near" d={tri([[-90, 58], [-48, 74], [40, 62], [96, 80], [150, 54], [430, 66], [486, 84], [548, 58], [640, 76], [700, 60]], 214)} />}
        {land === 2 && <path className="bd-fill-near" d="M-160 214 Q -60 180 40 200 T 260 196 T 480 192 T 780 198 V 290 H -160 Z" />}
        {land === 3 && <path className="bd-fill-near" d={tri([[-60, 40], [10, 52], [520, 46], [590, 56], [660, 42]], 214)} />}
        {land === 4 && <>
          <path className="bd-pole" d="M30 214 V 128 M190 214 V 120 M410 214 V 120 M570 214 V 128" />
          <path className="bd-flag" d="M30 128 l30 9 l-30 9 Z M190 120 l30 9 l-30 9 Z M410 120 l30 9 l-30 9 Z M570 128 l30 9 l-30 9 Z" />
        </>}
      </g>
    </svg>
  );
}
