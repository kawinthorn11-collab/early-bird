import { useAnswerReaction } from './motion';

// Original cast drawn in SVG. Pip = guide (paper bird). Villains = one rule-gremlin per grammar group. Three interviewers.
export type PipMood = 'happy' | 'think' | 'wow';

/** `still` turns off the idle loop, for spots next to text the student is reading. */
export function Pip({ size = 120, mood = 'happy', still = false }: { size?: number; mood?: PipMood; still?: boolean }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={`ch pip ${still ? 'still' : ''}`} aria-label="Pip นกกระดาษไกด์">
      <ellipse className="ch-shadow" cx="60" cy="108" rx="30" ry="5" fill="#0002" />
      <g className="ch-body">
        <path className="ink-print" d="M20 70 L100 40 L70 98 Z" transform="translate(4 3)" />
        <path className="pip-paper" d="M20 70 L100 40 L70 98 Z" strokeWidth="3.5" strokeLinejoin="round" />
        <path className="pip-wing pip-wing-fill" d="M100 40 L58 74 L70 98" strokeWidth="3.5" strokeLinejoin="round" />
        <path className="pip-line" d="M20 70 L58 74" strokeWidth="3.5" />
        <g className="ch-eyes">
          <circle className="pip-eye" cx="74" cy="58" r="7" strokeWidth="2.5" />
          <circle className="pip-pupil" cx={mood === 'think' ? 76 : 75} cy={mood === 'think' ? 55 : 58} r="3.5" />
        </g>
        <g className="ch-mood" key={mood}>
          {mood === 'wow' ? <circle className="pip-cheek-fill" cx="88" cy="66" r="3" /> : <path className="pip-cheek" d="M84 64 q4 4 8 0" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
        </g>
        <g className="pip-tuft">
          <path className="pip-tuft-line" d="M44 34 q6 -14 18 -10" strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <circle className="pip-tuft-dot" cx="64" cy="24" r="5" />
        </g>
      </g>
    </svg>
  );
}

const VILLAINS: Record<string, { color: string; glyph: string; name: string }> = {
  prepo: { color: '#765ce0', glyph: 'by', name: 'Prepo ปูหนีบบุพบท' },
  tikki: { color: '#ff6c2f', glyph: '⏱', name: 'Tikki ตัวป่วนเวลา' },
  knotto: { color: '#00a07a', glyph: '&', name: 'Knotto ปมคำเชื่อม' },
  morphy: { color: '#e8327c', glyph: '-ly', name: 'Morphy ร่างแปลง' },
  boo: { color: '#4f6b8a', glyph: '?', name: 'Boo ผีชี้ผิดตัว' },
  arti: { color: '#9a5b3c', glyph: 'the', name: 'Arti ผู้ขโมย a/the' },
  passo: { color: '#2f4fd8', glyph: 'V3', name: 'Passo จอมสลับ' },
  hydra: { color: '#e0442e', glyph: '∥', name: 'Hydra ร่างสองหัว' },
};
export const villainName = (id: string) => VILLAINS[id]?.name ?? id;
export const villainColor = (id: string) => (VILLAINS[id] ?? VILLAINS.boo).color;

/** `reacts` makes the villain wince at a right answer and gloat at a wrong one (see announceAnswer). */
export function Villain({ id, size = 120, still = false, reacts = false }: { id: string; size?: number; still?: boolean; reacts?: boolean }) {
  const v = VILLAINS[id] ?? VILLAINS.boo;
  const r = useAnswerReaction(reacts);
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={`ch villain-ch ${still ? 'still' : ''}`} aria-label={v.name}>
      <ellipse className="ch-shadow" cx="60" cy="110" rx="32" ry="5" fill="#0002" />
      <g key={r?.n ?? 0} className={r ? (r.ok ? 'react-hit' : 'react-gloat') : ''}>
        <g className="ch-body">
          <path className="ink-print" transform="translate(4 3)" d="M22 100 q-6 -60 38 -72 q44 12 38 72 q-8 -8 -12 0 q-6 -8 -12 0 q-7 -8 -14 0 q-6 -8 -12 0 q-6 -8 -14 0 z" />
          <path d="M22 100 q-6 -60 38 -72 q44 12 38 72 q-8 -8 -12 0 q-6 -8 -12 0 q-7 -8 -14 0 q-6 -8 -12 0 q-6 -8 -14 0 z" fill={v.color} />
          <path className="v-horns" d="M38 30 l-8 -16 l16 10 M82 30 l8 -16 l-16 10" fill={v.color} />
          <g className="ch-eyes">
            <circle cx="47" cy="56" r="9" fill="#fff" /><circle cx="73" cy="56" r="9" fill="#fff" />
            <circle cx="49" cy="58" r="4" fill="#111" /><circle cx="71" cy="58" r="4" fill="#111" />
          </g>
          <path className="v-ouch" d="M40 51 l12 6 l-12 6 M80 51 l-12 6 l12 6" stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M38 44 l14 6 M82 44 l-14 6" stroke="#111" strokeWidth="3" strokeLinecap="round" />
          <path d="M46 76 q14 10 28 0" stroke="#111" strokeWidth="3" fill="none" strokeLinecap="round" />
          <rect x="40" y="84" width="40" height="16" rx="6" fill="#fff" opacity=".9" />
          <text x="60" y="96.5" textAnchor="middle" fontSize="12" fontWeight="700" fill={v.color} fontFamily="ui-monospace,monospace">{v.glyph}</text>
        </g>
      </g>
    </svg>
  );
}

export type InterviewerId = 'kind' | 'strict' | 'asian';
export const INTERVIEWERS: Record<InterviewerId, { name: string; role: string; color: string }> = {
  kind: { name: 'Ms. Sarah', role: 'อาจารย์ใจดี (สำเนียงอเมริกัน)', color: '#f2b134' },
  strict: { name: 'Dr. Grant', role: 'อาจารย์ถามจี้ (สำเนียงอังกฤษ)', color: '#455a64' },
  asian: { name: 'Tawan', role: 'เพื่อนร่วมคลาส ถามตรงประเด็น (สำเนียงเอเชีย)', color: '#1f6f5c' },
};

export function Interviewer({ id, talking = false, listening = false, size = 130 }: { id: InterviewerId; talking?: boolean; listening?: boolean; size?: number }) {
  const c = INTERVIEWERS[id];
  const hair = id === 'kind' ? '#8d5524' : id === 'strict' ? '#cfd8dc' : '#212121';
  return (
    <svg viewBox="0 0 130 130" width={size} height={size} className={`ch judge-ch ${talking ? 'talking' : ''} ${listening ? 'listening' : ''}`} aria-label={c.name}>
      <rect x="20" y="88" width="90" height="42" rx="20" fill={c.color} />
      <path d="M52 88 l13 18 l13 -18" fill="#fff" />
      <g className="ch-head">
        <circle cx="65" cy="58" r="30" fill="#f1c9a5" />
        {id === 'kind' && <path d="M33 58 q0 -36 32 -36 q32 0 32 36 q-6 -20 -32 -22 q-26 2 -32 22 z M33 58 q-4 26 6 34 M97 58 q4 26 -6 34" fill={hair} stroke={hair} strokeWidth="4" />}
        {id === 'strict' && <path d="M36 50 q4 -26 29 -26 q25 0 29 26 q-10 -12 -29 -12 q-19 0 -29 12 z" fill={hair} />}
        {id === 'asian' && <path d="M35 52 q2 -28 30 -28 q28 0 30 28 l-6 -6 q-24 -6 -48 0 z" fill={hair} />}
        <g className="ch-eyes"><circle cx="54" cy="58" r="3.5" fill="#222" /><circle cx="76" cy="58" r="3.5" fill="#222" /></g>
        {id === 'strict' ? <path d="M46 48 l14 3 M84 46 l-14 4" stroke="#555" strokeWidth="3" strokeLinecap="round" /> : <path d="M47 50 q7 -4 13 0 M70 50 q7 -4 13 0" stroke="#5d4037" strokeWidth="2.5" fill="none" strokeLinecap="round" />}
        {id === 'kind' && <g fill="none" stroke="#333" strokeWidth="2"><circle cx="54" cy="58" r="8" /><circle cx="76" cy="58" r="8" /><path d="M62 58 h6" /></g>}
        {id === 'strict' && <path d="M52 76 q13 -6 26 0" stroke="#cfd8dc" strokeWidth="5" strokeLinecap="round" fill="none" />}
        <path className="mouth" d={id === 'strict' ? 'M56 80 q9 2 18 0' : 'M55 76 q10 9 20 0'} stroke="#8a3b2e" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}
