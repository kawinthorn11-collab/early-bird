import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useRecorder, transcribe, analyse, feedback, unheard, tokens, GREEN, type Analysis, type Feedback } from './speech';
import { speak, stopAll, sfx, interviewerFor } from './audio';
import { useStore, addXp, markDone, dateKey } from './store';
import { idbGet, idbSet } from './db';
import { interview, shadowing, lessons } from './content';
import { daysBetween } from './dates';
import { Back, Card, Check, Icon, Listen, celebrate, go } from './ui';
import type { RecordingMeta } from './types';
import { Interviewer, INTERVIEWERS } from './characters';

export async function saveRecording(blob: Blob, meta: RecordingMeta) {
  await idbSet(`rec:${meta.id}`, blob);
  const list = (await idbGet<RecordingMeta[]>('recmeta')) ?? [];
  list.push(meta);
  await idbSet('recmeta', list);
}

/** -70..0 dB → 0..1 */
export const loudness = (db: number) => Math.max(0, Math.min(1, (db + 70) / 70));
export const liveLevel = (db: number) => ({ '--lvl': loudness(db).toFixed(2) }) as CSSProperties;

export function Meter({ db }: { db: number }) {
  const ang = -90 + loudness(db) * 180;
  const zone = db < GREEN.lo ? 'เบาไป ดังอีกนิด!' : db > GREEN.hi ? 'ดังมาก (ระวังเสียงแตก)' : 'โซนเขียว ชัดเจน';
  const arc = (a0: number, a1: number) => { const p = (a: number) => [60 + 48 * Math.cos(((a - 90) * Math.PI) / 180), 60 + 48 * Math.sin(((a - 90) * Math.PI) / 180)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0} ${y0} A48 48 0 0 1 ${x1} ${y1}`; };
  const lo = -90 + ((GREEN.lo + 70) / 70) * 180, hi = -90 + ((GREEN.hi + 70) / 70) * 180;
  return (
    <div className="meter">
      <svg viewBox="0 0 120 70" width="220">
        <path d={arc(-90, lo)} stroke="#f0a35b" strokeWidth="10" fill="none" />
        <path d={arc(lo, hi)} stroke="#3c9d5d" strokeWidth="10" fill="none" />
        <path d={arc(hi, 90)} stroke="#d9534f" strokeWidth="10" fill="none" />
        <line className="needle" x1="60" y1="60" x2="60" y2="16" style={{ transform: `rotate(${ang}deg)` }} stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="60" cy="60" r="4" fill="var(--ink)" />
      </svg>
      <div className="small">{db > -80 ? zone : 'มาตรวัดความดัง'}</div>
    </div>
  );
}

/** Record → transcript → (orange unheard words) → exactly 3 pieces of feedback. Nothing is ever marked "wrong". */
export function RecordPanel({ target, question, sample, kind, maxSec = 90, onFinished, invite = false }: {
  target?: string; question?: string; sample?: string; kind: string; maxSec?: number; onFinished?: (a: Analysis, f: Feedback) => void; invite?: boolean;
}) {
  const { s } = useStore();
  const r = useRecorder();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ a: Analysis; f: Feedback } | null>(null);
  const [left, setLeft] = useState(maxSec);

  useEffect(() => {
    if (!r.rec) return;
    setLeft(maxSec);
    const t = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(t);
  }, [r.rec]);
  useEffect(() => { if (r.rec && left <= 0) done(); }, [left]);

  async function done() {
    const out = await r.stop();
    setBusy(true);
    const tr = await transcribe(out.blob, s, out.webText);
    const a = analyse(tr.text, tr.engine, out.timeline);
    const f = await feedback(a, { target, question, sample }, s);
    setRes({ a, f }); setBusy(false); sfx('ok');
    const id = `${Date.now()}`;
    saveRecording(out.blob, { id, t: Date.now(), kind, prompt: target ?? question ?? '', transcript: a.transcript, seconds: out.seconds, wpm: a.wpm, pauses: a.pauses, fillers: a.fillers, loudOk: a.loudOk });
    onFinished?.(a, f);
  }

  const miss = useMemo(() => (res && target ? unheard(target, res.a.transcript) : new Set<number>()), [res, target]);
  return (
    <div className="record">
      <div className="row center">
        {!r.rec ? <button className={`primary big ${invite && !res ? 'invite' : ''}`} disabled={busy} onClick={() => { stopAll(); setRes(null); r.start(); }}><Icon name="mic" />{res ? 'อัดใหม่' : 'กดแล้วพูด'}</button>
          : <button className="danger big rec-live" style={liveLevel(r.db)} onClick={done}><span className="rec-dot" aria-hidden="true" />หยุด ({left}s)</button>}
        <Meter db={r.db} />
      </div>
      {r.err && <p className="no-text">{r.err}</p>}
      {busy && <p className="muted">กำลังฟังเสียงของเรา…</p>}
      {res && (
        <div className="fb">
          {target && <p className="target">{tokens(target).map((w, i) => <span key={i} className={miss.has(i) ? 'unheard' : ''}>{w} </span>)}
            {miss.size > 0 && <span className="small muted"> (สีส้ม = คำที่ระบบยังฟังไม่ออก)</span>}</p>}
          <p className="muted small">ระบบได้ยิน ({res.a.engine}): “{res.a.transcript || '…'}”</p>
          <div className="fb3">
            <div><b>ทำได้ดี</b><p>{res.f.good}</p></div>
            <div><b>ลองแก้ 1 อย่าง</b><p>{res.f.fix}</p></div>
            <div><b>พูดซ้ำประโยคนี้</b><p>{res.f.better} <Listen onClick={() => speak(res.f.better, 'reader')} /></p></div>
          </div>
          <p className="small muted">{res.a.wpm} คำ/นาที · ช่วงเงียบนาน {res.a.pauses} ครั้ง · คำเติม {res.a.fillers} · ดังพอ {Math.round(res.a.loudOk * 100)}%</p>
        </div>
      )}
    </div>
  );
}

function useSession(step: number, need: number) {
  const { update } = useStore();
  const [n, setN] = useState(0);
  const bump = () => setN((x) => {
    const y = x + 1;
    if (y === need) {
      update((p) => { p.speak.sessions[step - 1] = (p.speak.sessions[step - 1] ?? 0) + 1; addXp(p, 40); markDone(p, 'speak'); });
      celebrate(); sfx('win');
    }
    return y;
  });
  return { n, bump, need };
}

const STEPS = [
  { n: 1, name: 'Shadowing', th: 'ฟังแล้วพูดตามพร้อมกัน ไม่มีการตรวจ' },
  { n: 2, name: 'อ่านออกเสียง', th: 'อัดเสียง ระบบบอกคำที่ฟังไม่ออกเป็นสีส้ม' },
  { n: 3, name: 'ตอบจากโครง', th: 'เติมประโยคโครง เช่น I want to study ___ because ___.' },
  { n: 4, name: 'ตอบเอง', th: 'คำถามจริง มีเวลาคิด 20 วินาที' },
  { n: 5, name: 'วงคุยในคลาสจำลอง', th: 'อาจารย์ 2 คนกับเพื่อน 1 คน ถามต่อเนื่อง 5–8 นาที' },
];

export function SpeakHub({ step }: { step?: number }) {
  const { p } = useStore();
  const max = unlockedSteps(p);
  if (step === 1) return <Shadow />;
  if (step === 2) return <ReadAloud />;
  if (step === 3) return <FrameStep />;
  if (step === 4) return <OwnStep />;
  return (
    <div>
      <Back />
      <h2>บันไดความกล้า</h2>
      <p className="muted">ฝึกพูดสำหรับคลาส EN101 Everyday English และ ENL111 Listening and Speaking I: แนะนำตัว เล่าความสนใจ แสดงความเห็น และตอบคำถามในห้อง</p>
      <p className="muted">ไม่มีการหักคะแนน พูดผิดได้เต็มที่ ทำครบ 3 รอบในขั้นไหน ขั้นถัดไปจะปลดล็อก</p>
      <ol className="ladder stagger">
        {STEPS.map((x) => (
          <li key={x.n}>
            <button className={`ladder-step ${x.n > max ? 'locked' : ''}`} disabled={x.n > max} onClick={() => go(x.n === 5 ? '/interview' : `/speak/${x.n}`)}>
              <span className="ladder-n">{x.n}</span>
              <span className="ladder-main"><b>{x.name}</b><span className="muted small">{x.th}</span></span>
              <span className="small muted">{x.n > max ? 'ยังล็อก' : `ทำแล้ว ${p.speak.sessions[x.n - 1] ?? 0} รอบ`}</span>
            </button>
          </li>
        ))}
      </ol>
      <h3 className="section-title"><span>ตัวช่วยก่อนเข้าคลาส</span></h3>
      <div className="grid2">
        <Card onClick={() => go('/builder')}><b>สร้างคำตอบของฉันเอง</b><div className="muted small">กรอกเรื่องจริงเป็นภาษาไทย แล้วเรียบเรียงเป็นอังกฤษระดับที่พูดได้จริง</div></Card>
        <Card onClick={() => go('/survival')}><b>ประโยคเอาตัวรอด</b><div className="muted small">Could you repeat that, please? ฯลฯ</div></Card>
        <Card onClick={() => go('/calm')}><b>ลดความประหม่า</b><div className="muted small">หายใจ 4-7-8, ท่าทาง, เช็กลิสต์วันพูดหน้าห้อง</div></Card>
        <Card onClick={() => go('/videos')}><b>คลิปพร้อมซับ</b><div className="muted small">ฟังจับใจความ แล้วตอบคำถามหลังดู (ENL111)</div></Card>
        <Card onClick={() => go('/voice-progress')}><b>พัฒนาการเสียงของฉัน</b><div className="muted small">กราฟรายสัปดาห์ + ฟังเทียบสัปดาห์แรกกับตอนนี้</div></Card>
      </div>
    </div>
  );
}

/** Steps open as earlier steps reach 3 sessions; the first two are always open. */
function unlockedSteps(p: { speak: { sessions: number[] } }) {
  let n = 2;
  for (let i = 1; i < 5; i++) if ((p.speak.sessions[i - 1] ?? 0) >= 3) n = Math.max(n, i + 1);
  return n;
}

function shadowList() {
  return [...shadowing.map((x) => ({ text: x.text, th: x.th })), ...lessons.flatMap((l) => l.speak.map((t) => ({ text: t, th: l.title_th })))];
}

function Shadow() {
  const list = useMemo(() => shadowList(), []);
  const [i, setI] = useState(() => Math.floor(Math.random() * list.length));
  const ses = useSession(1, 5);
  const r = useRecorder(); // meter only: nothing is saved or checked
  useEffect(() => () => { if (r.rec) r.stop(); }, [r.rec]);
  const x = list[i % list.length];
  return (
    <div>
      <Back to="/speak" />
      <h2>ขั้น 1 · Shadowing</h2>
      <p className="muted">กด ▶ แล้วพูดตาม <b>พร้อมกัน</b> แบบเงา ไม่ต้องกลัวผิด ไม่มีการตรวจ ({ses.n}/{ses.need})</p>
      <Card className="shadow-card">
        <div className="big-text">{x.text}</div><div className="muted">{x.th}</div>
        <div className="row center">
          <button onClick={() => speak(x.text, 'reader')}>▶ ปกติ</button>
          <button onClick={() => speak(x.text, 'reader', { slow: true })}>ช้า</button>
          {!r.rec ? <button onClick={r.start}><Icon name="mic" />เปิดมาตรวัดความดัง</button> : <button onClick={() => r.stop()}>ปิดมาตรวัด</button>}
        </div>
        {r.rec && <Meter db={r.db} />}
        <button className="primary" onClick={() => { ses.bump(); setI(i + 1); }}>พูดตามแล้ว → ประโยคถัดไป</button>
      </Card>
    </div>
  );
}

function ReadAloud() {
  const list = useMemo(() => shadowList(), []);
  const [i, setI] = useState(() => Math.floor(Math.random() * list.length));
  const ses = useSession(2, 3);
  const x = list[i % list.length];
  return (
    <div>
      <Back to="/speak" />
      <h2>ขั้น 2 · อ่านออกเสียง</h2>
      <p className="muted">ฟังตัวอย่างก่อนได้ แล้วอัดเสียงอ่านเอง ({ses.n}/{ses.need})</p>
      <Card>
        <div className="big-text">{x.text}</div><div className="muted">{x.th}</div>
        <div className="row"><button onClick={() => speak(x.text, 'reader')}><Icon name="speaker" />ฟังตัวอย่าง</button><button onClick={() => speak(x.text, 'reader', { slow: true })}>ฟังช้า</button></div>
        <RecordPanel key={i} target={x.text} kind="read" maxSec={30} onFinished={() => ses.bump()} />
        <button onClick={() => setI(i + 1)}>ประโยคถัดไป →</button>
      </Card>
    </div>
  );
}

function FrameStep() {
  const qs = interview.questions;
  const [i, setI] = useState(() => Math.floor(Math.random() * qs.length));
  const ses = useSession(3, 3);
  const q = qs[i % qs.length];
  return (
    <div>
      <Back to="/speak" />
      <h2>ขั้น 3 · ตอบจากโครง</h2>
      <p className="muted">พูดตามโครง เติมช่องว่างด้วยเรื่องของเราเอง 3–4 ประโยค ({ses.n}/{ses.need})</p>
      <Card>
        <div className="big-text">{q.q} <Listen onClick={() => speak(q.q, interviewerFor(q.id))} /></div>
        <div className="muted">{q.q_th}</div>
        <div className="frame">{q.frame}</div>
        <details><summary>ดูคำตอบตัวอย่าง</summary><p>{q.sample} <Listen onClick={() => speak(q.sample, 'reader')} /></p></details>
        <RecordPanel key={i} question={q.q} sample={q.sample} kind="frame" maxSec={60} onFinished={() => ses.bump()} />
        <button onClick={() => setI(i + 1)}>คำถามถัดไป →</button>
      </Card>
    </div>
  );
}

function OwnStep() {
  const { p } = useStore();
  const qs = interview.questions;
  const [i, setI] = useState(() => Math.floor(Math.random() * qs.length));
  const [think, setThink] = useState<number | null>(null);
  const ses = useSession(4, 3);
  const q = qs[i % qs.length];
  useEffect(() => { if (think === null || think <= 0) return; const t = setTimeout(() => setThink(think - 1), 1000); return () => clearTimeout(t); }, [think]);
  return (
    <div>
      <Back to="/speak" />
      <h2>ขั้น 4 · ตอบเอง</h2>
      <p className="muted">ฟังคำถาม คิด 20 วินาที แล้วตอบเองเลย ({ses.n}/{ses.need})</p>
      <Card>
        <div className="big-text">{q.q}</div>
        {think === null && <button className="primary" onClick={() => { speak(q.q, interviewerFor(q.id)); setThink(20); }}>▶ ฟังคำถาม + เริ่มคิด 20 วินาที</button>}
        {think !== null && think > 0 && <div className="think">คิดได้อีก {think} วินาที… <div className="muted small">{q.tip_th}</div><button className="link" onClick={() => setThink(0)}>พร้อมแล้ว</button></div>}
        {think === 0 && <>
          {p.myAnswers[q.id] && <details><summary>คำตอบที่ฉันเตรียมไว้</summary><p>{p.myAnswers[q.id].en}</p></details>}
          <RecordPanel key={i} question={q.q} sample={p.myAnswers[q.id]?.en ?? q.sample} kind="own" maxSec={75} onFinished={() => ses.bump()} />
        </>}
        <button onClick={() => { setI(i + 1); setThink(null); }}>คำถามถัดไป →</button>
      </Card>
    </div>
  );
}

export function Survival() {
  return (
    <div>
      <Back to="/speak" />
      <h2>ประโยคเอาตัวรอด</h2>
      <p className="muted">ใช้เมื่อฟังไม่ทัน คิดไม่ออก หรืออยากซื้อเวลา ในคลาส อาจารย์ชอบคนที่สื่อสารต่อได้มากกว่าคนที่เงียบ</p>
      {interview.survival.map((x) => (
        <Card key={x.en}><div className="row spread"><div><b>{x.en}</b><div className="muted">{x.th}</div></div>
          <div className="row"><button onClick={() => speak(x.en, 'reader')}>ฟัง</button><button onClick={() => speak(x.en, 'reader', { slow: true })}>ช้า</button></div></div></Card>
      ))}
    </div>
  );
}

const CHECK = ['ซ้อมพูดออกเสียงจริง 2 รอบ จับเวลาด้วย', 'จดคำสำคัญ 3–5 คำไว้ในการ์ดเล็ก ไม่ใช่ทั้งย่อหน้า', 'เตรียมประโยคเปิด 1 ประโยค และประโยคปิด 1 ประโยค', 'ถ้ามีสไลด์ ตรวจไฟล์ก่อนเข้าคลาส', 'ไปถึงห้องก่อนเวลา 10 นาที', 'น้ำเปล่า 1 ขวด', 'ทบทวนคำตอบของฉัน 3 ข้อ (แนะนำตัว / ความสนใจ / ความเห็น)', 'หายใจ 4-7-8 สามรอบก่อนพูด'];

const BREATH_SEC: Record<string, number> = { 'หายใจเข้า': 4, 'กลั้น': 7, 'หายใจออก': 8 };

export function Calm() {
  const [phase, setPhase] = useState<null | { name: string; left: number; round: number }>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  useEffect(() => { idbGet<Record<number, boolean>>('checklist').then((c) => c && setChecked(c)); }, []);
  useEffect(() => {
    if (!phase) return;
    const t = setTimeout(() => {
      if (phase.left > 1) return setPhase({ ...phase, left: phase.left - 1 });
      const next = phase.name === 'หายใจเข้า' ? { name: 'กลั้น', left: 7 } : phase.name === 'กลั้น' ? { name: 'หายใจออก', left: 8 } : { name: 'หายใจเข้า', left: 4 };
      if (phase.name === 'หายใจออก' && phase.round >= 3) return setPhase(null);
      setPhase({ ...next, round: phase.name === 'หายใจออก' ? phase.round + 1 : phase.round });
    }, 1000);
    return () => clearTimeout(t);
  }, [phase]);
  return (
    <div>
      <Back to="/speak" />
      <h2>ลดความประหม่า</h2>
      <Card>
        <h3>หายใจ 4-7-8 (3 รอบ)</h3>
        <div className="breath-wrap" style={{ '--d': `${phase ? BREATH_SEC[phase.name] : 4}s` } as CSSProperties}>
          <svg className="breath-ring" viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="100" cy="100" r="96" pathLength={1} />
            {phase && <circle key={`${phase.name}${phase.round}`} className="prog" cx="100" cy="100" r="96" pathLength={1} />}
          </svg>
          <div className={`breath ${phase?.name === 'หายใจเข้า' ? 'in' : phase?.name === 'หายใจออก' ? 'out' : phase ? 'hold' : ''}`} aria-live="polite">{phase ? <>{phase.name}<br /><b>{phase.left}</b></> : 'พร้อม?'}</div>
        </div>
        <button className="primary" onClick={() => setPhase({ name: 'หายใจเข้า', left: 4, round: 1 })}>{phase ? `รอบที่ ${phase.round}/3` : 'เริ่ม'}</button>
        <p className="muted small">เข้าทางจมูก 4 วินาที → กลั้น 7 → ออกทางปากช้า ๆ 8 วินาที ช่วยให้หัวใจเต้นช้าลงก่อนเข้าห้อง</p>
      </Card>
      <Card>
        <h3>ท่าทาง · สายตา · การแต่งกาย</h3>
        <ul>
          <li><b>เริ่มพูด:</b> ยิ้ม มองคนฟัง พูด "Good morning, everyone." แล้วหยุด 1 วินาทีก่อนเริ่ม</li>
          <li><b>นั่ง:</b> หลังตรงชิดพนักครึ่งหนึ่ง มือวางบนตัก ไม่กอดอก ไม่เขย่าขา</li>
          <li><b>สายตา:</b> มองคนที่ถาม 3–5 วินาที แล้วกวาดไปคนอื่นบ้างตอนตอบยาว ถ้ากลัวสบตา มองระหว่างคิ้วแทนได้</li>
          <li><b>เสียง:</b> พูดให้คนหลังห้องได้ยิน ช้ากว่าปกตินิดหนึ่ง จบประโยคด้วยเสียงลง ไม่ใช่เสียงถาม</li>
          <li><b>ไม่รู้คำตอบ:</b> "That's a good question. Let me think for a moment." ดีกว่าเงียบ</li>
          <li><b>แต่งกาย:</b> ชุดนักศึกษาเรียบร้อย สบายตัว</li>
          <li><b>จบ:</b> "Thank you for listening." ยิ้ม แล้วค่อยเดินกลับที่</li>
        </ul>
      </Card>
      <Card>
        <h3>เช็กลิสต์วันพูดหน้าห้อง</h3>
        {CHECK.map((c, i) => <label key={i} className="check"><input type="checkbox" checked={!!checked[i]} onChange={(e) => { const n = { ...checked, [i]: e.target.checked }; setChecked(n); idbSet('checklist', n); }} /> {c}</label>)}
      </Card>
    </div>
  );
}

export function VoiceProgress() {
  const [list, setList] = useState<RecordingMeta[]>([]);
  const [url, setUrl] = useState<Record<string, string>>({});
  useEffect(() => { idbGet<RecordingMeta[]>('recmeta').then((l) => setList(l ?? [])); }, []);
  const weeks = useMemo(() => {
    const m: Record<string, RecordingMeta[]> = {};
    list.forEach((r) => { const d = new Date(r.t); const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)); (m[dateKey(mon)] ??= []).push(r); });
    return Object.entries(m).sort().map(([w, rs]) => {
      const mins = rs.reduce((a, r) => a + r.seconds, 0) / 60 || 1;
      return { w, wpm: Math.round(rs.reduce((a, r) => a + r.wpm, 0) / rs.length), fillers: +(rs.reduce((a, r) => a + r.fillers, 0) / mins).toFixed(1), pauses: +(rs.reduce((a, r) => a + r.pauses, 0) / mins).toFixed(1), loud: Math.round((100 * rs.reduce((a, r) => a + r.loudOk, 0)) / rs.length) };
    });
  }, [list]);
  const play = async (id: string) => { if (url[id]) return new Audio(url[id]).play(); const b = await idbGet<Blob>(`rec:${id}`); if (b) { const u = URL.createObjectURL(b); setUrl({ ...url, [id]: u }); new Audio(u).play(); } };
  const firstWeek = weeks[0]?.w; const firsts = list.filter((r) => r.kind !== 'interview').slice(0, 3); const lasts = list.slice(-3);
  return (
    <div>
      <Back to="/speak" />
      <h2>พัฒนาการเสียงของฉัน</h2>
      {!list.length && <Card>ยังไม่มีเสียงที่อัดไว้ ลองขั้น 2 อ่านออกเสียงก่อน</Card>}
      {weeks.length > 0 && <Card>
        <LineChart title="คำต่อนาที (เป้า 100–140)" pts={weeks.map((w) => w.wpm)} labels={weeks.map((w) => w.w.slice(5))} />
        <LineChart title="คำเติม um/uh ต่อนาที (ยิ่งน้อยยิ่งดี)" pts={weeks.map((w) => w.fillers)} labels={weeks.map((w) => w.w.slice(5))} />
        <LineChart title="ช่วงเงียบนานต่อนาที (ยิ่งน้อยยิ่งดี)" pts={weeks.map((w) => w.pauses)} labels={weeks.map((w) => w.w.slice(5))} />
        <LineChart title="% เวลาที่เสียงอยู่โซนเขียว" pts={weeks.map((w) => w.loud)} labels={weeks.map((w) => w.w.slice(5))} max={100} />
      </Card>}
      {list.length > 0 && <Card>
        <h3>ฟังเทียบ: สัปดาห์แรก ({firstWeek}) vs ล่าสุด</h3>
        <div className="grid2">
          <div><b>สัปดาห์แรก</b>{firsts.map((r) => <div key={r.id} className="rec-row"><button onClick={() => play(r.id)}>▶</button> {r.prompt.slice(0, 50)} <span className="muted small">{r.wpm} wpm</span></div>)}</div>
          <div><b>ล่าสุด</b>{lasts.map((r) => <div key={r.id} className="rec-row"><button onClick={() => play(r.id)}>▶</button> {r.prompt.slice(0, 50)} <span className="muted small">{r.wpm} wpm</span></div>)}</div>
        </div>
      </Card>}
    </div>
  );
}

export function LineChart({ title, pts, labels, max, line }: { title: string; pts: number[]; labels: string[]; max?: number; line?: number }) {
  const W = 320, H = 120, pad = 24;
  const top = max ?? Math.max(1, ...pts, line ?? 0) * 1.15;
  const x = (i: number) => pad + (pts.length < 2 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (pts.length - 1));
  const y = (v: number) => H - pad - (v / top) * (H - 2 * pad);
  return (
    <div className="chart">
      <div className="small"><b>{title}</b></div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--line)" />
        {line !== undefined && <><line x1={pad} y1={y(line)} x2={W - pad} y2={y(line)} stroke="var(--no)" strokeDasharray="4 3" /><text x={W - pad} y={y(line) - 3} fontSize="9" textAnchor="end" fill="var(--no)">{line}%</text></>}
        <polyline className="chart-line" pathLength={1} fill="none" stroke="var(--accent)" strokeWidth="2.5" points={pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
        {pts.map((v, i) => <g key={i} className="chart-pt" style={{ '--i': i } as CSSProperties}><circle cx={x(i)} cy={y(v)} r="3.5" fill="var(--accent)" /><text x={x(i)} y={y(v) - 6} fontSize="9" textAnchor="middle" fill="var(--ink)">{v}</text><text x={x(i)} y={H - 8} fontSize="8" textAnchor="middle" fill="var(--muted)">{labels[i]}</text></g>)}
      </svg>
    </div>
  );
}

const BRAVE = [
  'พูดออกมาได้แล้ว นี่คือส่วนที่ยากที่สุด และวันนี้ทำแล้ว',
  'ประโยคไม่ต้องสวย อาจารย์อยากเห็นคนที่กล้าตอบ',
  'ทุกครั้งที่อัด เสียงจริงในคลาสจะนิ่งขึ้นอีกนิด',
  'ตอบสั้นแต่ครบ ดีกว่าตอบยาวแล้วหลง',
  'วันนี้พูดไปหนึ่งคำตอบ เท่ากับซ้อมคลาสพูดไปอีกหนึ่งครั้ง',
];

/** One interview question per day, rotating through the bank, so speaking happens daily rather than once a week. */
export function DailyQuestion() {
  const { p, update } = useStore();
  const day = Math.max(0, daysBetween('2026-01-01', dateKey()));
  const q = interview.questions[day % interview.questions.length];
  const who = interviewerFor(q.id);
  const done = p.days[dateKey()]?.done.includes('daily-q');
  const [showSample, setShowSample] = useState(false);
  const [cheer, setCheer] = useState('');
  return (
    <section className="daily-q">
      <div className="daily-q-head">
        <span className="eyebrow">คำถามฝึกพูดประจำวัน (EN101 / ENL111) · ไม่มีถูกผิด</span>
        {done && <span className="done-tag"><Icon name="check" />พูดแล้ววันนี้</span>}
      </div>
      <div className="daily-q-cast">
        <Interviewer id={who} size={84} />
        <div className="daily-q-bubble">
          <span className="small muted">{INTERVIEWERS[who].name} ถามว่า</span>
          <p className="daily-q-en">{q.q}</p>
        </div>
      </div>
      <p className="daily-q-th">{q.q_th}</p>
      <div className="row">
        <button onClick={() => speak(q.q, who)}><Icon name="speaker" />ฟังคำถาม</button>
        <button onClick={() => speak(q.q, who, { slow: true })}>ฟังช้า</button>
      </div>
      <p className="daily-q-frame"><b>ยืมโครงนี้ไปพูดได้เลย</b> {q.frame}</p>
      <p className="small muted">{q.tip_th}</p>
      <RecordPanel question={q.q} sample={q.sample} kind="daily-q" maxSec={60} invite={!done}
        onFinished={() => { setCheer(BRAVE[Math.floor(Math.random() * BRAVE.length)]); update((pp) => { if (!pp.days[dateKey()]?.done.includes('daily-q')) addXp(pp, 30); markDone(pp, 'daily-q'); }); }} />
      {cheer && <p className="cheer" key={cheer} role="status"><Check size={20} />{cheer}</p>}
      <button className="link" onClick={() => setShowSample(!showSample)}>{showSample ? 'ซ่อนคำตอบตัวอย่าง' : 'ดูคำตอบตัวอย่าง แล้วพูดตาม'}</button>
      {showSample && <div className="sample"><p>{q.sample}</p><div className="row"><button onClick={() => speak(q.sample, 'reader')}>ฟังตัวอย่าง</button><button onClick={() => speak(q.sample, 'reader', { slow: true })}>ฟังช้า</button></div>
        <p className="small muted">ตัวอย่างนี้เป็นของคนสมมติ ใช้ดูโครงเท่านั้น คำตอบจริงให้ใช้เรื่องของเราเอง</p></div>}
    </section>
  );
}
